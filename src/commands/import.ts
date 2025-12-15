/**
 * Import Command - Import prompts from files or URLs
 */

import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { ImportService, type ConflictStrategy } from "../services/import-service";
import { ImportCommandArgsSchema, ValidationError } from "../models";
import type { ParsedArgs } from "../cli/parser";

/**
 * Format import preview for display
 */
const formatPreview = (
  total: number,
  newPrompts: number,
  conflicts: { name: string; contentDiffers: boolean }[]
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
 * Parse raw CLI args into structured format for schema validation
 */
const parseImportArgs = (args: ParsedArgs) => {
  const onConflictFlag = args.flags["on-conflict"];

  return {
    source: args.positional[0],
    onConflict: typeof onConflictFlag === "string" ? onConflictFlag.toLowerCase() : undefined,
    dryRun: args.flags["dry-run"] === true ? true : undefined,
  };
};

/**
 * Import command handler
 * @param args - Parsed command-line arguments
 * @returns Effect that performs the import
 */
export const importCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const importService = yield* ImportService;

    // Validate arguments with schema
    const rawArgs = parseImportArgs(args);
    const validatedArgs = yield* Schema.decodeUnknown(ImportCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire import <source> [--on-conflict <skip|rename|overwrite>] [--dry-run]`,
        });
      })
    );

    // Get validated values
    const strategy: ConflictStrategy = validatedArgs.onConflict ?? "skip";

    // Handle dry-run mode
    if (validatedArgs.dryRun) {
      const preview = yield* importService.preview(validatedArgs.source);

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
    const result = yield* importService.import(validatedArgs.source, strategy);
    formatResult(
      result.imported,
      result.skipped,
      result.renamed,
      result.overwritten,
      result.errors
    );
  });
