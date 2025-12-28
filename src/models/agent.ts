/**
 * Agent Domain Types
 *
 * Defines schemas and types for agents - CLI tool wrappers and specialized
 * subagents that can be enabled across multiple AI coding platforms.
 */

import { Schema } from "@effect/schema";

/**
 * Agent platform enumeration
 * Supports multiple AI coding platforms with their specific agent conventions
 */
export const AgentPlatformSchema = Schema.Literal(
  "claude_code", // Anthropic Claude Code CLI - ~/.claude/agents/
  "opencode",    // OpenCode AI assistant - ~/.config/opencode/agent/
  "cursor",      // Cursor IDE (if agent support added)
  "generic"      // Generic fallback
);

/**
 * Permission mode for Claude Code agents
 */
export const PermissionModeSchema = Schema.Literal(
  "default", // Inherits from user settings
  "ask",     // Always ask for permission
  "allow"    // Allow without prompting
);

/**
 * Agent mode for OpenCode
 */
export const AgentModeSchema = Schema.Literal(
  "primary",  // Can be used as primary agent
  "subagent", // Only usable as subagent
  "all"       // Both modes
);

/**
 * OpenCode permission value - can be boolean, "ask", or array of allowed paths
 */
export const OpenCodePermissionValueSchema = Schema.Union(
  Schema.Boolean,
  Schema.Literal("ask"),
  Schema.Array(Schema.String)
);

/**
 * Base agent definition schema (unified format)
 *
 * This is the platform-agnostic definition that gets transpiled
 * to platform-specific formats.
 */
export const AgentDefinitionSchema = Schema.Struct({
  /** Unique agent identifier (kebab-case) */
  name: Schema.String.pipe(Schema.minLength(1)),

  /** Description for auto-invocation - critical for agent discovery */
  description: Schema.String.pipe(Schema.minLength(1)),

  /** Allowed tools for this agent (e.g., Read, Write, Bash, Glob) */
  tools: Schema.optional(Schema.Array(Schema.String)),

  /** Model override (e.g., haiku, sonnet, opus) */
  model: Schema.optional(Schema.String),

  /** System prompt / instructions markdown content */
  content: Schema.String,

  /** CLI tool this agent wraps (if any) */
  wraps_cli: Schema.optional(Schema.String),

  /** Tags for categorization */
  tags: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Claude Code specific agent schema
 *
 * Location: ~/.claude/agents/<name>.md or .claude/agents/<name>.md
 * Format: Markdown with YAML frontmatter
 */
export const ClaudeCodeAgentSchema = Schema.Struct({
  /** Agent name */
  name: Schema.String.pipe(Schema.minLength(1)),

  /** Description for Task tool invocation */
  description: Schema.String.pipe(Schema.minLength(1)),

  /** Allowed tools (defaults to all if not specified) */
  tools: Schema.optional(Schema.Array(Schema.String)),

  /** Model override */
  model: Schema.optional(Schema.String),

  /** Agent color for UI (hex or named color) */
  color: Schema.optional(Schema.String),

  /** Permission handling mode */
  permissionMode: Schema.optional(PermissionModeSchema),

  /** System prompt content (body of markdown) */
  content: Schema.String,
});

/**
 * OpenCode specific agent schema
 *
 * Location: ~/.config/opencode/agent/<name>.md or .opencode/agent/<name>.md
 * Format: Markdown with YAML frontmatter
 */
export const OpenCodeAgentSchema = Schema.Struct({
  /** Description for subagent invocation */
  description: Schema.String.pipe(Schema.minLength(1)),

  /** Model to use */
  model: Schema.optional(Schema.String),

  /** Agent mode */
  mode: Schema.optional(AgentModeSchema),

  /** Temperature for generation (0-1) */
  temperature: Schema.optional(Schema.Number),

  /** Allowed tools */
  tools: Schema.optional(Schema.Array(Schema.String)),

  /** Tool-specific permissions */
  permissions: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: OpenCodePermissionValueSchema
    })
  ),

  /** Maximum execution steps */
  maxSteps: Schema.optional(Schema.Number.pipe(Schema.int())),

  /** System prompt content */
  content: Schema.String,
});

/**
 * Cached agent metadata
 */
export const CachedAgentSchema = Schema.Struct({
  /** Agent name */
  name: Schema.String.pipe(Schema.minLength(1)),

  /** Source of the agent (local, github:user/repo, etc.) */
  source: Schema.String,

  /** When the agent was cached */
  cachedAt: Schema.String,

  /** The agent definition */
  definition: AgentDefinitionSchema,
});

