/**
 * Plugin Domain Types
 *
 * Defines schemas and types for Claude Code plugins and marketplace management.
 * Plugins are distinct from skills - they provide tools, MCP servers, hooks, and commands.
 */

import { Schema } from "@effect/schema";
import type { SkillInfo } from "./skill";

/**
 * Scope for plugin/skill installation
 * - user: Install globally for the user (~/.claude/)
 * - project: Install for the current project only (.claude/)
 */
export const ScopeSchema = Schema.Literal("user", "project");
export type Scope = Schema.Schema.Type<typeof ScopeSchema>;

/**
 * Detailed plugin information for marketplace operations
 * (Distinct from the simpler PluginInfo in skill.ts used for repo detection)
 */
export const MarketplacePluginInfoSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  description: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  path: Schema.String, // Path within the repository (empty string for root)
});
export type MarketplacePluginInfo = Schema.Schema.Type<typeof MarketplacePluginInfoSchema>;

/**
 * A selectable item in the TUI (can be plugin or skill)
 */
export const SelectableItemSchema = Schema.Struct({
  type: Schema.Literal("plugin", "skill"),
  name: Schema.String.pipe(Schema.minLength(1)),
  description: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  path: Schema.String,
});
export type SelectableItem = Schema.Schema.Type<typeof SelectableItemSchema>;

/**
 * Content found in a marketplace/repository
 */
export const MarketplaceContentSchema = Schema.Struct({
  plugins: Schema.Array(MarketplacePluginInfoSchema),
  skills: Schema.Array(
    Schema.Struct({
      name: Schema.String.pipe(Schema.minLength(1)),
      description: Schema.String,
      path: Schema.String,
    })
  ),
});
export type MarketplaceContent = Schema.Schema.Type<typeof MarketplaceContentSchema>;

/**
 * A tracked marketplace that has been added
 */
export const TrackedMarketplaceSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  source: Schema.String.pipe(Schema.minLength(1)), // e.g., "github:owner/repo"
  addedAt: Schema.String, // ISO date string
  scope: ScopeSchema,
});
export type TrackedMarketplace = Schema.Schema.Type<typeof TrackedMarketplaceSchema>;

/**
 * Installed plugin information (from claude plugin list)
 */
export const InstalledPluginSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  marketplace: Schema.String,
  version: Schema.optional(Schema.String),
  scope: ScopeSchema,
  enabled: Schema.Boolean,
});
export type InstalledPlugin = Schema.Schema.Type<typeof InstalledPluginSchema>;

/**
 * Marketplace information (from claude marketplace list)
 */
export const MarketplaceSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  url: Schema.optional(Schema.String),
  scope: ScopeSchema,
});
export type Marketplace = Schema.Schema.Type<typeof MarketplaceSchema>;

/**
 * State file for tracking added marketplaces
 */
export const MarketplaceStateSchema = Schema.Struct({
  version: Schema.Number.pipe(Schema.int()),
  marketplaces: Schema.Array(TrackedMarketplaceSchema),
});
export type MarketplaceState = Schema.Schema.Type<typeof MarketplaceStateSchema>;

/**
 * Convert MarketplacePluginInfo to SelectableItem
 */
export const pluginToSelectable = (plugin: MarketplacePluginInfo): SelectableItem => ({
  type: "plugin",
  name: plugin.name,
  description: plugin.description,
  version: plugin.version,
  path: plugin.path,
});

/**
 * Convert SkillInfo to SelectableItem
 */
export const skillToSelectable = (skill: SkillInfo): SelectableItem => ({
  type: "skill",
  name: skill.name,
  description: skill.description,
  path: skill.path,
});
