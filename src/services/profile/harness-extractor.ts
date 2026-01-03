/**
 * Harness Extractor Service
 *
 * Extracts configuration details from harness directories into profile structures.
 * Each harness has its own extraction logic for model, MCP, skills, commands, etc.
 */

import { Context, Effect, Layer } from "effect";
import { join } from "path";
import { homedir } from "os";
import { readdir, readFile, access } from "fs/promises";
import type {
  HarnessId,
  McpServerConfig,
  Profile,
} from "../../models/profile";
import { HARNESS_CONFIG_PATHS, createEmptyProfile } from "../../models/profile";
import {
  ProfileExtractionError,
  HarnessNotInstalledError,
  UnknownHarnessError,
} from "../../models/profile-errors";

/**
 * Extracted harness configuration
 */
export interface ExtractedConfig {
  /** Extracted model name */
  model?: string;
  /** Extracted theme */
  theme?: string;
  /** MCP server configurations */
  mcpServers: McpServerConfig[];
  /** Skill names (from files found) */
  skills: string[];
  /** Command names */
  commands: string[];
  /** Agent names (OpenCode) */
  agents: string[];
  /** Plugin names */
  plugins: string[];
  /** Extraction errors (non-fatal) */
  warnings: string[];
}

/**
 * Resolve ~ to home directory
 */
const resolvePath = (path: string): string => {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
};

/**
 * Check if path exists
 */
const pathExists = (path: string): Effect.Effect<boolean, never> =>
  Effect.tryPromise({
    try: async () => {
      await access(path);
      return true;
    },
    catch: () => false,
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));

/**
 * List directory contents, returning empty array if not exists
 */
const listDir = (path: string): Effect.Effect<string[], never> =>
  Effect.tryPromise({
    try: async () => {
      const entries = await readdir(path);
      return entries.filter((e) => !e.startsWith("."));
    },
    catch: () => [] as string[],
  }).pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

/**
 * Read file, returning undefined if not exists
 */
const readFileOpt = (path: string): Effect.Effect<string | undefined, never> =>
  Effect.tryPromise({
    try: async () => {
      const content = await readFile(path, "utf-8");
      return content;
    },
    catch: () => undefined,
  }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

/**
 * Parse JSON, handling JSONC (comments)
 * Strips single-line and multi-line comments before parsing
 */
const parseJsonc = <T>(content: string): T | undefined => {
  try {
    // Strip single-line comments (// ...)
    let stripped = content.replace(/\/\/.*$/gm, "");
    // Strip multi-line comments (/* ... */)
    stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, "");
    return JSON.parse(stripped) as T;
  } catch {
    return undefined;
  }
};

/**
 * Extract skill names from a skills directory
 */
const extractSkillNames = (
  skillsDir: string
): Effect.Effect<string[], never> =>
  Effect.gen(function* () {
    const entries = yield* listDir(skillsDir);
    const skills: string[] = [];

    for (const entry of entries) {
      const skillPath = join(skillsDir, entry, "SKILL.md");
      const exists = yield* pathExists(skillPath);
      if (exists) {
        skills.push(entry);
      }
    }

    return skills;
  });

/**
 * Extract command names from a commands directory
 */
const extractCommandNames = (
  commandsDir: string
): Effect.Effect<string[], never> =>
  Effect.gen(function* () {
    const entries = yield* listDir(commandsDir);
    return entries.filter((e) => e.endsWith(".md")).map((e) => e.replace(/\.md$/, ""));
  });

// ============================================================================
// Claude Code Extraction (~/.claude)
// ============================================================================

interface ClaudeSettings {
  model?: string;
  theme?: string;
}

interface ClaudeMcpConfig {
  mcpServers?: Record<
    string,
    {
      command?: string;
      args?: string[];
      url?: string;
      type?: string;
      disabled?: boolean;
      env?: Record<string, string>;
    }
  >;
}

/**
 * Extract configuration from Claude Code
 */
