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
  getMainRepoRoot,
} from "../../services/worktree";
import type { WorktreeListItem, WorktreeEntry } from "../../models/worktree";

type MergeStrategy = "merge" | "rebase" | "squash";

interface CollectResult {
  worktree: string;
  branch: string;
  status: "merged" | "conflict" | "skipped" | "not_ready";
  message?: string;
}

enum SkipReason {
  WORKTREE_NOT_FOUND = "Worktree not found in git",
  ALREADY_MERGED = "Already merged",
  NOT_COMPLETED = "Work not yet completed",
  CHECKOUT_FAILED = "Could not checkout branch",
  REBASE_CONFLICT = "Rebase conflict",
  REBASE_ERROR = "Rebase failed (non-conflict)",
  MERGE_CONFLICT = "Merge conflict",
  MERGE_ERROR = "Merge failed (non-conflict)",
  EARLIER_CONFLICT = "Skipped due to earlier conflict in batch",
}

/**
 * Log a skip event with details
 */
function logSkip(
  json: boolean,
  worktree: string,
  branch: string,
  reason: SkipReason,
  details?: string
): void {
  if (!json) {
    console.log(`  [skipped] ${branch}`);
    console.log(`    └─ ${reason}`);
    if (details) {
      console.log(`       ${details}`);
    }
  }
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
 * Check if branch is a descendant of base branch using git merge-base
 */
function isBranchDescendant(
  repoRoot: string,
  baseBranch: string,
  testBranch: string
): { isDescendant: boolean; hasCommits: boolean } {
  // Check if testBranch is descended from baseBranch
  const ancestorCheck = execGit(
    `git merge-base --is-ancestor ${baseBranch} ${testBranch}`,
    repoRoot
  );

  if (!ancestorCheck.success) {
    return { isDescendant: false, hasCommits: false };
  }

  // Check if there are new commits beyond the base
  const commitCheck = execGit(
    `git log ${baseBranch}..${testBranch} --oneline`,
    repoRoot
  );

  const hasCommits = commitCheck.success && commitCheck.output.trim().length > 0;
  return { isDescendant: true, hasCommits };
}

/**
 * Get current branch name, handling detached HEAD
 */
function getCurrentBranch(cwd: string): string | null {
  const result = execGit("git rev-parse --abbrev-ref HEAD", cwd);
  if (!result.success || result.output === "HEAD") {
    return null; // Detached HEAD
  }
  return result.output.trim();
}

/**
 * Check if a worktree is completed (agent finished or no agent)
 *
 * A worktree is considered completed if:
 * - mergeStatus is "ready" or "merged"
 * - Agent session is stopped or crashed
 * - completedAt timestamp is set
 * - No session exists (worktree created with `wt new`, work done manually)
 * - Explicitly specified in args (user knows it's ready)
 */
function isCompleted(
  entry: WorktreeEntry,
  sessionService: { isPidAlive: (pid: number) => boolean },
  sessionStatus?: { status: string; pid: number } | null,
  isExplicitlySpecified?: boolean
): boolean {
  // Check mergeStatus
  if (entry.mergeStatus === "ready" || entry.mergeStatus === "merged") {
    return true;
  }

  // Check agent session - stopped or crashed means work is done
  if (sessionStatus) {
    if (sessionStatus.status === "stopped" || sessionStatus.status === "crashed") {
      return true;
    }
    if (sessionStatus.status === "running" && !sessionService.isPidAlive(sessionStatus.pid)) {
      return true; // Process died but status not updated
    }
    // If session exists and is running, not completed
    return false;
  }

  // Check completedAt timestamp
  if (entry.completedAt) {
    return true;
  }

  // No session exists - if explicitly specified, treat as ready to collect
  // This handles worktrees created with `wt new` where work is done manually
  if (isExplicitlySpecified) {
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
    const json = args.flags.json === true;
    const deleteAfter = args.flags.delete === true;
    const verbose = args.flags.verbose === true || args.flags.v === true;
    const strategy = (args.flags.strategy as MergeStrategy) || "merge";
    // Auto-rebase is ON by default - rebase each branch onto current HEAD before merging
    // This prevents conflicts when multiple branches modify the same files in non-overlapping ways
    const autoRebase = args.flags["no-rebase"] !== true;

    const worktreeService = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const sessionService = yield* AgentSessionService;
    const cwd = process.cwd();

    // Get main repo root (works from both main repo and worktrees)
    const repoRoot = yield* getMainRepoRoot(cwd);

    // Detect current worktree/session or use explicit args
    const currentWorktree = process.env.GRIMOIRE_WORKTREE;
    const currentSession = process.env.GRIMOIRE_SESSION_ID;
    const explicitWorktrees = args.positional.slice(1); // Skip "collect" subcommand

    // Get all worktrees
    const worktreesResult = yield* Effect.either(worktreeService.list(cwd));
    if (worktreesResult._tag === "Left") {
      const e = worktreesResult.left as { message?: string };
      console.log(`Error: ${e.message || String(worktreesResult.left)}`);
      process.exit(1);
    }

    const worktrees = worktreesResult.right;
    const state = yield* stateService.getState(repoRoot);

    // Find worktrees to collect - either explicit args, or children of current session
    let childEntries: WorktreeEntry[];
    const isExplicitlySpecified = explicitWorktrees.length > 0;
    const explicitSet = new Set(explicitWorktrees);

    if (explicitWorktrees.length > 0) {
      // Explicit worktrees specified - look in both state and git worktrees
      childEntries = [...state.worktrees.filter((w) => explicitWorktrees.includes(w.name))];

      // Also check for worktrees that exist in git but not in state
      // (created with `wt new`, not tracked in state yet)
      for (const wtName of explicitWorktrees) {
        const existsInState = state.worktrees.some((w) => w.name === wtName);
        if (!existsInState) {
          const wt = worktrees.find((w) => w.name === wtName);
          if (wt) {
            // Create a minimal entry for the worktree
            childEntries.push({
              name: wt.name,
              branch: wt.branch,
              createdAt: new Date().toISOString(),
            } as WorktreeEntry);
          }
        }
      }
    } else if (currentWorktree || currentSession) {
      // Auto-detect children of current worktree/session
      childEntries = [...state.worktrees.filter(
        (w) => w.parentWorktree === currentWorktree || w.parentSession === currentSession
      )];
    } else {
      // NEW: Git ancestry detection - find all worktrees created from current branch
      const currentBranch = getCurrentBranch(cwd);

      if (!currentBranch) {
        console.log("Error: Cannot determine current branch (detached HEAD?)");
        console.log("Usage: grim wt collect <worktree1> <worktree2> ...");
        console.log("       grim wt collect  (auto-detect from spawned context)");
        process.exit(1);
      }

      if (!json) {
        console.log(`Detecting worktrees created from branch: ${currentBranch}`);
      }

      // Find all worktrees whose branches are descendants of current branch
      childEntries = [];
      for (const entry of state.worktrees) {
        const ancestry = isBranchDescendant(repoRoot, currentBranch, entry.branch);

        if (verbose && !json) {
          console.log(`  Checking ${entry.name} (${entry.branch}):`);
          console.log(`    Is descendant: ${ancestry.isDescendant}, Has commits: ${ancestry.hasCommits}`);
        }

        if (ancestry.isDescendant && ancestry.hasCommits) {
          childEntries.push(entry);
          if (!json) {
            console.log(`  ✓ Found: ${entry.name}`);
          }
        }
      }

      if (childEntries.length === 0 && !json) {
        console.log(`No worktrees found that are descendants of ${currentBranch}`);
        console.log();
        console.log("Try: grim wt collect <worktree1> <worktree2> ...");
      }
    }

    if (childEntries.length === 0) {
      if (json) {
        console.log(JSON.stringify({ status: "no_matches", results: [] }));
      } else {
        console.log("No matching worktrees to collect.");
      }
      return;
    }

    // Get session status for each child
    const childrenWithStatus: {
      entry: WorktreeEntry;
      worktree: WorktreeListItem | undefined;
      sessionStatus: { status: string; pid: number } | null;
    }[] = [];

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
      isCompleted(c.entry, sessionService, c.sessionStatus, explicitSet.has(c.entry.name))
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
        logSkip(json, entry.name, entry.branch, SkipReason.WORKTREE_NOT_FOUND);
        results.push({
          worktree: entry.name,
          branch: entry.branch,
          status: "skipped",
          message: SkipReason.WORKTREE_NOT_FOUND,
        });
        continue;
      }

      // Skip if already merged
      if (entry.mergeStatus === "merged") {
        logSkip(json, entry.name, entry.branch, SkipReason.ALREADY_MERGED);
        results.push({
          worktree: entry.name,
          branch: entry.branch,
          status: "skipped",
          message: SkipReason.ALREADY_MERGED,
        });
        continue;
      }

      // Check if child is actually completed
      if (!isCompleted(entry, sessionService, child.sessionStatus, explicitSet.has(entry.name))) {
        if (verbose && !json) {
          console.log(`  Not completed: ${entry.name}`);
          console.log(`    mergeStatus: ${entry.mergeStatus || 'undefined'}`);
          console.log(`    sessionStatus: ${child.sessionStatus?.status || 'none'}`);
          console.log(`    completedAt: ${entry.completedAt || 'undefined'}`);
        }
        logSkip(json, entry.name, entry.branch, SkipReason.NOT_COMPLETED);
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
          console.log(`  [dry-run] Would merge ${entry.branch}${autoRebase ? " (with rebase)" : ""}`);
        }
        continue;
      }

      // Track if we detached the worktree so we can restore it later
      let detachedWorktree = false;

      // Auto-rebase: Update the branch to include current HEAD before merging
      // This prevents conflicts when multiple branches modify the same files
      if (autoRebase) {
        // Save current branch
        const currentBranch = execGit("git rev-parse --abbrev-ref HEAD", cwd);
        if (!currentBranch.success) {
          results.push({
            worktree: entry.name,
            branch: entry.branch,
            status: "skipped",
            message: "Could not determine current branch",
          });
          continue;
        }

        // If the branch is checked out in a worktree, we need to temporarily detach it
        // so we can checkout the branch in the main repo for rebasing
        if (child.worktree) {
          const wtPath = child.worktree.path;
          const wtBranch = execGit("git rev-parse --abbrev-ref HEAD", wtPath);

          if (wtBranch.success && wtBranch.output === entry.branch) {
            // Branch is checked out in worktree - detach it temporarily
            const detach = execGit("git checkout --detach", wtPath);
            if (detach.success) {
              detachedWorktree = true;
              if (verbose && !json) {
                console.log(`  Temporarily detached ${entry.name} worktree from ${entry.branch}`);
              }
            } else {
              logSkip(json, entry.name, entry.branch, SkipReason.CHECKOUT_FAILED,
                `Could not detach worktree: ${detach.output}`);
              results.push({
                worktree: entry.name,
                branch: entry.branch,
                status: "skipped",
                message: `Could not detach worktree: ${detach.output}`,
              });
              continue;
            }
          }
        }

        // Checkout the child branch and rebase onto current HEAD
        const checkout = execGit(`git checkout ${entry.branch}`, cwd);
        if (!checkout.success) {
          // Restore worktree if we detached it
          if (detachedWorktree && child.worktree) {
            execGit(`git checkout ${entry.branch}`, child.worktree.path);
          }

          logSkip(json, entry.name, entry.branch, SkipReason.CHECKOUT_FAILED, checkout.output);
          results.push({
            worktree: entry.name,
            branch: entry.branch,
            status: "skipped",
            message: `${SkipReason.CHECKOUT_FAILED}: ${checkout.output}`,
          });
          continue;
        }

        const rebase = execGit(`git rebase ${currentBranch.output}`, cwd);
        if (!rebase.success) {
          // Rebase failed - abort and report
          execGit("git rebase --abort", cwd);
          execGit(`git checkout ${currentBranch.output}`, cwd);

          // Restore worktree if we detached it
          if (detachedWorktree && child.worktree) {
            execGit(`git checkout ${entry.branch}`, child.worktree.path);
          }

          const isConflict = rebase.output.includes("CONFLICT") ||
            rebase.output.includes("could not apply");

          if (isConflict) {
            yield* stateService.updateWorktree(repoRoot, entry.name, {
              mergeStatus: "conflict",
            });

            logSkip(json, entry.name, entry.branch, SkipReason.REBASE_CONFLICT, rebase.output.split("\n")[0]);
            results.push({
              worktree: entry.name,
              branch: entry.branch,
              status: "conflict",
              message: `${SkipReason.REBASE_CONFLICT}: ${rebase.output.split("\n")[0]}`,
            });

            if (!json) {
              console.log(`  [conflict] ${entry.branch} (during rebase)`);
              console.log(`    └─ ${rebase.output.split("\n")[0]}`);
            }

            hadConflict = true;
            continue; // Try next branch instead of stopping
          } else {
            logSkip(json, entry.name, entry.branch, SkipReason.REBASE_ERROR, rebase.output);
            results.push({
              worktree: entry.name,
              branch: entry.branch,
              status: "skipped",
              message: `${SkipReason.REBASE_ERROR}: ${rebase.output}`,
            });
            continue;
          }
        }

        // Switch back to main branch for the merge
        execGit(`git checkout ${currentBranch.output}`, cwd);

        // Note: Don't restore worktree yet - we'll do it after the merge succeeds
        // This keeps the worktree detached during merge in case something goes wrong

        if (!json) {
          console.log(`  [rebased] ${entry.branch}`);
        }
      }

      // Perform the merge (should be fast-forward after rebase)
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
        yield* stateService.updateWorktree(repoRoot, entry.name, {
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

        // Restore worktree if we detached it (only if not deleting)
        if (detachedWorktree && child.worktree && !deleteAfter) {
          execGit(`git checkout ${entry.branch}`, child.worktree.path);
          if (verbose && !json) {
            console.log(`    └─ restored worktree to ${entry.branch}`);
          }
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

          // Restore worktree if we detached it
          if (detachedWorktree && child.worktree) {
            execGit(`git checkout ${entry.branch}`, child.worktree.path);
          }

          yield* stateService.updateWorktree(repoRoot, entry.name, {
            mergeStatus: "conflict",
          });

          logSkip(json, entry.name, entry.branch, SkipReason.MERGE_CONFLICT, result.output.split("\n")[0]);
          results.push({
            worktree: entry.name,
            branch: entry.branch,
            status: "conflict",
            message: `${SkipReason.MERGE_CONFLICT}: ${result.output.split("\n")[0]}`,
          });

          if (!json) {
            console.log(`  [conflict] ${entry.branch} (during merge)`);
            console.log(`    └─ ${result.output.split("\n")[0]}`);
          }

          hadConflict = true;
          continue; // Continue with next branch instead of stopping
        } else {
          // Restore worktree if we detached it
          if (detachedWorktree && child.worktree) {
            execGit(`git checkout ${entry.branch}`, child.worktree.path);
          }

          logSkip(json, entry.name, entry.branch, SkipReason.MERGE_ERROR, result.output);
          results.push({
            worktree: entry.name,
            branch: entry.branch,
            status: "skipped",
            message: `${SkipReason.MERGE_ERROR}: ${result.output}`,
          });
        }
      }
    }

    // Add remaining unprocessed as skipped (if we stopped early due to conflict)
    const processedNames = new Set(results.map((r) => r.worktree));
    for (const entry of orderedEntries) {
      if (!processedNames.has(entry.name)) {
        logSkip(json, entry.name, entry.branch, SkipReason.EARLIER_CONFLICT);
        results.push({
          worktree: entry.name,
          branch: entry.branch,
          status: "skipped",
          message: SkipReason.EARLIER_CONFLICT,
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
