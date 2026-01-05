/**
 * rm command - Delete or archive prompts
 *
 * Supports soft delete (archive) by default and hard delete with --force flag.
 */

import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { StorageService } from "../../services";
import { RmCommandArgsSchema, ValidationError } from "../../models";
import type { ParsedArgs } from "../../cli/parser";
import * as readline from "node:readline";

/**
 * Parse raw CLI args into structured format for schema validation
 */
const parseRmArgs = (args: ParsedArgs) => {
  return {
    targets: args.positional,
    force: args.flags.force === true || args.flags.f === true ? true : undefined,
    yes: args.flags.yes === true || args.flags.y === true ? true : undefined,
  };
};

/**
 * Remove command handler
 *
 * Usage:
 *   grimoire rm <name-or-id...>
 *   grimoire rm <name-or-id...> --force|-f       Hard delete (remove file permanently)
 *   grimoire rm <name-or-id...> --yes|-y         Skip confirmation
 *
 * Behavior:
 * - Soft Delete (default): Move file to ~/.grimoire/archive/
 * - Hard Delete (--force): Delete file permanently and remove from database
 */
export const rmCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;

    // Validate arguments with schema
    const rawArgs = parseRmArgs(args);
    const validatedArgs = yield* Schema.decodeUnknown(RmCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire rm <name-or-id...> [--force|-f] [--yes|-y]`,
        });
      })
    );

    const hard = !!validatedArgs.force;

    // Resolve all targets to prompts first
    const prompts = [];
    for (const target of validatedArgs.targets) {
      const prompt = yield* storage
        .getById(target)
        .pipe(Effect.catchTag("PromptNotFoundError", () => storage.getByName(target)));
      prompts.push(prompt);
    }

    // Confirmation (unless --yes)
    if (!validatedArgs.yes) {
      const action = hard ? "permanently delete" : "archive";
      const names = prompts.map((p) => p.name).join(", ");
      console.log(`About to ${action}: ${names}`);

      const confirmed = yield* askConfirmation("Continue? [y/N] ");
      if (!confirmed) {
        console.log("Cancelled.");
        return;
      }
    }

    // Delete each prompt
    for (const prompt of prompts) {
      yield* storage.delete(prompt.id, hard);
      const action = hard ? "Deleted" : "Archived";
      console.log(`${action}: ${prompt.name}`);
    }
  });

/**
 * Ask for user confirmation with guaranteed readline cleanup.
 * Uses Effect.acquireUseRelease to ensure interface is closed on
 * completion, error, or interruption.
 */
const askConfirmation = (question: string): Effect.Effect<boolean> =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
    ),
    (rl) =>
      Effect.async<boolean>((resume) => {
        rl.question(question, (answer) => {
          resume(Effect.succeed(answer.toLowerCase() === "y"));
        });
      }),
    (rl) => Effect.sync(() => rl.close())
  );
