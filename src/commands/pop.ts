/**
 * Pop Command - Restore content from stash to clipboard
 *
 * Usage:
 *   grimoire pop               - Pop latest item to clipboard
 *   grimoire pop <name>        - Pop named item to clipboard
 *   grimoire pop --peek|-p     - Preview without removing
 *   grimoire pop --stdout      - Output to stdout instead of clipboard
 */

import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { StashService, Clipboard } from "../services";
import { PopCommandArgsSchema, ValidationError, StashEmptyError } from "../models";
import type { ParsedArgs } from "../cli/parser";

/**
 * Parse raw CLI args into structured format for schema validation
 */
const parsePopArgs = (args: ParsedArgs) => {
  const peekFlag = args.flags.peek || args.flags.p;
  const stdoutFlag = args.flags.stdout;

  return {
    name: args.positional[0],
    peek: peekFlag === true ? true : undefined,
    stdout: stdoutFlag === true ? true : undefined,
  };
};

/**
 * Pop command implementation
 *
 * Retrieves content from the stash and copies to clipboard.
 */
export const popCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const stash = yield* StashService;
    const clipboard = yield* Clipboard;

    // Validate arguments with schema
    const rawArgs = parsePopArgs(args);
    const validatedArgs = yield* Schema.decodeUnknown(PopCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire pop [name] [--peek|-p] [--stdout]`,
        });
      })
    );

    let item;

    // If name provided, pop/peek by name
    if (validatedArgs.name) {
      if (validatedArgs.peek) {
        item = yield* stash.getByName(validatedArgs.name);
      } else {
        item = yield* stash.popByName(validatedArgs.name);
      }
    } else {
      // Pop/peek most recent
      if (validatedArgs.peek) {
        const peeked = yield* stash.peek();
        if (!peeked) {
          return yield* Effect.fail(new StashEmptyError({ message: "Stash is empty" }));
        }
        item = peeked;
      } else {
        item = yield* stash.pop();
      }
    }

    // Output
    if (validatedArgs.stdout) {
      console.log(item.content);
    } else {
      yield* clipboard.copy(item.content);
      const nameDisplay = item.name ? ` "${item.name}"` : "";
      const action = validatedArgs.peek ? "Peeked at" : "Popped";
      console.log(`${action}${nameDisplay} to clipboard (${item.content.length} chars)`);
    }
  });
