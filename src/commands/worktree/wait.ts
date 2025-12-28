/**
 * grimoire wt wait - Block until child worktrees complete
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
  WorktreeStateService,
  WorktreeStateServiceLive,
  AgentSessionService,
  AgentSessionServiceLive,
} from "../../services/worktree";
import type { WorktreeListItem } from "../../models/worktree";

interface WaitResult {
  worktree: string;
  status: "completed" | "crashed" | "timeout" | "running";
  exitCode: number | null;
}

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms: number) => Effect.promise(() => new Promise((resolve) => setTimeout(resolve, ms)));

/**
 * Check if a worktree's agent has completed
 */
function isCompleted(status: string): boolean {
  return status === "stopped" || status === "crashed";
}

export const worktreeWait = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const waitAny = args.flags["any"] === true;
    const json = args.flags["json"] === true;
    const timeoutSecs = args.flags["timeout"] as number | undefined;
    const specifiedWorktrees = args.positional.slice(1); // Skip "wait" subcommand

    const worktreeService = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const sessionService = yield* AgentSessionService;
    const cwd = process.cwd();

    // Detect current worktree/session from environment
    const currentWorktree = process.env.GRIMOIRE_WORKTREE;
    const currentSession = process.env.GRIMOIRE_SESSION_ID;

    // Get all worktrees
    const worktreesResult = yield* Effect.either(worktreeService.list(cwd));
    if (worktreesResult._tag === "Left") {
      const e = worktreesResult.left as { message?: string };
      console.log(`Error: ${e.message || String(worktreesResult.left)}`);
      process.exit(1);
    }

    const worktrees = worktreesResult.right as WorktreeListItem[];
    const state = yield* stateService.getState(cwd);

    // Determine which worktrees to wait for
    let targetNames: string[];

    if (specifiedWorktrees.length > 0) {
      // Wait for specific worktrees
      targetNames = specifiedWorktrees;
    } else if (currentWorktree || currentSession) {
      // Wait for children of current session/worktree
      targetNames = state.worktrees
        .filter((w) => w.parentWorktree === currentWorktree || w.parentSession === currentSession)
        .map((w) => w.name);
    } else {
      console.log("No worktrees specified and not running in a spawned context.");
      console.log("Usage: grim wt wait [worktrees...] [--any] [--timeout <secs>]");
      process.exit(1);
    }

    if (targetNames.length === 0) {
      if (json) {
        console.log(JSON.stringify({ status: "no_children", results: [] }));
      } else {
        console.log("No child worktrees to wait for.");
      }
      return;
    }

    // Filter to valid worktrees
    const targets = worktrees.filter((wt) => targetNames.includes(wt.name));
    if (targets.length === 0) {
      console.log(`No matching worktrees found for: ${targetNames.join(", ")}`);
      process.exit(1);
    }

    if (!json) {
      const mode = waitAny ? "any" : "all";
      console.log(`Waiting for ${targets.length} worktree(s) to complete (mode: ${mode})...`);
      if (timeoutSecs) {
        console.log(`Timeout: ${timeoutSecs}s`);
      }
    }

    const startTime = Date.now();
    const timeoutMs = timeoutSecs ? timeoutSecs * 1000 : Infinity;
    const pollIntervalMs = 2000; // Poll every 2 seconds

    const results: Map<string, WaitResult> = new Map();

    // Initialize all as running
    for (const wt of targets) {
      results.set(wt.name, {
        worktree: wt.name,
        status: "running",
        exitCode: null,
      });
    }

    // Poll loop
    while (true) {
      const elapsed = Date.now() - startTime;

      // Check timeout
      if (elapsed > timeoutMs) {
        for (const [name, result] of results) {
          if (result.status === "running") {
            result.status = "timeout";
          }
        }
        break;
      }

      // Check each target
      let completedCount = 0;
      let anyCompleted = false;

      for (const wt of targets) {
        const current = results.get(wt.name)!;
        if (current.status !== "running") {
          completedCount++;
          continue;
        }

        // Check session status
        const sessionResult = yield* Effect.either(
          sessionService.refreshSessionStatus(wt.path)
        );

        if (sessionResult._tag === "Right" && sessionResult.right) {
          const session = sessionResult.right;
          const alive = sessionService.isPidAlive(session.pid);

          if (isCompleted(session.status) || !alive) {
            if (session.status === "crashed" || (session.status === "running" && !alive)) {
              current.status = "crashed";
            } else {
              current.status = "completed";
            }
            current.exitCode = session.exitCode ?? null;
            anyCompleted = true;
            completedCount++;

            if (!json) {
              console.log(`  [${current.status}] ${wt.name}${current.exitCode !== null ? ` (exit ${current.exitCode})` : ""}`);
            }
          }
        } else {
          // No session info - check if mergeStatus indicates completion
          const entry = state.worktrees.find((w) => w.name === wt.name);
          if (entry?.mergeStatus && entry.mergeStatus !== "pending") {
            current.status = "completed";
            completedCount++;
            anyCompleted = true;

            if (!json) {
              console.log(`  [completed] ${wt.name} (${entry.mergeStatus})`);
            }
          }
        }
      }

      // Check exit conditions
      if (waitAny && anyCompleted) {
        break;
      }
      if (completedCount === targets.length) {
        break;
      }

      // Sleep before next poll
      yield* sleep(pollIntervalMs);
    }

    // Output results
    const resultArray = Array.from(results.values());

    if (json) {
      const allCompleted = resultArray.every((r) => r.status === "completed");
      const anyTimeout = resultArray.some((r) => r.status === "timeout");
      const anyCrashed = resultArray.some((r) => r.status === "crashed");

      console.log(JSON.stringify({
        status: anyTimeout ? "timeout" : (anyCrashed ? "partial" : (allCompleted ? "success" : "partial")),
        results: resultArray,
      }, null, 2));
    } else {
      const completed = resultArray.filter((r) => r.status === "completed").length;
      const crashed = resultArray.filter((r) => r.status === "crashed").length;
      const timedOut = resultArray.filter((r) => r.status === "timeout").length;
      const running = resultArray.filter((r) => r.status === "running").length;

      console.log();
      console.log(`Done: ${completed} completed, ${crashed} crashed, ${timedOut} timeout, ${running} still running`);
    }

    // Exit with error if any failed
    const anyFailed = resultArray.some((r) => r.status === "crashed" || r.status === "timeout");
    if (anyFailed) {
      process.exitCode = 1;
    }
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive),
    Effect.provide(AgentSessionServiceLive)
  );
