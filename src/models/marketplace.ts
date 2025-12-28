/**
 * Marketplace Domain Types
 *
 * Types for managing skill marketplaces and source analysis.
 * Marketplaces are collections of skills/plugins that can be installed,
 * with special support for Claude Code plugin marketplace integration.
 */

import { Schema } from "@effect/schema";
import type { SkillInfo, PluginInfo } from "./skill";

// ============================================================================
// Marketplace Types
// ============================================================================

/**
 * Marketplace type enumeration
 */
export const MarketplaceTypeSchema = Schema.Literal("official", "community", "local");
export type MarketplaceType = Schema.Schema.Type<typeof MarketplaceTypeSchema>;

/**
 * Marketplace definition
 *
 * Represents a known marketplace that can provide skills/plugins.
 * For Claude Code, this maps to a plugin marketplace that can be installed via CLI.
 */
export const MarketplaceSchema = Schema.Struct({
  /** Unique marketplace name (e.g., "anthropic-agent-skills") */
  name: Schema.String.pipe(Schema.minLength(1)),

  /** Repository source (e.g., "github:anthropics/skills") */
  repo: Schema.String.pipe(Schema.minLength(1)),

  /** Marketplace type */
  type: MarketplaceTypeSchema,

  /** Subfolder containing skills (e.g., "skills") - if not at root */
  skillsPath: Schema.optional(Schema.String),

  /** Claude Code plugin marketplace ID (for `claude plugin install X@{id}`) */
  claudePluginId: Schema.optional(Schema.String),

  /** Description of the marketplace */
  description: Schema.optional(Schema.String),

  /** When this marketplace was added */
  addedAt: Schema.optional(Schema.String),
});

export type Marketplace = Schema.Schema.Type<typeof MarketplaceSchema>;

/** Mutable version of Marketplace for internal updates */
export interface MutableMarketplace {
  name: string;
  repo: string;
  type: MarketplaceType;
  skillsPath?: string;
  claudePluginId?: string;
  description?: string;
  addedAt?: string;
}

/**
 * Marketplace registry
 *
 * Stores known marketplaces in ~/.grimoire/marketplaces.json
 * Syncs with Claude Code's installed marketplaces.
 */
export const MarketplaceRegistrySchema = Schema.Struct({
  /** Schema version */
  version: Schema.Number.pipe(Schema.int()),

  /** Last sync with Claude Code */
  lastSync: Schema.optional(Schema.String),

  /** Registered marketplaces */
  marketplaces: Schema.Array(MarketplaceSchema),
});

export type MarketplaceRegistry = Schema.Schema.Type<typeof MarketplaceRegistrySchema>;

/** Mutable version of MarketplaceRegistry for internal updates */
export interface MutableMarketplaceRegistry {
  version: number;
  lastSync?: string;
  marketplaces: MutableMarketplace[];
}

// ============================================================================
// Source Analysis Types
// ============================================================================

/**
 * Single skill source
 */
export interface SingleSkillSource {
  type: "single-skill";
  skill: SkillInfo;
}

/**
 * Collection of skills (no marketplace.json)
 */
export interface CollectionSource {
  type: "collection";
  skills: SkillInfo[];
  plugins: PluginInfo[];
}

/**
 * Marketplace source (has .claude-plugin/marketplace.json)
 */
export interface MarketplaceSource {
  type: "marketplace";
  marketplace: Marketplace;
  skills: SkillInfo[];
  plugins: PluginInfo[];
}

/**
 * Empty source (no skills or plugins found)
 */
export interface EmptySource {
  type: "empty";
}

/**
 * Source analysis result
 *
 * Returned by SourceAnalyzerService.analyze() to describe what was found
 * at a given source URL/path.
 */
export type SourceType =
  | SingleSkillSource
  | CollectionSource
  | MarketplaceSource
  | EmptySource;

// ============================================================================
// Installation Types
// ============================================================================

/**
 * Installation method for Claude Code
 */
export const InstallMethodSchema = Schema.Literal("plugin", "skill");
export type InstallMethod = Schema.Schema.Type<typeof InstallMethodSchema>;

/**
 * Installation request for a single skill/plugin
 */
export interface InstallRequest {
  /** Skill/plugin name */
  name: string;

  /** Source path within the repository */
  path: string;

  /** Whether this is a plugin or skill */
  itemType: "skill" | "plugin";

  /** Installation method (for Claude Code) */
  method?: InstallMethod;
}

/**
 * Installation result
 */
export interface InstallResult {
  /** Skill/plugin name */
  name: string;

  /** Whether installation succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Installation details */
  details?: {
    cachedAt?: string;
    installedAs?: "plugin" | "skill" | "mdc-rule";
    path?: string;
  };
}

// ============================================================================
// Missing Features Warning
// ============================================================================

/**
 * Features that may be missing when installing as skills instead of plugins
 */
export interface MissingFeatures {
  /** MCP server integration */
  mcp: boolean;

  /** Slash commands */
  commands: boolean;

  /** Lifecycle hooks */
  hooks: boolean;

  /** Custom agents */
  agents: boolean;
}

/**
 * Get missing features for a given agent type
 *
 * Returns which plugin features will be unavailable when installing
 * marketplace items as skills (non-Claude Code agents).
 */
export function getMissingFeatures(agentType: string): MissingFeatures {
  // Only Claude Code supports full plugin features
  if (agentType === "claude_code") {
    return {
      mcp: false,
      commands: false,
      hooks: false,
      agents: false,
    };
  }

  // All other agents miss plugin features
  return {
    mcp: true,
    commands: true,
    hooks: true,
    agents: true,
  };
}

/**
 * Format missing features as human-readable list
 */
export function formatMissingFeatures(features: MissingFeatures): string[] {
  const missing: string[] = [];

  if (features.mcp) missing.push("MCP server integration");
  if (features.commands) missing.push("Slash commands");
  if (features.hooks) missing.push("Lifecycle hooks");
  if (features.agents) missing.push("Custom agents");

  return missing;
}

// ============================================================================
// Selectable Item (for TUI)
// ============================================================================

/**
 * Item that can be selected in the TUI
 *
 * Used by ItemSelector component for mixed skill/plugin selection.
 */
export interface SelectableItem {
  /** Item name */
  name: string;

  /** Item description */
  description: string;

  /** Item type */
  type: "skill" | "plugin";

  /** Path within the source repository */
  path: string;

  /** Whether this item is from a marketplace */
  fromMarketplace?: boolean;

  /** Marketplace name if applicable */
  marketplaceName?: string;
}

/**
 * Convert SkillInfo to SelectableItem
 */
export function skillToSelectable(
  skill: SkillInfo,
  marketplace?: Marketplace
): SelectableItem {
  return {
    name: skill.name,
    description: skill.description || "",
    type: "skill",
    path: skill.path,
    fromMarketplace: !!marketplace,
    marketplaceName: marketplace?.name,
  };
}

/**
 * Convert PluginInfo to SelectableItem
 */
export function pluginToSelectable(
  plugin: PluginInfo,
  marketplace?: Marketplace
): SelectableItem {
  return {
    name: plugin.name,
    description: "",
    type: "plugin",
    path: plugin.path,
    fromMarketplace: !!marketplace,
    marketplaceName: marketplace?.name,
  };
}
