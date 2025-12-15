import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { ExportService } from "../services/export-service";
import { ExportCommandArgsSchema, ValidationError } from "../models";
import type { ParsedArgs } from "../cli/parser";
import type { ExportOptions } from "../services/export-service";

/**
 * Parse raw CLI args into structured format for schema validation
 */
const parseExportArgs = (args: ParsedArgs) => {
  const formatFlag = args.flags.format || args.flags.f;
  const outputFlag = args.flags.output || args.flags.o;
  const tagsFlag = args.flags.tags;

  return {
    format: typeof formatFlag === "string" ? formatFlag.toLowerCase() : undefined,
    tags:
      typeof tagsFlag === "string"
        ? tagsFlag
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
    output: typeof outputFlag === "string" ? outputFlag : undefined,
    all: args.flags.all === true ? true : undefined,
  };
};

export const exportCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const exportService = yield* ExportService;

    // Validate arguments with schema
    const rawArgs = parseExportArgs(args);
    const validatedArgs = yield* Schema.decodeUnknown(ExportCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire export [--format|-f <json|yaml>] [--tags <tags>] [--output|-o <file>]`,
        });
      })
    );

    // Parse additional flags not in schema
    const includeHistoryFlag = args.flags["include-history"] || false;
    const prettyFlag = args.flags.pretty;

    // Build export options
    const options: ExportOptions = {
      format: validatedArgs.format ?? "json",
      includeHistory: Boolean(includeHistoryFlag),
      prettyPrint: prettyFlag === undefined ? true : Boolean(prettyFlag),
    };

    // Determine if filtering by tags
    let content: string;
    if (validatedArgs.tags && validatedArgs.tags.length > 0) {
      content = yield* exportService.exportByTags([...validatedArgs.tags], options);
    } else {
      content = yield* exportService.exportAll(options);
    }

    // Determine output destination
    if (validatedArgs.output === "-" || validatedArgs.output === undefined) {
      // Output to stdout
      console.log(content);
    } else {
      // Write to file
      yield* exportService.writeToFile(content, validatedArgs.output);
      console.log(`Exported to ${validatedArgs.output}`);
    }
  });
