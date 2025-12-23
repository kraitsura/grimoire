/**
 * Agent Transpilers
 *
 * Factory for getting platform-specific agent transpilers.
 */

import type { AgentPlatform } from "../../../models/agent";
import type { AgentTranspiler, ParseResult } from "./types";
import { claudeCodeTranspiler } from "./claude-code";
import { openCodeTranspiler } from "./opencode";

// Re-export types
export type { AgentTranspiler, ParseResult } from "./types";

/**
 * Registry of available transpilers
 */
const transpilers: Record<string, AgentTranspiler> = {
  claude_code: claudeCodeTranspiler,
  opencode: openCodeTranspiler,
};

/**
 * Get a transpiler for the specified platform
 *
 * @throws Error if platform is not supported
 */
export const getTranspiler = (platform: AgentPlatform): AgentTranspiler => {
  const transpiler = transpilers[platform];
  if (!transpiler) {
    throw new Error(`No transpiler available for platform: ${platform}`);
  }
  return transpiler;
};

/**
 * Check if a platform has transpiler support
 */
export const hasTranspiler = (platform: AgentPlatform): boolean => {
  return platform in transpilers;
};

/**
 * Get all supported platforms with transpilers
 */
export const getSupportedPlatforms = (): AgentPlatform[] => {
  return Object.keys(transpilers) as AgentPlatform[];
};

// Export individual transpilers for direct use
export { claudeCodeTranspiler } from "./claude-code";
export { openCodeTranspiler } from "./opencode";
