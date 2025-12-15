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
 * Agent-specific configurations
 */
export const AgentConfigsSchema = Schema.Struct({
  claude_code: Schema.optional(ClaudeCodeConfigSchema),
  opencode: Schema.optional(OpenCodeConfigSchema),
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
 * Skill manifest schema (parsed from skill.yaml)
 *
 * Complete specification of a skill including metadata, dependencies,
 * agent configurations, and initialization steps.
 */
export const SkillManifestSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  version: Schema.String.pipe(Schema.minLength(1)),
  description: Schema.String,
  type: SkillTypeSchema,
  tags: Schema.optional(Schema.Array(Schema.String)),
  author: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
  repository: Schema.optional(Schema.String),
  cli: Schema.optional(Schema.Record({ key: Schema.String, value: CliDependencySchema })),
  agents: Schema.optional(AgentConfigsSchema),
  init: Schema.optional(InitConfigSchema),
  prompt: Schema.optional(Schema.String),
});

/**
 * Agent type enumeration
 */
export const AgentTypeSchema = Schema.Literal("claude_code", "opencode", "generic");

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
  "opencode"
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
