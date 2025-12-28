/**
 * grimoire wt clean - Clean up stale worktrees
 */

import { Effect } from "effect";
import * as readline from "readline";
import type { ParsedArgs } from "../../cli/parser";
import { WorktreeService, WorktreeServiceLive } from "../../services/worktree";
import type { WorktreeListItem } from "../../models/worktree";

interface StaleWorktree {
  item: WorktreeListItem;
  reason: string;
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

export const worktreeClean = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const dryRun = args.flags["dry-run"] === true;
    const skipConfirm = args.flags.y === true;
    const includeBranch = args.flags["include-branch"] === true || args.flags.b === true;

    const service = yield* WorktreeService;
    const cwd = process.cwd();

    // List all worktrees
    const listResult = yield* Effect.either(service.list(cwd));

    if (listResult._tag === "Left") {
      const e = listResult.left as { _tag?: string; message?: string };
      console.error(`Error: ${e.message || String(listResult.left)}`);
      process.exit(1);
    }

    const worktrees = listResult.right;

    if (worktrees.length === 0) {
      console.log("No worktrees found.");
      return;
    }

    // Identify stale worktrees
    const staleWorktrees: StaleWorktree[] = [];

    for (const wt of worktrees) {
      if (wt.status === "stale") {
        staleWorktrees.push({
          item: wt,
          reason: "branch merged",
        });
      }
      // TODO: Check for closed linked issues when beads integration is implemented
    }

    if (staleWorktrees.length === 0) {
      console.log("No stale worktrees found.");
      console.log();
      console.log(`${worktrees.length} worktree(s) are active.`);
      return;
    }

    // Display stale worktrees
    if (dryRun) {
      console.log(`Would remove ${staleWorktrees.length} worktree(s):`);
    } else {
      console.log(`Found ${staleWorktrees.length} stale worktree(s):`);
    }
    console.log();

    for (const { item, reason } of staleWorktrees) {
      const uncommitted = item.uncommittedChanges
        ? ` [${item.uncommittedChanges} uncommitted]`
        : "";
      console.log(`  ${item.name.padEnd(20)} (${reason})${uncommitted}`);
    }
    console.log();

    if (dryRun) {
      console.log("Run without --dry-run to remove.");
      return;
    }

    // Check for uncommitted changes
    const withChanges = staleWorktrees.filter((s) => s.item.uncommittedChanges);
    if (withChanges.length > 0) {
      console.log(
        `Warning: ${withChanges.length} worktree(s) have uncommitted changes.`
      );
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

    // Remove stale worktrees
    let removed = 0;
    let skipped = 0;

    for (const { item } of staleWorktrees) {
      // Skip if has uncommitted changes and not forcing
      if (item.uncommittedChanges && !args.flags.force) {
        console.log(`  Skipped ${item.name} (uncommitted changes)`);
        skipped++;
        continue;
      }

      const removeResult = yield* Effect.either(
        service.remove(cwd, item.name, {
          deleteBranch: includeBranch,
          force: args.flags.force === true,
        })
      );

      if (removeResult._tag === "Left") {
        const e = removeResult.left as { _tag?: string; message?: string };
        console.log(`  Failed to remove ${item.name}: ${e.message || String(removeResult.left)}`);
        skipped++;
      } else {
        const branchMsg = includeBranch ? ` (branch '${item.branch}' deleted)` : "";
        console.log(`  Removed ${item.name}${branchMsg}`);
        removed++;
      }
    }

    console.log();
    if (removed > 0) {
      console.log(`${removed} worktree(s) cleaned up.`);
    }
    if (skipped > 0) {
      console.log(`${skipped} worktree(s) skipped.`);
    }
  }).pipe(Effect.provide(WorktreeServiceLive));