const extractClaudeCode = (
  configPath: string
): Effect.Effect<ExtractedConfig, never> =>
  Effect.gen(function* () {
    const warnings: string[] = [];
    const result: ExtractedConfig = {
      mcpServers: [],
      skills: [],
      commands: [],
      agents: [],
      plugins: [],
      warnings,
    };

    // Read settings.json for model and theme
    const settingsPath = join(configPath, "settings.json");
    const settingsContent = yield* readFileOpt(settingsPath);
    if (settingsContent) {
      const settings = parseJsonc<ClaudeSettings>(settingsContent);
      if (settings) {
        result.model = settings.model;
        result.theme = settings.theme;
      } else {
        warnings.push("Failed to parse settings.json");
      }
    }

    // Read .mcp.json for MCP servers
    const mcpPath = join(configPath, ".mcp.json");
    const mcpContent = yield* readFileOpt(mcpPath);
    if (mcpContent) {
      const mcpConfig = parseJsonc<ClaudeMcpConfig>(mcpContent);
      if (mcpConfig?.mcpServers) {
        for (const [name, server] of Object.entries(mcpConfig.mcpServers)) {
          const serverType = server.type as "stdio" | "sse" | "http" | undefined;
          result.mcpServers.push({
            name,
            enabled: !server.disabled,
            serverType: serverType ?? (server.command ? "stdio" : server.url ? "sse" : undefined),
            command: server.command,
            args: server.args,
            url: server.url,
            env: server.env,
          });
        }
      }
    }

    // Extract skills from skills/**/*.md
    const skillsDir = join(configPath, "skills");
    result.skills = yield* extractSkillNames(skillsDir);

    // Extract commands from commands/**/*.md
    const commandsDir = join(configPath, "commands");
    result.commands = yield* extractCommandNames(commandsDir);

    // Check for plugins (marketplace.json or directory scan)
    const marketplacePath = join(configPath, ".claude-plugin", "marketplace.json");
    const marketplaceContent = yield* readFileOpt(marketplacePath);
    if (marketplaceContent) {
      const marketplace = parseJsonc<{ plugins?: string[] }>(marketplaceContent);
      if (marketplace?.plugins) {
        result.plugins = marketplace.plugins;
      }
    }

    return result;
  });

// ============================================================================
// OpenCode Extraction (~/.config/opencode)
// ============================================================================

interface OpenCodeConfig {
  model?: string;
  theme?: string;
  agent?: {
    general?: {
      model?: string;
    };
  };
  mcp?: Record<
    string,
    {
      command?: string;
      args?: string[];
      url?: string;
      type?: string;
      disabled?: boolean;
      env?: Record<string, string>;
    }
  >;
  plugin?: string[];
}

/**
 * Extract configuration from OpenCode
 */
const extractOpenCode = (
  configPath: string
): Effect.Effect<ExtractedConfig, never> =>
  Effect.gen(function* () {
    const warnings: string[] = [];
    const result: ExtractedConfig = {
      mcpServers: [],
      skills: [],
      commands: [],
      agents: [],
      plugins: [],
      warnings,
    };

    // Read opencode.jsonc for model, MCP, theme, plugins
    const configFile = join(configPath, "opencode.jsonc");
    const configContent = yield* readFileOpt(configFile);
    if (configContent) {
      const config = parseJsonc<OpenCodeConfig>(configContent);
      if (config) {
        // Model can be at root or agent.general.model
        result.model = config.model ?? config.agent?.general?.model;
        result.theme = config.theme;

        // MCP servers
        if (config.mcp) {
          for (const [name, server] of Object.entries(config.mcp)) {
            const serverType = server.type as "stdio" | "sse" | "http" | undefined;
            result.mcpServers.push({
              name,
              enabled: !server.disabled,
              serverType: serverType ?? (server.command ? "stdio" : server.url ? "sse" : undefined),
              command: server.command,
              args: server.args,
              url: server.url,
              env: server.env,
            });
          }
        }

        // Plugins
        if (config.plugin) {
          result.plugins = config.plugin;
        }
      } else {
        warnings.push("Failed to parse opencode.jsonc");
      }
    }

    // Extract skills from skills/**/*.md
    const skillsDir = join(configPath, "skills");
    result.skills = yield* extractSkillNames(skillsDir);

    // Extract agents from agents/**/*.md
    const agentsDir = join(configPath, "agents");
    const agentFiles = yield* listDir(agentsDir);
    result.agents = agentFiles.filter((e) => e.endsWith(".md")).map((e) => e.replace(/\.md$/, ""));

    return result;
  });

