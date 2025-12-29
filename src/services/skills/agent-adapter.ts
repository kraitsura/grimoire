/**
 * Agent Adapter Interface and Factory
 *
 * Defines the adapter trait/interface for agent-specific operations.
 * Adapters handle agent-specific file operations, plugin installation,
 * MCP configuration, and file injection.
 */

import { Effect, Context, Layer, Data } from "effect";
import type { AgentType, InstallScope } from "../../models/skill";
import { GLOBAL_SKILL_LOCATIONS } from "../../models/skill";
import type { CachedSkill } from "./skill-cache-service";
import { InjectionError, PluginInstallError } from "../../models/skill-errors";
import type { McpConfig } from "../../models/skill";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import {
  hasManagedSection,
  addManagedSection,
  addSkillInjection,
  removeSkillInjection,
  hasSkillInjection,
} from "./injection-utils";
import type { SkillManifest } from "../../models/skill";

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Expand ~ in paths to home directory
 */
export function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/**
 * Get the global skills directory for an agent type
 */
export function getGlobalSkillsDir(agent: AgentType): string {
  const location = GLOBAL_SKILL_LOCATIONS[agent] || GLOBAL_SKILL_LOCATIONS.generic;
  return expandPath(location);
}

/**
 * Options for enabling a skill
 */
export interface EnableSkillOptions {
  /** Install scope: global (user-wide) or project (project-specific) */
  scope?: InstallScope;
  /** Create symlink from global to project instead of copying */
  link?: boolean;
}

// ============================================================================
// YAML Frontmatter Utilities for Claude Code Skills
// ============================================================================

/**
 * Check if content already has YAML frontmatter
 */
export function hasYamlFrontmatter(content: string): boolean {
  return content.trimStart().startsWith("---");
}

/**
 * Generate YAML frontmatter for a Claude Code SKILL.md file
 *
 * Claude Code uses this frontmatter for semantic skill discovery.
 * The description field is critical - it tells Claude WHEN to use the skill.
 */
export function generateSkillFrontmatter(manifest: SkillManifest): string {
  const lines: string[] = ["---"];

  // Name (required)
  lines.push(`name: ${manifest.name}`);

  // Description for discovery (required)
  const description = manifest.description;
  if (description) {
    // Handle multi-line descriptions
    if (description.includes("\n")) {
      lines.push(`description: |`);
      description.split("\n").forEach((line) => {
        lines.push(`  ${line}`);
      });
    } else {
      lines.push(`description: ${description}`);
    }
  }

  // Allowed tools (security boundary)
  if (manifest.allowed_tools && manifest.allowed_tools.length > 0) {
    lines.push(`allowed-tools: ${manifest.allowed_tools.join(", ")}`);
  }

  lines.push("---");
  lines.push(""); // Empty line after frontmatter

  return lines.join("\n");
}

/**
 * Prepend YAML frontmatter to skill content if not already present
 */
export function ensureSkillFrontmatter(content: string, manifest: SkillManifest): string {
  if (hasYamlFrontmatter(content)) {
    // Already has frontmatter, don't double-add
    return content;
  }

  const frontmatter = generateSkillFrontmatter(manifest);
  return frontmatter + content;
}

/**
 * Paths to exclude when copying skill directories
 */
const EXCLUDED_SKILL_PATHS = [".git", "node_modules", ".DS_Store", ".meta.json", "skill.yaml"];

/**
 * Check if a path should be excluded when copying to project
 */
function shouldExcludeFromProject(name: string): boolean {
  return EXCLUDED_SKILL_PATHS.includes(name);
}

/**
 * Options for copying skill directories
 */
interface CopySkillOptions {
  /** Whether to add YAML frontmatter to SKILL.md (Claude Code feature) */
  addFrontmatter?: boolean;
  /** The manifest to use for frontmatter generation */
  manifest: SkillManifest;
}

/**
 * Recursively copy skill directory from cache to project
 * Excludes .git, node_modules, .meta.json, and skill.yaml
 * Optionally adds frontmatter to SKILL.md (for Claude Code discovery)
 */
async function copySkillDirectoryToProjectAsync(
  srcDir: string,
  destDir: string,
  options: CopySkillOptions
): Promise<void> {
  // Create destination directory
  await mkdir(destDir, { recursive: true });

  // Read source directory entries
  const entries = await readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    // Skip excluded paths
    if (shouldExcludeFromProject(entry.name)) {
      continue;
    }

    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy subdirectory
      await copySkillDirectoryToProjectAsync(srcPath, destPath, options);
    } else if (entry.isFile()) {
      // Special handling for SKILL.md - optionally add frontmatter
      if (entry.name === "SKILL.md" && options.addFrontmatter) {
        const content = await readFile(srcPath, "utf-8");
        const contentWithFrontmatter = ensureSkillFrontmatter(content, options.manifest);
        await writeFile(destPath, contentWithFrontmatter, "utf-8");
      } else {
        // Regular file copy
        await copyFile(srcPath, destPath);
      }
    }
  }
}

/**
 * Effect wrapper for copySkillDirectoryToProject
 */
