/**
 * Search Command - Search prompts with result highlighting
 */

import { Effect } from "effect";
import { SearchService, type SearchOptions, type SearchResult } from "../services/search-service";
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
    const tagsDisplay = prompt.tags && prompt.tags.length > 0
      ? ` \x1b[33m(${prompt.tags.join(", ")})\x1b[0m`
      : "";

    // Display result number and name
    console.log(`[\x1b[36m${index + 1}\x1b[0m] \x1b[1m${prompt.name}\x1b[0m${tagsDisplay}`);

    // Display snippet with highlights
    const highlightedSnippet = applyHighlights(snippet, highlights);
    console.log(`    ${highlightedSnippet}\n`);
  });
};

/**
 * Parse date string in YYYY-MM-DD format
 * @param dateStr - Date string to parse
 * @returns Date object or undefined if invalid
 */
const parseDate = (dateStr: string): Date | undefined => {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;

  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);

  // Validate date
  if (isNaN(date.getTime())) return undefined;

  return date;
};

/**
 * Search command handler
 * @param args - Parsed command-line arguments
 * @returns Effect that performs the search
 */
export const searchCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const search = yield* SearchService;

    // Get query from positional args
    const query = args.positional[0];
    if (!query) {
      console.error("Error: Search query is required");
      console.log("\nUsage: grimoire search <query> [options]");
      console.log("\nOptions:");
      console.log("  --tags, -t <tags>    Filter by tags (comma-separated)");
      console.log("  --from <date>        Date from (YYYY-MM-DD)");
      console.log("  --to <date>          Date to (YYYY-MM-DD)");
      console.log("  --limit <n>          Max results (default: 20)");
      console.log("  --fuzzy              Enable fuzzy matching");
      console.log("  -i                   Interactive mode (not yet implemented)");
      return;
    }

    // Build search options from flags
    const options: SearchOptions = {
      query,
    };

    // Parse tags
    const tagsFlag = args.flags["tags"] || args.flags["t"];
    if (typeof tagsFlag === "string") {
      options.tags = tagsFlag.split(",").map((t) => t.trim()).filter(Boolean);
    }

    // Parse from date
    const fromFlag = args.flags["from"];
    if (typeof fromFlag === "string") {
      const fromDate = parseDate(fromFlag);
      if (!fromDate) {
        console.error(`Error: Invalid --from date format. Use YYYY-MM-DD`);
        return;
      }
      options.fromDate = fromDate;
    }

    // Parse to date
    const toFlag = args.flags["to"];
    if (typeof toFlag === "string") {
      const toDate = parseDate(toFlag);
      if (!toDate) {
        console.error(`Error: Invalid --to date format. Use YYYY-MM-DD`);
        return;
      }
      options.toDate = toDate;
    }

    // Parse limit
    const limitFlag = args.flags["limit"];
    if (typeof limitFlag === "string") {
      const limit = parseInt(limitFlag, 10);
      if (isNaN(limit) || limit < 1) {
        console.error(`Error: Invalid --limit value. Must be a positive number`);
        return;
      }
      options.limit = limit;
    } else if (typeof limitFlag === "number") {
      options.limit = limitFlag;
    } else {
      options.limit = 20; // Default limit
    }

    // Parse fuzzy flag
    if (args.flags["fuzzy"]) {
      options.fuzzy = true;
    }

    // Interactive mode stub
    if (args.flags["i"] || args.flags["interactive"]) {
      console.log("Interactive mode is not yet implemented");
      return;
    }

    // Execute search
    const results = yield* search.search(options);

    // Format and display results
    formatResults(results, query);
  });
