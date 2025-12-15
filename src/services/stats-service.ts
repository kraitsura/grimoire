/**
 * Stats Service - Usage analytics and statistics tracking
 *
 * Tracks prompt usage actions (copy, test, view, edit) and provides
 * analytics on individual prompts and the entire collection.
 */

import { Context, Effect, Layer } from "effect";
import { SqlService } from "./sql-service";
import { PromptStorageService } from "./prompt-storage-service";
import { SqlError, StorageError } from "../models";

/**
 * Usage action types
 */
export type UsageAction = "copy" | "test" | "view" | "edit";

/**
 * Statistics for a single prompt
 */
export interface PromptStats {
  characterCount: number;
  wordCount: number;
  lineCount: number;
  copyCount: number;
  testCount: number;
  viewCount: number;
  editCount: number;
  lastUsed: Date | null;
}

/**
 * Statistics for the entire collection
 */
export interface CollectionStats {
  totalPrompts: number;
  totalTemplates: number;
  tagDistribution: Record<string, number>;
  mostUsed: Array<{ promptId: string; name: string; count: number }>;
  recentlyEdited: Array<{ promptId: string; name: string; editedAt: Date }>;
}

/**
 * Database row structure for usage logs
 */
interface UsageLogRow {
  id: number;
  prompt_id: string;
  action: string;
  timestamp: string;
}

/**
 * Database row structure for usage counts
 */
interface UsageCountRow {
  action: string;
  count: number;
}

/**
 * Database row structure for last usage
 */
interface LastUsageRow {
  timestamp: string;
}

/**
 * Database row structure for prompts table
 */
interface PromptRow {
  id: string;
  name: string;
  is_template: number;
  file_path: string;
}

/**
 * Database row structure for tag distribution
 */
interface TagDistributionRow {
  name: string;
  count: number;
}

/**
 * Database row structure for most used prompts
 */
interface MostUsedRow {
  prompt_id: string;
  name: string;
  count: number;
}

/**
 * Database row structure for recently edited prompts
 */
interface RecentlyEditedRow {
  prompt_id: string;
  name: string;
  updated_at: string;
}

/**
 * Stats service interface - manages usage tracking and analytics
 */
interface StatsServiceImpl {
  /**
   * Get statistics for a specific prompt
   * Includes text metrics (character, word, line counts) and usage counts
   */
  readonly getPromptStats: (
    promptId: string
  ) => Effect.Effect<PromptStats, SqlError | StorageError>;

  /**
   * Get aggregate statistics across the entire collection
   * Includes totals, tag distribution, and usage patterns
   */
  readonly getCollectionStats: () => Effect.Effect<CollectionStats, SqlError>;

  /**
   * Record a usage action for a prompt
   * Creates a log entry in the usage_logs table
   */
  readonly recordUsage: (
    promptId: string,
    action: UsageAction
  ) => Effect.Effect<void, SqlError>;
}

/**
 * Stats service tag
 */
export class StatsService extends Context.Tag("StatsService")<
  StatsService,
  StatsServiceImpl
>() {}

/**
 * Calculate word count from text
 * Uses whitespace and punctuation as word boundaries
 */
const countWords = (text: string): number => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
};

/**
 * Calculate line count from text
 * Counts newline characters + 1 for the last line
 */
const countLines = (text: string): number => {
  if (text.length === 0) return 0;
  return text.split("\n").length;
};

/**
 * Stats service implementation
 */