function copySkillDirectoryToProject(
  srcDir: string,
  destDir: string,
  options: CopySkillOptions,
  agent: AgentType = "claude_code"
): Effect.Effect<void, AgentAdapterError> {
  return Effect.tryPromise({
    try: () => copySkillDirectoryToProjectAsync(srcDir, destDir, options),
    catch: (error) =>
      new AgentAdapterError({
        agent,
        operation: "enableSkill",
        message: `Failed to copy skill directory: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      }),
  });
}

/**
 * Result of enabling a skill for an agent
 */
export interface AgentEnableResult {
  pluginInstalled?: boolean;
  mcpConfigured?: boolean;
  injected: boolean;
  skillFileCopied: boolean;
  linked?: boolean; // Skill was symlinked from global
}

/**
 * Error when an agent adapter operation fails
 */
export class AgentAdapterError extends Data.TaggedError("AgentAdapterError")<{
  agent: AgentType;
  operation: string;
  message: string;
  cause?: unknown;
}> {}

/**
 * Agent Adapter Interface
 *
 * Defines the contract for agent-specific operations.
 * Each agent type (claude_code, opencode, generic) implements this interface.
 */
export interface AgentAdapter {
  /**
   * Agent type identifier
   */
  readonly name: AgentType;

  /**
   * Detect if this agent is present in the project
   */
  readonly detect: (projectPath: string) => Effect.Effect<boolean>;

  /**
   * Initialize agent configuration in the project
   */
  readonly init: (projectPath: string) => Effect.Effect<void>;

  /**
   * Get the project-local skills directory path for this agent
   */
  readonly getSkillsDir: (projectPath: string) => string;

  /**
   * Get the global (user-wide) skills directory path for this agent
   */
  readonly getGlobalSkillsDir: () => string;

  /**
   * Get the agent markdown file path (CLAUDE.md, AGENTS.md, etc.)
   */
  readonly getAgentMdPath: (projectPath: string) => string;

  /**
   * Enable a skill for this agent
   * @param projectPath - Project directory path
   * @param skill - Skill to enable
   * @param options - Optional install scope (global/project) and link options
   */
  readonly enableSkill: (
    projectPath: string,
    skill: CachedSkill,
    options?: EnableSkillOptions
  ) => Effect.Effect<AgentEnableResult, AgentAdapterError>;

  /**
   * Disable a skill for this agent
   */
  readonly disableSkill: (
    projectPath: string,
    skillName: string
  ) => Effect.Effect<void, AgentAdapterError>;

  /**
   * Install a plugin from a marketplace (Claude Code specific)
   */
  readonly installPlugin?: (
    marketplace: string,
    name: string
  ) => Effect.Effect<void, PluginInstallError>;

  /**
   * Configure MCP server
   */
  readonly configureMcp?: (
    projectPath: string,
    name: string,
    config: McpConfig
  ) => Effect.Effect<void>;

  /**
   * Inject content into agent markdown file
   */
  readonly injectContent: (
    projectPath: string,
    skillName: string,
    content: string
  ) => Effect.Effect<void, InjectionError>;

  /**
   * Remove injected content from agent markdown file
   */
  readonly removeInjection: (
    projectPath: string,
    skillName: string
  ) => Effect.Effect<void>;
}

// ============================================================================
// Adapter Implementations
// ============================================================================

/**
 * Claude Code adapter
 */
const ClaudeCodeAdapter: AgentAdapter = {
  name: "claude_code",

  detect: (projectPath: string) =>
    Effect.gen(function* () {
      // Check for .claude/ directory existence
      const claudeDir = join(projectPath, ".claude");
      return existsSync(claudeDir);
    }),

  init: (projectPath: string) =>
    Effect.gen(function* () {
      const claudeDir = join(projectPath, ".claude");
      const skillsDir = join(claudeDir, "skills");
      const claudeMdPath = join(projectPath, "CLAUDE.md");

      // Create .claude/skills/ directory
      yield* Effect.tryPromise({
        try: () => mkdir(skillsDir, { recursive: true }),
        catch: (error) =>
          new AgentAdapterError({
            agent: "claude_code",
            operation: "init",
            message: `Failed to create skills directory: ${skillsDir}`,
            cause: error,
          }),
      });

      // Ensure CLAUDE.md exists with managed section
      const claudeMdExists = existsSync(claudeMdPath);
      if (!claudeMdExists) {
        // Create new CLAUDE.md with managed section
        const defaultContent = "# Claude Code Instructions\n\n";
        const contentWithManaged = addManagedSection(defaultContent);
        yield* Effect.tryPromise({
          try: () => writeFile(claudeMdPath, contentWithManaged, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "claude_code",
              operation: "init",
              message: `Failed to create CLAUDE.md`,
              cause: error,
            }),
        });
      } else {
        // Add managed section if it doesn't exist
        const content = yield* Effect.tryPromise({
          try: () => readFile(claudeMdPath, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "claude_code",
              operation: "init",
              message: `Failed to read CLAUDE.md`,
              cause: error,
            }),
        });

        if (!hasManagedSection(content)) {
          const contentWithManaged = addManagedSection(content);
          yield* Effect.tryPromise({
            try: () => writeFile(claudeMdPath, contentWithManaged, "utf-8"),
            catch: (error) =>
              new AgentAdapterError({
                agent: "claude_code",
                operation: "init",
                message: `Failed to update CLAUDE.md`,
                cause: error,
              }),
          });
        }
      }
    }).pipe(Effect.orDie),

  getSkillsDir: (projectPath: string) => {
    return join(projectPath, ".claude", "skills");
  },

  getGlobalSkillsDir: () => {
    return getGlobalSkillsDir("claude_code");
  },

  getAgentMdPath: (projectPath: string) => {
    return join(projectPath, "CLAUDE.md");
  },

  enableSkill: (projectPath: string, skill: CachedSkill, options?: EnableSkillOptions) =>
    Effect.gen(function* () {
      const result: AgentEnableResult = {
        injected: false,
        skillFileCopied: false,
      };

      const scope = options?.scope ?? "project";
      const shouldLink = options?.link ?? false;

      // Always copy skill directory when SKILL.md exists (agentskills.io standard)
      // Claude Code expects skills as directories: .claude/skills/<name>/ or ~/.claude/skills/<name>/
      if (skill.skillMdPath) {
        // Determine target directory based on scope
        const skillsDir = scope === "global"
          ? ClaudeCodeAdapter.getGlobalSkillsDir()
          : ClaudeCodeAdapter.getSkillsDir(projectPath);
        const skillDir = join(skillsDir, skill.manifest.name);

        // Get the source cache directory (parent of SKILL.md)
        const sourceCacheDir = dirname(skill.skillMdPath);

        if (shouldLink && scope === "project") {
          // Create symlink from global to project
          const globalSkillDir = join(ClaudeCodeAdapter.getGlobalSkillsDir(), skill.manifest.name);
          if (existsSync(globalSkillDir)) {
            yield* Effect.tryPromise({
              try: async () => {
                const { symlink } = await import("node:fs/promises");
                await mkdir(dirname(skillDir), { recursive: true });
                await symlink(globalSkillDir, skillDir, "dir");
              },
              catch: (error) =>
                new AgentAdapterError({
                  agent: "claude_code",
                  operation: "enableSkill",
                  message: `Failed to create symlink: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            });
            result.skillFileCopied = true;
            result.linked = true;
          } else {
            return yield* Effect.fail(
              new AgentAdapterError({
                agent: "claude_code",
                operation: "enableSkill",
                message: `Cannot link: skill not installed globally. Run 'grimoire skills enable ${skill.manifest.name} --global' first.`,
              })
            );
          }
        } else {
          // Copy entire skill directory from cache to target location
          // Claude Code needs frontmatter for skill discovery
          yield* copySkillDirectoryToProject(
            sourceCacheDir,
            skillDir,
            { manifest: skill.manifest, addFrontmatter: true },
            "claude_code"
          );
          result.skillFileCopied = true;
        }
      }

      return result;
    }),

  disableSkill: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const skillsDir = ClaudeCodeAdapter.getSkillsDir(projectPath);
      const skillDir = join(skillsDir, skillName);
      const legacyFilePath = join(skillsDir, `${skillName}.md`);

      // Remove skill directory if it exists (new structure: .claude/skills/<name>/)
      if (existsSync(skillDir)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { rm } = await import("node:fs/promises");
            await rm(skillDir, { recursive: true, force: true });
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "claude_code",
              operation: "disableSkill",
              message: `Failed to remove skill directory: ${skillDir}`,
              cause: error,
            }),
        });
      }

      // Also remove legacy file structure if it exists (old: .claude/skills/<name>.md)
      if (existsSync(legacyFilePath)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { unlink } = await import("node:fs/promises");
            await unlink(legacyFilePath);
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "claude_code",
              operation: "disableSkill",
              message: `Failed to remove legacy skill file: ${legacyFilePath}`,
              cause: error,
            }),
        });
      }

      // Remove injection from CLAUDE.md
      yield* ClaudeCodeAdapter.removeInjection(projectPath, skillName);
    }).pipe(Effect.orDie),

  installPlugin: (marketplace: string, name: string) =>
    Effect.gen(function* () {
      // Run: claude plugin marketplace add <marketplace>
      yield* Effect.tryPromise({
        try: async () => {
          const { spawn } = await import("node:child_process");
          const { promisify } = await import("node:util");
          const execAsync = promisify(spawn);

          await new Promise<void>((resolve, reject) => {
            const proc = spawn("claude", ["plugin", "marketplace", "add", marketplace], {
              stdio: "inherit",
            });
            proc.on("close", (code) => {
              if (code === 0) resolve();
              else reject(new Error(`claude plugin marketplace add failed with code ${code}`));
            });
            proc.on("error", reject);
          });
        },
        catch: (error) =>
          new PluginInstallError({
            plugin: `${marketplace}/${name}`,
            message: `Failed to add marketplace: ${marketplace}`,
          }),
      });

      // Run: claude plugin install <name>
      yield* Effect.tryPromise({
        try: async () => {
          const { spawn } = await import("node:child_process");

          await new Promise<void>((resolve, reject) => {
            const proc = spawn("claude", ["plugin", "install", name], {
              stdio: "inherit",
            });
            proc.on("close", (code) => {
              if (code === 0) resolve();
              else reject(new Error(`claude plugin install failed with code ${code}`));
            });
            proc.on("error", reject);
          });
        },
        catch: (error) =>
          new PluginInstallError({
            plugin: name,
            message: `Failed to install plugin: ${name}`,
          }),
      });
    }),

  configureMcp: (projectPath: string, name: string, config: McpConfig) =>
    Effect.gen(function* () {
      const settingsPath = join(projectPath, ".claude", "settings.json");

      // Read existing settings or create empty object
      let settings: any = {};
      if (existsSync(settingsPath)) {
        const content = yield* Effect.tryPromise({
          try: () => readFile(settingsPath, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "claude_code",
              operation: "configureMcp",
              message: `Failed to read settings.json`,
              cause: error,
            }),
        });
        try {
          settings = JSON.parse(content);
        } catch (error) {
          // Invalid JSON, start fresh
          settings = {};
        }
      }

      // Add MCP configuration
      if (!settings.mcpServers) {
        settings.mcpServers = {};
      }
      settings.mcpServers[name] = config;

      // Write updated settings
      yield* Effect.tryPromise({
        try: () => writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8"),
        catch: (error) =>
          new AgentAdapterError({
            agent: "claude_code",
            operation: "configureMcp",
            message: `Failed to write settings.json`,
            cause: error,
          }),
      });
    }).pipe(Effect.orDie),

  injectContent: (projectPath: string, skillName: string, content: string) =>
    Effect.gen(function* () {
      const claudeMdPath = ClaudeCodeAdapter.getAgentMdPath(projectPath);

      // Read current content
      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(claudeMdPath, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: claudeMdPath,
            message: `Failed to read CLAUDE.md`,
          }),
      });

      // Add skill injection
      const updatedContent = yield* addSkillInjection(currentContent, skillName, content);

      // Write updated content
      yield* Effect.tryPromise({
        try: () => writeFile(claudeMdPath, updatedContent, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: claudeMdPath,
            message: `Failed to write CLAUDE.md`,
          }),
      });
    }),

  removeInjection: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const claudeMdPath = ClaudeCodeAdapter.getAgentMdPath(projectPath);

      // Check if file exists
      if (!existsSync(claudeMdPath)) {
        return;
      }

      // Read current content
      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(claudeMdPath, "utf-8"),
        catch: (error) =>
          new AgentAdapterError({
            agent: "claude_code",
            operation: "removeInjection",
            message: `Failed to read CLAUDE.md`,
            cause: error,
          }),
      });

      // Remove skill injection
      const updatedContent = removeSkillInjection(currentContent, skillName);

      // Write updated content only if changed
      if (updatedContent !== currentContent) {
        yield* Effect.tryPromise({
          try: () => writeFile(claudeMdPath, updatedContent, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "claude_code",
              operation: "removeInjection",
              message: `Failed to write CLAUDE.md`,
              cause: error,
            }),
        });
      }
    }).pipe(Effect.orDie),
};

/**
 * OpenCode adapter
 *
 * OpenCode configuration paths:
 * - Primary config: opencode.json (project root)
 * - Global config: ~/.config/opencode/opencode.json
 * - Agents: .opencode/agent/
 * - Commands: .opencode/command/
 * - Instructions: AGENTS.md
 *
 * MCP format for OpenCode:
 * {
 *   "mcp": {
 *     "server-name": {
 *       "type": "local",
 *       "command": ["cmd", "arg1", "arg2"],
 *       "environment": { "VAR": "value" }
 *     }
 *   }
 * }
 */
