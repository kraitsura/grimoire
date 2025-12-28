/**
 * grimoire wt collect - Merge completed child worktrees back into current branch
 */

import { Effect } from "effect";
import { execSync } from "child_process";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
  WorktreeStateService,
  WorktreeStateServiceLive,
  AgentSessionService,
  AgentSessionServiceLive,
} from "../../services/worktree";
import type { WorktreeListItem, WorktreeEntry } from "../../models/worktree";

type MergeStrategy = "merge" | "rebase" | "squash";

interface CollectResult {
  worktree: string;
  branch: string;
  status: "merged" | "conflict" | "skipped" | "not_ready";
  message?: string;
}

/**
 * Execute git command and return result
 */
function execGit(cmd: string, cwd: string): { success: boolean; output: string } {
  try {
    const output = execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return { success: true, output: output.trim() };
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer | string; stdout?: Buffer | string };
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    return { success: false, output: stderr || stdout };
  }
}

/**
 * Check if a worktree is completed (agent finished)
 */
function isCompleted(entry: WorktreeEntry, sessionService: { isPidAlive: (pid: number) => boolean }, sessionStatus?: { status: string; pid: number }): boolean {
  // Check mergeStatus
  if (entry.mergeStatus === "ready" || entry.mergeStatus === "merged") {
    return true;
  }

  // Check agent session
  if (sessionStatus) {
    if (sessionStatus.status === "stopped") {
      return true;
    }
    if (sessionStatus.status === "running" && !sessionService.isPidAlive(sessionStatus.pid)) {
      return true; // Crashed but done
    }
  }

  // Check completedAt timestamp
  if (entry.completedAt) {
    return true;
  }

  return false;
}

/**
 * Get topological order of worktrees based on beads dependencies
 */
function getTopologicalOrder(entries: WorktreeEntry[]): WorktreeEntry[] {
  // If no beads links, just return as-is
  const withIssues = entries.filter((e) => e.linkedIssue);
  if (withIssues.length === 0) {
    return entries;
  }

  // For now, simple ordering - could integrate with beads dep tree later
  // Sort by spawnedAt timestamp (oldest first)
  return [...entries].sort((a, b) => {
    const aTime = a.spawnedAt ? new Date(a.spawnedAt).getTime() : 0;
    const bTime = b.spawnedAt ? new Date(b.spawnedAt).getTime() : 0;
    return aTime - bTime;
  });
}