// ============================================================================
// Cursor Extraction (~/.cursor)
// ============================================================================

interface CursorSettings {
  "cursor.general.model"?: string;
  "workbench.colorTheme"?: string;
}

/**
 * Extract configuration from Cursor
 */
const extractCursor = (
  configPath: string
): Effect.Effect<ExtractedConfig, never> =>
  Effect.gen(function* () {
    const warnings: string[] = [];
    const result: ExtractedConfig = {
      mcpServers: [],
      skills: [],
      commands: [],
      agents: [],
      plugins: [],
      warnings,
    };

    // Read settings.json
    const settingsPath = join(configPath, "settings.json");
    const settingsContent = yield* readFileOpt(settingsPath);
    if (settingsContent) {
      const settings = parseJsonc<CursorSettings>(settingsContent);
      if (settings) {
        result.model = settings["cursor.general.model"];
        result.theme = settings["workbench.colorTheme"];
      }
    }

    // Extract rules from rules/**/*.md
    const rulesDir = join(configPath, "rules");
    const ruleFiles = yield* listDir(rulesDir);
    result.skills = ruleFiles.filter((e) => e.endsWith(".md")).map((e) => e.replace(/\.md$/, ""));

    // Check for .cursorrules file
    const cursorrules = join(configPath, ".cursorrules");
    const hasRules = yield* pathExists(cursorrules);
    if (hasRules && !result.skills.includes("cursorrules")) {
      result.skills.push("cursorrules");
    }

    return result;
  });

// ============================================================================
// Amp Extraction (~/.config/amp)
// ============================================================================

interface AmpSettings {
  amp?: {
    model?: {
      default?: string;
    };
    mcpServers?: Record<
      string,
      {
        command?: string;
        args?: string[];
        url?: string;
        type?: string;
        disabled?: boolean;
        env?: Record<string, string>;
      }
    >;
    theme?: string;
  };
}

/**
 * Extract configuration from Amp
 */
const extractAmp = (
  configPath: string
): Effect.Effect<ExtractedConfig, never> =>
  Effect.gen(function* () {
    const warnings: string[] = [];
    const result: ExtractedConfig = {
      mcpServers: [],
      skills: [],
      commands: [],
      agents: [],
      plugins: [],
      warnings,
    };

    // Read settings.json
    const settingsPath = join(configPath, "settings.json");
    const settingsContent = yield* readFileOpt(settingsPath);
    if (settingsContent) {
      const settings = parseJsonc<AmpSettings>(settingsContent);
      if (settings?.amp) {
        result.model = settings.amp.model?.default;
        result.theme = settings.amp.theme;

        // MCP servers
        if (settings.amp.mcpServers) {
          for (const [name, server] of Object.entries(settings.amp.mcpServers)) {
            const serverType = server.type as "stdio" | "sse" | "http" | undefined;
            result.mcpServers.push({
              name,
              enabled: !server.disabled,
              serverType: serverType ?? (server.command ? "stdio" : server.url ? "sse" : undefined),
              command: server.command,
              args: server.args,
              url: server.url,
              env: server.env,
            });
          }
        }
      }
    }

    return result;
  });

// ============================================================================
// Generic Extraction (Codex, Aider, Goose, Gemini)
// ============================================================================

/**
 * Extract configuration from generic harnesses (minimal extraction)
 */
const extractGeneric = (
  configPath: string,
  harnessId: HarnessId
): Effect.Effect<ExtractedConfig, never> =>
  Effect.gen(function* () {
    const warnings: string[] = [];
    const result: ExtractedConfig = {
      mcpServers: [],
      skills: [],
      commands: [],
      agents: [],
      plugins: [],
      warnings,
    };

    // Look for common patterns
    const skillsDir = join(configPath, "skills");
    result.skills = yield* extractSkillNames(skillsDir);

    // Check for AGENTS.md style (Codex, Aider)
    const agentsMd = join(configPath, "AGENTS.md");
    const hasAgentsMd = yield* pathExists(agentsMd);
    if (hasAgentsMd) {
      result.skills.push("agents-md");
    }

    // Check for CONVENTIONS.md (Aider)
    const conventionsMd = join(configPath, "CONVENTIONS.md");
    const hasConventionsMd = yield* pathExists(conventionsMd);
    if (hasConventionsMd) {
      result.skills.push("conventions-md");
    }

    return result;
  });

