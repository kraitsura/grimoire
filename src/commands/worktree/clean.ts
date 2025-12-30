/**
 * grimoire wt clean - Clean up stale worktrees with ownership model
 *
 * Only cleans managed worktrees (those in state file).
 * Shows unmanaged worktrees but never touches them.
 *
 * Categories:
 * - stale: branch merged to main, agent exited
 * - orphaned: in state file but worktree doesn't exist
 * - collected: mergeStatus === "merged" in state
 *
 * Completion signals required:
 * - Agent session exited (not running)
 * - Branch merged OR mergeStatus === "merged"
 */

import { Effect, Layer } from "effect";
import * as readline from "readline";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
  WorktreeStateService,
  WorktreeStateServiceLive,
  AgentSessionService,
  AgentSessionServiceLive,
} from "../../services/worktree";
import type { WorktreeListItem, WorktreeState } from "../../models/worktree";

type CleanReason = "merged" | "collected" | "orphaned";

interface CleanableWorktree {
  name: string;
  branch: string;
  reason: CleanReason;
  uncommitted?: number;
  path?: string;
}

interface UnmanagedWorktree {
  name: string;
  branch: string;
  path: string;
}

const prompt = (question: string): Effect.Effect<string, never> =>
  Effect.promise(() => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise<string>((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
    });
  });

const reasonLabel = (reason: CleanReason): string => {
  switch (reason) {
    case "merged":
      return "branch merged";
    case "collected":
      return "already collected";
    case "orphaned":
      return "orphaned entry";
  }
};

