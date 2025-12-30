/**
 * grimoire wt list - List all worktree names
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { WorktreeService, WorktreeServiceLive } from "../../services/worktree";

export const worktreeList = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const json = args.flags.json === true;

    const service = yield* WorktreeService;
    const cwd = process.cwd();

    const worktreesResult = yield* Effect.either(service.list(cwd));

    if (worktreesResult._tag === "Left") {
      const e = worktreesResult.left as { _tag?: string; message?: string };
      console.log(`Error: ${e.message || String(worktreesResult.left)}`);
      process.exit(1);
    }

    const worktrees = worktreesResult.right;

    if (json) {
      console.log(
        JSON.stringify({ worktrees, basePath: ".worktrees" }, null, 2)
      );
      return;
    }

    if (worktrees.length === 0) {
      console.log("No worktrees found.");
      console.log();
      console.log("Create one with: grim wt new <branch>");
      return;
    }

    // Just print names, one per line
    for (const wt of worktrees) {
      console.log(wt.name);
    }
  }).pipe(Effect.provide(WorktreeServiceLive));
