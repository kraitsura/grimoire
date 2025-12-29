/**
 * grimoire wt merge - Merge worktree branch into current branch
 */

import { Effect } from "effect";
import { execSync } from "child_process";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
  WorktreeStateService,
  WorktreeStateServiceLive,
} from "../../services/worktree";

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
 * Get commit count and file changes from git log
 */
function getMergeStats(branch: string, cwd: string): { commits: number; files: number } {
  try {
    // Get commit count between current HEAD and branch
    const commitCount = execSync(`git rev-list --count HEAD..${branch}`, {
      cwd,
      encoding: "utf-8",
    }).trim();

    // Get file changes
    const filesOutput = execSync(`git diff --name-only HEAD...${branch}`, {
      cwd,
      encoding: "utf-8",
    }).trim();
    const fileCount = filesOutput ? filesOutput.split("\n").length : 0;

    return {
      commits: parseInt(commitCount, 10) || 0,
      files: fileCount,
    };
  } catch {
    return { commits: 0, files: 0 };
  }
}

export const worktreeMerge = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const worktreeName = args.positional[1]; // grim wt merge <name>
    const squash = args.flags.squash === true;
    const noFf = args.flags["no-ff"] === true;
    const json = args.flags.json === true;

    if (!worktreeName) {
      console.log("Usage: grim wt merge <name> [options]");
      console.log();
      console.log("Options:");
      console.log("  --squash    Squash commits into single commit");
      console.log("  --no-ff     Force merge commit even if fast-forward possible");
      console.log("  --json      Output structured JSON");
      process.exit(1);
    }

    const worktreeService = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const cwd = process.cwd();

    // Get current branch
    const currentBranchResult = execGit("git branch --show-current", cwd);
    if (!currentBranchResult.success) {
      console.log("Error: Could not determine current branch");
      process.exit(1);
    }
    const currentBranch = currentBranchResult.output;

    // Get all worktrees
    const worktreesResult = yield* Effect.either(worktreeService.list(cwd));
    if (worktreesResult._tag === "Left") {
      const e = worktreesResult.left as { message?: string };
      console.log(`Error: ${e.message || String(worktreesResult.left)}`);
      process.exit(1);
    }

    const worktrees = worktreesResult.right;
    const worktree = worktrees.find((w) => w.name === worktreeName);

    if (!worktree) {
      console.log(`Error: Worktree '${worktreeName}' not found`);
      process.exit(1);
    }

    const targetBranch = worktree.branch;

    // Check if trying to merge into itself
    if (targetBranch === currentBranch) {
      console.log(`Error: Cannot merge branch '${targetBranch}' into itself`);
      process.exit(1);
    }

    // Get merge stats before merging
    const stats = getMergeStats(targetBranch, cwd);

    // Build merge command
    let mergeCmd = "git merge";
    if (squash) {
      mergeCmd += " --squash";
    } else if (noFf) {
      mergeCmd += " --no-ff";
    }
    mergeCmd += ` ${targetBranch}`;

    if (!squash) {
      mergeCmd += " --no-edit"; // Don't prompt for commit message
    }

    // Perform the merge
    const result = execGit(mergeCmd, cwd);

    // Handle squash merge - needs explicit commit
    if (squash && (result.success || result.output.includes("Squash commit"))) {
      const commitResult = execGit(`git commit -m "Merge ${targetBranch} (squash)"`, cwd);
      if (!commitResult.success && !commitResult.output.includes("nothing to commit")) {
        if (json) {
          console.log(
            JSON.stringify({
              status: "error",
              worktree: worktreeName,
              branch: targetBranch,
              currentBranch,
              message: commitResult.output,
            })
          );
        } else {
          console.log(`Error committing squash merge:`);
          console.log(commitResult.output);
        }
        process.exit(1);
      }
    }

    // Check for conflicts
    const isConflict =
      !result.success &&
      (result.output.includes("CONFLICT") ||
        result.output.includes("Merge conflict") ||
        result.output.includes("fix conflicts"));

    if (isConflict) {
      // Update state to mark conflict
      const state = yield* stateService.getState(cwd);
      const entry = state.worktrees.find((w) => w.name === worktreeName);
      if (entry) {
        yield* stateService.updateWorktree(cwd, worktreeName, {
          mergeStatus: "conflict",
        });
      }

      if (json) {
        console.log(
          JSON.stringify({
            status: "conflict",
            worktree: worktreeName,
            branch: targetBranch,
            currentBranch,
            message: result.output.split("\n")[0],
          })
        );
      } else {
        // Extract conflict files
        const conflictMatch = result.output.match(/CONFLICT \([^)]+\): (.+)/);
        const conflictFile = conflictMatch ? conflictMatch[1] : "unknown";

        console.log(`Merge conflict in ${conflictFile}`);
        console.log("Resolve conflicts and run: git commit");
      }
      process.exit(1);
    }

    // Check for other errors
    if (!result.success && !result.output.includes("Already up to date")) {
      if (json) {
        console.log(
          JSON.stringify({
            status: "error",
            worktree: worktreeName,
            branch: targetBranch,
            currentBranch,
            message: result.output,
          })
        );
      } else {
        console.log(`Error: ${result.output}`);
      }
      process.exit(1);
    }

    // Update worktree state to mark as merged
    const state = yield* stateService.getState(cwd);
    const entry = state.worktrees.find((w) => w.name === worktreeName);
    if (entry) {
      yield* stateService.updateWorktree(cwd, worktreeName, {
        mergeStatus: "merged",
      });
    }

    // Success output
    if (json) {
      console.log(
        JSON.stringify({
          status: "success",
          worktree: worktreeName,
          branch: targetBranch,
          currentBranch,
          commits: stats.commits,
          files: stats.files,
          squash,
          noFf,
        })
      );
    } else {
      const mergeType = squash ? " (squashed)" : noFf ? " (no-ff)" : "";
      console.log(`Merged branch "${targetBranch}" into "${currentBranch}"${mergeType}`);
      if (stats.commits > 0 || stats.files > 0) {
        console.log(`  ${stats.commits} commits, ${stats.files} files changed`);
      }
    }
  }).pipe(Effect.provide(WorktreeServiceLive), Effect.provide(WorktreeStateServiceLive));
