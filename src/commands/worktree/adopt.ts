/**
 * grimoire wt adopt - Take ownership of external worktrees
 *
 * Adds unmanaged worktrees (created via raw git) to the state file,
 * enabling grim wt to manage them (clean, ps filtering, etc.)
 */

import { Effect, Layer } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
  WorktreeStateService,
  WorktreeStateServiceLive,
} from "../../services/worktree";

interface UnmanagedWorktree {
  name: string;
  branch: string;
  path: string;
}

export const worktreeAdopt = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const adoptAll = args.flags.all === true || args.flags.a === true;
    const targetName = args.positional[1];
    const linkedIssue = (args.flags.issue as string) || (args.flags.i as string);

    if (!adoptAll && !targetName) {
      console.log("Usage: grimoire wt adopt <name> [options]");
      console.log("       grimoire wt adopt --all");
      console.log();
      console.log("Takes ownership of worktrees created outside grim wt.");
      console.log();
      console.log("Arguments:");
      console.log("  <name>              Name of worktree to adopt");
      console.log();
      console.log("Options:");
      console.log("  --all, -a           Adopt all unmanaged worktrees");
      console.log("  --issue, -i <id>    Link to beads issue");
      console.log();
      console.log("Examples:");
      console.log("  grim wt adopt feature-x           Adopt single worktree");
      console.log("  grim wt adopt feature-x -i BUG-1  Adopt and link to issue");
      console.log("  grim wt adopt --all               Adopt all unmanaged");
      process.exit(1);
    }

    const worktreeService = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const cwd = process.cwd();

    // Get git worktrees
    const listResult = yield* Effect.either(worktreeService.list(cwd));
    if (listResult._tag === "Left") {
      const e = listResult.left as { _tag?: string; message?: string };
      console.error(`Error: ${e.message || String(listResult.left)}`);
      process.exit(1);
    }
    const gitWorktrees = listResult.right;

    // Get state entries
    const stateResult = yield* Effect.either(stateService.getState(cwd));
    const state = stateResult._tag === "Right"
      ? stateResult.right
      : { version: 2 as const, worktrees: [] };

    // Build set of managed worktree names
    const managedNames = new Set(state.worktrees.map((w) => w.name));

    // If targeting specific worktree, check if already managed first
    if (targetName && managedNames.has(targetName)) {
      console.log(`Worktree '${targetName}' is already managed.`);
      return;
    }

    // Find unmanaged worktrees
    const unmanaged: UnmanagedWorktree[] = gitWorktrees
      .filter((wt) => !managedNames.has(wt.name))
      .map((wt) => ({
        name: wt.name,
        branch: wt.branch,
        path: wt.path,
      }));

    if (unmanaged.length === 0) {
      console.log("No unmanaged worktrees found.");
      return;
    }

    // Determine which worktrees to adopt
    let toAdopt: UnmanagedWorktree[];

    if (adoptAll) {
      toAdopt = unmanaged;
    } else {
      const target = unmanaged.find((wt) => wt.name === targetName);
      if (!target) {
        // Not in unmanaged list - check if it exists at all
        const exists = gitWorktrees.find((wt) => wt.name === targetName);
        if (!exists) {
          console.log(`Worktree '${targetName}' not found.`);
          if (unmanaged.length > 0) {
            console.log();
            console.log("Available unmanaged worktrees:");
            for (const wt of unmanaged) {
              console.log(`  ${wt.name}`);
            }
          }
          process.exit(1);
        }
        // Exists but not unmanaged - already handled above, but just in case
        console.log(`Worktree '${targetName}' is already managed.`);
        return;
      }
      toAdopt = [target];
    }

    // Adopt each worktree
    let adopted = 0;
    for (const wt of toAdopt) {
      const entry = {
        name: wt.name,
        branch: wt.branch,
        createdAt: new Date().toISOString(),
        linkedIssue: linkedIssue,
        metadata: {
          createdBy: "user" as const,
        },
      };

      yield* Effect.either(stateService.addWorktree(cwd, entry));

      const issueTag = linkedIssue ? ` (linked to ${linkedIssue})` : "";
      console.log(`Adopted: ${wt.name}${issueTag}`);
      adopted++;
    }

    console.log();
    console.log(`${adopted} worktree(s) adopted.`);
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        WorktreeServiceLive,
        WorktreeStateServiceLive
      )
    )
  );
