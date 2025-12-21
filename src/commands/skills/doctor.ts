/**
 * Skills Doctor Command - Diagnose and fix common issues
 *
 * Usage:
 *   grimoire skills doctor
 *   grimoire skills doctor --fix
 */

import { Effect, Data } from "effect";
import { join } from "path";
import type { ParsedArgs } from "../../cli/parser";
import {
  SkillStateService,
  SkillCacheService,
  AgentAdapterService,
} from "../../services";
import { hasManagedSection, addManagedSection } from "../../services/skills/injection-utils";
import {
  hasYamlFrontmatter,
  generateSkillFrontmatter,
} from "../../services/skills/agent-adapter";

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

/**
 * Issue severity levels
 */
type IssueSeverity = "error" | "warning";

/**
 * Diagnostic issue
 */
interface DiagnosticIssue {
  severity: IssueSeverity;
  message: string;
  fix?: () => Effect.Effect<void, DoctorError>;
}

/**
 * Error types
 */
export class DoctorError extends Data.TaggedError("DoctorError")<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Check if project is initialized
 */
const checkProjectInitialized = (
  projectPath: string
): Effect.Effect<DiagnosticIssue | null, DoctorError, SkillStateService | AgentAdapterService> =>
  Effect.gen(function* () {
    const stateService = yield* SkillStateService;
    const isInitialized = yield* stateService.isInitialized(projectPath).pipe(
      Effect.mapError((e) => new DoctorError({ message: e.message }))
    );

    if (!isInitialized) {
      return {
        severity: "error" as const,
        message: "Project not initialized (no state found in ~/.skills/state.json)",
      };
    }

    // Check if skills directory exists
    const projectState = yield* stateService.getProjectState(projectPath).pipe(
      Effect.mapError((e) => new DoctorError({ message: e.message }))
    );
    if (!projectState) {
      return null;
    }

    const adapterService = yield* AgentAdapterService;
    const adapter = adapterService.getAdapter(projectState.agent);
    const skillsDir = adapter.getSkillsDir(projectPath);

    const dirExists = yield* Effect.tryPromise({
      try: async () => {
        const fs = await import("fs/promises");
        try {
          await fs.access(skillsDir);
          return true;
        } catch {
          return false;
        }
      },
      catch: (error) =>
        new DoctorError({
          message: `Failed to check skills directory: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    if (!dirExists) {
      return {
        severity: "error" as const,
        message: `Skills directory missing: ${skillsDir}`,
        fix: () =>
          Effect.tryPromise({
            try: async () => {
              const fs = await import("fs/promises");
              await fs.mkdir(skillsDir, { recursive: true });
            },
            catch: (error) =>
              new DoctorError({
                message: `Failed to create skills directory: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
          }),
      };
    }

    return null;
  });

/**
 * Check if agent MD file has valid managed section
 */
