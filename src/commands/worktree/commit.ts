/**
 * grimoire wt commit - Commit changes in worktree(s)
 *
 * For orchestrators to commit subagent work before collecting.
 * Unlike checkpoint, this auto-stages all changes and doesn't track metadata.
 */

import { Effect } from "effect";
import { execSync } from "child_process";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
} from "../../services/worktree";

/**
 * Detect current worktree from cwd
 */
function detectCurrentWorktree(cwd: string): string | null {
  const match = /\.worktrees\/([^/]+)/.exec(cwd);
  return match ? match[1] : null;
}

/**
 * Get short summary of changes for auto-generated commit message
 */
function getChangeSummary(worktreePath: string): string {
  try {
    const status = execSync("git status --porcelain", {
      cwd: worktreePath,
      encoding: "utf8",
    }).trim();

    if (!status) return "no changes";

    const lines = status.split("\n");
    const added = lines.filter((l) => l.startsWith("A") || l.startsWith("??")).length;
    const modified = lines.filter((l) => l.startsWith("M") || l.startsWith(" M")).length;
    const deleted = lines.filter((l) => l.startsWith("D") || l.startsWith(" D")).length;

    const parts: string[] = [];
    if (added) parts.push(`${added} added`);
    if (modified) parts.push(`${modified} modified`);
    if (deleted) parts.push(`${deleted} deleted`);

    return parts.join(", ") || "changes";
  } catch {
    return "changes";
  }
}

/**
 * Commit a single worktree
 */
function commitWorktree(
  name: string,
  path: string,
  message: string | null,
  dryRun: boolean
): { success: boolean; message: string; hash?: string } {
  // Check for changes
  try {
    const status = execSync("git status --porcelain", {
      cwd: path,
      encoding: "utf8",
    }).trim();

    if (!status) {
      return { success: true, message: "nothing to commit" };
    }
  } catch (e) {
    return { success: false, message: `git status failed: ${e}` };
  }

  // Generate commit message if not provided
  const commitMsg = message || `wt(${name}): ${getChangeSummary(path)}`;

  if (dryRun) {
    return { success: true, message: `would commit: "${commitMsg}"` };
  }

  // Stage all changes
  try {
    execSync("git add -A", { cwd: path, stdio: "pipe" });
  } catch (e) {
    return { success: false, message: `git add failed: ${e}` };
  }

  // Commit
  try {
    execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, {
      cwd: path,
      stdio: "pipe",
    });

    const hash = execSync("git rev-parse --short HEAD", {
      cwd: path,
      encoding: "utf8",
    }).trim();

    return { success: true, message: commitMsg, hash };
  } catch (e) {
    const err = e as { stderr?: Buffer };
    const stderr = err.stderr?.toString() || String(e);
    return { success: false, message: `commit failed: ${stderr}` };
  }
}

export const worktreeCommit = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const cwd = process.cwd();
    const service = yield* WorktreeService;

    // Parse arguments
    const names: string[] = [];
    let message: string | null = null;
    const dryRun = args.flags["dry-run"] === true || args.flags.n === true;
    const json = args.flags.json === true;

    // Handle -m "message" flag
    // If -m has a string value, use it directly
    // If -m is true (boolean), the message might be in positional args
    if (typeof args.flags.m === "string") {
      message = args.flags.m;
    } else if (typeof args.flags.message === "string") {
      message = args.flags.message;
    }

    // Collect worktree names from positional args
    // We need to be careful: if -m was used as boolean flag,
    // the message ends up in positional args
    const positionalArgs = args.positional.slice(1).filter(
      (arg) => arg && !arg.startsWith("-")
    );

    // If -m flag was used but message is boolean (true),
    // check if we have worktree names that look like commit messages
    const mFlagUsed = args.flags.m === true;

    for (const arg of positionalArgs) {
      // If -m was used and we don't have a message yet,
      // and this arg contains spaces or looks like a message, treat it as message
      if (mFlagUsed && !message && (arg.includes(" ") || arg.includes(":"))) {
        message = arg;
      } else {
        names.push(arg);
      }
    }

    // If no names provided, try to detect from cwd
    if (names.length === 0) {
      const detected = detectCurrentWorktree(cwd);
      if (detected) {
        names.push(detected);
      } else {
        console.log(`Usage: grimoire wt commit <name> [name...] [-m "message"]`);
        console.log(`       grimoire wt commit [-m "message"]  # from within worktree`);
        console.log();
        console.log(`Options:`);
        console.log(`  -m <msg>     Commit message (auto-generated if omitted)`);
        console.log(`  --dry-run    Show what would be committed`);
        console.log(`  --json       Output as JSON`);
        process.exit(1);
      }
    }

    const results: Array<{
      name: string;
      success: boolean;
      message: string;
      hash?: string;
    }> = [];

    // Process each worktree
    for (const name of names) {
      const infoResult = yield* Effect.either(service.get(cwd, name));

      if (infoResult._tag === "Left") {
        results.push({
          name,
          success: false,
          message: `worktree '${name}' not found`,
        });
        continue;
      }

      const info = infoResult.right;
      const result = commitWorktree(name, info.path, message, dryRun);
      results.push({ name, ...result });
    }

    // Output results
    if (json) {
      console.log(JSON.stringify({ results, dryRun }, null, 2));
      return;
    }

    const prefix = dryRun ? "[dry-run] " : "";

    for (const r of results) {
      if (r.success) {
        if (r.hash) {
          console.log(`${prefix}${r.name}: ${r.hash} ${r.message}`);
        } else {
          console.log(`${prefix}${r.name}: ${r.message}`);
        }
      } else {
        console.log(`${prefix}${r.name}: ERROR - ${r.message}`);
      }
    }

    // Summary for multiple worktrees
    if (results.length > 1) {
      const committed = results.filter((r) => r.hash).length;
      const skipped = results.filter((r) => r.success && !r.hash).length;
      const failed = results.filter((r) => !r.success).length;
      console.log();
      console.log(`${prefix}Done: ${committed} committed, ${skipped} skipped, ${failed} failed`);
    }

    // Exit with error if any failed
    if (results.some((r) => !r.success)) {
      process.exit(1);
    }
  }).pipe(Effect.provide(WorktreeServiceLive));
