/**
 * Search Service - Full-text search using SQLite FTS5
 */

import { Context, Effect, Layer } from "effect";
import { SqlService } from "./sql-service";
import { PromptStorageService } from "./prompt-storage-service";
import type { Prompt } from "../models";
import { SqlError, StorageError } from "../models";

/**
 * Range representing highlighted text position
 */
export interface Range {
  start: number;
  end: number;
}

/**
 * Search result with prompt, snippet, ranking, and highlights
 */
export interface SearchResult {
  prompt: Prompt;
  snippet: string;
  rank: number;
  highlights: Range[];
}

/**
 * Search options for querying prompts
 */
export interface SearchOptions {
  query: string;
  tags?: string[];
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  fuzzy?: boolean;
}

/**
 * Row structure returned from FTS5 query
 */
interface FtsRow {
  id: string;
  name: string;
  tags: string | null;
  created: string;
  updated: string;
  version: number | null;
  isTemplate: number | null;
  content: string;
  filePath: string | null;
  snippet: string;
  rank: number;
}

/**
 * Search service interface - manages full-text search operations
 */
interface SearchServiceImpl {
  /**
   * Search for prompts using FTS5
   * @param options - Search options including query, filters, and limits
   * @returns Effect that succeeds with array of search results or fails with SqlError
   */
  readonly search: (options: SearchOptions) => Effect.Effect<SearchResult[], SqlError, never>;

  /**
   * Get autocomplete suggestions based on prefix
   * @param prefix - Text prefix to match
   * @returns Effect that succeeds with array of suggestions or fails with SqlError
   */
  readonly suggest: (prefix: string) => Effect.Effect<string[], SqlError, never>;

  /**
   * Update the search index for a specific prompt
   * @param promptId - ID of the prompt to update
   * @param name - Prompt name
   * @param content - Prompt content
   * @param tags - Prompt tags
   * @returns Effect that succeeds with void or fails with SqlError
   */
  readonly updateIndex: (
    promptId: string,
    name: string,
    content: string,
    tags: string[]
  ) => Effect.Effect<void, SqlError, never>;

  /**
   * Rebuild the entire search index from prompts
   * @returns Effect that succeeds with void or fails with SqlError
   */
  readonly rebuildIndex: () => Effect.Effect<void, SqlError, never>;
}

/**
 * Search service tag
 */
export class SearchService extends Context.Tag("SearchService")<
  SearchService,
  SearchServiceImpl
>() {}

/**
 * Parse highlight markers from snippet to create Range array
 * @param snippet - Snippet with <mark> tags
 * @returns Array of highlight ranges
 */
const parseHighlights = (snippet: string): Range[] => {
  const ranges: Range[] = [];
  const markStart = "<mark>";
  const markEnd = "</mark>";

  let offset = 0;
  let cleanPosition = 0;
  let searchFrom = 0;

  while (true) {
    const startIdx = snippet.indexOf(markStart, searchFrom);
    if (startIdx === -1) break;

    const endIdx = snippet.indexOf(markEnd, startIdx + markStart.length);
    if (endIdx === -1) break;

    // Account for text before this marker
    const textBefore = snippet.slice(searchFrom, startIdx);
    cleanPosition += textBefore.length;

    // Calculate the actual content between markers
    const markedContent = snippet.slice(startIdx + markStart.length, endIdx);
    const start = cleanPosition;
    const end = cleanPosition + markedContent.length;

    ranges.push({ start, end });

    cleanPosition += markedContent.length;
    searchFrom = endIdx + markEnd.length;
  }

  return ranges;
};

/**
 * Remove highlight markers from snippet
 * @param snippet - Snippet with <mark> tags
 * @returns Clean snippet without markers
 */
const cleanSnippet = (snippet: string): string => {
  return snippet.replace(/<mark>/g, "").replace(/<\/mark>/g, "");
};

/**
 * Sanitize user input for FTS5 query
 * Removes or escapes characters that cause FTS5 syntax errors
 * @param query - Raw user input
 * @returns Sanitized query safe for FTS5
 */