const checkAgentMdFile = (
  projectPath: string
): Effect.Effect<DiagnosticIssue | null, DoctorError, SkillStateService | AgentAdapterService> =>
  Effect.gen(function* () {
    const stateService = yield* SkillStateService;
    const projectState = yield* stateService.getProjectState(projectPath).pipe(
      Effect.mapError((e) => new DoctorError({ message: e.message }))
    );
    if (!projectState) {
      return null;
    }

    const adapterService = yield* AgentAdapterService;
    const adapter = adapterService.getAdapter(projectState.agent);
    const agentMdPath = adapter.getAgentMdPath(projectPath);

    const fileExists = yield* Effect.tryPromise({
      try: async () => {
        const file = Bun.file(agentMdPath);
        return await file.exists();
      },
      catch: (error) =>
        new DoctorError({
          message: `Failed to check agent MD file: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    if (!fileExists) {
      return {
        severity: "error" as const,
        message: `Agent MD file missing: ${agentMdPath}`,
        fix: () =>
          Effect.tryPromise({
            try: async () => {
              const defaultContent =
                projectState.agent === "claude_code"
                  ? "# Claude Code Instructions\n\n"
                  : "# Agent Instructions\n\n";
              const contentWithManaged = addManagedSection(defaultContent);
              await Bun.write(agentMdPath, contentWithManaged);
            },
            catch: (error) =>
              new DoctorError({
                message: `Failed to create agent MD file: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
          }),
      };
    }

    // Check for managed section
    const content = yield* Effect.tryPromise({
      try: async () => {
        const file = Bun.file(agentMdPath);
        return await file.text();
      },
      catch: (error) =>
        new DoctorError({
          message: `Failed to read agent MD file: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    if (!hasManagedSection(content)) {
      return {
        severity: "warning" as const,
        message: `Agent MD file missing managed section: ${agentMdPath}`,
        fix: () =>
          Effect.tryPromise({
            try: async () => {
              const contentWithManaged = addManagedSection(content);
              await Bun.write(agentMdPath, contentWithManaged);
            },
            catch: (error) =>
              new DoctorError({
                message: `Failed to add managed section: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
          }),
      };
    }

    return null;
  });

/**
 * Check if all enabled skills have files in skills directory
 * Supports both directory structure (.claude/skills/<name>/SKILL.md) and legacy file structure
 */
const checkEnabledSkillsHaveFiles = (
  projectPath: string
): Effect.Effect<DiagnosticIssue[], DoctorError, SkillStateService | AgentAdapterService> =>
  Effect.gen(function* () {
    const stateService = yield* SkillStateService;
    const issues: DiagnosticIssue[] = [];
    const projectState = yield* stateService.getProjectState(projectPath).pipe(
      Effect.mapError((e) => new DoctorError({ message: e.message }))
    );

    if (!projectState) {
      return issues;
    }

    const adapterService = yield* AgentAdapterService;
    const adapter = adapterService.getAdapter(projectState.agent);
    const skillsDir = adapter.getSkillsDir(projectPath);

    const enabledSkills = yield* stateService.getEnabled(projectPath).pipe(
      Effect.mapError((e) => new DoctorError({ message: e.message }))
    );

    for (const skillName of enabledSkills) {
      // Check new directory structure first: .claude/skills/<name>/SKILL.md
      const skillDirPath = join(skillsDir, skillName, "SKILL.md");
      // Then check legacy file structure: .claude/skills/<name>.md
      const legacyFilePath = join(skillsDir, `${skillName}.md`);

      const dirStructureExists = yield* Effect.tryPromise({
        try: async () => {
          const file = Bun.file(skillDirPath);
          return await file.exists();
        },
        catch: () => new DoctorError({ message: "Failed to check skill file" }),
      }).pipe(Effect.catchAll(() => Effect.succeed(false)));

      const legacyExists = yield* Effect.tryPromise({
        try: async () => {
          const file = Bun.file(legacyFilePath);
          return await file.exists();
        },
        catch: () => new DoctorError({ message: "Failed to check skill file" }),
      }).pipe(Effect.catchAll(() => Effect.succeed(false)));

      if (!dirStructureExists && !legacyExists) {
        issues.push({
          severity: "error" as const,
          message: `Enabled skill '${skillName}' missing file (checked ${skillDirPath} and ${legacyFilePath})`,
        });
      }
    }

    return issues;
  });

/**
 * Parse simple YAML frontmatter from content
 */
function parseSimpleFrontmatter(content: string): Record<string, string> | null {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return null;

  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex === -1) return null;

  const yamlBlock = trimmed.slice(4, endIndex);
  const result: Record<string, string> = {};

  for (const line of yamlBlock.split("\n")) {
    const match = line.match(/^(\w[\w-]*?):\s*(.*)$/);
    if (match) {
      result[match[1]] = match[2];
    }
  }

  return result;
}

/**
 * Check SKILL.md files have valid frontmatter for Claude Code discovery
 */
