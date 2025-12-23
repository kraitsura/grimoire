/**
 * grimoire wt path - Get worktree path for scripting
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { WorktreeService, WorktreeServiceLive } from "../../services/worktree";

export const worktreePath = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    if (!name) {
      console.error("Usage: grimoire wt path <name>");
      process.exit(1);
    }

    const service = yield* WorktreeService;
    const cwd = process.cwd();

    const pathResult = yield* Effect.either(service.getPath(cwd, name));

    if (pathResult._tag === "Left") {
      // Exit with code 1 for scripting, no message
      process.exit(1);
    }

    // Output just the path with no decorations - this is a scripting primitive
    console.log(pathResult.right);
  }).pipe(Effect.provide(WorktreeServiceLive));
