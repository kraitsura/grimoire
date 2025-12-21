/**
 * Plugin Domain Error Types
 */

import { Data } from "effect";

/**
 * Error when Claude CLI command fails
 */
export class ClaudeCliError extends Data.TaggedError("ClaudeCliError")<{
  command: string;
  message: string;
  exitCode?: number;
  stderr?: string;
}> {}

/**
 * Error when a plugin is not found
 */
export class PluginNotFoundError extends Data.TaggedError("PluginNotFoundError")<{
  name: string;
  marketplace?: string;
}> {}

/**
 * Error when a marketplace is not found
 */
export class MarketplaceNotFoundError extends Data.TaggedError("MarketplaceNotFoundError")<{
  name: string;
}> {}

/**
 * Error when marketplace state file operations fail
 */
export class MarketplaceStateError extends Data.TaggedError("MarketplaceStateError")<{
  operation: "read" | "write";
  message: string;
  cause?: unknown;
}> {}

/**
 * Error when marketplace already exists
 */
export class MarketplaceAlreadyExistsError extends Data.TaggedError("MarketplaceAlreadyExistsError")<{
  name: string;
  source: string;
}> {}

/**
 * Error when plugin is already installed
 */
export class PluginAlreadyInstalledError extends Data.TaggedError("PluginAlreadyInstalledError")<{
  name: string;
}> {}

/**
 * Error when plugin is not installed
 */
export class PluginNotInstalledError extends Data.TaggedError("PluginNotInstalledError")<{
  name: string;
}> {}

/**
 * Error when detection fails
 */
export class DetectionError extends Data.TaggedError("DetectionError")<{
  source: string;
  message: string;
  cause?: unknown;
}> {}
