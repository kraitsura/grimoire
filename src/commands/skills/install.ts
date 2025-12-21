/**
 * Skills Install Command - One-command skill installation
 *
 * Combines: detect repo type + add to cache + init project + enable skill
 *
 * Usage:
 *   grimoire skills install github:owner/repo
 *   grimoire skills install github:owner/repo@v1.0.0
 *   grimoire skills install github:owner/collection#skill-name
 *   grimoire skills install ./local/path
 *
 * Flags:
 *   --target <name>   Install specific skill from collection
 *   --force           Overwrite if already cached
 *   --no-deps         Skip CLI dependency installation
 *   --no-init         Skip init commands
 *   -y, --yes         Auto-confirm prompts
 *   --dry-run         Show what would happen without doing it
 */

import { Effect, Data } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import {
  SkillCacheService,
  SkillStateService,
  SkillEngineService,
} from "../../services";
import type { GitHubSource } from "../../services";
import type { RepoType, SkillInfo, AgentType } from "../../models/skill";

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

/**
 * Error types for install command
 */
export class PluginDetectedError extends Data.TaggedError("PluginDetectedError")<{
  source: string;
  pluginName: string;
  message: string;
}> {}

export class EmptyRepoError extends Data.TaggedError("EmptyRepoError")<{
  source: string;
  message: string;
}> {}

export class InstallError extends Data.TaggedError("InstallError")<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Normalize GitHub URL to github:owner/repo format
 */
const normalizeGitHubUrl = (url: string): string => {
  if (url.startsWith("github:")) {
    return url;
  }

  let normalized = url;
  normalized = normalized.replace(/\.git$/, "");

  if (normalized.startsWith("https://github.com/")) {
    normalized = normalized.replace("https://github.com/", "github:");
    const treeBranchMatch = normalized.match(/^(github:[^/]+\/[^/]+)\/tree\/([^/]+)(\/(.+))?$/);
    if (treeBranchMatch) {
      const [, repo, branch, , subdir] = treeBranchMatch;
      return `${repo}@${branch}${subdir ? `#${subdir}` : ""}`;
    }
    return normalized;
  }

  if (normalized.startsWith("git@github.com:")) {
    normalized = normalized.replace("git@github.com:", "github:");
    return normalized;
  }

  return url;
};

/**
 * Parse GitHub source string
 */
const parseGitHubSource = (
  source: string
): Effect.Effect<GitHubSource, InstallError> =>
  Effect.gen(function* () {
    const normalized = normalizeGitHubUrl(source);

    if (!normalized.startsWith("github:")) {
      return yield* Effect.fail(
        new InstallError({
          message: "Source must start with 'github:' or be a local path",
        })
      );
    }

    const withoutPrefix = normalized.slice(7);
    const [repoPath, refAndSubdir] = withoutPrefix.split("@");
    const [owner, repo] = repoPath.split("/");

    if (!owner || !repo) {
      return yield* Effect.fail(
        new InstallError({
          message: "Invalid GitHub source format. Expected: github:owner/repo[@ref][#subdir]",
        })
      );
    }

    let ref: string | undefined;
    let subdir: string | undefined;

    if (refAndSubdir) {
      const [refPart, subdirPart] = refAndSubdir.split("#");
      ref = refPart || undefined;
      subdir = subdirPart || undefined;
    }

    return { owner, repo, ref, subdir };
  });

/**
 * Check if source is a local path
 */
const isLocalPath = (source: string): boolean => {
  return source.startsWith("./") || source.startsWith("../") || source.startsWith("/");
};

/**
 * Detect agent type in current project
 */
const detectAgent = (): Effect.Effect<AgentType | null> =>
  Effect.gen(function* () {
    const cwd = process.cwd();
    const fs = yield* Effect.promise(() => import("fs/promises"));

    const claudeExists = yield* Effect.promise(async () => {
      try {
        await fs.stat(`${cwd}/.claude`);
        return true;
      } catch {
        return false;
      }
    });

    const opencodeExists = yield* Effect.promise(async () => {
      try {
        await fs.stat(`${cwd}/.opencode`);
        return true;
      } catch {
        return false;
      }
    });

    if (claudeExists) return "claude_code";
    if (opencodeExists) return "opencode";
    return null;
  });

