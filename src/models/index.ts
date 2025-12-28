/**
 * Domain Models
 */

export * from "./prompt";
export * from "./errors";
export * from "./command-args";
export * from "./stash";
export * from "./skill";
export * from "./skill-errors";
export * from "./plugin";
export * from "./plugin-errors";
// Export marketplace types explicitly to avoid conflicts with plugin.ts
export {
  MarketplaceTypeSchema,
  type MarketplaceType,
  MarketplaceRegistrySchema,
  type MarketplaceRegistry,
  type SingleSkillSource,
  type CollectionSource,
  type MarketplaceSource,
  type EmptySource,
  type SourceType,
  InstallMethodSchema,
  type InstallMethod,
  type InstallRequest,
  type InstallResult,
  type MissingFeatures,
  getMissingFeatures,
  formatMissingFeatures,
} from "./marketplace";
// Re-export marketplace-specific Marketplace type with alias to avoid conflict
export { MarketplaceSchema as MarketplaceRegistryEntrySchema } from "./marketplace";
export { type Marketplace as MarketplaceRegistryEntry } from "./marketplace";
export * from "./agent";
export * from "./agent-errors";
export * from "./worktree";
export * from "./worktree-errors";
export * from "./enhancement-template";
