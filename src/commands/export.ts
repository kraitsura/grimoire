import { Effect } from "effect";
import { ExportService } from "../services/export-service";
import type { ParsedArgs } from "../cli/parser";
import type { ExportOptions } from "../services/export-service";

export const exportCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const exportService = yield* ExportService;

    // Parse flags
    const formatFlag = args.flags["format"] || args.flags["f"] || "json";
    const outputFlag = args.flags["output"] || args.flags["o"];
    const tagsFlag = args.flags["tags"];
    const includeHistoryFlag = args.flags["include-history"] || false;
    const prettyFlag = args.flags["pretty"];

    // Validate format
    const format = String(formatFlag).toLowerCase();
    if (format !== "json" && format !== "yaml") {
      console.error(`Invalid format: ${format}. Must be 'json' or 'yaml'.`);
      process.exit(1);
    }

    // Build export options
    const options: ExportOptions = {
      format: format as "json" | "yaml",
      includeHistory: Boolean(includeHistoryFlag),
      prettyPrint: prettyFlag === undefined ? true : Boolean(prettyFlag),
    };

    // Determine if filtering by tags
    let content: string;
    if (typeof tagsFlag === "string") {
      const tags = tagsFlag.split(",").map((t) => t.trim()).filter(Boolean);
      if (tags.length === 0) {
        console.error("No valid tags provided.");
        process.exit(1);
      }
      content = yield* exportService.exportByTags(tags, options);
    } else {
      content = yield* exportService.exportAll(options);
    }

    // Determine output destination
    if (outputFlag === "-" || outputFlag === undefined) {
      // Output to stdout
      console.log(content);
    } else {
      // Write to file
      const outputPath = String(outputFlag);
      yield* exportService.writeToFile(content, outputPath);
      console.log(`Exported to ${outputPath}`);
    }
  });
