/**
 * Rollback Command - Restore a prompt to a previous version
 */

import { Effect } from "effect";
import { StorageService, VersionService } from "../services";
import type { ParsedArgs } from "../cli/parser";
import * as readline from "node:readline";

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

    const promptName = args.positional[0];
    const versionStr = args.positional[1];

    if (!promptName || !versionStr) {
      console.log("Usage: grimoire rollback <prompt-name> <version> [--preview] [--backup] [--reason] [--force] [-i]");
      return;
    }

    const targetVersion = parseInt(versionStr, 10);
    if (isNaN(targetVersion) || targetVersion < 1) {
      console.log("Error: Version must be a positive integer");
      return;
    }

    const previewFlag = args.flags["preview"];
    const backupFlag = args.flags["backup"] !== false; // default true
    const reasonFlag = args.flags["reason"];
    const forceFlag = args.flags["force"];
    const interactiveFlag = args.flags["interactive"] || args.flags["i"];

    // Interactive mode stub
    if (interactiveFlag) {
      console.log("Interactive version selection is not yet implemented.");
      return;
    }

    // Get the prompt by name
    const prompt = yield* storage.getByName(promptName);

    // Get current head version
    const currentVersion = yield* versionService.getHead(prompt.id);

    // Check if already at target version
    if (currentVersion.version === targetVersion) {
      console.log(`Already at version ${targetVersion}`);
      return;
    }

    // Get target version
    const targetVersionData = yield* versionService.getVersion(
      prompt.id,
      targetVersion
    );

    // Compute diff
    const diff = yield* versionService.diff(
      prompt.id,
      currentVersion.version,
      targetVersion
    );

    // Display preview
    console.log(`\nRolling back ${promptName} to v${targetVersion}\n`);
    console.log("Changes:");
    if (diff.changes) {
      console.log(diff.changes);
    } else {
      console.log("(no changes)");
    }
    console.log(`\nLine changes: -${diff.deletions} +${diff.additions}\n`);

    // If preview mode, stop here
    if (previewFlag) {
      console.log("Use --force to apply, or confirm below.");
      return;
    }

    // Confirm rollback (unless --force)
    if (!forceFlag) {
      const confirmed = yield* Effect.promise(() =>
        askConfirmation("Apply rollback? [y/N] ")
      );
      if (!confirmed) {
        console.log("Cancelled.");
        return;
      }
    }

    // Perform rollback
    const customReason = typeof reasonFlag === "string" ? reasonFlag : undefined;

    // If backup requested, create a pre-rollback backup version
    if (backupFlag) {
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
      targetVersion,
      { createBackup: true } // Always create rollback version
    );

    // Update the prompt content in storage to match the rolled-back version
    yield* storage.update(prompt.id, {
      content: targetVersionData.content,
    });

    console.log(`\nRollback complete: ${promptName} → v${newVersion.version}`);
    if (customReason) {
      console.log(`Reason: ${customReason}`);
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
