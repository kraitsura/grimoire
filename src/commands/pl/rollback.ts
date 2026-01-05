/**
 * Rollback Command - Restore a prompt to a previous version
 */

import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { StorageService, VersionService } from "../../services";
import { RollbackCommandArgsSchema, ValidationError } from "../../models";
import type { ParsedArgs } from "../../cli/parser";
import * as readline from "node:readline";

/**
 * Parse raw CLI args into structured format for schema validation
 */
const parseRollbackArgs = (args: ParsedArgs) => {
  const versionStr = args.positional[1];
  const reasonFlag = args.flags.reason;

  return {
    promptName: args.positional[0],
    version: versionStr ? parseInt(versionStr, 10) : undefined,
    reason: typeof reasonFlag === "string" ? reasonFlag : undefined,
    preview: args.flags.preview === true ? true : undefined,
    backup: args.flags.backup === false ? false : undefined, // default true, only set if explicitly false
    force: args.flags.force === true ? true : undefined,
  };
};

/**
 * Rollback command handler
 *
 * Usage:
 *   grimoire rollback <prompt-name> <version>
 *   grimoire rollback <prompt-name> <version> --preview      Show changes without applying
 *   grimoire rollback <prompt-name> <version> --backup       Create backup before rollback (default: true)
 *   grimoire rollback <prompt-name> <version> --reason       Reason for rollback
 *   grimoire rollback <prompt-name> <version> --force        Skip confirmation
 *   grimoire rollback <prompt-name> <version> -i             Interactive version selection (stub for now)
 *
 * Behavior:
 * 1. Find prompt and target version
 * 2. Show diff between current and target
 * 3. Confirm rollback (unless --force)
 * 4. Create backup version with reason "Pre-rollback backup"
 * 5. Restore content from target version
 * 6. Create new version with reason "Rollback to v{N}"
 */
export const rollbackCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const versionService = yield* VersionService;

    // Validate arguments with schema
    const rawArgs = parseRollbackArgs(args);
    const validatedArgs = yield* Schema.decodeUnknown(RollbackCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire rollback <prompt-name> <version> [--preview] [--backup] [--reason <reason>] [--force]`,
        });
      })
    );

    const interactiveFlag = args.flags.interactive || args.flags.i;

    // Interactive mode stub
    if (interactiveFlag) {
      console.log("Interactive version selection is not yet implemented.");
      return;
    }

    // Get the prompt by name
    const prompt = yield* storage.getByName(validatedArgs.promptName);

    // Get current head version
    const currentVersion = yield* versionService.getHead(prompt.id);

    // Check if already at target version
    if (currentVersion.version === validatedArgs.version) {
      console.log(`Already at version ${validatedArgs.version}`);
      return;
    }

    // Get target version
    const targetVersionData = yield* versionService.getVersion(prompt.id, validatedArgs.version);

    // Compute diff
    const diff = yield* versionService.diff(
      prompt.id,
      currentVersion.version,
      validatedArgs.version
    );

    // Display preview
    console.log(`\nRolling back ${validatedArgs.promptName} to v${validatedArgs.version}\n`);
    console.log("Changes:");
    if (diff.changes) {
      console.log(diff.changes);
    } else {
      console.log("(no changes)");
    }
    console.log(`\nLine changes: -${diff.deletions} +${diff.additions}\n`);

    // If preview mode, stop here
    if (validatedArgs.preview) {
      console.log("Use --force to apply, or confirm below.");
      return;
    }

    // Confirm rollback (unless --force)
    if (!validatedArgs.force) {
      const confirmed = yield* askConfirmation("Apply rollback? [y/N] ");
      if (!confirmed) {
        console.log("Cancelled.");
        return;
      }
    }

    // If backup requested (default true), create a pre-rollback backup version
    const shouldBackup = validatedArgs.backup !== false;
    if (shouldBackup) {
      yield* versionService.createVersion({
        promptId: prompt.id,
        content: currentVersion.content,
        frontmatter: currentVersion.frontmatter,
        changeReason: "Pre-rollback backup",
      });
    }

    // Rollback to target version - this creates a new version with the restored content
    const newVersion = yield* versionService.rollback(
      prompt.id,
      validatedArgs.version,
      { createBackup: true } // Always create rollback version
    );

    // Update the prompt content in storage to match the rolled-back version
    yield* storage.update(prompt.id, {
      content: targetVersionData.content,
    });

    console.log(`\nRollback complete: ${validatedArgs.promptName} -> v${newVersion.version}`);
    if (validatedArgs.reason) {
      console.log(`Reason: ${validatedArgs.reason}`);
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