const OpenCodeAdapter: AgentAdapter = {
  name: "opencode",

  detect: (projectPath: string) =>
    Effect.gen(function* () {
      // Check for .opencode/ directory or opencode.json config file
      const opencodeDir = join(projectPath, ".opencode");
      const opencodeConfig = join(projectPath, "opencode.json");
      return existsSync(opencodeDir) || existsSync(opencodeConfig);
    }),

  init: (projectPath: string) =>
    Effect.gen(function* () {
      const opencodeDir = join(projectPath, ".opencode");
      const skillsDir = join(opencodeDir, "skills");
      const agentsMdPath = join(projectPath, "AGENTS.md");

      // Create .opencode/skills/ directory
      yield* Effect.tryPromise({
        try: () => mkdir(skillsDir, { recursive: true }),
        catch: (error) =>
          new AgentAdapterError({
            agent: "opencode",
            operation: "init",
            message: `Failed to create skills directory: ${skillsDir}`,
            cause: error,
          }),
      });

      // Ensure AGENTS.md exists with managed section
      const agentsMdExists = existsSync(agentsMdPath);
      if (!agentsMdExists) {
        // Create new AGENTS.md with managed section
        const defaultContent = "# Agent Instructions\n\n";
        const contentWithManaged = addManagedSection(defaultContent);
        yield* Effect.tryPromise({
          try: () => writeFile(agentsMdPath, contentWithManaged, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "opencode",
              operation: "init",
              message: `Failed to create AGENTS.md`,
              cause: error,
            }),
        });
      } else {
        // Add managed section if it doesn't exist
        const content = yield* Effect.tryPromise({
          try: () => readFile(agentsMdPath, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "opencode",
              operation: "init",
              message: `Failed to read AGENTS.md`,
              cause: error,
            }),
        });

        if (!hasManagedSection(content)) {
          const contentWithManaged = addManagedSection(content);
          yield* Effect.tryPromise({
            try: () => writeFile(agentsMdPath, contentWithManaged, "utf-8"),
            catch: (error) =>
              new AgentAdapterError({
                agent: "opencode",
                operation: "init",
                message: `Failed to update AGENTS.md`,
                cause: error,
              }),
          });
        }
      }
    }).pipe(Effect.orDie),

  getSkillsDir: (projectPath: string) => {
    return join(projectPath, ".opencode", "skills");
  },

  getGlobalSkillsDir: () => {
    return getGlobalSkillsDir("opencode");
  },

  getAgentMdPath: (projectPath: string) => {
    return join(projectPath, "AGENTS.md");
  },

  enableSkill: (projectPath: string, skill: CachedSkill, options?: EnableSkillOptions) =>
    Effect.gen(function* () {
      const result: AgentEnableResult = {
        injected: false,
        skillFileCopied: false,
      };

      const scope = options?.scope ?? "project";
      const shouldLink = options?.link ?? false;

      // Always copy skill directory when SKILL.md exists (agentskills.io standard)
      // OpenCode stores skills as directories: .opencode/skills/<name>/ or ~/.config/opencode/skills/<name>/
      if (skill.skillMdPath) {
        // Determine target directory based on scope
        const skillsDir = scope === "global"
          ? OpenCodeAdapter.getGlobalSkillsDir()
          : OpenCodeAdapter.getSkillsDir(projectPath);
        const skillDir = join(skillsDir, skill.manifest.name);

        // Get the source cache directory (parent of SKILL.md)
        const sourceCacheDir = dirname(skill.skillMdPath);

        if (shouldLink && scope === "project") {
          // Create symlink from global to project
          const globalSkillDir = join(OpenCodeAdapter.getGlobalSkillsDir(), skill.manifest.name);
          if (existsSync(globalSkillDir)) {
            yield* Effect.tryPromise({
              try: async () => {
                const { symlink } = await import("node:fs/promises");
                await mkdir(dirname(skillDir), { recursive: true });
                await symlink(globalSkillDir, skillDir, "dir");
              },
              catch: (error) =>
                new AgentAdapterError({
                  agent: "opencode",
                  operation: "enableSkill",
                  message: `Failed to create symlink: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            });
            result.skillFileCopied = true;
            result.linked = true;
          } else {
            return yield* Effect.fail(
              new AgentAdapterError({
                agent: "opencode",
                operation: "enableSkill",
                message: `Cannot link: skill not installed globally. Run 'grimoire skills enable ${skill.manifest.name} --global' first.`,
              })
            );
          }
        } else {
          // Copy entire skill directory from cache to target location
          // OpenCode doesn't need frontmatter (no Skill tool discovery mechanism)
          yield* copySkillDirectoryToProject(
            sourceCacheDir,
            skillDir,
            { manifest: skill.manifest, addFrontmatter: false },
            "opencode"
          );
          result.skillFileCopied = true;
        }
      }

      return result;
    }),

  disableSkill: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const skillsDir = OpenCodeAdapter.getSkillsDir(projectPath);
      const skillDir = join(skillsDir, skillName);
      const legacyFilePath = join(skillsDir, `${skillName}.md`);

      // Remove skill directory if it exists (new structure: .opencode/skills/<name>/)
      if (existsSync(skillDir)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { rm } = await import("node:fs/promises");
            await rm(skillDir, { recursive: true, force: true });
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "opencode",
              operation: "disableSkill",
              message: `Failed to remove skill directory: ${skillDir}`,
              cause: error,
            }),
        });
      }

      // Also remove legacy file structure if it exists (old: .opencode/skills/<name>.md)
      if (existsSync(legacyFilePath)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { unlink } = await import("node:fs/promises");
            await unlink(legacyFilePath);
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "opencode",
              operation: "disableSkill",
              message: `Failed to remove legacy skill file: ${legacyFilePath}`,
              cause: error,
            }),
        });
      }

      // Remove injection from AGENTS.md
      yield* OpenCodeAdapter.removeInjection(projectPath, skillName);
    }).pipe(Effect.orDie),

  configureMcp: (projectPath: string, name: string, config: McpConfig) =>
    Effect.gen(function* () {
      // OpenCode uses opencode.json at project root (not .opencode/config.json)
      const configPath = join(projectPath, "opencode.json");

      // Read existing config or create empty object
      let opencodeConfig: any = {};
      if (existsSync(configPath)) {
        const content = yield* Effect.tryPromise({
          try: () => readFile(configPath, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "opencode",
              operation: "configureMcp",
              message: `Failed to read opencode.json`,
              cause: error,
            }),
        });
        try {
          opencodeConfig = JSON.parse(content);
        } catch (error) {
          // Invalid JSON, start fresh
          opencodeConfig = {};
        }
      }

      // Add MCP configuration in OpenCode format
      // OpenCode uses "mcp" key (not "mcpServers") with different structure
      if (!opencodeConfig.mcp) {
        opencodeConfig.mcp = {};
      }

      // Transform to OpenCode MCP format:
      // { type: "local", command: ["cmd", ...args], environment: { ... } }
      opencodeConfig.mcp[name] = {
        type: "local",
        command: [config.command, ...(config.args || [])],
        ...(config.env && { environment: config.env }),
      };

      // Write updated config
      yield* Effect.tryPromise({
        try: () => writeFile(configPath, JSON.stringify(opencodeConfig, null, 2), "utf-8"),
        catch: (error) =>
          new AgentAdapterError({
            agent: "opencode",
            operation: "configureMcp",
            message: `Failed to write opencode.json`,
            cause: error,
          }),
      });
    }).pipe(Effect.orDie),

  injectContent: (projectPath: string, skillName: string, content: string) =>
    Effect.gen(function* () {
      const agentsMdPath = OpenCodeAdapter.getAgentMdPath(projectPath);

      // Read current content
      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(agentsMdPath, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: agentsMdPath,
            message: `Failed to read AGENTS.md`,
          }),
      });

      // Add skill injection
      const updatedContent = yield* addSkillInjection(currentContent, skillName, content);

      // Write updated content
      yield* Effect.tryPromise({
        try: () => writeFile(agentsMdPath, updatedContent, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: agentsMdPath,
            message: `Failed to write AGENTS.md`,
          }),
      });
    }),

  removeInjection: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const agentsMdPath = OpenCodeAdapter.getAgentMdPath(projectPath);

      // Check if file exists
      if (!existsSync(agentsMdPath)) {
        return;
      }

      // Read current content
      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(agentsMdPath, "utf-8"),
        catch: (error) =>
          new AgentAdapterError({
            agent: "opencode",
            operation: "removeInjection",
            message: `Failed to read AGENTS.md`,
            cause: error,
          }),
      });

      // Remove skill injection
      const updatedContent = removeSkillInjection(currentContent, skillName);

      // Write updated content only if changed
      if (updatedContent !== currentContent) {
        yield* Effect.tryPromise({
          try: () => writeFile(agentsMdPath, updatedContent, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "opencode",
              operation: "removeInjection",
              message: `Failed to write AGENTS.md`,
              cause: error,
            }),
        });
      }
    }).pipe(Effect.orDie),
};

/**
 * Generic adapter (fallback implementation)
 */
const GenericAdapter: AgentAdapter = {
  name: "generic",

  detect: (projectPath: string) =>
    Effect.gen(function* () {
      // Check for AGENTS.md file existence
      const agentsMd = join(projectPath, "AGENTS.md");
      return existsSync(agentsMd);
    }),

  init: (projectPath: string) =>
    Effect.gen(function* () {
      const skillsDir = join(projectPath, ".skills");
      const agentsMdPath = join(projectPath, "AGENTS.md");

      // Create .skills/ directory
      yield* Effect.tryPromise({
        try: () => mkdir(skillsDir, { recursive: true }),
        catch: (error) =>
          new AgentAdapterError({
            agent: "generic",
            operation: "init",
            message: `Failed to create skills directory: ${skillsDir}`,
            cause: error,
          }),
      });

      // Ensure AGENTS.md exists with managed section
      const agentsMdExists = existsSync(agentsMdPath);
      if (!agentsMdExists) {
        // Create new AGENTS.md with managed section
        const defaultContent = "# Agent Instructions\n\n";
        const contentWithManaged = addManagedSection(defaultContent);
        yield* Effect.tryPromise({
          try: () => writeFile(agentsMdPath, contentWithManaged, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "generic",
              operation: "init",
              message: `Failed to create AGENTS.md`,
              cause: error,
            }),
        });
      } else {
        // Add managed section if it doesn't exist
        const content = yield* Effect.tryPromise({
          try: () => readFile(agentsMdPath, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "generic",
              operation: "init",
              message: `Failed to read AGENTS.md`,
              cause: error,
            }),
        });

        if (!hasManagedSection(content)) {
          const contentWithManaged = addManagedSection(content);
          yield* Effect.tryPromise({
            try: () => writeFile(agentsMdPath, contentWithManaged, "utf-8"),
            catch: (error) =>
              new AgentAdapterError({
                agent: "generic",
                operation: "init",
                message: `Failed to update AGENTS.md`,
                cause: error,
              }),
          });
        }
      }
    }).pipe(Effect.orDie),

  getSkillsDir: (projectPath: string) => {
    return join(projectPath, ".skills");
  },

  getGlobalSkillsDir: () => {
    return getGlobalSkillsDir("generic");
  },

  getAgentMdPath: (projectPath: string) => {
    return join(projectPath, "AGENTS.md");
  },

  enableSkill: (projectPath: string, skill: CachedSkill, options?: EnableSkillOptions) =>
    Effect.gen(function* () {
      const result: AgentEnableResult = {
        injected: false,
        skillFileCopied: false,
      };

      const scope = options?.scope ?? "project";
      const shouldLink = options?.link ?? false;

      // Copy full skill directory (SKILL.md + scripts/ + references/ + assets/)
      // This follows the agentskills.io standard for skill bundles
      if (skill.skillMdPath) {
        // Determine target directory based on scope
        const skillsDir = scope === "global"
          ? GenericAdapter.getGlobalSkillsDir()
          : GenericAdapter.getSkillsDir(projectPath);
        const skillDir = join(skillsDir, skill.manifest.name);

        // Get the source cache directory (parent of SKILL.md)
        const sourceCacheDir = dirname(skill.skillMdPath);

        if (shouldLink && scope === "project") {
          // Create symlink from global to project
          const globalSkillDir = join(GenericAdapter.getGlobalSkillsDir(), skill.manifest.name);
          if (existsSync(globalSkillDir)) {
            yield* Effect.tryPromise({
              try: async () => {
                const { symlink } = await import("node:fs/promises");
                await mkdir(dirname(skillDir), { recursive: true });
                await symlink(globalSkillDir, skillDir, "dir");
              },
              catch: (error) =>
                new AgentAdapterError({
                  agent: "generic",
                  operation: "enableSkill",
                  message: `Failed to create symlink: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            });
            result.skillFileCopied = true;
            result.linked = true;
          } else {
            return yield* Effect.fail(
              new AgentAdapterError({
                agent: "generic",
                operation: "enableSkill",
                message: `Cannot link: skill not installed globally. Run 'grimoire skills enable ${skill.manifest.name} --global' first.`,
              })
            );
          }
        } else {
          // Copy entire skill directory from cache to target location
          // Generic adapter doesn't need frontmatter (no Skill tool discovery mechanism)
          yield* copySkillDirectoryToProject(
            sourceCacheDir,
            skillDir,
            { manifest: skill.manifest, addFrontmatter: false },
            "generic"
          );
          result.skillFileCopied = true;
        }
      }

      return result;
    }),

  disableSkill: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const skillsDir = GenericAdapter.getSkillsDir(projectPath);
      const skillDir = join(skillsDir, skillName);
      const legacyFilePath = join(skillsDir, `${skillName}.md`);

      // Remove skill directory if it exists (new structure: .skills/<name>/)
      if (existsSync(skillDir)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { rm } = await import("node:fs/promises");
            await rm(skillDir, { recursive: true, force: true });
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "generic",
              operation: "disableSkill",
              message: `Failed to remove skill directory: ${skillDir}`,
              cause: error,
            }),
        });
      }

      // Also remove legacy file structure if it exists (old: .skills/<name>.md)
      if (existsSync(legacyFilePath)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { unlink } = await import("node:fs/promises");
            await unlink(legacyFilePath);
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "generic",
              operation: "disableSkill",
              message: `Failed to remove legacy skill file: ${legacyFilePath}`,
              cause: error,
            }),
        });
      }

      // Remove injection from AGENTS.md
      yield* GenericAdapter.removeInjection(projectPath, skillName);
    }).pipe(Effect.orDie),

  injectContent: (projectPath: string, skillName: string, content: string) =>
    Effect.gen(function* () {
      const agentsMdPath = GenericAdapter.getAgentMdPath(projectPath);

      // Read current content
      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(agentsMdPath, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: agentsMdPath,
            message: `Failed to read AGENTS.md`,
          }),
      });

      // Add skill injection
      const updatedContent = yield* addSkillInjection(currentContent, skillName, content);

      // Write updated content
      yield* Effect.tryPromise({
        try: () => writeFile(agentsMdPath, updatedContent, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: agentsMdPath,
            message: `Failed to write AGENTS.md`,
          }),
      });
    }),

  removeInjection: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const agentsMdPath = GenericAdapter.getAgentMdPath(projectPath);

      // Check if file exists
      if (!existsSync(agentsMdPath)) {
        return;
      }

      // Read current content
      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(agentsMdPath, "utf-8"),
        catch: (error) =>
          new AgentAdapterError({
            agent: "generic",
            operation: "removeInjection",
            message: `Failed to read AGENTS.md`,
            cause: error,
          }),
      });

      // Remove skill injection
      const updatedContent = removeSkillInjection(currentContent, skillName);

      // Write updated content only if changed
      if (updatedContent !== currentContent) {
        yield* Effect.tryPromise({
          try: () => writeFile(agentsMdPath, updatedContent, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "generic",
              operation: "removeInjection",
              message: `Failed to write AGENTS.md`,
              cause: error,
            }),
        });
      }
    }).pipe(Effect.orDie),
};

