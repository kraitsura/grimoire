/**
 * Stash Command - Save clipboard content to stash
 *
 * Usage:
 *   grimoire stash              - Stash clipboard content
 *   grimoire stash <name>       - Stash with a name
 *   grimoire stash --list|-l    - List all stashed items
 *   grimoire stash --clear      - Clear all stashed items
 */

import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { StashService, Clipboard } from "../services";
import { StashCommandArgsSchema, ValidationError } from "../models";
import type { ParsedArgs } from "../cli/parser";

/**
 * Parse raw CLI args into structured format for schema validation
 */
const parseStashArgs = (args: ParsedArgs) => {
  const listFlag = args.flags.list || args.flags.l;
  const clearFlag = args.flags.clear;

  return {
    name: args.positional[0],
    list: listFlag === true ? true : undefined,
    clear: clearFlag === true ? true : undefined,
  };
};

/**
 * Stash command implementation
 *
 * Saves clipboard content to the stash stack with optional name.
 */
export const stashCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const stash = yield* StashService;
    const clipboard = yield* Clipboard;

    // Validate arguments with schema
    const rawArgs = parseStashArgs(args);
    const validatedArgs = yield* Schema.decodeUnknown(StashCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire stash [name] [--list|-l] [--clear]`,
        });
      })
    );

    // Handle --list flag
    if (validatedArgs.list) {
      const items = yield* stash.list();

      if (items.length === 0) {
        console.log("Stash is empty.");
        return;
      }

      console.log(`Stash (${items.length} items):`);
      for (const item of items) {
        const preview = item.content.slice(0, 50).replace(/\n/g, " ");
        const nameDisplay = item.name ? `[${item.name}]` : `#${item.stackOrder}`;
        console.log(`  ${nameDisplay}: ${preview}${item.content.length > 50 ? "..." : ""}`);
      }
      return;
    }

    // Handle --clear flag
    if (validatedArgs.clear) {
      const count = yield* stash.clear();
      console.log(`Cleared ${count} items from stash.`);
      return;
    }

    // Default: stash clipboard content
    const content = yield* clipboard.paste;

    if (!content.trim()) {
      console.log("Clipboard is empty, nothing to stash.");
      return;
    }

    const item = yield* stash.push(content, validatedArgs.name);

    const nameDisplay = item.name ? ` as "${item.name}"` : "";
    console.log(`Stashed${nameDisplay} (${content.length} chars)`);
  });
