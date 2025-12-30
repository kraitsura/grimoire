/**
 * grimoire wt status - [DEPRECATED] Use 'ps' instead
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { worktreePs } from "./ps";

export const worktreeStatus = (args: ParsedArgs) =>
  Effect.gen(function* () {
    console.log("Warning: 'grim wt status' is deprecated. Use 'grim wt ps' instead.");
    console.log();
    return yield* worktreePs(args);
  });