// ============================================================================
// Codex Adapter (OpenAI Codex CLI)
// ============================================================================

/**
 * Get the effective agent MD path for reading, checking override first
 * Codex supports AGENTS.override.md which takes precedence over AGENTS.md
 */
function getCodexAgentMdPathForRead(projectPath: string): string {
  const overridePath = join(projectPath, "AGENTS.override.md");
  if (existsSync(overridePath)) {
    return overridePath;
  }
  return join(projectPath, "AGENTS.md");
}

/**
 * Check if an AGENTS.override.md exists at the given path
 */
function hasCodexOverrideFile(projectPath: string): boolean {
  return existsSync(join(projectPath, "AGENTS.override.md"));
}

/**
 * Codex adapter
 *
 * Codex configuration:
 * - Agent MD: AGENTS.md (walks from repo root to cwd)
 * - Override: AGENTS.override.md takes precedence when present
 * - Config: ~/.codex/config.toml
 * - Skills: .codex/skills/<name>/SKILL.md (file-based, Dec 2025 format)
 * - Global skills: ~/.codex/skills/<name>/SKILL.md
 */
const CodexAdapter: AgentAdapter = {
  name: "codex",

  detect: (projectPath: string) =>
    Effect.gen(function* () {
      // Check for AGENTS.md, AGENTS.override.md, or .codex/ directory
      const agentsMd = join(projectPath, "AGENTS.md");
      const agentsOverrideMd = join(projectPath, "AGENTS.override.md");
      const codexDir = join(projectPath, ".codex");
      return existsSync(agentsMd) || existsSync(agentsOverrideMd) || existsSync(codexDir);
    }),

  init: (projectPath: string) =>
    Effect.gen(function* () {
      const agentsMdPath = join(projectPath, "AGENTS.md");
      const skillsDir = join(projectPath, ".codex", "skills");

      // Create .codex/skills/ directory
      yield* Effect.tryPromise({
        try: () => mkdir(skillsDir, { recursive: true }),
        catch: (error) =>
          new AgentAdapterError({
            agent: "codex",
            operation: "init",
            message: `Failed to create skills directory: ${skillsDir}`,
            cause: error,
          }),
      });

      // Ensure AGENTS.md exists with managed section
      const agentsMdExists = existsSync(agentsMdPath);
      if (!agentsMdExists) {
        const defaultContent = `# Agent Instructions

Instructions for AI coding assistants.

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
`;
        yield* Effect.tryPromise({
          try: () => writeFile(agentsMdPath, defaultContent, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "codex",
              operation: "init",
              message: `Failed to create AGENTS.md`,
              cause: error,
            }),
        });
      } else {
        const content = yield* Effect.tryPromise({
          try: () => readFile(agentsMdPath, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "codex",
              operation: "init",
              message: `Failed to read AGENTS.md`,
              cause: error,
            }),
        });

        if (!hasManagedSection(content)) {
          const contentWithManaged = addManagedSection(content);
          yield* Effect.tryPromise({
            try: () => writeFile(agentsMdPath, contentWithManaged, "utf-8"),
            catch: (error) =>
              new AgentAdapterError({
                agent: "codex",
                operation: "init",
                message: `Failed to update AGENTS.md`,
                cause: error,
              }),
          });
        }
      }
    }).pipe(Effect.orDie),

  getSkillsDir: (projectPath: string) => {
    // Codex now supports skills directory (Dec 2025)
    return join(projectPath, ".codex", "skills");
  },

  getGlobalSkillsDir: () => {
    return getGlobalSkillsDir("codex");
  },

  getAgentMdPath: (projectPath: string) => {
    return join(projectPath, "AGENTS.md");
  },

  enableSkill: (projectPath: string, skill: CachedSkill, options?: EnableSkillOptions) =>
    Effect.gen(function* () {
      const result: AgentEnableResult = {
        injected: false,
        skillFileCopied: false,
      };

      const scope = options?.scope ?? "project";
      const shouldLink = options?.link ?? false;

      // Codex now supports file-based skills (Dec 2025 format)
      // Skills go in .codex/skills/<name>/SKILL.md
      if (skill.skillMdPath) {
        // Determine target directory based on scope
        const skillsDir = scope === "global"
          ? CodexAdapter.getGlobalSkillsDir()
          : CodexAdapter.getSkillsDir(projectPath);
        const skillDir = join(skillsDir, skill.manifest.name);

        // Get the source cache directory (parent of SKILL.md)
        const sourceCacheDir = dirname(skill.skillMdPath);

        if (shouldLink && scope === "project") {
          // Create symlink from global to project
          const globalSkillDir = join(CodexAdapter.getGlobalSkillsDir(), skill.manifest.name);
          if (existsSync(globalSkillDir)) {
            yield* Effect.tryPromise({
              try: async () => {
                const { symlink } = await import("node:fs/promises");
                await mkdir(dirname(skillDir), { recursive: true });
                await symlink(globalSkillDir, skillDir, "dir");
              },
              catch: (error) =>
                new AgentAdapterError({
                  agent: "codex",
                  operation: "enableSkill",
                  message: `Failed to create symlink: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            });
            result.skillFileCopied = true;
            result.linked = true;
          } else {
            return yield* Effect.fail(
              new AgentAdapterError({
                agent: "codex",
                operation: "enableSkill",
                message: `Cannot link: skill not installed globally. Run 'grimoire skills enable ${skill.manifest.name} --global' first.`,
              })
            );
          }
        } else {
          // Copy entire skill directory from cache to target location
          // Codex uses standard SKILL.md format (agentskills.io compatible)
          yield* copySkillDirectoryToProject(
            sourceCacheDir,
            skillDir,
            { manifest: skill.manifest, addFrontmatter: true },
            "codex"
          );
          result.skillFileCopied = true;
        }
      }

      return result;
    }),

  disableSkill: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const skillsDir = CodexAdapter.getSkillsDir(projectPath);
      const skillDir = join(skillsDir, skillName);

      // Remove skill directory if it exists (.codex/skills/<name>/)
      if (existsSync(skillDir)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { rm } = await import("node:fs/promises");
            await rm(skillDir, { recursive: true, force: true });
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "codex",
              operation: "disableSkill",
              message: `Failed to remove skill directory: ${skillDir}`,
              cause: error,
            }),
        });
      }

      // Also remove any legacy injection from AGENTS.md
      yield* CodexAdapter.removeInjection(projectPath, skillName);
    }).pipe(Effect.orDie),

  injectContent: (projectPath: string, skillName: string, content: string) =>
    Effect.gen(function* () {
      // Use override file if it exists, otherwise regular AGENTS.md
      const agentsMdPath = getCodexAgentMdPathForRead(projectPath);

      if (!existsSync(agentsMdPath)) {
        return;
      }

      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(agentsMdPath, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: agentsMdPath,
            message: `Failed to read ${hasCodexOverrideFile(projectPath) ? "AGENTS.override.md" : "AGENTS.md"}`,
          }),
      });

      const updatedContent = yield* addSkillInjection(currentContent, skillName, content);

      yield* Effect.tryPromise({
        try: () => writeFile(agentsMdPath, updatedContent, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: agentsMdPath,
            message: `Failed to write ${hasCodexOverrideFile(projectPath) ? "AGENTS.override.md" : "AGENTS.md"}`,
          }),
      });
    }),

  removeInjection: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      // Check both override and regular file for injections to remove
      const filesToCheck = [
        join(projectPath, "AGENTS.override.md"),
        join(projectPath, "AGENTS.md"),
      ];

      for (const agentsMdPath of filesToCheck) {
        if (!existsSync(agentsMdPath)) {
          continue;
        }

        const currentContent = yield* Effect.tryPromise({
          try: () => readFile(agentsMdPath, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "codex",
              operation: "removeInjection",
              message: `Failed to read ${agentsMdPath}`,
              cause: error,
            }),
        });

        const updatedContent = removeSkillInjection(currentContent, skillName);

        if (updatedContent !== currentContent) {
          yield* Effect.tryPromise({
            try: () => writeFile(agentsMdPath, updatedContent, "utf-8"),
            catch: (error) =>
              new AgentAdapterError({
                agent: "codex",
                operation: "removeInjection",
                message: `Failed to write ${agentsMdPath}`,
                cause: error,
              }),
          });
        }
      }
    }).pipe(Effect.orDie),
};

// ============================================================================
// Cursor Adapter (Cursor IDE)
// ============================================================================

/**
 * Parse globs from SKILL.md frontmatter
 * Supports both array format and comma-separated string
 */
function parseGlobsFromFrontmatter(content: string): string[] | undefined {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return undefined;

  const frontmatter = frontmatterMatch[1];

  // Try to find globs field
  const globsMatch = frontmatter.match(/^globs:\s*(.+)$/m);
  if (!globsMatch) return undefined;

  const globsValue = globsMatch[1].trim();

  // Handle array format: ["*.ts", "*.tsx"]
  if (globsValue.startsWith("[")) {
    try {
      // Simple JSON-like array parsing
      const parsed = JSON.parse(globsValue.replace(/'/g, '"'));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to string parsing
    }
  }

  // Handle comma-separated: "*.ts, *.tsx"
  if (globsValue.includes(",")) {
    return globsValue.split(",").map((g) => g.trim().replace(/^["']|["']$/g, ""));
  }

  // Single glob
  return [globsValue.replace(/^["']|["']$/g, "")];
}

/**
 * Convert SKILL.md to Cursor RULE.md format
 * New format uses folders: .cursor/rules/<name>/RULE.md
 */
function convertToRuleMd(skill: CachedSkill, skillContent: string): string {
  const description = skill.manifest.description || skill.manifest.name;

  // Handle multi-line descriptions
  const descriptionYaml = description.includes("\n")
    ? `|\n${description.split("\n").map(line => `  ${line}`).join("\n")}`
    : `"${description.replace(/"/g, '\\"')}"`;

  // Parse globs from SKILL.md frontmatter if present
  const globs = parseGlobsFromFrontmatter(skillContent);

  // Strip existing frontmatter from skill content
  const contentWithoutFrontmatter = skillContent.replace(/^---[\s\S]*?---\n*/, "");

  const lines = ["---"];
  lines.push(`description: ${descriptionYaml}`);
  lines.push(`alwaysApply: false`);

  // Add globs if specified in the skill's frontmatter
  if (globs && globs.length > 0) {
    lines.push(`globs: ${JSON.stringify(globs)}`);
  }

  lines.push("---");
  lines.push("");
  lines.push(contentWithoutFrontmatter);

  return lines.join("\n");
}

/**
 * Cursor adapter
 *
 * Cursor configuration:
 * - Rules: .cursor/rules/<name>/RULE.md (folder-based format)
 * - Supports AGENTS.md fallback for legacy compatibility
 */
const CursorAdapter: AgentAdapter = {
  name: "cursor",

  detect: (projectPath: string) =>
    Effect.gen(function* () {
      const cursorDir = join(projectPath, ".cursor");
      return existsSync(cursorDir);
    }),

  init: (projectPath: string) =>
    Effect.gen(function* () {
      const cursorDir = join(projectPath, ".cursor");
      const rulesDir = join(cursorDir, "rules");

      // Create .cursor/rules/ directory
      yield* Effect.tryPromise({
        try: () => mkdir(rulesDir, { recursive: true }),
        catch: (error) =>
          new AgentAdapterError({
            agent: "cursor",
            operation: "init",
            message: `Failed to create rules directory: ${rulesDir}`,
            cause: error,
          }),
      });

      // Create AGENTS.md for legacy compatibility
      const agentsMdPath = join(projectPath, "AGENTS.md");
      if (!existsSync(agentsMdPath)) {
        const defaultContent = "# Agent Instructions\n\n";
        const contentWithManaged = addManagedSection(defaultContent);
        yield* Effect.tryPromise({
          try: () => writeFile(agentsMdPath, contentWithManaged, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "cursor",
              operation: "init",
              message: `Failed to create AGENTS.md`,
              cause: error,
            }),
        });
      }
    }).pipe(Effect.orDie),

  getSkillsDir: (projectPath: string) => {
    return join(projectPath, ".cursor", "rules");
  },

  getGlobalSkillsDir: () => {
    return getGlobalSkillsDir("cursor");
  },

  getAgentMdPath: (projectPath: string) => {
    // Cursor supports AGENTS.md as fallback
    return join(projectPath, "AGENTS.md");
  },

  enableSkill: (projectPath: string, skill: CachedSkill, options?: EnableSkillOptions) =>
    Effect.gen(function* () {
      const result: AgentEnableResult = {
        injected: false,
        skillFileCopied: false,
      };

      const scope = options?.scope ?? "project";
      const shouldLink = options?.link ?? false;

      if (skill.skillMdPath) {
        // Determine target directory based on scope
        // New format: .cursor/rules/<name>/RULE.md
        const rulesDir = scope === "global"
          ? CursorAdapter.getGlobalSkillsDir()
          : CursorAdapter.getSkillsDir(projectPath);
        const ruleDir = join(rulesDir, skill.manifest.name);
        const ruleFile = join(ruleDir, "RULE.md");

        // Ensure rules directory exists
        yield* Effect.tryPromise({
          try: () => mkdir(ruleDir, { recursive: true }),
          catch: (error) =>
            new AgentAdapterError({
              agent: "cursor",
              operation: "enableSkill",
              message: `Failed to create rule directory`,
              cause: error,
            }),
        });

        if (shouldLink && scope === "project") {
          // Create symlink from global to project
          const globalRuleDir = join(CursorAdapter.getGlobalSkillsDir(), skill.manifest.name);
          if (existsSync(globalRuleDir)) {
            yield* Effect.tryPromise({
              try: async () => {
                const { symlink, rm } = await import("node:fs/promises");
                // Remove the directory we just created to replace with symlink
                await rm(ruleDir, { recursive: true, force: true });
                await symlink(globalRuleDir, ruleDir, "dir");
              },
              catch: (error) =>
                new AgentAdapterError({
                  agent: "cursor",
                  operation: "enableSkill",
                  message: `Failed to create symlink: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            });
            result.skillFileCopied = true;
            result.linked = true;
          } else {
            return yield* Effect.fail(
              new AgentAdapterError({
                agent: "cursor",
                operation: "enableSkill",
                message: `Cannot link: skill not installed globally. Run 'grimoire skills enable ${skill.manifest.name} --global' first.`,
              })
            );
          }
        } else {
          // Read SKILL.md and convert to RULE.md format
          const skillContent = yield* Effect.tryPromise({
            try: () => readFile(skill.skillMdPath!, "utf-8"),
            catch: (error) =>
              new AgentAdapterError({
                agent: "cursor",
                operation: "enableSkill",
                message: `Failed to read SKILL.md`,
                cause: error,
              }),
          });

          const ruleMdContent = convertToRuleMd(skill, skillContent);

          yield* Effect.tryPromise({
            try: () => writeFile(ruleFile, ruleMdContent, "utf-8"),
            catch: (error) =>
              new AgentAdapterError({
                agent: "cursor",
                operation: "enableSkill",
                message: `Failed to write RULE.md file`,
                cause: error,
              }),
          });
          result.skillFileCopied = true;
        }
      }

      return result;
    }),

  disableSkill: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const rulesDir = CursorAdapter.getSkillsDir(projectPath);

      // New format: .cursor/rules/<name>/ folder
      const ruleDir = join(rulesDir, skillName);
      if (existsSync(ruleDir)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { rm } = await import("node:fs/promises");
            await rm(ruleDir, { recursive: true, force: true });
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "cursor",
              operation: "disableSkill",
              message: `Failed to remove rule directory: ${ruleDir}`,
              cause: error,
            }),
        });
      }

      // Legacy format: .cursor/rules/<name>.mdc file
      const legacyRuleFile = join(rulesDir, `${skillName}.mdc`);
      if (existsSync(legacyRuleFile)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { unlink } = await import("node:fs/promises");
            await unlink(legacyRuleFile);
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "cursor",
              operation: "disableSkill",
              message: `Failed to remove legacy rule file: ${legacyRuleFile}`,
              cause: error,
            }),
        });
      }
    }).pipe(Effect.orDie),

  injectContent: (projectPath: string, skillName: string, content: string) =>
    Effect.gen(function* () {
      // Cursor primarily uses individual rule files
      // But we support AGENTS.md injection as fallback
      const agentsMdPath = CursorAdapter.getAgentMdPath(projectPath);
      if (existsSync(agentsMdPath)) {
        const currentContent = yield* Effect.tryPromise({
          try: () => readFile(agentsMdPath, "utf-8"),
          catch: (error) =>
            new InjectionError({
              file: agentsMdPath,
              message: `Failed to read AGENTS.md`,
            }),
        });

        const updatedContent = yield* addSkillInjection(currentContent, skillName, content);

        yield* Effect.tryPromise({
          try: () => writeFile(agentsMdPath, updatedContent, "utf-8"),
          catch: (error) =>
            new InjectionError({
              file: agentsMdPath,
              message: `Failed to write AGENTS.md`,
            }),
        });
      }
    }),

  removeInjection: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const agentsMdPath = CursorAdapter.getAgentMdPath(projectPath);
      if (!existsSync(agentsMdPath)) {
        return;
      }

      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(agentsMdPath, "utf-8"),
        catch: (error) =>
          new AgentAdapterError({
            agent: "cursor",
            operation: "removeInjection",
            message: `Failed to read AGENTS.md`,
            cause: error,
          }),
      });

      const updatedContent = removeSkillInjection(currentContent, skillName);

      if (updatedContent !== currentContent) {
        yield* Effect.tryPromise({
          try: () => writeFile(agentsMdPath, updatedContent, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "cursor",
              operation: "removeInjection",
              message: `Failed to write AGENTS.md`,
              cause: error,
            }),
        });
      }
    }).pipe(Effect.orDie),
};

// ============================================================================
// Aider Adapter (aider.chat)
// ============================================================================

/**
 * Aider adapter
 *
 * Aider configuration:
 * - Config: .aider.conf.yml
 * - Conventions: CONVENTIONS.md
 * - Skills: Injected into CONVENTIONS.md
 */
const AiderAdapter: AgentAdapter = {
  name: "aider",

  detect: (projectPath: string) =>
    Effect.gen(function* () {
      const aiderConf = join(projectPath, ".aider.conf.yml");
      const conventionsMd = join(projectPath, "CONVENTIONS.md");
      return existsSync(aiderConf) || existsSync(conventionsMd);
    }),

  init: (projectPath: string) =>
    Effect.gen(function* () {
      const conventionsMdPath = join(projectPath, "CONVENTIONS.md");

      // Ensure CONVENTIONS.md exists with managed section
      const conventionsMdExists = existsSync(conventionsMdPath);
      if (!conventionsMdExists) {
        const defaultContent = `# Coding Conventions

Coding guidelines and conventions for this project.

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
`;
        yield* Effect.tryPromise({
          try: () => writeFile(conventionsMdPath, defaultContent, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "aider",
              operation: "init",
              message: `Failed to create CONVENTIONS.md`,
              cause: error,
            }),
        });
      } else {
        const content = yield* Effect.tryPromise({
          try: () => readFile(conventionsMdPath, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "aider",
              operation: "init",
              message: `Failed to read CONVENTIONS.md`,
              cause: error,
            }),
        });

        if (!hasManagedSection(content)) {
          const contentWithManaged = addManagedSection(content);
          yield* Effect.tryPromise({
            try: () => writeFile(conventionsMdPath, contentWithManaged, "utf-8"),
            catch: (error) =>
              new AgentAdapterError({
                agent: "aider",
                operation: "init",
                message: `Failed to update CONVENTIONS.md`,
                cause: error,
              }),
          });
        }
      }
    }).pipe(Effect.orDie),

  getSkillsDir: (projectPath: string) => {
    // Aider doesn't have a skills dir - uses CONVENTIONS.md injection
    return join(projectPath, ".aider", "skills");
  },

  getGlobalSkillsDir: () => {
    return getGlobalSkillsDir("aider");
  },

  getAgentMdPath: (projectPath: string) => {
    return join(projectPath, "CONVENTIONS.md");
  },

  enableSkill: (projectPath: string, skill: CachedSkill, options?: EnableSkillOptions) =>
    Effect.gen(function* () {
      const result: AgentEnableResult = {
        injected: false,
        skillFileCopied: false,
      };

      // Aider uses injection-based skills (no file copying)
      // Global scope not supported for injection-based adapters
      const scope = options?.scope ?? "project";
      if (scope === "global") {
        return yield* Effect.fail(
          new AgentAdapterError({
            agent: "aider",
            operation: "enableSkill",
            message: "Aider uses injection-based skills. Global scope is not supported.",
          })
        );
      }

      // Inject skill content into CONVENTIONS.md
      if (skill.skillMdPath) {
        const skillContent = yield* Effect.tryPromise(() =>
          readFile(skill.skillMdPath!, "utf-8")
        ).pipe(Effect.orElse(() => Effect.succeed("")));

        if (skillContent) {
          // Strip frontmatter before injection
          const contentWithoutFrontmatter = skillContent.replace(/^---[\s\S]*?---\n*/, "");
          yield* AiderAdapter.injectContent(
            projectPath,
            skill.manifest.name,
            contentWithoutFrontmatter
          ).pipe(
            Effect.mapError(
              (error) =>
                new AgentAdapterError({
                  agent: "aider",
                  operation: "enableSkill",
                  message: `Failed to inject content: ${error.message}`,
                  cause: error,
                })
            )
          );
          result.injected = true;
        }
      }

      return result;
    }),

  disableSkill: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      yield* AiderAdapter.removeInjection(projectPath, skillName);
    }).pipe(Effect.orDie),

  injectContent: (projectPath: string, skillName: string, content: string) =>
    Effect.gen(function* () {
      const conventionsMdPath = AiderAdapter.getAgentMdPath(projectPath);

      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(conventionsMdPath, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: conventionsMdPath,
            message: `Failed to read CONVENTIONS.md`,
          }),
      });

      const updatedContent = yield* addSkillInjection(currentContent, skillName, content);

      yield* Effect.tryPromise({
        try: () => writeFile(conventionsMdPath, updatedContent, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: conventionsMdPath,
            message: `Failed to write CONVENTIONS.md`,
          }),
      });
    }),

  removeInjection: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const conventionsMdPath = AiderAdapter.getAgentMdPath(projectPath);

      if (!existsSync(conventionsMdPath)) {
        return;
      }

      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(conventionsMdPath, "utf-8"),
        catch: (error) =>
          new AgentAdapterError({
            agent: "aider",
            operation: "removeInjection",
            message: `Failed to read CONVENTIONS.md`,
            cause: error,
          }),
      });

      const updatedContent = removeSkillInjection(currentContent, skillName);

      if (updatedContent !== currentContent) {
        yield* Effect.tryPromise({
          try: () => writeFile(conventionsMdPath, updatedContent, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "aider",
              operation: "removeInjection",
              message: `Failed to write CONVENTIONS.md`,
              cause: error,
            }),
        });
      }
    }).pipe(Effect.orDie),
};

// ============================================================================
// Amp Adapter (Sourcegraph Amp)
// ============================================================================

/**
 * Amp adapter
 *
 * Amp configuration:
 * - Agent MD: AGENT.md (singular, NOT AGENTS.md)
 * - Config: ~/.config/amp/settings.json
 * - Skills: Injected into AGENT.md
 */
const AmpAdapter: AgentAdapter = {
  name: "amp",

  detect: (projectPath: string) =>
    Effect.gen(function* () {
      // Note: Amp uses AGENT.md (singular), not AGENTS.md
      const agentMd = join(projectPath, "AGENT.md");
      return existsSync(agentMd);
    }),

  init: (projectPath: string) =>
    Effect.gen(function* () {
      const agentMdPath = join(projectPath, "AGENT.md");

      // Ensure AGENT.md exists with managed section
      const agentMdExists = existsSync(agentMdPath);
      if (!agentMdExists) {
        const defaultContent = `# Agent Instructions

Instructions for Amp AI coding assistant.

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
`;
        yield* Effect.tryPromise({
          try: () => writeFile(agentMdPath, defaultContent, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "amp",
              operation: "init",
              message: `Failed to create AGENT.md`,
              cause: error,
            }),
        });
      } else {
        const content = yield* Effect.tryPromise({
          try: () => readFile(agentMdPath, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "amp",
              operation: "init",
              message: `Failed to read AGENT.md`,
              cause: error,
            }),
        });

        if (!hasManagedSection(content)) {
          const contentWithManaged = addManagedSection(content);
          yield* Effect.tryPromise({
            try: () => writeFile(agentMdPath, contentWithManaged, "utf-8"),
            catch: (error) =>
              new AgentAdapterError({
                agent: "amp",
                operation: "init",
                message: `Failed to update AGENT.md`,
                cause: error,
              }),
          });
        }
      }
    }).pipe(Effect.orDie),

  getSkillsDir: (projectPath: string) => {
    // Amp doesn't have a skills dir - uses AGENT.md injection
    return join(projectPath, ".amp", "skills");
  },

  getGlobalSkillsDir: () => {
    return getGlobalSkillsDir("amp");
  },

  getAgentMdPath: (projectPath: string) => {
    // Note: AGENT.md (singular), not AGENTS.md
    return join(projectPath, "AGENT.md");
  },

  enableSkill: (projectPath: string, skill: CachedSkill, options?: EnableSkillOptions) =>
    Effect.gen(function* () {
      const result: AgentEnableResult = {
        injected: false,
        skillFileCopied: false,
      };

      // Amp uses injection-based skills (no file copying)
      // Global scope not supported for injection-based adapters
      const scope = options?.scope ?? "project";
      if (scope === "global") {
        return yield* Effect.fail(
          new AgentAdapterError({
            agent: "amp",
            operation: "enableSkill",
            message: "Amp uses injection-based skills. Global scope is not supported.",
          })
        );
      }

      // Inject skill content into AGENT.md
      if (skill.skillMdPath) {
        const skillContent = yield* Effect.tryPromise(() =>
          readFile(skill.skillMdPath!, "utf-8")
        ).pipe(Effect.orElse(() => Effect.succeed("")));

        if (skillContent) {
          // Strip frontmatter before injection
          const contentWithoutFrontmatter = skillContent.replace(/^---[\s\S]*?---\n*/, "");
          yield* AmpAdapter.injectContent(
            projectPath,
            skill.manifest.name,
            contentWithoutFrontmatter
          ).pipe(
            Effect.mapError(
              (error) =>
                new AgentAdapterError({
                  agent: "amp",
                  operation: "enableSkill",
                  message: `Failed to inject content: ${error.message}`,
                  cause: error,
                })
            )
          );
          result.injected = true;
        }
      }

      return result;
    }),

  disableSkill: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      yield* AmpAdapter.removeInjection(projectPath, skillName);
    }).pipe(Effect.orDie),

  injectContent: (projectPath: string, skillName: string, content: string) =>
    Effect.gen(function* () {
      const agentMdPath = AmpAdapter.getAgentMdPath(projectPath);

      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(agentMdPath, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: agentMdPath,
            message: `Failed to read AGENT.md`,
          }),
      });

      const updatedContent = yield* addSkillInjection(currentContent, skillName, content);

      yield* Effect.tryPromise({
        try: () => writeFile(agentMdPath, updatedContent, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: agentMdPath,
            message: `Failed to write AGENT.md`,
          }),
      });
    }),

  removeInjection: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const agentMdPath = AmpAdapter.getAgentMdPath(projectPath);

      if (!existsSync(agentMdPath)) {
        return;
      }

      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(agentMdPath, "utf-8"),
        catch: (error) =>
          new AgentAdapterError({
            agent: "amp",
            operation: "removeInjection",
            message: `Failed to read AGENT.md`,
            cause: error,
          }),
      });

      const updatedContent = removeSkillInjection(currentContent, skillName);

      if (updatedContent !== currentContent) {
        yield* Effect.tryPromise({
          try: () => writeFile(agentMdPath, updatedContent, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "amp",
              operation: "removeInjection",
              message: `Failed to write AGENT.md`,
              cause: error,
            }),
        });
      }
    }).pipe(Effect.orDie),
};

// ============================================================================
// Gemini Adapter (Google Gemini CLI)
// ============================================================================

/**
 * Gemini adapter
 *
 * Gemini CLI configuration:
 * - Agent MD: GEMINI.md (project root, or hierarchical in subdirs)
 * - Global config: ~/.gemini/GEMINI.md
 * - Settings: ~/.gemini/settings.json
 * - Skills: .gemini/skills/<name>/SKILL.md (project)
 * - Global skills: ~/.gemini/skills/<name>/SKILL.md
 */
const GeminiAdapter: AgentAdapter = {
  name: "gemini",

  detect: (projectPath: string) =>
    Effect.gen(function* () {
      // Check for GEMINI.md file or .gemini/ directory
      const geminiMd = join(projectPath, "GEMINI.md");
      const geminiDir = join(projectPath, ".gemini");
      return existsSync(geminiMd) || existsSync(geminiDir);
    }),

  init: (projectPath: string) =>
    Effect.gen(function* () {
      const geminiMdPath = join(projectPath, "GEMINI.md");
      const geminiDir = join(projectPath, ".gemini");
      const skillsDir = join(geminiDir, "skills");

      // Create .gemini/skills/ directory
      yield* Effect.tryPromise({
        try: () => mkdir(skillsDir, { recursive: true }),
        catch: (error) =>
          new AgentAdapterError({
            agent: "gemini",
            operation: "init",
            message: `Failed to create skills directory: ${skillsDir}`,
            cause: error,
          }),
      });

      // Ensure GEMINI.md exists with managed section
      const geminiMdExists = existsSync(geminiMdPath);
      if (!geminiMdExists) {
        const defaultContent = `# Gemini CLI Instructions

Instructions for Gemini AI coding assistant.

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
`;
        yield* Effect.tryPromise({
          try: () => writeFile(geminiMdPath, defaultContent, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "gemini",
              operation: "init",
              message: `Failed to create GEMINI.md`,
              cause: error,
            }),
        });
      } else {
        const content = yield* Effect.tryPromise({
          try: () => readFile(geminiMdPath, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "gemini",
              operation: "init",
              message: `Failed to read GEMINI.md`,
              cause: error,
            }),
        });

        if (!hasManagedSection(content)) {
          const contentWithManaged = addManagedSection(content);
          yield* Effect.tryPromise({
            try: () => writeFile(geminiMdPath, contentWithManaged, "utf-8"),
            catch: (error) =>
              new AgentAdapterError({
                agent: "gemini",
                operation: "init",
                message: `Failed to update GEMINI.md`,
                cause: error,
              }),
          });
        }
      }
    }).pipe(Effect.orDie),

  getSkillsDir: (projectPath: string) => {
    return join(projectPath, ".gemini", "skills");
  },

  getGlobalSkillsDir: () => {
    return getGlobalSkillsDir("gemini");
  },

  getAgentMdPath: (projectPath: string) => {
    return join(projectPath, "GEMINI.md");
  },

  enableSkill: (projectPath: string, skill: CachedSkill, options?: EnableSkillOptions) =>
    Effect.gen(function* () {
      const result: AgentEnableResult = {
        injected: false,
        skillFileCopied: false,
      };

      const scope = options?.scope ?? "project";
      const shouldLink = options?.link ?? false;

      // Gemini uses file-based skills similar to Claude Code
      // Skills go in .gemini/skills/<name>/SKILL.md
      if (skill.skillMdPath) {
        // Determine target directory based on scope
        const skillsDir = scope === "global"
          ? GeminiAdapter.getGlobalSkillsDir()
          : GeminiAdapter.getSkillsDir(projectPath);
        const skillDir = join(skillsDir, skill.manifest.name);

        // Get the source cache directory (parent of SKILL.md)
        const sourceCacheDir = dirname(skill.skillMdPath);

        if (shouldLink && scope === "project") {
          // Create symlink from global to project
          const globalSkillDir = join(GeminiAdapter.getGlobalSkillsDir(), skill.manifest.name);
          if (existsSync(globalSkillDir)) {
            yield* Effect.tryPromise({
              try: async () => {
                const { symlink } = await import("node:fs/promises");
                await mkdir(dirname(skillDir), { recursive: true });
                await symlink(globalSkillDir, skillDir, "dir");
              },
              catch: (error) =>
                new AgentAdapterError({
                  agent: "gemini",
                  operation: "enableSkill",
                  message: `Failed to create symlink: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            });
            result.skillFileCopied = true;
            result.linked = true;
          } else {
            return yield* Effect.fail(
              new AgentAdapterError({
                agent: "gemini",
                operation: "enableSkill",
                message: `Cannot link: skill not installed globally. Run 'grimoire skills enable ${skill.manifest.name} --global' first.`,
              })
            );
          }
        } else {
          // Copy entire skill directory from cache to target location
          // Gemini uses standard SKILL.md format with frontmatter
          yield* copySkillDirectoryToProject(
            sourceCacheDir,
            skillDir,
            { manifest: skill.manifest, addFrontmatter: true },
            "gemini"
          );
          result.skillFileCopied = true;
        }
      }

      return result;
    }),

  disableSkill: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const skillsDir = GeminiAdapter.getSkillsDir(projectPath);
      const skillDir = join(skillsDir, skillName);
      const legacyFilePath = join(skillsDir, `${skillName}.md`);

      // Remove skill directory if it exists (.gemini/skills/<name>/)
      if (existsSync(skillDir)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { rm } = await import("node:fs/promises");
            await rm(skillDir, { recursive: true, force: true });
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "gemini",
              operation: "disableSkill",
              message: `Failed to remove skill directory: ${skillDir}`,
              cause: error,
            }),
        });
      }

      // Also remove legacy file structure if it exists
      if (existsSync(legacyFilePath)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { unlink } = await import("node:fs/promises");
            await unlink(legacyFilePath);
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "gemini",
              operation: "disableSkill",
              message: `Failed to remove legacy skill file: ${legacyFilePath}`,
              cause: error,
            }),
        });
      }

      // Remove injection from GEMINI.md
      yield* GeminiAdapter.removeInjection(projectPath, skillName);
    }).pipe(Effect.orDie),

  configureMcp: (projectPath: string, name: string, config: McpConfig) =>
    Effect.gen(function* () {
      // Gemini uses ~/.gemini/settings.json for MCP configuration
      const settingsPath = join(projectPath, ".gemini", "settings.json");

      // Read existing settings or create empty object
      let settings: any = {};
      if (existsSync(settingsPath)) {
        const content = yield* Effect.tryPromise({
          try: () => readFile(settingsPath, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "gemini",
              operation: "configureMcp",
              message: `Failed to read settings.json`,
              cause: error,
            }),
        });
        try {
          settings = JSON.parse(content);
        } catch (error) {
          settings = {};
        }
      }

      // Add MCP configuration
      if (!settings.mcpServers) {
        settings.mcpServers = {};
      }
      settings.mcpServers[name] = config;

      // Ensure .gemini directory exists
      yield* Effect.tryPromise({
        try: () => mkdir(dirname(settingsPath), { recursive: true }),
        catch: () => new AgentAdapterError({
          agent: "gemini",
          operation: "configureMcp",
          message: `Failed to create .gemini directory`,
        }),
      });

      // Write updated settings
      yield* Effect.tryPromise({
        try: () => writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8"),
        catch: (error) =>
          new AgentAdapterError({
            agent: "gemini",
            operation: "configureMcp",
            message: `Failed to write settings.json`,
            cause: error,
          }),
      });
    }).pipe(Effect.orDie),

  injectContent: (projectPath: string, skillName: string, content: string) =>
    Effect.gen(function* () {
      const geminiMdPath = GeminiAdapter.getAgentMdPath(projectPath);

      // Read current content
      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(geminiMdPath, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: geminiMdPath,
            message: `Failed to read GEMINI.md`,
          }),
      });

      // Add skill injection
      const updatedContent = yield* addSkillInjection(currentContent, skillName, content);

      // Write updated content
      yield* Effect.tryPromise({
        try: () => writeFile(geminiMdPath, updatedContent, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: geminiMdPath,
            message: `Failed to write GEMINI.md`,
          }),
      });
    }),

  removeInjection: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const geminiMdPath = GeminiAdapter.getAgentMdPath(projectPath);

      if (!existsSync(geminiMdPath)) {
        return;
      }

      const currentContent = yield* Effect.tryPromise({
        try: () => readFile(geminiMdPath, "utf-8"),
        catch: (error) =>
          new AgentAdapterError({
            agent: "gemini",
            operation: "removeInjection",
            message: `Failed to read GEMINI.md`,
            cause: error,
          }),
      });

      const updatedContent = removeSkillInjection(currentContent, skillName);

      if (updatedContent !== currentContent) {
        yield* Effect.tryPromise({
          try: () => writeFile(geminiMdPath, updatedContent, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "gemini",
              operation: "removeInjection",
              message: `Failed to write GEMINI.md`,
              cause: error,
            }),
        });
      }
    }).pipe(Effect.orDie),
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Agent adapter registry
 */
