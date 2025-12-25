/**
 * grimoire wt each - Run command across all/selected worktrees
 */

import { Effect } from "effect";
import { spawn } from "child_process";
import type { ParsedArgs } from "../../cli/parser";
import { WorktreeService, WorktreeServiceLive } from "../../services/worktree";
import type { WorktreeListItem } from "../../models/worktree";

interface CommandResult {
  name: string;
  success: boolean;
  exitCode: number;
  output?: string;
}

/**
 * Run a command in a worktree
 */
function runInWorktree(
  worktree: WorktreeListItem,
  command: string,
  parallel: boolean
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      GRIMOIRE_WORKTREE: worktree.name,
      GRIMOIRE_WORKTREE_PATH: worktree.path,
    };

    if (!parallel) {
      console.log(`\n[${worktree.name}] Running: ${command}`);
    }

    const child = spawn(command, {
      cwd: worktree.path,
      env,
      shell: true,
      stdio: parallel ? "pipe" : "inherit",
    });

    let output = "";
    if (parallel) {
      child.stdout?.on("data", (data) => {
        output += data.toString();
      });
      child.stderr?.on("data", (data) => {
        output += data.toString();
      });
    }

    child.on("close", (code) => {
      resolve({
        name: worktree.name,
        success: code === 0,
        exitCode: code ?? 1,
        output: parallel ? output : undefined,
      });
    });

    child.on("error", (err) => {
      resolve({
        name: worktree.name,
        success: false,
        exitCode: 1,
        output: err.message,
      });
    });
  });
}

export const worktreeEach = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const command = args.positional.slice(1).join(" ");
    const parallel = args.flags["parallel"] === true || args.flags["p"] === true;
    const failFast = args.flags["fail-fast"] === true;
    const filter = args.flags["filter"] as string | undefined;
    const claimedOnly = args.flags["claimed"] === true;
    const unclaimedOnly = args.flags["unclaimed"] === true;

    if (!command) {
      console.log("Usage: grimoire wt each <command>");
      console.log();
      console.log("Run a command across all/selected worktrees.");
      console.log();
      console.log("Options:");
      console.log("  --parallel, -p   Run commands concurrently");
      console.log("  --fail-fast      Stop on first failure");
      console.log("  --filter=<type>  Filter by status (active, stale)");
      console.log("  --claimed        Only claimed worktrees");
      console.log("  --unclaimed      Only unclaimed worktrees");
      console.log();
      console.log("Examples:");
      console.log('  grimoire wt each "bun test"');
      console.log('  grimoire wt each "git status" --parallel');
      console.log('  grimoire wt each "bun test" --fail-fast');
      process.exit(1);
    }

    const service = yield* WorktreeService;
    const cwd = process.cwd();

    const worktreesResult = yield* Effect.either(service.list(cwd));

    if (worktreesResult._tag === "Left") {
      const e = worktreesResult.left as { _tag?: string; message?: string };
      console.error(`Error: ${e.message || String(worktreesResult.left)}`);
      process.exit(1);
    }

    let worktrees = worktreesResult.right as WorktreeListItem[];

    // Apply filters
    if (filter === "active") {
      worktrees = worktrees.filter((w) => w.status === "active");
    } else if (filter === "stale") {
      worktrees = worktrees.filter((w) => w.status === "stale");
    }

    // Note: claimed/unclaimed filtering requires reading full state
    // For now, these are placeholders - would need state service access
    if (claimedOnly || unclaimedOnly) {
      // TODO: Implement when claim data is accessible from WorktreeListItem
      console.log("Warning: --claimed/--unclaimed filtering not yet implemented");
    }

    if (worktrees.length === 0) {
      console.log("No worktrees match the filter criteria.");
      process.exit(0);
    }

    if (parallel) {
      console.log(`Running in ${worktrees.length} worktrees...`);
      console.log();
    }

    const results: CommandResult[] = [];

    if (parallel) {
      // Run all concurrently
      const allResults = yield* Effect.promise(() =>
        Promise.all(worktrees.map((wt) => runInWorktree(wt, command, true)))
      );

      for (const result of allResults) {
        const icon = result.success ? "✓" : "✗";
        console.log(`${icon} [${result.name}] exit ${result.exitCode}`);
        if (result.output && !result.success) {
          // Show output for failures
          console.log(result.output.trim().split("\n").map(l => `  ${l}`).join("\n"));
        }
        results.push(result);
      }
    } else {
      // Run sequentially
      for (const wt of worktrees) {
        const result = yield* Effect.promise(() =>
          runInWorktree(wt, command, false)
        );
        results.push(result);

        if (failFast && !result.success) {
          console.log();
          console.log(`Stopping: command failed in ${wt.name}`);
          break;
        }
      }
    }

    // Summary
    const passed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log();
    console.log(`Summary: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  }).pipe(Effect.provide(WorktreeServiceLive));
