/**
 * Skills Services - Barrel Export
 *
 * Re-exports all skill-related services for convenient imports
 */

// Skill Config Service
export { SkillConfigService, SkillConfigServiceLive } from "./skill-config-service";

// Skill Cache Service
export { SkillCacheService, SkillCacheServiceLive } from "./skill-cache-service";
export type { GitHubSource, CachedSkill } from "./skill-cache-service";

// Skill State Service
export { SkillStateService, SkillStateServiceLive } from "./skill-state-service";

// Agent Adapter Service
export {
  AgentAdapterService,
  AgentAdapterServiceLive,
  AgentAdapterError,
  getAgentAdapter,
  detectAgent,
} from "./agent-adapter";
export type { AgentAdapter, AgentEnableResult } from "./agent-adapter";

// CLI Installer Service
export { CliInstallerService, CliInstallerServiceLive } from "./cli-installer-service";
export type { InstallerType, InstallOptions } from "./cli-installer-service";

// Skill Engine Service
export { SkillEngineService, SkillEngineServiceLive } from "./skill-engine-service";
export type { EnableOptions, DisableOptions, EnableResult, EnableCheck, SkillError } from "./skill-engine-service";

// Injection Utilities
export {
  hasManagedSection,
  addManagedSection,
  hasSkillInjection,
  addSkillInjection,
  removeSkillInjection,
  replaceSkillInjection,
  listInjectedSkills,
} from "./injection-utils";

// Skill Validation Service
export {
  SkillValidationService,
  SkillValidationServiceLive,
  validateName,
  validateDescription,
  validateCompatibility,
  validateSkillMdSize,
  validateManifest,
  validateSkillAtPath,
  parseAllowedTools,
} from "./skill-validation-service";

// Project Config Service
export {
  ProjectConfigService,
  ProjectConfigServiceLive,
  ProjectConfigSchema,
  ProjectConfigReadError,
  ProjectConfigWriteError,
} from "./project-config-service";
export type { ProjectConfig } from "./project-config-service";

// Marketplace Registry Service
export {
  MarketplaceRegistryService,
  MarketplaceRegistryServiceLive,
  MarketplaceRegistryError,
  ClaudeCliNotFoundError,
} from "./marketplace-registry-service";

// Source Analyzer Service
export {
  SourceAnalyzerService,
  SourceAnalyzerServiceLive,
  SourceAnalyzerError,
} from "./source-analyzer-service";
