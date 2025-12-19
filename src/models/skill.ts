/**
 * Skill Domain Types
 *
 * Defines schemas and types for skills - reusable agent configurations
 * that can be installed, enabled, and managed across projects.
 */

import { Schema } from "@effect/schema";

/**
 * CLI dependency specification
 *
 * Defines how to check for and install command-line tools required by a skill.
 */
export const CliDependencySchema = Schema.Struct({
  check: Schema.String.pipe(Schema.minLength(1)),
  install: Schema.optional(
    Schema.Struct({
      brew: Schema.optional(Schema.String),
      cargo: Schema.optional(Schema.String),
      npm: Schema.optional(Schema.String),
      go: Schema.optional(Schema.String),
      script: Schema.optional(Schema.String),
    })
  ),
});

/**
 * MCP (Model Context Protocol) server configuration
 */
export const McpConfigSchema = Schema.Struct({
  command: Schema.String.pipe(Schema.minLength(1)),
  args: Schema.optional(Schema.Array(Schema.String)),
  env: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
});

/**
 * Plugin marketplace reference
 */
export const PluginReferenceSchema = Schema.Struct({
  marketplace: Schema.String.pipe(Schema.minLength(1)),
  name: Schema.String.pipe(Schema.minLength(1)),
});

/**
 * File injection configuration
 */
export const InjectConfigSchema = Schema.Struct({
  file: Schema.String.pipe(Schema.minLength(1)),
  content: Schema.String,
});

/**
 * Claude Code agent configuration
 */
export const ClaudeCodeConfigSchema = Schema.Struct({
  plugin: Schema.optional(PluginReferenceSchema),
  mcp: Schema.optional(McpConfigSchema),
  skill_file: Schema.optional(Schema.Boolean),
  inject: Schema.optional(InjectConfigSchema),
});

/**
 * OpenCode agent configuration
 */
export const OpenCodeConfigSchema = Schema.Struct({
  inject: Schema.optional(InjectConfigSchema),
  mcp: Schema.optional(McpConfigSchema),
});

/**
 * Codex agent configuration (OpenAI Codex CLI)
 * Uses AGENTS.md for instructions
 */
export const CodexConfigSchema = Schema.Struct({
  inject: Schema.optional(InjectConfigSchema),
});

/**
 * Cursor agent configuration (Cursor IDE)
 * Uses .cursor/rules/*.mdc for rules (MDC format)
 */
export const CursorConfigSchema = Schema.Struct({
  inject: Schema.optional(InjectConfigSchema),
  /** Glob patterns for when this rule applies */
  globs: Schema.optional(Schema.Array(Schema.String)),
  /** Whether to always apply this rule */
  always_apply: Schema.optional(Schema.Boolean),
});

/**
 * Aider agent configuration (aider.chat)
 * Uses CONVENTIONS.md for instructions
 */
export const AiderConfigSchema = Schema.Struct({
  inject: Schema.optional(InjectConfigSchema),
});

/**
 * Amp agent configuration (Sourcegraph Amp)
 * Uses AGENT.md (singular) for instructions
 */
export const AmpConfigSchema = Schema.Struct({
  inject: Schema.optional(InjectConfigSchema),
});

/**
 * Agent-specific configurations
 */
export const AgentConfigsSchema = Schema.Struct({
  claude_code: Schema.optional(ClaudeCodeConfigSchema),
  opencode: Schema.optional(OpenCodeConfigSchema),
  codex: Schema.optional(CodexConfigSchema),
  cursor: Schema.optional(CursorConfigSchema),
  aider: Schema.optional(AiderConfigSchema),
  amp: Schema.optional(AmpConfigSchema),
});

/**
 * Initialization configuration
 */
export const InitConfigSchema = Schema.Struct({
  commands: Schema.optional(Schema.Array(Schema.String)),
  files: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
});

/**
 * Skill type enumeration
 */