/**
 * Print skill selector for collections (simple numbered list for now)
 */
const printSkillSelector = (skills: SkillInfo[]): void => {
  console.log(`\n${colors.bold}Available skills:${colors.reset}\n`);
  skills.forEach((skill, index) => {
    const num = `${index + 1}`.padStart(2);
    console.log(`  ${colors.cyan}${num})${colors.reset} ${colors.bold}${skill.name}${colors.reset}`);
    if (skill.description) {
      console.log(`      ${colors.gray}${skill.description}${colors.reset}`);
    }
  });
  console.log();
};

/**
 * Prompt for skill selection (simple stdin for now)
 */
const promptSkillSelection = (
  skills: SkillInfo[],
  yesFlag: boolean
): Effect.Effect<SkillInfo[], InstallError> =>
  Effect.gen(function* () {
    if (yesFlag) {
      // With -y flag, install all skills
      console.log(`${colors.yellow}Installing all ${skills.length} skills (--yes flag)${colors.reset}`);
      return skills;
    }

    printSkillSelector(skills);
    console.log(`${colors.dim}Enter skill number(s) to install (comma-separated), or 'all':${colors.reset}`);
    console.log(`${colors.dim}Example: 1,3,5 or all${colors.reset}\n`);

    // For non-interactive mode, default to first skill
    // TODO: Add proper interactive prompt
    console.log(`${colors.yellow}Note: Non-interactive mode, installing first skill: ${skills[0].name}${colors.reset}`);
    return [skills[0]];
  });

/**
 * Skills install command handler
 */
