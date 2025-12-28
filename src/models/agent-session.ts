/**
 * Agent Session Types
 *
 * Defines schemas and types for tracking spawned agent sessions in worktrees.
 * Session state is stored per-worktree in .grimoire-session.json
 */

import { Schema } from "@effect/schema";

/**
 * Agent session mode
 */
export const AgentSessionModeSchema = Schema.Literal(
  "interactive", // Normal terminal session
  "headless",    // Background with --print
  "tmux"         // Tmux window (supervised)
);

/**
 * Agent session status
 */
export const AgentSessionStatusSchema = Schema.Literal(
  "running",  // Process is active
  "stopped",  // Gracefully terminated
  "crashed",  // Unexpectedly terminated
  "unknown"   // PID check failed
);

/**
 * Agent session state stored in .grimoire-session.json
 *
 * Only tracks process-specific info. Worktree metadata (linkedIssue, etc.)
 * is in the main .state.json file.
 */
export const AgentSessionSchema = Schema.Struct({
  /** Unique session identifier */
  sessionId: Schema.String,

  /** Process ID of the Claude process */
  pid: Schema.Number,

  /** How the agent was spawned */
  mode: AgentSessionModeSchema,

  /** When the session started */
  startedAt: Schema.String,

  /** Current session status */
  status: AgentSessionStatusSchema,

  /** Initial prompt given to Claude (for reference) */
  prompt: Schema.optional(Schema.String),

  /** Path to log file (for headless mode) */
  logFile: Schema.optional(Schema.String),

  /** Tmux window name (for tmux mode) */
  tmuxWindow: Schema.optional(Schema.String),

  /** When the session ended (if stopped/crashed) */
  endedAt: Schema.optional(Schema.String),

  /** Exit code (if process exited) */
  exitCode: Schema.optional(Schema.Number),
});

// Type exports

/**
 * Agent session mode
 */
export type AgentSessionMode = Schema.Schema.Type<typeof AgentSessionModeSchema>;

/**
 * Agent session status
 */
export type AgentSessionStatus = Schema.Schema.Type<typeof AgentSessionStatusSchema>;

/**
 * Agent session state
 */
export type AgentSession = Schema.Schema.Type<typeof AgentSessionSchema>;

/**
 * Session file name
 */
export const SESSION_FILE_NAME = ".grimoire-session.json";
