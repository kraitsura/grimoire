/**
 * rm command - Delete or archive prompts
 *
 * Supports soft delete (archive) by default and hard delete with --force flag.
 */

import { Effect } from "effect";
import { StorageService } from "../services";
import type { ParsedArgs } from "../cli/parser";
import * as readline from "node:readline";

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

    const targets = args.positional;
    if (targets.length === 0) {
      console.log("Usage: grimoire rm <name-or-id...> [--force|-f] [--yes|-y]");
      return;
    }

    const forceFlag = args.flags["force"] || args.flags["f"];
    const yesFlag = args.flags["yes"] || args.flags["y"];
    const hard = !!forceFlag;

    // Resolve all targets to prompts first
    const prompts = [];
    for (const target of targets) {
      const prompt = yield* storage.getById(target).pipe(
        Effect.catchTag("PromptNotFoundError", () => storage.getByName(target))
      );
      prompts.push(prompt);
    }

    // Confirmation (unless --yes)
    if (!yesFlag) {
      const action = hard ? "permanently delete" : "archive";
      const names = prompts.map((p) => p.name).join(", ");
      console.log(`About to ${action}: ${names}`);

      const confirmed = yield* Effect.promise(() =>
        askConfirmation("Continue? [y/N] ")
      );
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
 * Ask for user confirmation
 *
 * @param question - The question to ask the user
 * @returns Promise that resolves to true if user confirmed (y), false otherwise
 */
function askConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}