export const skillsInstall = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const cacheService = yield* SkillCacheService;
    const stateService = yield* SkillStateService;
    const engineService = yield* SkillEngineService;

    const projectPath = process.cwd();

    // Parse arguments
    const source = args.positional[1];
    const targetFlag = args.flags.target as string | undefined;
    const forceFlag = args.flags.force === true || args.flags.f === true;
    const noDepsFlag = args.flags["no-deps"] === true;
    const noInitFlag = args.flags["no-init"] === true;
    const yesFlag = args.flags.yes === true || args.flags.y === true;
    const dryRunFlag = args.flags["dry-run"] === true;

    // Validate source
    if (!source) {
      console.log(`${colors.red}Error:${colors.reset} Missing source argument\n`);
      console.log("Usage: grimoire skills install <source> [options]\n");
      console.log("Examples:");
      console.log("  grimoire skills install github:steveyegge/beads");
      console.log("  grimoire skills install github:owner/repo@v1.0.0");
      console.log("  grimoire skills install github:owner/collection --target skill-name");
      console.log("  grimoire skills install ./local/skill\n");
      console.log("Flags:");
      console.log("  --target <name>   Install specific skill from collection");
      console.log("  --force, -f       Overwrite if already cached");
      console.log("  --no-deps         Skip CLI dependency installation");
      console.log("  --no-init         Skip init commands");
      console.log("  -y, --yes         Auto-confirm prompts");
      console.log("  --dry-run         Show what would happen without doing it");
      return;
    }

    if (dryRunFlag) {
      console.log(`${colors.cyan}[DRY RUN]${colors.reset} Would install from: ${source}\n`);
    }

    // Step 1: Detect repo type (for GitHub sources)
    let repoType: RepoType | undefined;
    let githubSource: GitHubSource | undefined;

    if (!isLocalPath(source)) {
      githubSource = yield* parseGitHubSource(source);

      console.log(`${colors.dim}Detecting repository type...${colors.reset}`);
      repoType = yield* cacheService.detectRepoType(githubSource).pipe(
        Effect.catchAll((error) => {
          console.log(`${colors.red}Error:${colors.reset} ${error.message}`);
          return Effect.fail(new InstallError({ message: error.message }));
        })
      );

      // Handle different repo types
      if (repoType.type === "empty") {
        console.log(`${colors.red}Error:${colors.reset} No skill.yaml or SKILL.md found in repository`);
        console.log(`\nMake sure the repository contains a valid skill.`);
        return yield* Effect.fail(
          new EmptyRepoError({
            source,
            message: "No skill markers found in repository",
          })
        );
      }

      if (repoType.type === "plugin") {
        console.log(`${colors.yellow}Notice:${colors.reset} This repository contains a Claude Code plugin.`);
        console.log(`\nTo install plugins, use:`);
        console.log(`  ${colors.cyan}grimoire plugins add ${source}${colors.reset}`);
        console.log(`\nThis will add the marketplace and let you select plugins to install.`);
        return yield* Effect.fail(
          new PluginDetectedError({
            source,
            pluginName: repoType.plugin.name,
            message: "Repository is a plugin, not a skill",
          })
        );
      }

      // Check for collection with plugins
      if (repoType.type === "collection" && repoType.plugins.length > 0) {
        if (repoType.skills.length === 0) {
          // Only plugins, no skills
          console.log(`${colors.yellow}Notice:${colors.reset} This repository contains ${repoType.plugins.length} plugin(s) but no skills.`);
          console.log(`\nTo install plugins, use:`);
          console.log(`  ${colors.cyan}grimoire plugins add ${source}${colors.reset}`);
          return yield* Effect.fail(
            new PluginDetectedError({
              source,
              pluginName: repoType.plugins[0].name,
              message: "Repository contains plugins, not skills",
            })
          );
        }

        // Mixed repo - inform about plugins
        console.log(`${colors.cyan}Mixed repository:${colors.reset} ${repoType.skills.length} skill(s), ${repoType.plugins.length} plugin(s)`);
        console.log(`${colors.dim}To also install plugins: grimoire plugins add ${source}${colors.reset}\n`);
      }

      if (repoType.type === "collection") {
        console.log(`${colors.cyan}Collection detected${colors.reset} with ${repoType.skills.length} skill(s)`);

        // Filter by --target if specified
        let skillsToInstall = repoType.skills;
        if (targetFlag) {
          skillsToInstall = repoType.skills.filter(s => s.name === targetFlag);
          if (skillsToInstall.length === 0) {
            console.log(`${colors.red}Error:${colors.reset} Skill "${targetFlag}" not found in collection`);
            console.log(`\nAvailable skills:`);
            repoType.skills.forEach(s => console.log(`  - ${s.name}`));
            return;
          }
        } else {
          // Prompt for selection
          skillsToInstall = yield* promptSkillSelection(repoType.skills, yesFlag);
        }

        if (dryRunFlag) {
          console.log(`\n${colors.cyan}[DRY RUN]${colors.reset} Would install ${skillsToInstall.length} skill(s):`);
          skillsToInstall.forEach(s => console.log(`  - ${s.name}`));
          return;
        }

        // Install each selected skill
        for (const skillInfo of skillsToInstall) {
          console.log(`\n${colors.bold}Installing: ${skillInfo.name}${colors.reset}`);

          // Create source with subdir
          const skillSource: GitHubSource = {
            ...githubSource,
            subdir: skillInfo.path || undefined,
          };

          yield* installSingleSkill({
            projectPath,
            source: skillSource,
            isLocal: false,
            force: forceFlag,
            noDeps: noDepsFlag,
            noInit: noInitFlag,
            yes: yesFlag,
          });
        }

        return;
      }

      // Single skill at root - update source with subdir if present
      if (repoType.type === "skill" && repoType.skill.path) {
        githubSource = {
          ...githubSource,
          subdir: repoType.skill.path || undefined,
        };
      }
    }

    if (dryRunFlag) {
      console.log(`${colors.cyan}[DRY RUN]${colors.reset} Would install single skill from: ${source}`);
      return;
    }

    // Install single skill
    yield* installSingleSkill({
      projectPath,
      source: isLocalPath(source) ? source : githubSource!,
      isLocal: isLocalPath(source),
      force: forceFlag,
      noDeps: noDepsFlag,
      noInit: noInitFlag,
      yes: yesFlag,
    });
  });

/**
 * Install a single skill (add to cache, init project if needed, enable)
 */
