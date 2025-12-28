/**
 * Agent Session Service
 *
 * Manages agent session state for spawned Claude processes in worktrees.
 * Session state is stored in .grimoire-session.json within each worktree.
 */

import { Context, Effect, Layer } from "effect";
import { join } from "path";
import type { AgentSession, AgentSessionMode, AgentSessionStatus, MutableAgentSession } from "../../models/agent-session";
import { SESSION_FILE_NAME } from "../../models/agent-session";

/**
 * Check if a process is still running
 */
const isProcessAlive = (pid: number): boolean => {
  try {
    // kill with signal 0 checks if process exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Get session file path for a worktree
 */
const getSessionFilePath = (worktreePath: string): string => {
  return join(worktreePath, SESSION_FILE_NAME);
};

/**
 * Create session options
 *
 * Only process-specific info. Worktree metadata (linkedIssue, etc.)
 * is tracked separately in .state.json
 */
export interface CreateSessionOptions {
  sessionId: string;
  pid: number;
  mode: AgentSessionMode;
  prompt?: string;
  logFile?: string;
  tmuxWindow?: string;
}

/**
 * Session update options
 */
export interface UpdateSessionOptions {
  status?: AgentSessionStatus;
  endedAt?: string;
  exitCode?: number;
}

// Service interface
interface AgentSessionServiceImpl {
  /**
   * Create a new session state file
   */
  readonly createSession: (
    worktreePath: string,
    options: CreateSessionOptions
  ) => Effect.Effect<AgentSession, Error>;

  /**
   * Read session state from a worktree
   */
  readonly getSession: (
    worktreePath: string
  ) => Effect.Effect<AgentSession | null, Error>;

  /**
   * Update session state
   */
  readonly updateSession: (
    worktreePath: string,
    updates: UpdateSessionOptions
  ) => Effect.Effect<AgentSession | null, Error>;

  /**
   * Remove session state file
   */
  readonly removeSession: (
    worktreePath: string
  ) => Effect.Effect<void, Error>;

  /**
   * Check if session has an active process
   */
  readonly isSessionAlive: (
    worktreePath: string
  ) => Effect.Effect<boolean, Error>;

  /**
   * Refresh session status based on PID
   * Returns updated session or null if no session
   */
  readonly refreshSessionStatus: (
    worktreePath: string
  ) => Effect.Effect<AgentSession | null, Error>;

  /**
   * Check if a PID is still running
   */
  readonly isPidAlive: (pid: number) => boolean;
}

// Service tag
export class AgentSessionService extends Context.Tag("AgentSessionService")<
  AgentSessionService,
  AgentSessionServiceImpl
>() {}

// Service implementation
const makeAgentSessionService = (): AgentSessionServiceImpl => ({
  createSession: (worktreePath: string, options: CreateSessionOptions) =>
    Effect.gen(function* () {
      const sessionPath = getSessionFilePath(worktreePath);

      const session: AgentSession = {
        sessionId: options.sessionId,
        pid: options.pid,
        mode: options.mode,
        startedAt: new Date().toISOString(),
        status: "running",
        prompt: options.prompt,
        logFile: options.logFile,
        tmuxWindow: options.tmuxWindow,
      };

      yield* Effect.tryPromise({
        try: () => Bun.write(sessionPath, JSON.stringify(session, null, 2)),
        catch: (error) =>
          new Error(`Failed to write session file: ${error instanceof Error ? error.message : String(error)}`),
      });

      return session;
    }),

  getSession: (worktreePath: string) =>
    Effect.gen(function* () {
      const sessionPath = getSessionFilePath(worktreePath);
      const file = Bun.file(sessionPath);

      const exists = yield* Effect.promise(() => file.exists());
      if (!exists) {
        return null;
      }

      const content = yield* Effect.tryPromise({
        try: () => file.text(),
        catch: (error) =>
          new Error(`Failed to read session file: ${error instanceof Error ? error.message : String(error)}`),
      });

      try {
        return JSON.parse(content) as AgentSession;
      } catch (error) {
        return null;
      }
    }),

  updateSession: (worktreePath: string, updates: UpdateSessionOptions) =>
    Effect.gen(function* () {
      const sessionPath = getSessionFilePath(worktreePath);
      const file = Bun.file(sessionPath);

      const exists = yield* Effect.promise(() => file.exists());
      if (!exists) {
        return null;
      }

      const content = yield* Effect.tryPromise({
        try: () => file.text(),
        catch: (error) =>
          new Error(`Failed to read session file: ${error instanceof Error ? error.message : String(error)}`),
      });

      let parsed: AgentSession;
      try {
        parsed = JSON.parse(content) as AgentSession;
      } catch {
        return null;
      }

      // Create mutable copy with updates
      const session: MutableAgentSession = {
        sessionId: parsed.sessionId,
        pid: parsed.pid,
        mode: parsed.mode,
        startedAt: parsed.startedAt,
        status: updates.status ?? parsed.status,
        prompt: parsed.prompt,
        logFile: parsed.logFile,
        tmuxWindow: parsed.tmuxWindow,
        endedAt: updates.endedAt ?? parsed.endedAt,
        exitCode: updates.exitCode ?? parsed.exitCode,
      };

      yield* Effect.tryPromise({
        try: () => Bun.write(sessionPath, JSON.stringify(session, null, 2)),
        catch: (error) =>
          new Error(`Failed to write session file: ${error instanceof Error ? error.message : String(error)}`),
      });

      return session;
    }),

  removeSession: (worktreePath: string) =>
    Effect.gen(function* () {
      const sessionPath = getSessionFilePath(worktreePath);

      yield* Effect.tryPromise({
        try: async () => {
          const fs = await import("fs/promises");
          try {
            await fs.unlink(sessionPath);
          } catch (error: unknown) {
            // Ignore if file doesn't exist
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
              throw error;
            }
          }
        },
        catch: (error) =>
          new Error(`Failed to remove session file: ${error instanceof Error ? error.message : String(error)}`),
      });
    }),

  isSessionAlive: (worktreePath: string) =>
    Effect.gen(function* () {
      const sessionPath = getSessionFilePath(worktreePath);
      const file = Bun.file(sessionPath);

      const exists = yield* Effect.promise(() => file.exists());
      if (!exists) {
        return false;
      }

      const content = yield* Effect.tryPromise({
        try: () => file.text(),
        catch: () => new Error("Failed to read session file"),
      });

      try {
        const session = JSON.parse(content) as AgentSession;
        return isProcessAlive(session.pid);
      } catch {
        return false;
      }
    }),

  refreshSessionStatus: (worktreePath: string) =>
    Effect.gen(function* () {
      const sessionPath = getSessionFilePath(worktreePath);
      const file = Bun.file(sessionPath);

      const exists = yield* Effect.promise(() => file.exists());
      if (!exists) {
        return null;
      }

      const content = yield* Effect.tryPromise({
        try: () => file.text(),
        catch: (error) =>
          new Error(`Failed to read session file: ${error instanceof Error ? error.message : String(error)}`),
      });

      let parsed: AgentSession;
      try {
        parsed = JSON.parse(content) as AgentSession;
      } catch {
        return null;
      }

      // If already terminal status, no need to check
      if (parsed.status === "stopped" || parsed.status === "crashed") {
        return parsed;
      }

      // Check if process is still alive
      const alive = isProcessAlive(parsed.pid);
      if (!alive && parsed.status === "running") {
        // Process died - mark as crashed (we don't know the exit code)
        const updated: MutableAgentSession = {
          sessionId: parsed.sessionId,
          pid: parsed.pid,
          mode: parsed.mode,
          startedAt: parsed.startedAt,
          status: "crashed",
          prompt: parsed.prompt,
          logFile: parsed.logFile,
          tmuxWindow: parsed.tmuxWindow,
          endedAt: new Date().toISOString(),
          exitCode: parsed.exitCode,
        };

        yield* Effect.tryPromise({
          try: () => Bun.write(sessionPath, JSON.stringify(updated, null, 2)),
          catch: (error) =>
            new Error(`Failed to write session file: ${error instanceof Error ? error.message : String(error)}`),
        });

        return updated;
      }

      return parsed;
    }),

  isPidAlive: isProcessAlive,
});

// Live layer
export const AgentSessionServiceLive = Layer.succeed(
  AgentSessionService,
  makeAgentSessionService()
);
