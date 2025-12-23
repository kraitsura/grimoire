/**
 * Agent Domain Error Types
 */

import { Data } from "effect";
import type { AgentPlatform } from "./agent";

/**
 * Error when an agent is not found
 */
export class AgentNotFoundError extends Data.TaggedError("AgentNotFoundError")<{
  name: string;
  suggestion?: string; // fuzzy match suggestion
}> {}

/**
 * Error when an agent is not cached locally
 */
export class AgentNotCachedError extends Data.TaggedError("AgentNotCachedError")<{
  name: string;
}> {}

/**
 * Error when attempting to enable an already enabled agent
 */
export class AgentAlreadyEnabledError extends Data.TaggedError("AgentAlreadyEnabledError")<{
  name: string;
  platform: AgentPlatform;
}> {}

/**
 * Error when an agent is not enabled
 */
export class AgentNotEnabledError extends Data.TaggedError("AgentNotEnabledError")<{
  name: string;
}> {}

/**
 * Error when agent definition is invalid or cannot be parsed
 */
export class AgentDefinitionError extends Data.TaggedError("AgentDefinitionError")<{
  name: string;
  message: string;
  path?: string;
}> {}

/**
 * Error when agent source cannot be fetched or resolved
 */
export class AgentSourceError extends Data.TaggedError("AgentSourceError")<{
  source: string;
  message: string;
  cause?: unknown;
}> {}

/**
 * Error when project is not initialized for agents
 */
export class AgentProjectNotInitializedError extends Data.TaggedError("AgentProjectNotInitializedError")<{
  path: string;
}> {}

/**
 * Error when no agent platform can be detected
 */
export class AgentPlatformNotDetectedError extends Data.TaggedError("AgentPlatformNotDetectedError")<{
  path: string;
  hint?: string;
}> {}

/**
 * Error when transpilation to a specific platform fails
 */
export class AgentTranspileError extends Data.TaggedError("AgentTranspileError")<{
  name: string;
  platform: AgentPlatform;
  message: string;
}> {}

/**
 * Error when writing agent file fails
 */
export class AgentWriteError extends Data.TaggedError("AgentWriteError")<{
  name: string;
  path: string;
  message: string;
}> {}

/**
 * Validation severity level
 */
export type AgentValidationSeverity = "error" | "warning";

/**
 * Single validation issue
 */
export interface AgentValidationIssue {
  field: string;
  message: string;
  severity: AgentValidationSeverity;
  value?: unknown;
}

/**
 * Validation result containing all issues found
 */
export interface AgentValidationResult {
  valid: boolean;
  issues: AgentValidationIssue[];
  errors: AgentValidationIssue[];
  warnings: AgentValidationIssue[];
}

/**
 * Error when agent validation fails
 */
export class AgentValidationError extends Data.TaggedError("AgentValidationError")<{
  name: string;
  result: AgentValidationResult;
}> {}

/**
 * Error when CLI tool wrapping fails
 */
export class CliWrapError extends Data.TaggedError("CliWrapError")<{
  cliTool: string;
  message: string;
}> {}
