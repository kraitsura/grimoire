/**
 * Skill Domain Error Types
 */

import { Data } from "effect";

/**
 * Error when a skill is not found
 */
export class SkillNotFoundError extends Data.TaggedError("SkillNotFoundError")<{
  name: string;
  suggestion?: string; // fuzzy match suggestion
}> {}

/**
 * Error when a skill is not cached locally
 */
export class SkillNotCachedError extends Data.TaggedError("SkillNotCachedError")<{
  name: string;
}> {}

/**
 * Error when attempting to enable an already enabled skill
 */
export class SkillAlreadyEnabledError extends Data.TaggedError("SkillAlreadyEnabledError")<{
  name: string;
}> {}

/**
 * Error when a skill is not enabled
 */
export class SkillNotEnabledError extends Data.TaggedError("SkillNotEnabledError")<{
  name: string;
}> {}

/**
 * Error when skill manifest is invalid or cannot be parsed
 */
export class SkillManifestError extends Data.TaggedError("SkillManifestError")<{
  name: string;
  message: string;
  path?: string;
}> {}

/**
 * Error when skill source cannot be fetched or resolved
 */
export class SkillSourceError extends Data.TaggedError("SkillSourceError")<{
  source: string;
  message: string;
  cause?: unknown;
}> {}

/**
 * Error when project is not initialized for grimoire
 */
export class ProjectNotInitializedError extends Data.TaggedError("ProjectNotInitializedError")<{
  path: string;
}> {}

/**
 * Error when agent context cannot be detected
 */
export class AgentNotDetectedError extends Data.TaggedError("AgentNotDetectedError")<{
  path: string;
}> {}

/**
 * Error when required CLI binary is missing
 */
export class CliDependencyError extends Data.TaggedError("CliDependencyError")<{
  binary: string;
  message: string;
}> {}

/**
 * Error when plugin installation fails
 */
export class PluginInstallError extends Data.TaggedError("PluginInstallError")<{
  plugin: string;
  message: string;
}> {}

/**
 * Error when file injection fails
 */
export class InjectionError extends Data.TaggedError("InjectionError")<{
  file: string;
  message: string;
}> {}

/**
 * Error when a plugin is detected instead of a skill
 */
export class PluginDetectedError extends Data.TaggedError("PluginDetectedError")<{
  source: string;
  pluginPath: string;
}> {}

/**
 * Error when repository contains no skills or plugins
 */
export class EmptyRepoError extends Data.TaggedError("EmptyRepoError")<{
  source: string;
}> {}

/**
 * Error when SKILL.md is missing required frontmatter
 */
export class SkillMdFrontmatterError extends Data.TaggedError("SkillMdFrontmatterError")<{
  path: string;
  message: string;
}> {}

/**
 * Validation severity level
 */
export type ValidationSeverity = "error" | "warning";

/**
 * Single validation issue
 */
export interface ValidationIssue {
  field: string;
  message: string;
  severity: ValidationSeverity;
  value?: unknown;
}

/**
 * Validation result containing all issues found
 */
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/**
 * Error when skill validation fails against agentskills.io standard
 */
export class SkillValidationError extends Data.TaggedError("SkillValidationError")<{
  name: string;
  result: ValidationResult;
}> {}