/**
 * Agent state for a project
 */
export const AgentProjectStateSchema = Schema.Struct({
  /** Detected platforms in this project */
  platforms: Schema.Array(AgentPlatformSchema),

  /** Enabled agents by name */
  enabled: Schema.Array(Schema.String),

  /** When the project was initialized for agents */
  initializedAt: Schema.String,

  /** Last sync timestamp */
  lastSync: Schema.optional(Schema.String),
});

/**
 * Global agent state
 */
export const AgentStateSchema = Schema.Struct({
  /** State version for migrations */
  version: Schema.Number.pipe(Schema.int()),

  /** Per-project agent state keyed by project path */
  projects: Schema.Record({
    key: Schema.String,
    value: AgentProjectStateSchema
  }),
});

/**
 * Agent type (kind of agent)
 */
export const AgentTypeEnumSchema = Schema.Literal(
  "cli_wrapper",  // Wraps an existing CLI tool
  "specialized",  // Custom specialized agent
  "cross_platform" // Generates for all platforms
);

// ============================================================================
// Derived Types
// ============================================================================

/**
 * Agent platform type
 */
export type AgentPlatform = Schema.Schema.Type<typeof AgentPlatformSchema>;

/**
 * Permission mode type
 */
export type PermissionMode = Schema.Schema.Type<typeof PermissionModeSchema>;

/**
 * Agent mode type (OpenCode)
 */
export type AgentMode = Schema.Schema.Type<typeof AgentModeSchema>;

/**
 * OpenCode permission value type
 */
export type OpenCodePermissionValue = Schema.Schema.Type<typeof OpenCodePermissionValueSchema>;

/**
 * Base agent definition type
 */
export type AgentDefinition = Schema.Schema.Type<typeof AgentDefinitionSchema>;

/**
 * Claude Code agent type
 */
export type ClaudeCodeAgent = Schema.Schema.Type<typeof ClaudeCodeAgentSchema>;

/**
 * OpenCode agent type
 */
export type OpenCodeAgent = Schema.Schema.Type<typeof OpenCodeAgentSchema>;

/**
 * Cached agent type
 */
export type CachedAgent = Schema.Schema.Type<typeof CachedAgentSchema>;

/**
 * Agent project state type
 */
export type AgentProjectState = Schema.Schema.Type<typeof AgentProjectStateSchema>;

/**
 * Agent state type
 */
export type AgentState = Schema.Schema.Type<typeof AgentStateSchema>;

/** Mutable version of AgentProjectState for internal updates */
export interface MutableAgentProjectState {
  platforms: AgentPlatform[];
  enabled: string[];
  initializedAt: string;
  lastSync?: string;
}

/** Mutable version of AgentState for internal updates */
export interface MutableAgentState {
  version: number;
  projects: Record<string, MutableAgentProjectState>;
}

/**
 * Agent type enum
 */
export type AgentTypeEnum = Schema.Schema.Type<typeof AgentTypeEnumSchema>;

// ============================================================================
// Constants
// ============================================================================

/**
 * Global agent locations per platform
 */
export const GLOBAL_AGENT_LOCATIONS: Record<AgentPlatform, string> = {
  claude_code: "~/.claude/agents",
  opencode: "~/.config/opencode/agent",
  cursor: "~/.cursor/agents",
  generic: "~/.grimoire/agents",
};

/**
 * Project agent locations per platform
 */
export const PROJECT_AGENT_LOCATIONS: Record<AgentPlatform, string> = {
  claude_code: ".claude/agents",
  opencode: ".opencode/agent",
  cursor: ".cursor/agents",
  generic: ".grimoire/agents",
};

/**
 * Platform detection patterns
 * Files/directories that indicate a platform is in use
 */
export const PLATFORM_DETECTION_PATTERNS: Record<AgentPlatform, string[]> = {
  claude_code: ["CLAUDE.md", ".claude/", ".clauderc"],
  opencode: ["AGENTS.md", ".opencode/", ".opencode.json"],
  cursor: [".cursor/", ".cursorrc"],
  generic: [],
};

/**
 * Default tools for CLI wrapper agents
 */
export const CLI_WRAPPER_DEFAULT_TOOLS = ["Bash"];

/**
 * Common tool restrictions for specialized agents
 */
export const SPECIALIZED_TOOL_PRESETS: Record<string, string[]> = {
  readonly: ["Read", "Glob", "Grep"],
  analysis: ["Read", "Glob", "Grep", "Bash"],
  development: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
  full: [], // Empty means all tools allowed
};