export const worktreeCollect = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const dryRun = args.flags["dry-run"] === true;
    const json = args.flags["json"] === true;
    const deleteAfter = args.flags["delete"] === true;
    const strategy = (args.flags["strategy"] as MergeStrategy) || "merge";

    const worktreeService = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const sessionService = yield* AgentSessionService;
    const cwd = process.cwd();

    // Detect current worktree/session
    const currentWorktree = process.env.GRIMOIRE_WORKTREE;
    const currentSession = process.env.GRIMOIRE_SESSION_ID;

    if (!currentWorktree && !currentSession) {
      console.log("Not running in a spawned worktree context.");
      console.log("Usage: grim wt collect [--dry-run] [--strategy merge|rebase|squash]");
      process.exit(1);
    }

    // Get all worktrees
    const worktreesResult = yield* Effect.either(worktreeService.list(cwd));
    if (worktreesResult._tag === "Left") {
      const e = worktreesResult.left as { message?: string };
      console.log(`Error: ${e.message || String(worktreesResult.left)}`);
      process.exit(1);
    }

    const worktrees = worktreesResult.right as WorktreeListItem[];
    const state = yield* stateService.getState(cwd);

    // Find children of current worktree/session
    const childEntries = state.worktrees.filter(
      (w) => w.parentWorktree === currentWorktree || w.parentSession === currentSession
    );

    if (childEntries.length === 0) {
      if (json) {
        console.log(JSON.stringify({ status: "no_children", results: [] }));
      } else {
        console.log("No child worktrees to collect.");
      }
      return;
    }

    // Get session status for each child
    const childrenWithStatus: Array<{
      entry: WorktreeEntry;
      worktree: WorktreeListItem | undefined;
      sessionStatus: { status: string; pid: number } | null;
    }> = [];

    for (const entry of childEntries) {
      const wt = worktrees.find((w) => w.name === entry.name);
      let sessionStatus = null;

      if (wt) {
        const session = yield* Effect.either(
          sessionService.refreshSessionStatus(wt.path)
        );
        if (session._tag === "Right" && session.right) {
          sessionStatus = { status: session.right.status, pid: session.right.pid };
        }
      }

      childrenWithStatus.push({ entry, worktree: wt, sessionStatus });
    }

    // Filter to completed children
    const completed = childrenWithStatus.filter((c) =>
      isCompleted(c.entry, sessionService, c.sessionStatus || undefined)
    );

    // Get topological order
    const orderedEntries = getTopologicalOrder(completed.map((c) => c.entry));

    if (!json && !dryRun) {
      console.log(`Collecting ${orderedEntries.length} completed child worktrees (strategy: ${strategy})...`);
    }

    const results: CollectResult[] = [];
    let hadConflict = false;

    for (const entry of orderedEntries) {
      const child = completed.find((c) => c.entry.name === entry.name);
      if (!child?.worktree) {
        results.push({
          worktree: entry.name,
          branch: entry.branch,
          status: "skipped",
          message: "Worktree not found",
        });
        continue;
      }

      // Skip if already merged
      if (entry.mergeStatus === "merged") {
        results.push({
          worktree: entry.name,
          branch: entry.branch,
          status: "skipped",
          message: "Already merged",
        });
        continue;
      }

      // Check if child is actually completed
      if (!isCompleted(entry, sessionService, child.sessionStatus || undefined)) {
        results.push({
          worktree: entry.name,
          branch: entry.branch,
          status: "not_ready",
          message: "Work not yet completed",
        });
        continue;
      }

      if (dryRun) {
        results.push({
          worktree: entry.name,
          branch: entry.branch,
          status: "merged",
          message: "Would merge",
        });
        if (!json) {
          console.log(`  [dry-run] Would merge ${entry.branch}`);
        }
        continue;
      }

      // Perform the merge
      let mergeCmd: string;
      switch (strategy) {
        case "squash":
          mergeCmd = `git merge --squash ${entry.branch}`;
          break;
        case "rebase":
          mergeCmd = `git rebase ${entry.branch}`;
          break;
        default:
          mergeCmd = `git merge ${entry.branch} --no-edit`;
      }

      const result = execGit(mergeCmd, cwd);

      if (result.success || (strategy === "squash" && result.output.includes("Squash commit"))) {
        // For squash, we need to commit
        if (strategy === "squash") {
          const commitResult = execGit(`git commit -m "Merge ${entry.branch} (squash)"`, cwd);
          if (!commitResult.success && !commitResult.output.includes("nothing to commit")) {
            results.push({
              worktree: entry.name,
              branch: entry.branch,
              status: "conflict",
              message: commitResult.output,
            });
            hadConflict = true;
            break;
          }
        }

        // Update merge status
        yield* stateService.updateWorktree(cwd, entry.name, {
          mergeStatus: "merged",
        });

        results.push({
          worktree: entry.name,
          branch: entry.branch,
          status: "merged",
        });

        if (!json) {
          console.log(`  [merged] ${entry.branch}`);
        }

        // Delete worktree if requested
        if (deleteAfter) {
          yield* Effect.either(worktreeService.remove(cwd, entry.name, { deleteBranch: false }));
          if (!json) {
            console.log(`    └─ deleted worktree`);
          }
        }
      } else {
        // Check for conflict
        const isConflict = result.output.includes("CONFLICT") ||
          result.output.includes("Merge conflict") ||
          result.output.includes("could not apply");

        if (isConflict) {
          // Abort the merge to restore clean state
          execGit("git merge --abort", cwd);
          execGit("git rebase --abort", cwd);

          yield* stateService.updateWorktree(cwd, entry.name, {
            mergeStatus: "conflict",
          });

          results.push({
            worktree: entry.name,
            branch: entry.branch,
            status: "conflict",
            message: result.output.split("\n")[0],
          });

          if (!json) {
            console.log(`  [conflict] ${entry.branch}`);
            console.log(`    └─ ${result.output.split("\n")[0]}`);
          }

          hadConflict = true;
          break; // Stop on first conflict
        } else {
          results.push({
            worktree: entry.name,
            branch: entry.branch,
            status: "skipped",
            message: result.output,
          });
        }
      }
    }

    // Add remaining unprocessed as skipped (if we stopped early due to conflict)
    const processedNames = new Set(results.map((r) => r.worktree));
    for (const entry of orderedEntries) {
      if (!processedNames.has(entry.name)) {
        results.push({
          worktree: entry.name,
          branch: entry.branch,
          status: "skipped",
          message: "Skipped due to earlier conflict",
        });
      }
    }

    // Output
    if (json) {
      const merged = results.filter((r) => r.status === "merged").length;
      const conflicts = results.filter((r) => r.status === "conflict").length;
      console.log(JSON.stringify({
        status: conflicts > 0 ? "conflict" : (merged > 0 ? "success" : "no_action"),
        results,
      }, null, 2));
    } else if (!dryRun) {
      const merged = results.filter((r) => r.status === "merged").length;
      const conflicts = results.filter((r) => r.status === "conflict").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      const notReady = results.filter((r) => r.status === "not_ready").length;

      console.log();
      console.log(`Done: ${merged} merged, ${conflicts} conflicts, ${skipped} skipped, ${notReady} not ready`);

      if (hadConflict) {
        console.log();
        console.log("Resolve conflicts manually, then run 'grim wt collect' again.");
        console.log("Use 'grim wt resolve <name>' for guided resolution.");
      }
    }

    if (hadConflict) {
      process.exitCode = 1;
    }
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive),
    Effect.provide(AgentSessionServiceLive)
  );