export const worktreeClean = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const execute = args.flags.execute === true || args.flags.x === true;
    const skipConfirm = args.flags.y === true;
    const includeBranch = args.flags.branches === true || args.flags.b === true;
    const force = args.flags.force === true;

    const worktreeService = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const sessionService = yield* AgentSessionService;
    const cwd = process.cwd();

    // Get git worktrees
    const listResult = yield* Effect.either(worktreeService.list(cwd));
    if (listResult._tag === "Left") {
      const e = listResult.left as { _tag?: string; message?: string };
      console.error(`Error: ${e.message || String(listResult.left)}`);
      process.exit(1);
    }
    const gitWorktrees = listResult.right;

    // Get state file entries
    const stateResult = yield* Effect.either(stateService.getState(cwd));
    const state: WorktreeState = stateResult._tag === "Right"
      ? stateResult.right
      : { version: 2, worktrees: [] };

    // Build maps for quick lookup
    const gitWorktreeMap = new Map<string, WorktreeListItem>();
    for (const wt of gitWorktrees) {
      gitWorktreeMap.set(wt.name, wt);
    }

    const stateEntryMap = new Map<string, (typeof state.worktrees)[number]>();
    for (const entry of state.worktrees) {
      stateEntryMap.set(entry.name, entry);
    }

    // Identify cleanable worktrees and unmanaged ones
    const cleanable: CleanableWorktree[] = [];
    const unmanaged: UnmanagedWorktree[] = [];

    // Check each git worktree
    for (const wt of gitWorktrees) {
      const stateEntry = stateEntryMap.get(wt.name);

      if (!stateEntry) {
        // Unmanaged - exists in git but not in state
        unmanaged.push({
          name: wt.name,
          branch: wt.branch,
          path: wt.path,
        });
        continue;
      }

      // Check if agent is still running
      const session = yield* Effect.either(sessionService.refreshSessionStatus(wt.path));
      const isRunning = session._tag === "Right" && session.right?.status === "running";

      if (isRunning) {
        // Agent still running - skip
        continue;
      }

      // Check completion signals
      if (stateEntry.mergeStatus === "merged") {
        cleanable.push({
          name: wt.name,
          branch: wt.branch,
          reason: "collected",
          uncommitted: wt.uncommittedChanges,
          path: wt.path,
        });
      } else if (wt.status === "stale") {
        cleanable.push({
          name: wt.name,
          branch: wt.branch,
          reason: "merged",
          uncommitted: wt.uncommittedChanges,
          path: wt.path,
        });
      }
    }

    // Check for orphaned state entries (in state but not in git)
    for (const entry of state.worktrees) {
      if (!gitWorktreeMap.has(entry.name)) {
        cleanable.push({
          name: entry.name,
          branch: entry.branch,
          reason: "orphaned",
        });
      }
    }

    // Display results
    if (cleanable.length === 0 && unmanaged.length === 0) {
      console.log("No worktrees to clean.");
      const activeCount = gitWorktrees.filter((wt) => stateEntryMap.has(wt.name)).length;
      if (activeCount > 0) {
        console.log(`${activeCount} managed worktree(s) are active.`);
      }
      return;
    }

    // Show unmanaged worktrees (informational only)
    if (unmanaged.length > 0) {
      console.log(`Unmanaged worktrees (will not be touched):`);
      for (const wt of unmanaged) {
        console.log(`  ${wt.name.padEnd(24)} ${wt.branch}`);
      }
      console.log();
    }

    if (cleanable.length === 0) {
      console.log("No managed worktrees to clean.");
      return;
    }

    // Show cleanable worktrees
    const actionWord = execute ? "Removing" : "Would remove";
    console.log(`${actionWord} ${cleanable.length} worktree(s):`);
    console.log();

    for (const wt of cleanable) {
      const uncommittedTag = wt.uncommitted ? ` [${wt.uncommitted} uncommitted]` : "";
      console.log(`  ${wt.name.padEnd(24)} (${reasonLabel(wt.reason)})${uncommittedTag}`);
    }
    console.log();

    if (!execute) {
      console.log("Run with --execute to remove.");
      return;
    }

    // Check for uncommitted changes
    const withChanges = cleanable.filter((wt) => wt.uncommitted && wt.uncommitted > 0);
    if (withChanges.length > 0 && !force) {
      console.log(`Warning: ${withChanges.length} worktree(s) have uncommitted changes.`);
      console.log("These will be skipped unless you use --force.");
      console.log();
    }

    // Confirm removal
    if (!skipConfirm) {
      const answer = yield* prompt("Remove these worktrees? [y/N] ");
      if (answer !== "y" && answer !== "yes") {
        console.log("Cancelled.");
        return;
      }
    }

    // Remove worktrees
    let removed = 0;
    let skipped = 0;
    let orphansCleaned = 0;

    for (const wt of cleanable) {
      // Handle orphaned entries (just remove from state)
      if (wt.reason === "orphaned") {
        yield* Effect.either(stateService.removeWorktree(cwd, wt.name));
        console.log(`  Removed orphaned entry: ${wt.name}`);
        orphansCleaned++;
        continue;
      }

      // Skip if has uncommitted changes and not forcing
      if (wt.uncommitted && wt.uncommitted > 0 && !force) {
        console.log(`  Skipped ${wt.name} (uncommitted changes)`);
        skipped++;
        continue;
      }

      // Remove the actual worktree
      const removeResult = yield* Effect.either(
        worktreeService.remove(cwd, wt.name, {
          deleteBranch: includeBranch,
          force: force,
        })
      );

      if (removeResult._tag === "Left") {
        const e = removeResult.left as { _tag?: string; message?: string };
        console.log(`  Failed to remove ${wt.name}: ${e.message || String(removeResult.left)}`);
        skipped++;
      } else {
        const branchMsg = includeBranch ? ` (branch deleted)` : "";
        console.log(`  Removed ${wt.name}${branchMsg}`);
        removed++;
      }
    }

    console.log();
    const parts: string[] = [];
    if (removed > 0) parts.push(`${removed} worktree(s) cleaned`);
    if (orphansCleaned > 0) parts.push(`${orphansCleaned} orphaned entries removed`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    console.log(parts.join(", ") + ".");
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        WorktreeServiceLive,
        WorktreeStateServiceLive,
        AgentSessionServiceLive
      )
    )
  );
