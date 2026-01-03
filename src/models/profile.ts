/**
 * Profile Domain Types
 *
 * Profiles are harness-agnostic configuration bundles that users can
 * apply to any supported AI coding assistant. Users have full control
 * over which harnesses receive which profiles.
 */

import { Schema } from "@effect/schema";

/**
 * Supported harness identifiers
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
 * MCP server configuration
 */
export const McpServerConfigSchema = Schema.Struct({
  /** Server name/identifier */
  name: Schema.String.pipe(Schema.minLength(1)),

  /** Whether the server is enabled by default */
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
 * Model preferences for a profile
 */
export const ModelPreferencesSchema = Schema.Struct({
  /** Default model to use */
  default: Schema.optional(Schema.String),

  /** Per-harness model overrides */
  harness: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
});

/**
 * Profile metadata stored in profile.json
 */
export const ProfileMetadataSchema = Schema.Struct({
  /** Profile name */
  name: Schema.String.pipe(Schema.minLength(1)),

  /** Human-readable description */
  description: Schema.optional(Schema.String),

  /** Creation timestamp (ISO 8601) */
  created: Schema.String,

  /** Last modified timestamp (ISO 8601) */
  updated: Schema.String,

  /** Harnesses this profile is currently applied to */
  appliedTo: Schema.Array(HarnessIdSchema),

  /** Model preferences */
  modelPreferences: Schema.optional(ModelPreferencesSchema),

  /** Theme preference */
  theme: Schema.optional(Schema.String),

  /** Tags for organization */
  tags: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Full profile with all contents
 */
export const ProfileSchema = Schema.Struct({
  /** Profile metadata */
  metadata: ProfileMetadataSchema,

  /** Skills included in this profile */
  skills: Schema.Array(Schema.String),

  /** Commands included in this profile */
  commands: Schema.Array(Schema.String),

  /** MCP server configurations */
  mcpServers: Schema.Array(McpServerConfigSchema),

  /** Agents included in this profile */
  agents: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Profile name validation pattern
 * Must be kebab-case: lowercase letters, numbers, hyphens
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

  /** Profile currently applied (if any) */
  appliedProfile: Schema.optional(Schema.String),
});

/**
 * Profile list item (summary for list display)
 */
export const ProfileListItemSchema = Schema.Struct({
  /** Profile name */
  name: Schema.String,

  /** Description */
  description: Schema.optional(Schema.String),

  /** Number of skills */
  skillCount: Schema.Number,

  /** Number of commands */
  commandCount: Schema.Number,

  /** Number of MCP servers */
  mcpServerCount: Schema.Number,

  /** Harnesses applied to */
  appliedTo: Schema.Array(HarnessIdSchema),

  /** Last updated */
  updated: Schema.String,
});

/**
 * Global profile configuration
 */
export const ProfileGlobalConfigSchema = Schema.Struct({
  /** Whether to create marker files in harness config dirs */
  profileMarker: Schema.Boolean,

  /** Editor for profile editing (falls back to $EDITOR) */
  editor: Schema.optional(Schema.String),

  /** Default harness for TUI */
  defaultHarness: Schema.optional(HarnessIdSchema),
});

/**
 * Diff item for comparing profiles
 */
export const ProfileDiffItemSchema = Schema.Struct({
  /** Category (skill, command, mcp, model, etc.) */
  category: Schema.String,

  /** Specific item that changed */
  item: Schema.String,

  /** Change type */
  changeType: Schema.Literal("added", "removed", "modified"),

  /** Details about the change */
  details: Schema.optional(Schema.String),
});

/**
 * Diff result between profile and harness config
 */
export const ProfileDiffSchema = Schema.Struct({
  /** Profile name */
  profileName: Schema.String,

  /** Harness being compared */
  harnessId: HarnessIdSchema,

  /** Individual differences */
  differences: Schema.Array(ProfileDiffItemSchema),

  /** Whether they are identical */
  identical: Schema.Boolean,
});

/**
 * Backup metadata
 */
export const ProfileBackupSchema = Schema.Struct({
  /** Harness that was backed up */
  harnessId: HarnessIdSchema,

  /** Profile that triggered the backup */
  profileName: Schema.String,

  /** Timestamp of backup */
  timestamp: Schema.String,

  /** Path to backup directory */
  path: Schema.String,

  /** Reason (apply, remove, etc.) */
  reason: Schema.optional(Schema.String),
});

// Type exports

export type HarnessId = Schema.Schema.Type<typeof HarnessIdSchema>;
export type McpServerType = Schema.Schema.Type<typeof McpServerTypeSchema>;
export type McpServerConfig = Schema.Schema.Type<typeof McpServerConfigSchema>;
export type ModelPreferences = Schema.Schema.Type<typeof ModelPreferencesSchema>;
export type ProfileMetadata = Schema.Schema.Type<typeof ProfileMetadataSchema>;
export type Profile = Schema.Schema.Type<typeof ProfileSchema>;
export type ProfileName = Schema.Schema.Type<typeof ProfileNameSchema>;
export type HarnessStatus = Schema.Schema.Type<typeof HarnessStatusSchema>;
export type HarnessInfo = Schema.Schema.Type<typeof HarnessInfoSchema>;
export type ProfileListItem = Schema.Schema.Type<typeof ProfileListItemSchema>;
export type ProfileGlobalConfig = Schema.Schema.Type<typeof ProfileGlobalConfigSchema>;
export type ProfileDiffItem = Schema.Schema.Type<typeof ProfileDiffItemSchema>;
export type ProfileDiff = Schema.Schema.Type<typeof ProfileDiffSchema>;
export type ProfileBackup = Schema.Schema.Type<typeof ProfileBackupSchema>;

// Default values

/**
 * Default global profile configuration
 */
export const DEFAULT_PROFILE_CONFIG: ProfileGlobalConfig = {
  profileMarker: true,
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
 * Profile metadata filename
 */
export const PROFILE_METADATA_FILE = "profile.json";

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

/**
 * Create empty profile metadata
 */
export function createEmptyProfile(name: string, description?: string): Profile {
  const now = new Date().toISOString();
  return {
    metadata: {
      name,
      description,
      created: now,
      updated: now,
      appliedTo: [],
    },
    skills: [],
    commands: [],
    mcpServers: [],
  };
}