const adapters: Record<AgentType, AgentAdapter> = {
  claude_code: ClaudeCodeAdapter,
  opencode: OpenCodeAdapter,
  codex: CodexAdapter,
  cursor: CursorAdapter,
  aider: AiderAdapter,
  amp: AmpAdapter,
  gemini: GeminiAdapter,
  generic: GenericAdapter,
};

/**
 * Get the agent adapter for a specific agent type
 *
 * @param agent - The agent type
 * @returns The corresponding agent adapter
 */
export function getAgentAdapter(agent: AgentType): AgentAdapter {
  return adapters[agent];
}

/**
 * Auto-detect the agent type for a project
 *
 * Checks for agent-specific markers in the project directory:
 * - Claude Code: .claude/ directory
 * - OpenCode: .opencode/ directory
 * - Cursor: .cursor/ directory
 * - Gemini: .gemini/ directory or GEMINI.md
 * - Aider: .aider.conf.yml or CONVENTIONS.md
 * - Amp: AGENT.md (singular)
 * - Codex: .codex/ directory or AGENTS.md
 * - Generic: AGENTS.md (fallback)
 *
 * @param projectPath - Path to the project directory
 * @returns Effect that resolves to the detected agent type, or null if none detected
 */
export function detectAgent(projectPath: string): Effect.Effect<AgentType | null> {
  return Effect.gen(function* () {
    // Try Claude Code first (most specific)
    const claudeCodeDetected = yield* ClaudeCodeAdapter.detect(projectPath);
    if (claudeCodeDetected) {
      return "claude_code" as AgentType;
    }

    // Try OpenCode
    const openCodeDetected = yield* OpenCodeAdapter.detect(projectPath);
    if (openCodeDetected) {
      return "opencode" as AgentType;
    }

    // Try Cursor
    const cursorDetected = yield* CursorAdapter.detect(projectPath);
    if (cursorDetected) {
      return "cursor" as AgentType;
    }

    // Try Gemini (.gemini/ directory or GEMINI.md)
    const geminiDetected = yield* GeminiAdapter.detect(projectPath);
    if (geminiDetected) {
      return "gemini" as AgentType;
    }

    // Try Aider
    const aiderDetected = yield* AiderAdapter.detect(projectPath);
    if (aiderDetected) {
      return "aider" as AgentType;
    }

    // Try Amp (AGENT.md singular)
    const ampDetected = yield* AmpAdapter.detect(projectPath);
    if (ampDetected) {
      return "amp" as AgentType;
    }

    // Try Codex (.codex/ directory or AGENTS.md)
    const codexDetected = yield* CodexAdapter.detect(projectPath);
    if (codexDetected) {
      return "codex" as AgentType;
    }

    // Try Generic (fallback)
    const genericDetected = yield* GenericAdapter.detect(projectPath);
    if (genericDetected) {
      return "generic" as AgentType;
    }

    // No agent detected
    return null;
  });
}

// ============================================================================
// Service Definition
// ============================================================================

/**
 * Agent Adapter Service Interface
 *
 * Provides access to agent adapters and detection functionality.
 */
interface AgentAdapterServiceImpl {
  /**
   * Get adapter for a specific agent type
   */
  readonly getAdapter: (agent: AgentType) => AgentAdapter;

  /**
   * Auto-detect agent type for a project
   */
  readonly detectAgent: (projectPath: string) => Effect.Effect<AgentType | null>;
}

/**
 * Agent Adapter Service Tag
 */
export class AgentAdapterService extends Context.Tag("AgentAdapterService")<
  AgentAdapterService,
  AgentAdapterServiceImpl
>() {}

/**
 * Make Agent Adapter Service
 */
const makeAgentAdapterService = (): AgentAdapterServiceImpl => ({
  getAdapter: (agent: AgentType) => getAgentAdapter(agent),
  detectAgent: (projectPath: string) => detectAgent(projectPath),
});

/**
 * Agent Adapter Service Live Layer
 */
export const AgentAdapterServiceLive = Layer.succeed(
  AgentAdapterService,
  makeAgentAdapterService()
);
