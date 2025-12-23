/**
 * grimoire wt rm - Remove a worktree
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { WorktreeService, WorktreeServiceLive } from "../../services/worktree";
import type { WorktreeInfo } from "../../models/worktree";

export const worktreeRm = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    if (!name) {
      console.log("Usage: grimoire wt rm <name> [options]");
      console.log();
      console.log("Options:");
      console.log("  --branch, -b    Also delete the branch");
      console.log("  --force, -f     Remove even with uncommitted changes");
      console.log("  -y              Skip confirmation prompts");
      process.exit(1);
    }

    const deleteBranch = args.flags["branch"] === true || args.flags["b"] === true;
    const force = args.flags["force"] === true || args.flags["f"] === true;

    const service = yield* WorktreeService;
    const cwd = process.cwd();

    // First check if worktree exists and get info
    const infoResult = yield* Effect.either(service.get(cwd, name));

    if (infoResult._tag === "Left") {
      const e = infoResult.left as { _tag?: string; message?: string };
      console.log(`Error: ${e.message || String(infoResult.left)}`);
      process.exit(1);
    }

    const info = infoResult.right as WorktreeInfo;

    const removeResult = yield* Effect.either(service.remove(cwd, name, { deleteBranch, force }));

    if (removeResult._tag === "Left") {
      const e = removeResult.left as { _tag?: string; message?: string };
      console.log(`Error: ${e.message || String(removeResult.left)}`);
      process.exit(1);
    }

    console.log(`Removed worktree '${name}'`);
    if (deleteBranch) {
      console.log(`  Branch '${info.branch}' deleted`);
    } else {
      console.log(`  Branch '${info.branch}' retained (use --branch to delete)`);
    }
  }).pipe(Effect.provide(WorktreeServiceLive));