// ============================================================================
// Main Extractor
// ============================================================================

/**
 * Get harness config path, validating it exists
 */
const getHarnessConfigPath = (
  harnessId: HarnessId
): Effect.Effect<string, UnknownHarnessError | HarnessNotInstalledError> =>
  Effect.gen(function* () {
    const configPath = HARNESS_CONFIG_PATHS[harnessId];
    if (!configPath) {
      return yield* Effect.fail(
        new UnknownHarnessError({
          harnessId,
          validHarnesses: Object.keys(HARNESS_CONFIG_PATHS),
        })
      );
    }

    const resolvedPath = resolvePath(configPath);
    const exists = yield* pathExists(resolvedPath);

    if (!exists) {
      return yield* Effect.fail(
        new HarnessNotInstalledError({
          harnessId,
          configPath: resolvedPath,
        })
      );
    }

    return resolvedPath;
  });

/**
 * Extract configuration from a harness
 */
const extractFromHarness = (
  harnessId: HarnessId
): Effect.Effect<
  ExtractedConfig,
  UnknownHarnessError | HarnessNotInstalledError | ProfileExtractionError
> =>
  Effect.gen(function* () {
    const configPath = yield* getHarnessConfigPath(harnessId);

    switch (harnessId) {
      case "claude-code":
        return yield* extractClaudeCode(configPath);
      case "opencode":
        return yield* extractOpenCode(configPath);
      case "cursor":
        return yield* extractCursor(configPath);
      case "amp":
        return yield* extractAmp(configPath);
      default:
        return yield* extractGeneric(configPath, harnessId);
    }
  });

/**
 * Create a profile from extracted harness configuration
 */
const createProfileFromHarness = (
  profileName: string,
  harnessId: HarnessId,
  description?: string
): Effect.Effect<
  Profile,
  UnknownHarnessError | HarnessNotInstalledError | ProfileExtractionError
> =>
  Effect.gen(function* () {
    const extracted = yield* extractFromHarness(harnessId);
    const profile = createEmptyProfile(profileName, description);

    // Populate from extracted config
    return {
      ...profile,
      metadata: {
        ...profile.metadata,
        modelPreferences: extracted.model
          ? { default: extracted.model }
          : undefined,
        theme: extracted.theme,
      },
      skills: extracted.skills,
      commands: extracted.commands,
      mcpServers: extracted.mcpServers,
      agents: extracted.agents.length > 0 ? extracted.agents : undefined,
    };
  });

// Service interface
interface HarnessExtractorImpl {
  /**
   * Extract configuration from a harness
   */
  readonly extract: (
    harnessId: HarnessId
  ) => Effect.Effect<
    ExtractedConfig,
    UnknownHarnessError | HarnessNotInstalledError | ProfileExtractionError
  >;

  /**
   * Create a profile from extracted harness configuration
   */
  readonly createProfile: (
    profileName: string,
    harnessId: HarnessId,
    description?: string
  ) => Effect.Effect<
    Profile,
    UnknownHarnessError | HarnessNotInstalledError | ProfileExtractionError
  >;

  /**
   * Get harness config path (for direct file access)
   */
  readonly getConfigPath: (
    harnessId: HarnessId
  ) => Effect.Effect<string, UnknownHarnessError | HarnessNotInstalledError>;
}

// Service tag
export class HarnessExtractor extends Context.Tag("HarnessExtractor")<
  HarnessExtractor,
  HarnessExtractorImpl
>() {}

// Service implementation
const makeHarnessExtractor = (): HarnessExtractorImpl => ({
  extract: (harnessId: HarnessId) => extractFromHarness(harnessId),

  createProfile: (profileName: string, harnessId: HarnessId, description?: string) =>
    createProfileFromHarness(profileName, harnessId, description),

  getConfigPath: (harnessId: HarnessId) => getHarnessConfigPath(harnessId),
});

// Live layer
export const HarnessExtractorLive = Layer.succeed(
  HarnessExtractor,
  makeHarnessExtractor()
);