export const StatsServiceLive = Layer.effect(
  StatsService,
  Effect.gen(function* () {
    // Get service dependencies
    const sql = yield* SqlService;
    const promptStorage = yield* PromptStorageService;

    return StatsService.of({
      recordUsage: (promptId: string, action: UsageAction) =>
        Effect.gen(function* () {
          // Insert log entry
          yield* sql.run(
            "INSERT INTO usage_logs (prompt_id, action) VALUES (?, ?)",
            [promptId, action]
          );
        }),

      getPromptStats: (promptId: string) =>
        Effect.gen(function* () {
          // Get prompt file path from database
          const promptRows = yield* sql.query<PromptRow>(
            "SELECT file_path FROM prompts WHERE id = ?",
            [promptId]
          );

          // Read content from file
          let content = "";
          if (promptRows.length > 0) {
            const parsed = yield* promptStorage.readPrompt(
              promptRows[0].file_path
            );
            content = parsed.content;
          }

          // Calculate text statistics
          const characterCount = content.length;
          const wordCount = countWords(content);
          const lineCount = countLines(content);

          // Get usage counts by action type
          const usageCounts = yield* sql.query<UsageCountRow>(
            `SELECT action, COUNT(*) as count
             FROM usage_logs
             WHERE prompt_id = ?
             GROUP BY action`,
            [promptId]
          );

          // Build count map
          const countMap: Record<string, number> = {
            copy: 0,
            test: 0,
            view: 0,
            edit: 0,
          };

          for (const row of usageCounts) {
            countMap[row.action] = row.count;
          }

          // Get last usage timestamp
          const lastUsageRows = yield* sql.query<LastUsageRow>(
            `SELECT timestamp
             FROM usage_logs
             WHERE prompt_id = ?
             ORDER BY timestamp DESC
             LIMIT 1`,
            [promptId]
          );

          const lastUsed =
            lastUsageRows.length > 0
              ? new Date(lastUsageRows[0].timestamp)
              : null;

          return {
            characterCount,
            wordCount,
            lineCount,
            copyCount: countMap.copy,
            testCount: countMap.test,
            viewCount: countMap.view,
            editCount: countMap.edit,
            lastUsed,
          };
        }),

      getCollectionStats: () =>
        Effect.gen(function* () {
          // Get total prompts and templates count
          const totalRows = yield* sql.query<{
            total: number;
            templates: number;
          }>(
            `SELECT
               COUNT(*) as total,
               SUM(CASE WHEN is_template = 1 THEN 1 ELSE 0 END) as templates
             FROM prompts`
          );

          const totalPrompts = totalRows[0]?.total ?? 0;
          const totalTemplates = totalRows[0]?.templates ?? 0;

          // Get tag distribution
          const tagRows = yield* sql.query<TagDistributionRow>(
            `SELECT t.name, COUNT(pt.prompt_id) as count
             FROM tags t
             LEFT JOIN prompt_tags pt ON t.id = pt.tag_id
             GROUP BY t.id, t.name
             ORDER BY count DESC`
          );

          const tagDistribution: Record<string, number> = {};
          for (const row of tagRows) {
            tagDistribution[row.name] = row.count;
          }

          // Get most used prompts (top 10 by total usage count)
          const mostUsedRows = yield* sql.query<MostUsedRow>(
            `SELECT
               ul.prompt_id,
               p.name,
               COUNT(*) as count
             FROM usage_logs ul
             JOIN prompts p ON ul.prompt_id = p.id
             GROUP BY ul.prompt_id, p.name
             ORDER BY count DESC
             LIMIT 10`
          );

          const mostUsed = mostUsedRows.map((row) => ({
            promptId: row.prompt_id,
            name: row.name,
            count: row.count,
          }));

          // Get recently edited prompts (top 10 by update time)
          const recentlyEditedRows = yield* sql.query<RecentlyEditedRow>(
            `SELECT id as prompt_id, name, updated_at
             FROM prompts
             ORDER BY updated_at DESC
             LIMIT 10`
          );

          const recentlyEdited = recentlyEditedRows.map((row) => ({
            promptId: row.prompt_id,
            name: row.name,
            editedAt: new Date(row.updated_at),
          }));

          return {
            totalPrompts,
            totalTemplates,
            tagDistribution,
            mostUsed,
            recentlyEdited,
          };
        }),
    });
  })
);