export const SkillTypeSchema = Schema.Literal("prompt", "plugin", "mcp", "tool");

/**
 * Skill manifest schema (parsed from skill.yaml or SKILL.md frontmatter)
 *
 * Complete specification of a skill including metadata, dependencies,
 * agent configurations, and initialization steps.
 *
 * Aligned with agentskills.io standard:
 * - Required: name, description
 * - Optional: license, compatibility, metadata, allowed-tools
 */
export const SkillManifestSchema = Schema.Struct({
  // Required fields (agentskills.io standard)
  name: Schema.String.pipe(Schema.minLength(1)),
  description: Schema.String,

  // Optional fields (agentskills.io standard)
  /** Skill licensing terms */
  license: Schema.optional(Schema.String),
  /** Environment requirements (system packages, network access, etc.) */
  compatibility: Schema.optional(Schema.String),
  /** Arbitrary key-value metadata (agentskills.io standard) */
  metadata: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),

  // Extended fields (grimoire-specific, backwards compatible)
  version: Schema.optional(Schema.String),
  type: Schema.optional(SkillTypeSchema),
  tags: Schema.optional(Schema.Array(Schema.String)),
  author: Schema.optional(Schema.String),
  repository: Schema.optional(Schema.String),
  cli: Schema.optional(Schema.Record({ key: Schema.String, value: CliDependencySchema })),
  agents: Schema.optional(AgentConfigsSchema),
  init: Schema.optional(InitConfigSchema),
  prompt: Schema.optional(Schema.String),
  /**
   * Trigger description for Claude Code skill discovery.
   * This text helps Claude understand WHEN to use the skill.
   * Should describe use cases and trigger phrases.
   * Example: "Use this skill when managing tasks, tracking issues, or planning work"
   */
  trigger_description: Schema.optional(Schema.String),
  /**
   * List of allowed tools for this skill in Claude Code.
   * Restricts which tools the skill can use for security.
   * Can be space-delimited string or array (agentskills.io uses space-delimited).
   * Example: ["Read", "Write", "Bash", "Glob", "Grep"]
   */
  allowed_tools: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Agent type enumeration
 * Supports multiple AI coding agents with their specific conventions
 */
export const AgentTypeSchema = Schema.Literal(
  "claude_code", // Anthropic Claude Code CLI
  "opencode",    // OpenCode AI assistant
  "codex",       // OpenAI Codex CLI
  "cursor",      // Cursor IDE
  "aider",       // Aider chat
  "amp",         // Sourcegraph Amp
  "generic"      // Generic AGENTS.md fallback
);

/**
 * Per-project skill state
 *
 * Tracks which skills are enabled/disabled and when operations occurred.
 */
export const ProjectStateSchema = Schema.Struct({
  agent: AgentTypeSchema,
  enabled: Schema.Array(Schema.String),
  disabled_at: Schema.Record({ key: Schema.String, value: Schema.String }),
  initialized_at: Schema.String,
  last_sync: Schema.optional(Schema.String),
});

/**
 * Global skills state
 *
 * Tracks skill enablement state across all projects.
 */
export const SkillsStateSchema = Schema.Struct({
  version: Schema.Number.pipe(Schema.int()),
  projects: Schema.Record({ key: Schema.String, value: ProjectStateSchema }),
});

/**
 * Agent detection mode
 */
export const AgentDetectionModeSchema = Schema.Literal(
  "auto",
  "claude_code",
  "opencode",
  "codex",
  "cursor",
  "aider",
  "amp"
);

/**
 * Feature flags for skills system
 */
export const FeatureFlagsSchema = Schema.Struct({
  auto_detect: Schema.optional(Schema.Boolean),
  inject_agent_md: Schema.optional(Schema.Boolean),
  color_output: Schema.optional(Schema.Boolean),
});

/**
 * Skills system configuration
 *
 * Global configuration for skill management behavior.
 */
export const SkillsConfigSchema = Schema.Struct({
  defaults: Schema.Struct({
    agent: AgentDetectionModeSchema,
  }),
  recommended: Schema.optional(Schema.Array(Schema.String)),
  sources: Schema.optional(Schema.Array(Schema.String)),
  detect: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  features: Schema.optional(FeatureFlagsSchema),
});

// Derived Types

/**
 * CLI dependency type
 */
export type CliDependency = Schema.Schema.Type<typeof CliDependencySchema>;

/**
 * MCP configuration type
 */
export type McpConfig = Schema.Schema.Type<typeof McpConfigSchema>;

/**
 * Plugin reference type
 */
export type PluginReference = Schema.Schema.Type<typeof PluginReferenceSchema>;

/**
 * File injection configuration type
 */
export type InjectConfig = Schema.Schema.Type<typeof InjectConfigSchema>;

/**
 * Claude Code configuration type
 */
export type ClaudeCodeConfig = Schema.Schema.Type<typeof ClaudeCodeConfigSchema>;

/**
 * OpenCode configuration type
 */
export type OpenCodeConfig = Schema.Schema.Type<typeof OpenCodeConfigSchema>;

/**
 * Codex configuration type
 */
export type CodexConfig = Schema.Schema.Type<typeof CodexConfigSchema>;

/**
 * Cursor configuration type
 */
export type CursorConfig = Schema.Schema.Type<typeof CursorConfigSchema>;

/**
 * Aider configuration type
 */
export type AiderConfig = Schema.Schema.Type<typeof AiderConfigSchema>;

/**
 * Amp configuration type
 */
export type AmpConfig = Schema.Schema.Type<typeof AmpConfigSchema>;

/**
 * Agent configurations type
 */
export type AgentConfigs = Schema.Schema.Type<typeof AgentConfigsSchema>;

/**
 * Initialization configuration type
 */
export type InitConfig = Schema.Schema.Type<typeof InitConfigSchema>;

/**
 * Skill type
 */
export type SkillType = Schema.Schema.Type<typeof SkillTypeSchema>;

/**
 * Skill manifest type
 */
export type SkillManifest = Schema.Schema.Type<typeof SkillManifestSchema>;

/**
 * Agent type
 */
export type AgentType = Schema.Schema.Type<typeof AgentTypeSchema>;

/**
 * Project state type
 */
export type ProjectState = Schema.Schema.Type<typeof ProjectStateSchema>;

/**
 * Skills state type
 */
export type SkillsState = Schema.Schema.Type<typeof SkillsStateSchema>;

/**
 * Agent detection mode type
 */
export type AgentDetectionMode = Schema.Schema.Type<typeof AgentDetectionModeSchema>;

/**
 * Feature flags type
 */
export type FeatureFlags = Schema.Schema.Type<typeof FeatureFlagsSchema>;

/**
 * Skills configuration type
 */
export type SkillsConfig = Schema.Schema.Type<typeof SkillsConfigSchema>;

/**
 * Skill identifier type
 */
export type SkillId = string;

/**
 * Information about a skill found in a repository
 */
export interface SkillInfo {
  name: string;
  description: string;
  path: string; // subdirectory path (empty string for root)
  hasYaml: boolean;
  hasMd: boolean;
}

/**
 * Information about a plugin found in a repository
 */
export interface PluginInfo {
  name: string;
  path: string;
}

/**
 * Repository type detection result
 */
export type RepoType =
  | { type: "skill"; skill: SkillInfo }
  | { type: "plugin"; plugin: PluginInfo }
  | { type: "collection"; skills: SkillInfo[]; plugins: PluginInfo[] }
  | { type: "empty" };

/**
 * Partial manifest inferred from SKILL.md frontmatter
 */
export interface InferredManifest {
  name: string;
  version: string;
  description: string;
  type: SkillType;
  trigger_description?: string;
  allowed_tools?: string[];
}