const checkSkillMdFrontmatter = (
  projectPath: string
): Effect.Effect<DiagnosticIssue[], DoctorError, SkillStateService | AgentAdapterService | SkillCacheService> =>
  Effect.gen(function* () {
    const stateService = yield* SkillStateService;
    const cacheService = yield* SkillCacheService;
    const issues: DiagnosticIssue[] = [];
    const projectState = yield* stateService.getProjectState(projectPath).pipe(
      Effect.mapError((e) => new DoctorError({ message: e.message }))
    );

    if (!projectState) {
      return issues;
    }

    // Only check frontmatter for Claude Code (it's the one that uses semantic discovery)
    if (projectState.agent !== "claude_code") {
      return issues;
    }

    const adapterService = yield* AgentAdapterService;
    const adapter = adapterService.getAdapter(projectState.agent);
    const skillsDir = adapter.getSkillsDir(projectPath);

    const enabledSkills = yield* stateService.getEnabled(projectPath).pipe(
      Effect.mapError((e) => new DoctorError({ message: e.message }))
    );

    for (const skillName of enabledSkills) {
      // Find the skill file (check both structures)
      const skillDirPath = join(skillsDir, skillName, "SKILL.md");
      const legacyFilePath = join(skillsDir, `${skillName}.md`);

      let skillFilePath: string | null = null;

      const dirStructureExists = yield* Effect.tryPromise({
        try: async () => {
          const file = Bun.file(skillDirPath);
          return await file.exists();
        },
        catch: () => new DoctorError({ message: "Failed to check skill file" }),
      }).pipe(Effect.catchAll(() => Effect.succeed(false)));

      if (dirStructureExists) {
        skillFilePath = skillDirPath;
      } else {
        const legacyExists = yield* Effect.tryPromise({
          try: async () => {
            const file = Bun.file(legacyFilePath);
            return await file.exists();
          },
          catch: () => new DoctorError({ message: "Failed to check skill file" }),
        }).pipe(Effect.catchAll(() => Effect.succeed(false)));
        if (legacyExists) {
          skillFilePath = legacyFilePath;
        }
      }

      if (!skillFilePath) {
        continue; // Already reported by checkEnabledSkillsHaveFiles
      }

      // Read the skill file
      const content = yield* Effect.tryPromise({
        try: async () => {
          const file = Bun.file(skillFilePath!);
          return await file.text();
        },
        catch: (error) =>
          new DoctorError({
            message: `Failed to read skill file: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

      // Check for frontmatter
      if (!hasYamlFrontmatter(content)) {
        // Try to get manifest from cache for auto-fix
        const cachedSkill = yield* cacheService.getCached(skillName).pipe(
          Effect.catchAll(() => Effect.succeed(null))
        );

        issues.push({
          severity: "warning" as const,
          message: `Skill '${skillName}' missing YAML frontmatter (won't be discovered by Claude)`,
          fix: cachedSkill
            ? () =>
                Effect.tryPromise({
                  try: async () => {
                    const frontmatter = generateSkillFrontmatter(cachedSkill.manifest);
                    const newContent = frontmatter + content;
                    await Bun.write(skillFilePath!, newContent);
                  },
                  catch: (error) =>
                    new DoctorError({
                      message: `Failed to add frontmatter: ${error instanceof Error ? error.message : String(error)}`,
                      cause: error,
                    }),
                })
            : undefined,
        });
        continue;
      }

      // Parse frontmatter and check quality
      const frontmatter = parseSimpleFrontmatter(content);
      if (frontmatter) {
        // Check name field
        if (!frontmatter.name) {
          issues.push({
            severity: "warning" as const,
            message: `Skill '${skillName}' frontmatter missing 'name' field`,
          });
        }

        // Check description field
        if (!frontmatter.description) {
          issues.push({
            severity: "warning" as const,
            message: `Skill '${skillName}' frontmatter missing 'description' field (critical for discovery)`,
          });
        } else if (frontmatter.description.length < 20) {
          issues.push({
            severity: "warning" as const,
            message: `Skill '${skillName}' description too short (${frontmatter.description.length} chars) - recommend 20+ for better discovery`,
          });
        }
      }
    }

    return issues;
  });

/**
 * Check for orphaned skill files (files not in state)
 */
const checkOrphanedSkillFiles = (
  projectPath: string
): Effect.Effect<DiagnosticIssue[], DoctorError, SkillStateService | AgentAdapterService> =>
  Effect.gen(function* () {
    const stateService = yield* SkillStateService;
    const issues: DiagnosticIssue[] = [];
    const projectState = yield* stateService.getProjectState(projectPath).pipe(
      Effect.mapError((e) => new DoctorError({ message: e.message }))
    );

    if (!projectState) {
      return issues;
    }

    const adapterService = yield* AgentAdapterService;
    const adapter = adapterService.getAdapter(projectState.agent);
    const skillsDir = adapter.getSkillsDir(projectPath);

    const dirExists = yield* Effect.tryPromise({
      try: async () => {
        const fs = await import("fs/promises");
        try {
          await fs.access(skillsDir);
          return true;
        } catch {
          return false;
        }
      },
      catch: (error) =>
        new DoctorError({
          message: `Failed to check skills directory: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    if (!dirExists) {
      return issues;
    }

    const entries = yield* Effect.tryPromise({
      try: async () => {
        const fs = await import("fs/promises");
        return await fs.readdir(skillsDir, { withFileTypes: true });
      },
      catch: (error) =>
        new DoctorError({
          message: `Failed to read skills directory: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    const enabledSkills = yield* stateService.getEnabled(projectPath).pipe(
      Effect.mapError((e) => new DoctorError({ message: e.message }))
    );
    const enabledSet = new Set(enabledSkills);

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const skillName = entry.name.replace(/\.md$/, "");

        if (!enabledSet.has(skillName)) {
          const skillFilePath = join(skillsDir, entry.name);
          issues.push({
            severity: "warning" as const,
            message: `Orphaned skill file: ${skillFilePath}`,
            fix: () =>
              Effect.tryPromise({
                try: async () => {
                  const fs = await import("fs/promises");
                  await fs.unlink(skillFilePath);
                },
                catch: (error) =>
                  new DoctorError({
                    message: `Failed to remove orphaned file: ${error instanceof Error ? error.message : String(error)}`,
                    cause: error,
                  }),
              }),
          });
        }
      }
    }

    return issues;
  });

/**
 * Check state file consistency
 */
const checkStateConsistency = (
  projectPath: string
): Effect.Effect<DiagnosticIssue[], DoctorError, SkillStateService | SkillCacheService> =>
  Effect.gen(function* () {
    const stateService = yield* SkillStateService;
    const cacheService = yield* SkillCacheService;
    const issues: DiagnosticIssue[] = [];
    const projectState = yield* stateService.getProjectState(projectPath).pipe(
      Effect.mapError((e) => new DoctorError({ message: e.message }))
    );

    if (!projectState) {
      return issues;
    }

    const enabledSkills = yield* stateService.getEnabled(projectPath).pipe(
      Effect.mapError((e) => new DoctorError({ message: e.message }))
    );

    for (const skillName of enabledSkills) {
      const isCached = yield* cacheService.isCached(skillName);

      if (!isCached) {
        issues.push({
          severity: "warning" as const,
          message: `State references skill '${skillName}' but it's not in cache`,
        });
      }
    }

    return issues;
  });

/**
 * Format issue output
 */
const formatIssue = (issue: DiagnosticIssue): string => {
  const symbol = issue.severity === "error" ? `${colors.red}[!!]${colors.reset}` : `${colors.yellow}[!]${colors.reset}`;
  return `${symbol} ${issue.message}`;
};

/**
 * Skills doctor command handler
 */
export const skillsDoctor = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const stateService = yield* SkillStateService;
    const cacheService = yield* SkillCacheService;
    const projectPath = process.cwd();
    const fixFlag = args.flags.fix;

    console.log("Checking project health...\n");

    const allIssues: DiagnosticIssue[] = [];

    // Run all checks
    const initIssue = yield* checkProjectInitialized(projectPath);
    if (initIssue) {
      allIssues.push(initIssue);
    } else {
      console.log(`${colors.green}[ok]${colors.reset} Project initialized`);
    }

    const mdIssue = yield* checkAgentMdFile(projectPath);
    if (mdIssue) {
      allIssues.push(mdIssue);
    } else {
      console.log(`${colors.green}[ok]${colors.reset} Agent MD file has valid managed section`);
    }

    const enabledIssues = yield* checkEnabledSkillsHaveFiles(projectPath);
    if (enabledIssues.length === 0) {
      console.log(`${colors.green}[ok]${colors.reset} All enabled skills have files`);
    } else {
      allIssues.push(...enabledIssues);
    }

    const orphanedIssues = yield* checkOrphanedSkillFiles(projectPath);
    if (orphanedIssues.length === 0) {
      console.log(`${colors.green}[ok]${colors.reset} No orphaned skill files`);
    } else {
      allIssues.push(...orphanedIssues);
    }

    const stateIssues = yield* checkStateConsistency(projectPath);
    if (stateIssues.length === 0) {
      console.log(`${colors.green}[ok]${colors.reset} State file consistent`);
    } else {
      allIssues.push(...stateIssues);
    }

    // Check SKILL.md frontmatter (Claude Code only)
    const frontmatterIssues = yield* checkSkillMdFrontmatter(projectPath);
    if (frontmatterIssues.length === 0) {
      console.log(`${colors.green}[ok]${colors.reset} SKILL.md files have valid frontmatter`);
    } else {
      allIssues.push(...frontmatterIssues);
    }

    // Display all issues
    if (allIssues.length > 0) {
      console.log("");
      for (const issue of allIssues) {
        console.log(formatIssue(issue));
      }
      console.log("");
      console.log(`${colors.bold}Issues found: ${allIssues.length}${colors.reset}`);

      // Apply fixes if --fix flag is set
      if (fixFlag) {
        console.log("");
        console.log("Applying fixes...\n");

        let fixedCount = 0;
        let failedCount = 0;

        for (const issue of allIssues) {
          if (issue.fix) {
            const result = yield* issue.fix().pipe(Effect.either);

            if (result._tag === "Right") {
              console.log(`${colors.green}[ok]${colors.reset} Fixed: ${issue.message}`);
              fixedCount++;
            } else {
              console.log(`${colors.red}[!!]${colors.reset} Failed to fix: ${issue.message}`);
              console.log(`  ${colors.gray}${result.left.message}${colors.reset}`);
              failedCount++;
            }
          }
        }

        console.log("");
        if (fixedCount > 0) {
          console.log(`${colors.green}Fixed ${fixedCount} issue(s)${colors.reset}`);
        }
        if (failedCount > 0) {
          console.log(`${colors.red}Failed to fix ${failedCount} issue(s)${colors.reset}`);
        }

        const unfixableCount = allIssues.filter((i) => !i.fix).length;
        if (unfixableCount > 0) {
          console.log(`${colors.yellow}${unfixableCount} issue(s) require manual intervention${colors.reset}`);
        }
      } else {
        console.log("");
        const fixableCount = allIssues.filter((i) => i.fix).length;
        if (fixableCount > 0) {
          console.log(`Run ${colors.bold}grimoire skills doctor --fix${colors.reset} to auto-fix ${fixableCount} issue(s)`);
        }
      }
    } else {
      console.log("");
      console.log(`${colors.green}${colors.bold}No issues found! Project is healthy.${colors.reset}`);
    }
  });
