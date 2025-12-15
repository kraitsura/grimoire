/**
 * Agent Adapter Interface and Factory
 *
 * Defines the adapter trait/interface for agent-specific operations.
 * Adapters handle agent-specific file operations, plugin installation,
 * MCP configuration, and file injection.
 */

import { Effect, Context, Layer, Data } from "effect";
import type { AgentType } from "../../models/skill";
import type { CachedSkill } from "./skill-cache-service";
import { InjectionError, PluginInstallError } from "../../models/skill-errors";
import type { McpConfig } from "../../models/skill";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import {
  hasManagedSection,
  addManagedSection,
  addSkillInjection,
  removeSkillInjection,
  hasSkillInjection,
} from "./injection-utils";

/**
 * Result of enabling a skill for an agent
 */
export interface AgentEnableResult {
  pluginInstalled?: boolean;
  mcpConfigured?: boolean;
  injected: boolean;
  skillFileCopied: boolean;
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
   * Get the skills directory path for this agent
   */
  readonly getSkillsDir: (projectPath: string) => string;

  /**
   * Get the agent markdown file path (CLAUDE.md, AGENTS.md, etc.)
   */
  readonly getAgentMdPath: (projectPath: string) => string;

  /**
   * Enable a skill for this agent
   */
  readonly enableSkill: (
    projectPath: string,
    skill: CachedSkill
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

  getAgentMdPath: (projectPath: string) => {
    return join(projectPath, "CLAUDE.md");
  },

  enableSkill: (projectPath: string, skill: CachedSkill) =>
    Effect.gen(function* () {
      const result: AgentEnableResult = {
        injected: false,
        skillFileCopied: false,
      };

      const agentConfig = skill.manifest.agents?.claude_code;
      if (!agentConfig) {
        return result;
      }

      // Copy skill file if configured
      if (agentConfig.skill_file && skill.skillMdPath) {
        const skillsDir = ClaudeCodeAdapter.getSkillsDir(projectPath);
        const destPath = join(skillsDir, `${skill.manifest.name}.md`);

        yield* Effect.tryPromise({
          try: () => mkdir(dirname(destPath), { recursive: true }),
          catch: (error) =>
            new AgentAdapterError({
              agent: "claude_code",
              operation: "enableSkill",
              message: `Failed to create skills directory`,
              cause: error,
            }),
        });

        yield* Effect.tryPromise({
          try: () => copyFile(skill.skillMdPath!, destPath),
          catch: (error) =>
            new AgentAdapterError({
              agent: "claude_code",
              operation: "enableSkill",
              message: `Failed to copy skill file`,
              cause: error,
            }),
        });

        result.skillFileCopied = true;
      }

      // Install plugin if configured
      if (agentConfig.plugin && ClaudeCodeAdapter.installPlugin) {
        yield* ClaudeCodeAdapter.installPlugin(
          agentConfig.plugin.marketplace,
          agentConfig.plugin.name
        ).pipe(
          Effect.mapError(
            (error) =>
              new AgentAdapterError({
                agent: "claude_code",
                operation: "enableSkill",
                message: `Failed to install plugin: ${error.plugin}`,
                cause: error,
              })
          )
        );
        result.pluginInstalled = true;
      }

      // Configure MCP if configured
      if (agentConfig.mcp && ClaudeCodeAdapter.configureMcp) {
        yield* ClaudeCodeAdapter.configureMcp(
          projectPath,
          skill.manifest.name,
          agentConfig.mcp
        );
        result.mcpConfigured = true;
      }

      // Inject content if configured
      if (agentConfig.inject) {
        yield* ClaudeCodeAdapter.injectContent(
          projectPath,
          skill.manifest.name,
          agentConfig.inject.content
        ).pipe(
          Effect.mapError(
            (error) =>
              new AgentAdapterError({
                agent: "claude_code",
                operation: "enableSkill",
                message: `Failed to inject content: ${error.message}`,
                cause: error,
              })
          )
        );
        result.injected = true;
      }

      return result;
    }),

  disableSkill: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const skillsDir = ClaudeCodeAdapter.getSkillsDir(projectPath);
      const skillFilePath = join(skillsDir, `${skillName}.md`);

      // Remove skill file if it exists
      if (existsSync(skillFilePath)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { unlink } = await import("node:fs/promises");
            await unlink(skillFilePath);
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "claude_code",
              operation: "disableSkill",
              message: `Failed to remove skill file: ${skillFilePath}`,
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
 */
const OpenCodeAdapter: AgentAdapter = {
  name: "opencode",

  detect: (projectPath: string) =>
    Effect.gen(function* () {
      // Check for .opencode/ directory existence
      const opencodeDir = join(projectPath, ".opencode");
      return existsSync(opencodeDir);
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

  getAgentMdPath: (projectPath: string) => {
    return join(projectPath, "AGENTS.md");
  },

  enableSkill: (projectPath: string, skill: CachedSkill) =>
    Effect.gen(function* () {
      const result: AgentEnableResult = {
        injected: false,
        skillFileCopied: false,
      };

      const agentConfig = skill.manifest.agents?.opencode;
      if (!agentConfig) {
        return result;
      }

      // Copy skill file if configured (using same logic as claude_code)
      if (skill.skillMdPath) {
        const skillsDir = OpenCodeAdapter.getSkillsDir(projectPath);
        const destPath = join(skillsDir, `${skill.manifest.name}.md`);

        yield* Effect.tryPromise({
          try: () => mkdir(dirname(destPath), { recursive: true }),
          catch: (error) =>
            new AgentAdapterError({
              agent: "opencode",
              operation: "enableSkill",
              message: `Failed to create skills directory`,
              cause: error,
            }),
        });

        yield* Effect.tryPromise({
          try: () => copyFile(skill.skillMdPath!, destPath),
          catch: (error) =>
            new AgentAdapterError({
              agent: "opencode",
              operation: "enableSkill",
              message: `Failed to copy skill file`,
              cause: error,
            }),
        });

        result.skillFileCopied = true;
      }

      // Configure MCP if configured
      if (agentConfig.mcp && OpenCodeAdapter.configureMcp) {
        yield* OpenCodeAdapter.configureMcp(
          projectPath,
          skill.manifest.name,
          agentConfig.mcp
        );
        result.mcpConfigured = true;
      }

      // Inject content if configured
      if (agentConfig.inject) {
        yield* OpenCodeAdapter.injectContent(
          projectPath,
          skill.manifest.name,
          agentConfig.inject.content
        ).pipe(
          Effect.mapError(
            (error) =>
              new AgentAdapterError({
                agent: "opencode",
                operation: "enableSkill",
                message: `Failed to inject content: ${error.message}`,
                cause: error,
              })
          )
        );
        result.injected = true;
      }

      return result;
    }),

  disableSkill: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const skillsDir = OpenCodeAdapter.getSkillsDir(projectPath);
      const skillFilePath = join(skillsDir, `${skillName}.md`);

      // Remove skill file if it exists
      if (existsSync(skillFilePath)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { unlink } = await import("node:fs/promises");
            await unlink(skillFilePath);
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "opencode",
              operation: "disableSkill",
              message: `Failed to remove skill file: ${skillFilePath}`,
              cause: error,
            }),
        });
      }

      // Remove injection from AGENTS.md
      yield* OpenCodeAdapter.removeInjection(projectPath, skillName);
    }).pipe(Effect.orDie),

  configureMcp: (projectPath: string, name: string, config: McpConfig) =>
    Effect.gen(function* () {
      const configPath = join(projectPath, ".opencode", "config.json");

      // Read existing config or create empty object
      let opencodeConfig: any = {};
      if (existsSync(configPath)) {
        const content = yield* Effect.tryPromise({
          try: () => readFile(configPath, "utf-8"),
          catch: (error) =>
            new AgentAdapterError({
              agent: "opencode",
              operation: "configureMcp",
              message: `Failed to read config.json`,
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

      // Add MCP configuration
      if (!opencodeConfig.mcpServers) {
        opencodeConfig.mcpServers = {};
      }
      opencodeConfig.mcpServers[name] = config;

      // Write updated config
      yield* Effect.tryPromise({
        try: () => writeFile(configPath, JSON.stringify(opencodeConfig, null, 2), "utf-8"),
        catch: (error) =>
          new AgentAdapterError({
            agent: "opencode",
            operation: "configureMcp",
            message: `Failed to write config.json`,
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

  getAgentMdPath: (projectPath: string) => {
    return join(projectPath, "AGENTS.md");
  },

  enableSkill: (projectPath: string, skill: CachedSkill) =>
    Effect.gen(function* () {
      const result: AgentEnableResult = {
        injected: false,
        skillFileCopied: false,
      };

      // Copy skill file if available
      if (skill.skillMdPath) {
        const skillsDir = GenericAdapter.getSkillsDir(projectPath);
        const destPath = join(skillsDir, `${skill.manifest.name}.md`);

        yield* Effect.tryPromise({
          try: () => mkdir(dirname(destPath), { recursive: true }),
          catch: (error) =>
            new AgentAdapterError({
              agent: "generic",
              operation: "enableSkill",
              message: `Failed to create skills directory`,
              cause: error,
            }),
        });

        yield* Effect.tryPromise({
          try: () => copyFile(skill.skillMdPath!, destPath),
          catch: (error) =>
            new AgentAdapterError({
              agent: "generic",
              operation: "enableSkill",
              message: `Failed to copy skill file`,
              cause: error,
            }),
        });

        result.skillFileCopied = true;
      }

      // Inject content from skill manifest prompt if available
      if (skill.manifest.prompt) {
        yield* GenericAdapter.injectContent(
          projectPath,
          skill.manifest.name,
          skill.manifest.prompt
        ).pipe(
          Effect.mapError(
            (error) =>
              new AgentAdapterError({
                agent: "generic",
                operation: "enableSkill",
                message: `Failed to inject content: ${error.message}`,
                cause: error,
              })
          )
        );
        result.injected = true;
      }

      return result;
    }),

  disableSkill: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const skillsDir = GenericAdapter.getSkillsDir(projectPath);
      const skillFilePath = join(skillsDir, `${skillName}.md`);

      // Remove skill file if it exists
      if (existsSync(skillFilePath)) {
        yield* Effect.tryPromise({
          try: async () => {
            const { unlink } = await import("node:fs/promises");
            await unlink(skillFilePath);
          },
          catch: (error) =>
            new AgentAdapterError({
              agent: "generic",
              operation: "disableSkill",
              message: `Failed to remove skill file: ${skillFilePath}`,
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
// Factory Functions
// ============================================================================

/**
 * Agent adapter registry
 */
const adapters: Record<AgentType, AgentAdapter> = {
  claude_code: ClaudeCodeAdapter,
  opencode: OpenCodeAdapter,
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
 * - Claude Code: .claude/ directory or CLAUDE.md
 * - OpenCode: .opencode/ directory
 * - Generic: AGENTS.md (fallback)
 *
 * @param projectPath - Path to the project directory
 * @returns Effect that resolves to the detected agent type, or null if none detected
 */
export function detectAgent(projectPath: string): Effect.Effect<AgentType | null> {
  return Effect.gen(function* () {
    // Try Claude Code first
    const claudeCodeDetected = yield* ClaudeCodeAdapter.detect(projectPath);
    if (claudeCodeDetected) {
      return "claude_code" as AgentType;
    }

    // Try OpenCode
    const openCodeDetected = yield* OpenCodeAdapter.detect(projectPath);
    if (openCodeDetected) {
      return "opencode" as AgentType;
    }

    // Try Generic
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