export const sanitizeFtsQuery = (query: string): string => {
  // Remove FTS5 special characters that break syntax
  // These include: " * + - ( ) [ ] { } : ^
  return query
    .replace(/[[\]{}()":*+\-^\\]/g, " ") // Replace dangerous chars with space
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
};

/**
 * Build FTS5 query from search options
 * @param options - Search options
 * @returns FTS5 query string
 */
const buildFtsQuery = (options: SearchOptions): string => {
  // Sanitize user input first
  let query = sanitizeFtsQuery(options.query);

  // Return empty if sanitization removed everything
  if (!query) {
    return "";
  }

  // Add fuzzy matching if requested (using OR with prefix match)
  if (options.fuzzy) {
    const tokens = query.split(/\s+/).filter((t) => t.length > 0);
    if (tokens.length === 0) {
      return "";
    }
    const fuzzyTokens = tokens.map((token) => `${token}*`);
    query = fuzzyTokens.join(" OR ");
  }

  // Add tag filtering if provided
  if (options.tags && options.tags.length > 0) {
    const tagQueries = options.tags.map((tag) => `tags:${sanitizeFtsQuery(tag)}`);
    query = `(${query}) AND (${tagQueries.join(" OR ")})`;
  }

  return query;
};

/**
 * Convert FtsRow to Prompt
 * @param row - Row from database
 * @returns Prompt object
 */
const rowToPrompt = (row: FtsRow): Prompt => {
  return {
    id: row.id,
    name: row.name,
    tags: row.tags ? row.tags.split(",") : undefined,
    created: new Date(row.created),
    updated: new Date(row.updated),
    version: row.version ?? undefined,
    isTemplate: row.isTemplate === 1 ? true : row.isTemplate === 0 ? false : undefined,
    content: row.content,
    filePath: row.filePath ?? undefined,
  };
};

/**
 * Row structure returned from FTS5 query for prompts table
 */
interface PromptDbRow {
  id: string;
  name: string;
  content_hash: string;
  file_path: string;
  created_at: string;
  updated_at: string;
  is_template: number;
  version: number;
  is_favorite?: number;
  favorite_order?: number;
  is_pinned?: number;
  pin_order?: number;
}

/**
 * Search service implementation
 */
export const SearchServiceLive = Layer.effect(
  SearchService,
  Effect.gen(function* () {
    const sql = yield* SqlService;
    const storage = yield* PromptStorageService;

    // FTS5 table is created by migration service (version 8)
    // No initialization needed here

    return SearchService.of({
      search: (options: SearchOptions) =>
        Effect.gen(function* () {
          const ftsQuery = buildFtsQuery(options);

          // Return empty results if query is empty after sanitization
          if (!ftsQuery) {
            return [];
          }

          const limit = options.limit ?? 50;

          // Build base SQL query
          // FTS5 schema: prompt_id UNINDEXED, name (1), content (2), tags (3)
          let sqlQuery = `
            SELECT
              p.id, p.name, p.file_path as filePath, p.created_at as created,
              p.updated_at as updated, p.version, p.is_template as isTemplate,
              fts.content,
              (SELECT GROUP_CONCAT(t.name) FROM tags t
               JOIN prompt_tags pt ON t.id = pt.tag_id
               WHERE pt.prompt_id = p.id) as tags,
              snippet(prompts_fts, 2, '<mark>', '</mark>', '...', 64) as snippet,
              bm25(prompts_fts) as rank
            FROM prompts_fts fts
            JOIN prompts p ON fts.prompt_id = p.id
            WHERE prompts_fts MATCH ?
          `;

          const params: (string | number)[] = [ftsQuery];

          // Add date filtering
          if (options.fromDate) {
            sqlQuery += ` AND datetime(p.created_at) >= datetime(?)`;
            params.push(options.fromDate.toISOString());
          }

          if (options.toDate) {
            sqlQuery += ` AND datetime(p.created_at) <= datetime(?)`;
            params.push(options.toDate.toISOString());
          }

          sqlQuery += `
            ORDER BY rank
            LIMIT ?
          `;
          params.push(limit);

          // Execute query
          const rows = yield* sql.query<FtsRow>(sqlQuery, params);

          // Convert rows to search results
          const results: SearchResult[] = rows.map((row) => ({
            prompt: rowToPrompt(row),
            snippet: cleanSnippet(row.snippet),
            rank: row.rank,
            highlights: parseHighlights(row.snippet),
          }));

          return results;
        }),

      suggest: (prefix: string) =>
        Effect.gen(function* () {
          const sanitized = sanitizeFtsQuery(prefix);
          if (sanitized.length === 0) {
            return [];
          }

          // Search for names and content starting with prefix
          const query = `${sanitized}*`;

          const sqlQuery = `
            SELECT DISTINCT fts.name
            FROM prompts_fts fts
            WHERE prompts_fts MATCH ?
            ORDER BY bm25(prompts_fts)
            LIMIT 10
          `;

          const rows = yield* sql.query<{ name: string }>(sqlQuery, [query]);

          return rows.map((row) => row.name);
        }),

      updateIndex: (promptId: string, name: string, content: string, tags: string[]) =>
        Effect.gen(function* () {
          const tagsStr = tags.length > 0 ? tags.join(",") : "";

          // Delete existing entry if it exists
          yield* sql.run(`DELETE FROM prompts_fts WHERE prompt_id = ?`, [promptId]);

          // Insert new entry into FTS index
          yield* sql.run(
            `INSERT INTO prompts_fts (prompt_id, name, content, tags) VALUES (?, ?, ?, ?)`,
            [promptId, name, content, tagsStr]
          );
        }),

      rebuildIndex: () =>
        Effect.gen(function* () {
          // Clear existing FTS index
          yield* sql.run(`DELETE FROM prompts_fts`);

          // Get all prompt files
          const promptFiles = yield* storage.listPrompts().pipe(
            Effect.mapError((error) =>
              new SqlError({
                message: "Failed to list prompts",
                cause: error,
              })
            )
          );

          // Index each prompt
          for (const filePath of promptFiles) {
            const parsed = yield* storage.readPrompt(filePath).pipe(
              Effect.mapError((error) =>
                new SqlError({
                  message: "Failed to read prompt",
                  cause: error,
                })
              )
            );
            const { frontmatter, content } = parsed;

            const tagsStr =
              frontmatter.tags && frontmatter.tags.length > 0
                ? frontmatter.tags.join(",")
                : "";

            // Insert into FTS index
            yield* sql.run(
              `INSERT INTO prompts_fts (prompt_id, name, content, tags) VALUES (?, ?, ?, ?)`,
              [frontmatter.id, frontmatter.name, content, tagsStr]
            );
          }
        }),
    });
  })
);
