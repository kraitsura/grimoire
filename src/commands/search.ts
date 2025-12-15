/**
 * Search Command - Search prompts with result highlighting
 */

import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { SearchService, type SearchOptions, type SearchResult } from "../services/search-service";
import { SearchCommandArgsSchema, ValidationError } from "../models";
import type { ParsedArgs } from "../cli/parser";

/**
 * Apply ANSI highlighting to text based on highlight ranges
 * @param text - Text to highlight
 * @param highlights - Ranges to highlight
 * @returns Text with ANSI codes for highlighted terms
 */
const applyHighlights = (text: string, highlights: { start: number; end: number }[]): string => {
  if (highlights.length === 0) return text;

  // Sort highlights by start position
  const sorted = [...highlights].sort((a, b) => a.start - b.start);

  let result = "";
  let lastIndex = 0;

  for (const { start, end } of sorted) {
    // Add text before highlight
    result += text.slice(lastIndex, start);
    // Add highlighted text
    result += `\x1b[1m${text.slice(start, end)}\x1b[0m`;
    lastIndex = end;
  }

  // Add remaining text
  result += text.slice(lastIndex);

  return result;
};

/**
 * Format search results for display
 * @param results - Search results to format
 * @param query - Original search query
 */
const formatResults = (results: SearchResult[], query: string): void => {
  if (results.length === 0) {
    console.log(`No results found for "${query}"`);
    return;
  }

  console.log(`Found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}"\n`);

  results.forEach((result, index) => {
    const { prompt, snippet, highlights } = result;

    // Format tags
    const tagsDisplay =
      prompt.tags && prompt.tags.length > 0 ? ` \x1b[33m(${prompt.tags.join(", ")})\x1b[0m` : "";

    // Display result number and name
    console.log(`[\x1b[36m${index + 1}\x1b[0m] \x1b[1m${prompt.name}\x1b[0m${tagsDisplay}`);

    // Display snippet with highlights
    const highlightedSnippet = applyHighlights(snippet, highlights);
    console.log(`    ${highlightedSnippet}\n`);
  });
};

/**
 * Parse raw CLI args into structured format for schema validation
 */
const parseSearchArgs = (args: ParsedArgs) => {
  const tagsFlag = args.flags.tags || args.flags.t;
  const fromFlag = args.flags.from;
  const toFlag = args.flags.to;
  const limitFlag = args.flags.limit;

  return {
    query: args.positional[0],
    tags:
      typeof tagsFlag === "string"
        ? tagsFlag
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
    from: typeof fromFlag === "string" ? fromFlag : undefined,
    to: typeof toFlag === "string" ? toFlag : undefined,
    limit:
      typeof limitFlag === "string"
        ? parseInt(limitFlag, 10)
        : typeof limitFlag === "number"
          ? limitFlag
          : undefined,
  };
};

/**
 * Search command handler
 * @param args - Parsed command-line arguments
 * @returns Effect that performs the search
 */
export const searchCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const search = yield* SearchService;

    // Validate arguments with schema
    const rawArgs = parseSearchArgs(args);
    const validatedArgs = yield* Schema.decodeUnknown(SearchCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire search <query> [--tags|-t <tags>] [--from <date>] [--to <date>] [--limit <n>]`,
        });
      })
    );

    // Build search options from validated args
    const options: SearchOptions = {
      query: validatedArgs.query,
      tags: validatedArgs.tags ? [...validatedArgs.tags] : undefined,
      fromDate: validatedArgs.from,
      toDate: validatedArgs.to,
      limit: validatedArgs.limit ?? 20,
    };

    // Parse fuzzy flag (not in schema, handle separately)
    if (args.flags.fuzzy) {
      options.fuzzy = true;
    }

    // Interactive mode stub
    if (args.flags.i || args.flags.interactive) {
      console.log("Interactive mode is not yet implemented");
      return;
    }

    // Execute search
    const results = yield* search.search(options);

    // Format and display results
    formatResults(results, validatedArgs.query);
  });
