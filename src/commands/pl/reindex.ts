/**
 * Reindex Command - Rebuild the FTS search index
 */

import { Effect } from "effect";
import { SearchService } from "../../services";
import type { ParsedArgs } from "../../cli/parser";

/**
 * Reindex command handler
 *
 * Rebuilds the full-text search index from all prompt files.
 * Use this after migration or if search results seem incomplete.
 */
export const reindexCommand = (_args: ParsedArgs) =>
  Effect.gen(function* () {
    console.log("Rebuilding search index...");

    const search = yield* SearchService;
    yield* search.rebuildIndex();

    console.log("Search index rebuilt successfully.");
  });
