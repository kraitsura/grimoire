/**
 * Agent Transpiler Types
 *
 * Defines the interface for platform-specific agent transpilers.
 */

import type { AgentDefinition, AgentPlatform } from "../../../models/agent";

/**
 * Result of parsing a platform-specific agent file
 */
export interface ParseResult {
  definition: AgentDefinition;
  /** Platform-specific fields that don't map to unified format */
  extras: Record<string, unknown>;
}

/**
 * Agent transpiler interface
 *
 * Each platform (Claude Code, OpenCode, etc.) has its own transpiler
 * that converts between the unified AgentDefinition format and the
 * platform-specific file format.
 */
export interface AgentTranspiler {
  /** The platform this transpiler handles */
  readonly platform: AgentPlatform;

  /**
   * Convert unified AgentDefinition to platform-specific markdown format
   */
  readonly transpile: (agent: AgentDefinition) => string;

  /**
   * Parse platform-specific markdown format to AgentDefinition
   */
  readonly parse: (content: string, name: string) => ParseResult;

  /**
   * Get the file path for an agent in a project
   */
  readonly getProjectPath: (projectPath: string, name: string) => string;

  /**
   * Get the global (user-level) path for an agent
   */
  readonly getGlobalPath: (name: string) => string;
}
