/**
 * Profile Domain Types
 *
 * Defines schemas and types for harness profile management.
 * Profiles are configuration snapshots that can be switched, diffed, and shared.
 *
 * Inspired by bridle's profile management system.
 */

import { Schema } from "@effect/schema";

/**
 * Supported harness identifiers
 *
 * These correspond to AI coding assistants that can be configured.
 */
export const HarnessIdSchema = Schema.Literal(
  "claude-code",  // Anthropic Claude Code CLI (~/.claude)
  "opencode",     // OpenCode AI assistant (~/.config/opencode)
  "cursor",       // Cursor IDE (~/.cursor)
  "codex",        // OpenAI Codex CLI (AGENTS.md based)
  "aider",        // Aider chat (CONVENTIONS.md based)
  "amp",          // Sourcegraph Amp (~/.config/amp)
  "goose",        // Goose AI (~/.config/goose)
  "gemini"        // Google Gemini CLI (~/.gemini)
);

/**
 * Harness configuration locations
 */
export const HARNESS_CONFIG_PATHS: Record<string, string> = {
  "claude-code": "~/.claude",
  "opencode": "~/.config/opencode",
  "cursor": "~/.cursor",
  "codex": "~/.codex",
  "aider": "~/.config/aider",
  "amp": "~/.config/amp",
  "goose": "~/.config/goose",
  "gemini": "~/.gemini",
};

/**
 * MCP server type
 */
export const McpServerTypeSchema = Schema.Literal("stdio", "sse", "http");

/**
 * MCP server configuration extracted from harness config
 */
export const McpServerInfoSchema = Schema.Struct({
  /** Server name/identifier */
  name: Schema.String.pipe(Schema.minLength(1)),

  /** Whether the server is enabled */
  enabled: Schema.Boolean,

  /** Server type (stdio, sse, http) */
  serverType: Schema.optional(McpServerTypeSchema),

  /** Command to run (for stdio servers) */
  command: Schema.optional(Schema.String),

  /** Command arguments */
  args: Schema.optional(Schema.Array(Schema.String)),

  /** URL (for sse/http servers) */
  url: Schema.optional(Schema.String),

  /** Environment variables */
  env: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
});

/**
 * Resource summary for directory-based resources (skills, commands, agents)
 */
export const ResourceSummarySchema = Schema.Struct({
  /** Names/identifiers of resources found */
  items: Schema.Array(Schema.String),

  /** Whether the resource directory exists */
  directoryExists: Schema.Boolean,
});

/**
 * Profile information extracted from harness configuration
 *
 * This represents the complete state of a harness configuration,
 * including model settings, MCP servers, skills, commands, etc.
 */
export const ProfileInfoSchema = Schema.Struct({
  /** Profile name (e.g., "default", "work", "personal") */
  name: Schema.String.pipe(Schema.minLength(1)),

  /** Harness identifier */
  harnessId: HarnessIdSchema,

  /** Whether this profile is currently active */
  isActive: Schema.Boolean,

  /** Absolute path to profile storage */
  path: Schema.String,

  /** MCP servers configured */
  mcpServers: Schema.Array(McpServerInfoSchema),

  /** Skills installed/enabled */
  skills: ResourceSummarySchema,

  /** Commands installed */
  commands: ResourceSummarySchema,

  /** Plugins installed (harness-specific) */
  plugins: Schema.optional(ResourceSummarySchema),

  /** Agents defined (harness-specific) */
  agents: Schema.optional(ResourceSummarySchema),

  /** Rules file path (for Cursor) */
  rulesFile: Schema.optional(Schema.String),

  /** Theme setting */
  theme: Schema.optional(Schema.String),

  /** Model setting */
  model: Schema.optional(Schema.String),

  /** API provider (anthropic, openai, etc.) */
  provider: Schema.optional(Schema.String),

  /** Errors encountered during extraction */
  extractionErrors: Schema.Array(Schema.String),
});

/**
 * Profile name validation pattern
 * Must be kebab-case: lowercase letters, numbers, hyphens
 * No leading/trailing hyphens, no consecutive hyphens
 */
export const ProfileNameSchema = Schema.String.pipe(
  Schema.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  Schema.minLength(1),
  Schema.maxLength(64)
);

/**
 * Harness installation status
 */
export const HarnessStatusSchema = Schema.Literal(
  "installed",      // Binary and config present
  "binary-only",    // Binary present, no config
  "config-only",    // Config present, no binary
  "not-installed"   // Neither present
);

/**
 * Harness status information
 */
export const HarnessInfoSchema = Schema.Struct({
  /** Harness identifier */
  id: HarnessIdSchema,

  /** Installation status */
  status: HarnessStatusSchema,

  /** Path to harness configuration */
  configPath: Schema.optional(Schema.String),

  /** Active profile name */
  activeProfile: Schema.optional(Schema.String),
});

