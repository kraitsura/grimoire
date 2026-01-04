/**
 * grimoire wt kill - Terminate a spawned agent
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
  AgentSessionService,
  AgentSessionServiceLive,
} from "../../services/worktree";

export const worktreeKill = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[3];
    const force = args.flags.force === true;

    if (!name) {
      console.log("Error: Worktree name required");
      console.log("Usage: grim wt kill <name> [--force]");
      process.exit(1);
    }

    const worktreeService = yield* WorktreeService;
    const sessionService = yield* AgentSessionService;
    const cwd = process.cwd();

    // Get all worktrees to find the one by name
    const worktreesResult = yield* Effect.either(worktreeService.list(cwd));
    if (worktreesResult._tag === "Left") {
      const e = worktreesResult.left as { message?: string };
      console.log(`Error: ${e.message || String(worktreesResult.left)}`);
      process.exit(1);
    }

    const worktrees = worktreesResult.right;
    const worktree = worktrees.find((wt) => wt.name === name);

    if (!worktree) {
      console.log(`Error: Worktree "${name}" not found`);
      process.exit(1);
    }

    // Get session info
    const sessionResult = yield* Effect.either(
      sessionService.refreshSessionStatus(worktree.path)
    );

    if (sessionResult._tag === "Left" || !sessionResult.right) {
      console.log(`Error: No session found for worktree "${name}"`);
      process.exit(1);
    }

    const session = sessionResult.right;

    // Check if agent is running
    if (session.status !== "running") {
      console.log(`Error: No running agent in worktree "${name}"`);
      process.exit(1);
    }

    // Check if process is actually alive
    if (!sessionService.isPidAlive(session.pid)) {
      console.log(`Error: No running agent in worktree "${name}"`);
      process.exit(1);
    }

    // Send signal to terminate the process
    const signal = force ? "SIGKILL" : "SIGTERM";
    try {
      process.kill(session.pid, signal);
    } catch (error) {
      console.log(
        `Error: Failed to terminate process ${session.pid}: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }

    // Update session state to stopped
    yield* sessionService.updateSession(worktree.path, {
      status: "stopped",
      endedAt: new Date().toISOString(),
    });

    // If tmux window exists, close it
    if (session.tmuxWindow) {
      yield* Effect.tryPromise({
        try: async () => {
          const tmux = Bun.spawn(["tmux", "kill-window", "-t", session.tmuxWindow!], {
            stdout: "ignore",
            stderr: "ignore",
          });
          await tmux.exited;
        },
        catch: () => {
          // Ignore errors - window might already be closed
          return null;
        },
      });
    }

    console.log(
      `Terminated agent in worktree "${name}" (PID ${session.pid})`
    );
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(AgentSessionServiceLive)
  );