interface InstallOptions {
  projectPath: string;
  source: GitHubSource | string;
  isLocal: boolean;
  force: boolean;
  noDeps: boolean;
  noInit: boolean;
  yes: boolean;
}

const installSingleSkill = (opts: InstallOptions) =>
  Effect.gen(function* () {
    const cacheService = yield* SkillCacheService;
    const stateService = yield* SkillStateService;
    const engineService = yield* SkillEngineService;
    const { projectPath, source, isLocal, force, noDeps, noInit, yes } = opts;

    // Step 1: Add to cache
    console.log(`${colors.dim}Fetching skill...${colors.reset}`);

    // Remove from cache if force flag
    if (force && !isLocal && typeof source !== "string") {
      const githubSource = source as GitHubSource;
      const potentialName = githubSource.subdir || githubSource.repo;
      const isCached = yield* cacheService.isCached(potentialName);
      if (isCached) {
        console.log(`${colors.dim}Removing existing cached skill: ${potentialName}${colors.reset}`);
        yield* cacheService.remove(potentialName).pipe(Effect.catchAll(() => Effect.void));
      }
    }

    const cachedSkill = yield* Effect.gen(function* () {
      if (isLocal) {
        return yield* cacheService.fetchFromLocal(source as string);
      } else {
        return yield* cacheService.fetchFromGitHub(source as GitHubSource);
      }
    }).pipe(
      Effect.catchAll((error: unknown) => {
        const message = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
        console.log(`${colors.red}Error:${colors.reset} Failed to fetch skill: ${message}`);
        return Effect.fail(new InstallError({ message, cause: error }));
      })
    );

    console.log(`${colors.green}+${colors.reset} Cached: ${cachedSkill.manifest.name}`);

    // Step 2: Ensure project is initialized
    const isInitialized = yield* stateService.isInitialized(projectPath);

    if (!isInitialized) {
      console.log(`${colors.dim}Initializing project...${colors.reset}`);

      // Detect agent type
      let agent: AgentType = yield* detectAgent().pipe(
        Effect.map((detected) => detected || "claude_code")
      );

      if (!yes && agent === "claude_code") {
        // Default confirmed
      }

      yield* stateService.initProject(projectPath, agent);
      console.log(`${colors.green}+${colors.reset} Initialized for ${agent}`);
    }

    // Step 3: Enable the skill
    console.log(`${colors.dim}Enabling skill...${colors.reset}`);

    const enableResult = yield* engineService
      .enable(projectPath, cachedSkill.manifest.name, {
        yes,
        noDeps,
        noInit,
      })
      .pipe(
        Effect.catchAll((error: unknown) => {
          // Check for already enabled
          if (error && typeof error === "object" && "_tag" in error && error._tag === "SkillAlreadyEnabledError") {
            console.log(`${colors.gray}o${colors.reset} ${cachedSkill.manifest.name} is already enabled`);
            return Effect.succeed({ skillName: cachedSkill.manifest.name, alreadyEnabled: true });
          }

          const message = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
          console.log(`${colors.red}Error:${colors.reset} Failed to enable skill: ${message}`);
          return Effect.fail(new InstallError({ message, cause: error }));
        })
      );

    // Print success message
    if (!("alreadyEnabled" in enableResult)) {
      console.log(`${colors.green}+${colors.reset} Enabled: ${enableResult.skillName}`);

      const details: string[] = [];
      if (enableResult.cliInstalled && enableResult.cliInstalled.length > 0) {
        details.push(`CLI: ${enableResult.cliInstalled.join(", ")}`);
      }
      if (enableResult.pluginInstalled) {
        details.push("Plugin installed");
      }
      if (enableResult.mcpConfigured) {
        details.push("MCP configured");
      }
      if (enableResult.initRan) {
        details.push("Init commands ran");
      }

      if (details.length > 0) {
        console.log(`  ${colors.dim}${details.join(" | ")}${colors.reset}`);
      }
    }

    console.log(`\n${colors.green}Done!${colors.reset} Skill "${cachedSkill.manifest.name}" is now active.`);
  });