/**
 * Profile configuration stored in ~/.grimoire/config.json
 *
 * Tracks active profiles and user preferences for profile management.
 */
export const ProfileConfigSchema = Schema.Struct({
  /** Active profile per harness: { "claude-code": "work", "opencode": "default" } */
  active: Schema.Record({ key: Schema.String, value: Schema.String }),

  /** Whether to create profile marker files in harness config dirs */
  profileMarker: Schema.Boolean,

  /** Editor to use for profile editing (falls back to $EDITOR) */
  editor: Schema.optional(Schema.String),

  /** Default harness to show in TUI */
  defaultHarness: Schema.optional(HarnessIdSchema),
});

/**
 * Diff result for comparing profiles
 */
export const ProfileDiffItemSchema = Schema.Struct({
  /** What changed (model, theme, mcp, skill, etc.) */
  category: Schema.String,

  /** Specific key that changed */
  key: Schema.String,

  /** Value in first profile (undefined if added) */
  left: Schema.optional(Schema.String),

  /** Value in second profile (undefined if removed) */
  right: Schema.optional(Schema.String),

  /** Change type */
  changeType: Schema.Literal("added", "removed", "modified"),
});

/**
 * Complete diff between two profiles
 */
export const ProfileDiffSchema = Schema.Struct({
  /** Left profile name */
  leftName: Schema.String,

  /** Right profile name (or "current" for live config) */
  rightName: Schema.String,

  /** Individual differences */
  differences: Schema.Array(ProfileDiffItemSchema),

  /** Whether profiles are identical */
  identical: Schema.Boolean,
});

/**
 * Backup metadata
 */
export const ProfileBackupSchema = Schema.Struct({
  /** Harness that was backed up */
  harnessId: HarnessIdSchema,

  /** Timestamp of backup */
  timestamp: Schema.String,

  /** Path to backup directory */
  path: Schema.String,

  /** Reason for backup (e.g., "switch", "manual") */
  reason: Schema.optional(Schema.String),
});

// Type exports

/**
 * Harness identifier
 */
export type HarnessId = Schema.Schema.Type<typeof HarnessIdSchema>;

/**
 * MCP server type
 */
export type McpServerType = Schema.Schema.Type<typeof McpServerTypeSchema>;

/**
 * MCP server information
 */
export type McpServerInfo = Schema.Schema.Type<typeof McpServerInfoSchema>;

/**
 * Resource summary
 */
export type ResourceSummary = Schema.Schema.Type<typeof ResourceSummarySchema>;

/**
 * Profile information
 */
export type ProfileInfo = Schema.Schema.Type<typeof ProfileInfoSchema>;

/**
 * Profile name (validated)
 */
export type ProfileName = Schema.Schema.Type<typeof ProfileNameSchema>;

/**
 * Harness installation status
 */
export type HarnessStatus = Schema.Schema.Type<typeof HarnessStatusSchema>;

/**
 * Harness information
 */
export type HarnessInfo = Schema.Schema.Type<typeof HarnessInfoSchema>;

/**
 * Profile configuration
 */
export type ProfileConfig = Schema.Schema.Type<typeof ProfileConfigSchema>;

/**
 * Profile diff item
 */
export type ProfileDiffItem = Schema.Schema.Type<typeof ProfileDiffItemSchema>;

/**
 * Profile diff result
 */
export type ProfileDiff = Schema.Schema.Type<typeof ProfileDiffSchema>;

/**
 * Profile backup metadata
 */
export type ProfileBackup = Schema.Schema.Type<typeof ProfileBackupSchema>;

// Default values

/**
 * Default profile configuration
 */
export const DEFAULT_PROFILE_CONFIG: ProfileConfig = {
  active: {},
  profileMarker: true,
};

/**
 * Default empty resource summary
 */
export const EMPTY_RESOURCE_SUMMARY: ResourceSummary = {
  items: [],
  directoryExists: false,
};

/**
 * Profiles storage directory relative to ~/.grimoire/
 */
export const PROFILES_DIR = "profiles";

/**
 * Backups storage directory relative to ~/.grimoire/
 */
export const BACKUPS_DIR = "backups";

/**
 * Profile marker file prefix
 */
export const PROFILE_MARKER_PREFIX = "GRIMOIRE_PROFILE_";

/**
 * Validate a profile name
 */
export function isValidProfileName(name: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length >= 1 && name.length <= 64;
}

/**
 * Sanitize a string to be a valid profile name
 */
export function sanitizeProfileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Get profile marker filename
 */
export function getProfileMarkerName(profileName: string): string {
  return `${PROFILE_MARKER_PREFIX}${profileName}`;
}
