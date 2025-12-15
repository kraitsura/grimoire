/**
 * Import Command - Import prompts from files or URLs
 */

import { Effect } from "effect";
import { ImportService, type ConflictStrategy } from "../services/import-service";
import type { ParsedArgs } from "../cli/parser";

/**
 * Format import preview for display
 */
const formatPreview = (
  total: number,
  newPrompts: number,
  conflicts: Array<{ name: string; contentDiffers: boolean }>
): void => {
  console.log("\nImport Preview:");
  console.log(`  Total prompts: ${total}`);
  console.log(`  New: ${newPrompts}`);
  console.log(`  Conflicts: ${conflicts.length}`);

  if (conflicts.length > 0) {
    conflicts.forEach((conflict) => {
      const status = conflict.contentDiffers
        ? "(exists, different content)"
        : "(exists, same content)";
      console.log(`    - ${conflict.name} ${status}`);
    });

    console.log("\nUse --on-conflict=overwrite to replace existing prompts.");
    console.log("Use --on-conflict=rename to create copies with new names.");
  }
};

/**
 * Format import result for display
 */
const formatResult = (
  imported: number,
  skipped: number,
  renamed: number,
  overwritten: number,
  errors: string[]
): void => {
  console.log();

  if (imported > 0) {
    console.log(`\x1b[32mImported: ${imported} prompt${imported === 1 ? "" : "s"}\x1b[0m`);
  }

  if (skipped > 0) {
    console.log(`Skipped: ${skipped} (conflicts)`);
  }

  if (renamed > 0) {
    console.log(`Renamed: ${renamed} (to avoid conflicts)`);
  }

  if (overwritten > 0) {
    console.log(`Overwritten: ${overwritten} (existing prompts replaced)`);
  }

  if (errors.length > 0) {
    console.log(`\n\x1b[31mErrors:\x1b[0m`);
    errors.forEach((error) => {
      console.log(`  - ${error}`);
    });
  }

  if (skipped > 0) {
    console.log("\nUse --on-conflict=overwrite to replace existing prompts.");
    console.log("Use --on-conflict=rename to create copies with new names.");
  }
};

/**
 * Import command handler
 * @param args - Parsed command-line arguments
 * @returns Effect that performs the import
 */
export const importCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const importService = yield* ImportService;

    // Get source from positional args
    const source = args.positional[0];
    if (!source) {
      console.error("Error: Source file or URL is required");
      console.log("\nUsage: grimoire import <source> [options]");
      console.log("\nArguments:");
      console.log("  <source>              File path or URL to import from");
      console.log("\nOptions:");
      console.log("  --on-conflict <mode>  How to handle conflicts (skip|rename|overwrite)");
      console.log("                        Default: skip");
      console.log("  --dry-run             Preview without making changes");
      return;
    }

    // Parse flags
    const dryRun = args.flags["dry-run"] || false;
    const onConflictFlag = args.flags["on-conflict"];

    // Validate conflict strategy
    let strategy: ConflictStrategy = "skip";
    if (typeof onConflictFlag === "string") {
      const normalized = onConflictFlag.toLowerCase();
      if (normalized === "skip" || normalized === "rename" || normalized === "overwrite") {
        strategy = normalized;
      } else {
        console.error(`Error: Invalid --on-conflict value: ${onConflictFlag}`);
        console.log("Valid values: skip, rename, overwrite");
        return;
      }
    }

    // Handle dry-run mode
    if (dryRun) {
      const preview = yield* importService.preview(source);

      if (preview.errors.length > 0) {
        console.log(`\n\x1b[31mErrors:\x1b[0m`);
        preview.errors.forEach((error) => {
          console.log(`  - ${error}`);
        });
        return;
      }

      formatPreview(preview.total, preview.newPrompts, preview.conflicts);
      return;
    }

    // Perform actual import
    const result = yield* importService.import(source, strategy);
    formatResult(
      result.imported,
      result.skipped,
      result.renamed,
      result.overwritten,
      result.errors
    );
  });
