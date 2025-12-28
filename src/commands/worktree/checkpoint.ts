/**
 * grimoire wt checkpoint - Create named checkpoints (commits with metadata)
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
import type { WorktreeCheckpoint, WorktreeLog } from "../../models/worktree";

/**
 * Detect current worktree from cwd
 */
function detectCurrentWorktree(cwd: string): string | null {
  const match = /\.worktrees\/([^/]+)/.exec(cwd);
  return match ? match[1] : null;
}


export const worktreeCheckpoint = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[1];
    const cwd = process.cwd();
    const service = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;

    // View checkpoints: grimoire wt checkpoints [name]
    if (subcommand === "checkpoints") {
      const name = args.positional[2] || detectCurrentWorktree(cwd);
      const json = args.flags.json === true;

      if (!name) {
        console.error("Error: Specify worktree name or run from within a worktree");
        process.exit(1);
      }

      const infoResult = yield* Effect.either(service.get(cwd, name));
      if (infoResult._tag === "Left") {
        console.error(`Error: Worktree '${name}' not found`);
        process.exit(1);
      }

      const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
      const state = yield* stateService.getState(repoRoot);
      const entry = state.worktrees.find((w) => w.name === name);
      const checkpoints = (entry?.checkpoints || []) as WorktreeCheckpoint[];

      if (json) {
        console.log(JSON.stringify({ name, checkpoints }, null, 2));
        return;
      }

      if (checkpoints.length === 0) {
        console.log(`${name} (no checkpoints)`);
        return;
      }

      console.log(`${name} (${checkpoints.length} checkpoints)`);
      console.log("─".repeat(60));

      for (const cp of checkpoints) {
        const time = new Date(cp.time).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const shortHash = cp.hash.slice(0, 7);
        console.log(`  ${shortHash}  ${time}  ${cp.message}`);
      }
      return;
    }

    // Create checkpoint: grimoire wt checkpoint <name> "message" OR grimoire wt checkpoint "message"
    let name: string | null;
    let message: string;

    if (args.positional.length >= 3) {
      name = args.positional[1];
      message = args.positional.slice(2).join(" ");
    } else if (args.positional.length === 2) {
      name = detectCurrentWorktree(cwd);
      message = args.positional[1];
    } else {
      console.log("Usage: grimoire wt checkpoint <name> <message>");
      console.log("       grimoire wt checkpoint <message>   # from within worktree");
      console.log();
      console.log("View checkpoints:");
      console.log("       grimoire wt checkpoints <name>");
      console.log("       grimoire wt checkpoints --json");
      process.exit(1);
    }

    if (!name) {
      console.error("Error: Specify worktree name or run from within a worktree");
      process.exit(1);
    }

    if (!message) {
      console.error("Error: Checkpoint message required");
      process.exit(1);
    }

    // Get worktree info
    const infoResult = yield* Effect.either(service.get(cwd, name));
    if (infoResult._tag === "Left") {
      console.error(`Error: Worktree '${name}' not found`);
      process.exit(1);
    }

    const info = infoResult.right;
    const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

    // Check for changes in worktree
    let hasChanges = false;
    try {
      const status = execSync("git status --porcelain", {
        cwd: info.path,
        encoding: "utf8",
      });
      hasChanges = status.trim().length > 0;
    } catch {
      // Ignore errors
    }

    let commitHash: string;

    if (hasChanges) {
      // Stage and commit all changes
      try {
        execSync("git add -A", { cwd: info.path, stdio: "pipe" });
        execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
          cwd: info.path,
          stdio: "pipe",
        });
        commitHash = execSync("git rev-parse HEAD", {
          cwd: info.path,
          encoding: "utf8",
        }).trim();
        console.log(`Committed: ${commitHash.slice(0, 7)}`);
      } catch (e) {
        console.error("Error: Failed to create commit");
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    } else {
      // No changes - just record current HEAD as checkpoint
      commitHash = execSync("git rev-parse HEAD", {
        cwd: info.path,
        encoding: "utf8",
      }).trim();
      console.log(`No changes to commit, recording HEAD: ${commitHash.slice(0, 7)}`);
    }

    const author = (args.flags.author as string) || "human";
    const now = new Date().toISOString();

    // Get current state
    const state = yield* stateService.getState(repoRoot);
    const entry = state.worktrees.find((w) => w.name === name);

    if (!entry) {
      console.error(`Error: Worktree '${name}' not in state`);
      process.exit(1);
    }

    // Create checkpoint entry
    const checkpoint: WorktreeCheckpoint = {
      hash: commitHash,
      message,
      time: now,
      author,
    };

    // Create log entry
    const log: WorktreeLog = {
      time: now,
      message: `Checkpoint: ${message}`,
      author,
      type: "log",
    };

    const currentCheckpoints = (entry.checkpoints || []) as WorktreeCheckpoint[];
    const currentLogs = (entry.logs || []) as WorktreeLog[];

    // Update state
    yield* stateService.updateWorktree(repoRoot, name, {
      checkpoints: [...currentCheckpoints, checkpoint],
      logs: [...currentLogs, log],
    });

    console.log(`✓ Checkpoint: ${message}`);
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive)
  );
