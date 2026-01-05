/**
 * Sync Service - Filesystem-database synchronization
 *
 * Keeps Markdown files in ~/.grimoire/prompts/ synchronized with the SQLite database.
 * Provides full sync, single file sync, and integrity checking capabilities.
 */

import { Context, Effect, Layer } from "effect";
import { StorageError, SqlError } from "../models";
import { SqlService } from "./sql-service";
import { PromptStorageService } from "./prompt-storage-service";
import { basename } from "node:path";

/**
 * Result of a full synchronization operation
 */
export interface SyncResult {
  filesScanned: number;
  filesUpdated: number;
  filesCreated: number;
  filesRemoved: number;
  errors: string[];
}

/**
 * Result of an integrity check operation
 */
export interface IntegrityResult {
  isValid: boolean;
  missingFiles: string[];
  orphanedDbRecords: string[];
  hashMismatches: string[];
}

/**
 * Sync service interface - manages filesystem-database synchronization
 */
interface SyncServiceImpl {
  /**
   * Perform a full synchronization between files and database
   * Scans all files in ~/.grimoire/prompts/ and ensures database is in sync
   */
  readonly fullSync: () => Effect.Effect<SyncResult, StorageError | SqlError>;

  /**
   * Synchronize a single file with the database
   * Reads the file, computes its hash, and updates/inserts the DB record
   */
  readonly syncFile: (path: string) => Effect.Effect<void, StorageError | SqlError>;

  /**
   * Check integrity between filesystem and database
   * Identifies mismatches, missing files, and orphaned DB records
   */
  readonly checkIntegrity: () => Effect.Effect<IntegrityResult, StorageError | SqlError>;
}

/**
 * Sync service tag
 */
export class SyncService extends Context.Tag("SyncService")<SyncService, SyncServiceImpl>() {}

/**
 * Database row structure for prompts table
 */
interface PromptRow {
  id: string;
  name: string;
  content_hash: string;
  file_path: string;
  created_at: string;
  updated_at: string;
  is_template: number;
  version: number;
}

/**
 * Database row structure for tags table
 */
interface TagRow {
  id: number;
  name: string;
}

/**
 * Helper function to batch insert tags and link them to a prompt.
 * Reduces N*3 queries to just 3 queries regardless of tag count.
 *
 * Before: A prompt with 10 tags = 30 queries (3 per tag)
 * After:  A prompt with 10 tags = 3 queries total
 */
const batchInsertTags = (
  sql: Context.Tag.Service<typeof SqlService>,
  promptId: string,
  tags: readonly string[]
) =>
  Effect.gen(function* () {
    if (tags.length === 0) return;

    // Convert to mutable array for SQL parameters
    const tagArray = [...tags];

    // 1. Batch insert all tags at once (INSERT OR IGNORE handles duplicates)
    const tagPlaceholders = tagArray.map(() => "(?)").join(", ");
    yield* sql.run(`INSERT OR IGNORE INTO tags (name) VALUES ${tagPlaceholders}`, tagArray);

    // 2. Batch select all tag IDs in one query
    const selectPlaceholders = tagArray.map(() => "?").join(", ");
    const tagRows = yield* sql.query<TagRow>(
      `SELECT id, name FROM tags WHERE name IN (${selectPlaceholders})`,
      tagArray
    );

    // 3. Batch insert all prompt_tags in one query
    if (tagRows.length > 0) {
      const promptTagPlaceholders = tagRows.map(() => "(?, ?)").join(", ");
      const promptTagValues = tagRows.flatMap((t) => [promptId, t.id]);
      yield* sql.run(
        `INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES ${promptTagPlaceholders}`,
        promptTagValues
      );
    }
  });

/**
 * Sync service implementation
 */
export const SyncLive = Layer.effect(
  SyncService,
  Effect.gen(function* () {
    // Get service dependencies
    const sql = yield* SqlService;
    const storage = yield* PromptStorageService;

    return SyncService.of({
      fullSync: () =>
        Effect.gen(function* () {
          // Concurrency limit for parallel file operations
          const CONCURRENCY_LIMIT = 10;

          // Step 1: Get all files from filesystem
          const filePaths = yield* storage.listPrompts();

          // Step 2: Get all prompts from database
          const dbPrompts = yield* sql.query<PromptRow>(
            "SELECT id, file_path, content_hash FROM prompts"
          );

          // Create a map of file paths to database records for quick lookup
          const dbPromptsByPath = new Map(dbPrompts.map((p) => [p.file_path, p]));

          // Create a set of file paths that exist on disk
          const filePathSet = new Set(filePaths);

          // Result type for individual file sync operations
          type FileSyncResult =
            | { readonly _tag: "created" }
            | { readonly _tag: "updated" }
            | { readonly _tag: "unchanged" }
            | { readonly _tag: "error"; readonly message: string };

          // Step 3: Process each file in parallel with concurrency limit
          const syncSingleFile = (filePath: string): Effect.Effect<FileSyncResult, never> =>
            Effect.gen(function* () {
              // Read and parse the file
              const parsed = yield* storage.readPrompt(filePath);
              const { frontmatter, content } = parsed;

              // Compute hash of the full file content (frontmatter + content)
              const fullContent = JSON.stringify(frontmatter) + content;
              const hash = yield* storage.computeHash(fullContent);

              const dbPrompt = dbPromptsByPath.get(filePath);

              if (!dbPrompt) {
                // File exists but not in database - insert it
                yield* sql.run(
                  `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at, is_template, version, is_favorite, favorite_order, is_pinned, pin_order)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    frontmatter.id,
                    frontmatter.name,
                    hash,
                    filePath,
                    frontmatter.created.toISOString(),
                    frontmatter.updated.toISOString(),
                    frontmatter.isTemplate ? 1 : 0,
                    frontmatter.version ?? 1,
                    frontmatter.isFavorite ? 1 : 0,
                    frontmatter.favoriteOrder ?? null,
                    frontmatter.isPinned ? 1 : 0,
                    frontmatter.pinOrder ?? null,
                  ]
                );

                // Update FTS index
                const tagsStr = frontmatter.tags?.join(",") ?? "";
                yield* sql.run(
                  `INSERT INTO prompts_fts (prompt_id, name, content, tags) VALUES (?, ?, ?, ?)`,
                  [frontmatter.id, frontmatter.name, content, tagsStr]
                );

                // Insert tags if present (batched for efficiency)
                if (frontmatter.tags && frontmatter.tags.length > 0) {
                  yield* batchInsertTags(sql, frontmatter.id, frontmatter.tags);
                }

                return { _tag: "created" } as const;
              } else if (dbPrompt.content_hash !== hash) {
                // File exists and is in database, but hash doesn't match - update it
                yield* sql.run(
                  `UPDATE prompts
                   SET name = ?, content_hash = ?, updated_at = ?, is_template = ?, version = ?
                   WHERE id = ?`,
                  [
                    frontmatter.name,
                    hash,
                    frontmatter.updated.toISOString(),
                    frontmatter.isTemplate ? 1 : 0,
                    frontmatter.version ?? 1,
                    frontmatter.id,
                  ]
                );

                // Update FTS index
                const tagsStr = frontmatter.tags?.join(",") ?? "";
                yield* sql.run(`DELETE FROM prompts_fts WHERE prompt_id = ?`, [frontmatter.id]);
                yield* sql.run(
                  `INSERT INTO prompts_fts (prompt_id, name, content, tags) VALUES (?, ?, ?, ?)`,
                  [frontmatter.id, frontmatter.name, content, tagsStr]
                );

                // Update tags - remove old ones and add new ones (batched for efficiency)
                yield* sql.run(`DELETE FROM prompt_tags WHERE prompt_id = ?`, [frontmatter.id]);

                if (frontmatter.tags && frontmatter.tags.length > 0) {
                  yield* batchInsertTags(sql, frontmatter.id, frontmatter.tags);
                }

                return { _tag: "updated" } as const;
              }
              // Hash matches, no update needed
              return { _tag: "unchanged" } as const;
            }).pipe(
              Effect.catchAll((error) =>
                Effect.succeed({
                  _tag: "error",
                  message: `Failed to sync ${basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`,
                } as const)
              )
            );

          // Execute all file syncs in parallel with concurrency limit
          const fileSyncResults = yield* Effect.all(
            filePaths.map(syncSingleFile),
            { concurrency: CONCURRENCY_LIMIT }
          );

          // Result type for orphan removal operations
          type RemovalResult =
            | { readonly _tag: "removed" }
            | { readonly _tag: "error"; readonly message: string };

          // Step 4: Remove database records for files that no longer exist
          const orphanedPrompts = dbPrompts.filter((p) => !filePathSet.has(p.file_path));

          const removeOrphan = (dbPrompt: PromptRow): Effect.Effect<RemovalResult, never> =>
            Effect.gen(function* () {
              // Delete from FTS index first
              yield* sql.run(`DELETE FROM prompts_fts WHERE prompt_id = ?`, [dbPrompt.id]);
              // Delete from prompts table
              yield* sql.run(`DELETE FROM prompts WHERE id = ?`, [dbPrompt.id]);
              return { _tag: "removed" } as const;
            }).pipe(
              Effect.catchAll((error) =>
                Effect.succeed({
                  _tag: "error",
                  message: `Failed to remove ${dbPrompt.id}: ${error instanceof Error ? error.message : String(error)}`,
                } as const)
              )
            );

          // Execute all orphan removals in parallel with concurrency limit
          const removalResults = yield* Effect.all(
            orphanedPrompts.map(removeOrphan),
            { concurrency: CONCURRENCY_LIMIT }
          );

          // Aggregate results immutably
          const filesCreated = fileSyncResults.filter((r) => r._tag === "created").length;
          const filesUpdated = fileSyncResults.filter((r) => r._tag === "updated").length;
          const filesRemoved = removalResults.filter((r) => r._tag === "removed").length;
          const fileErrors = fileSyncResults
            .filter((r): r is { readonly _tag: "error"; readonly message: string } => r._tag === "error")
            .map((r) => r.message);
          const removalErrors = removalResults
            .filter((r): r is { readonly _tag: "error"; readonly message: string } => r._tag === "error")
            .map((r) => r.message);

          return {
            filesScanned: filePaths.length,
            filesUpdated,
            filesCreated,
            filesRemoved,
            errors: [...fileErrors, ...removalErrors],
          };
        }),

      syncFile: (path: string) =>
        Effect.gen(function* () {
          // Read and parse the file
          const parsed = yield* storage.readPrompt(path);
          const { frontmatter, content } = parsed;

          // Compute hash of the full file content
          const fullContent = JSON.stringify(frontmatter) + content;
          const hash = yield* storage.computeHash(fullContent);

          // Check if prompt exists in database
          const existing = yield* sql.query<PromptRow>(`SELECT id FROM prompts WHERE id = ?`, [
            frontmatter.id,
          ]);

          if (existing.length === 0) {
            // Insert new record
            yield* sql.run(
              `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at, is_template, version, is_favorite, favorite_order, is_pinned, pin_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                frontmatter.id,
                frontmatter.name,
                hash,
                path,
                frontmatter.created.toISOString(),
                frontmatter.updated.toISOString(),
                frontmatter.isTemplate ? 1 : 0,
                frontmatter.version ?? 1,
                frontmatter.isFavorite ? 1 : 0,
                frontmatter.favoriteOrder ?? null,
                frontmatter.isPinned ? 1 : 0,
                frontmatter.pinOrder ?? null,
              ]
            );

            // Insert into FTS index
            const tagsStr = frontmatter.tags?.join(",") ?? "";
            yield* sql.run(
              `INSERT INTO prompts_fts (prompt_id, name, content, tags) VALUES (?, ?, ?, ?)`,
              [frontmatter.id, frontmatter.name, content, tagsStr]
            );
          } else {
            // Update existing record
            yield* sql.run(
              `UPDATE prompts
               SET name = ?, content_hash = ?, file_path = ?, updated_at = ?, is_template = ?, version = ?
               WHERE id = ?`,
              [
                frontmatter.name,
                hash,
                path,
                frontmatter.updated.toISOString(),
                frontmatter.isTemplate ? 1 : 0,
                frontmatter.version ?? 1,
                frontmatter.id,
              ]
            );

            // Update FTS index
            const tagsStr = frontmatter.tags?.join(",") ?? "";
            yield* sql.run(`DELETE FROM prompts_fts WHERE prompt_id = ?`, [frontmatter.id]);
            yield* sql.run(
              `INSERT INTO prompts_fts (prompt_id, name, content, tags) VALUES (?, ?, ?, ?)`,
              [frontmatter.id, frontmatter.name, content, tagsStr]
            );
          }

          // Update tags - remove old ones and add new ones (batched for efficiency)
          yield* sql.run(`DELETE FROM prompt_tags WHERE prompt_id = ?`, [frontmatter.id]);

          if (frontmatter.tags && frontmatter.tags.length > 0) {
            yield* batchInsertTags(sql, frontmatter.id, frontmatter.tags);
          }
        }),

      checkIntegrity: () =>
        Effect.gen(function* () {
          const result: IntegrityResult = {
            isValid: true,
            missingFiles: [],
            orphanedDbRecords: [],
            hashMismatches: [],
          };

          // Get all files from filesystem
          const filePaths = yield* storage.listPrompts();
          const filePathSet = new Set(filePaths);

          // Get all prompts from database
          const dbPrompts = yield* sql.query<PromptRow>(
            "SELECT id, name, file_path, content_hash FROM prompts"
          );

          // Create a map for quick lookup
          const dbPromptsByPath = new Map(dbPrompts.map((p) => [p.file_path, p]));

          // Check for orphaned DB records (DB has record but file doesn't exist)
          for (const dbPrompt of dbPrompts) {
            if (!filePathSet.has(dbPrompt.file_path)) {
              result.orphanedDbRecords.push(dbPrompt.file_path);
              result.isValid = false;
            }
          }

          // Check each file for issues
          for (const filePath of filePaths) {
            const dbPrompt = dbPromptsByPath.get(filePath);

            if (!dbPrompt) {
              // File exists but not in database
              result.missingFiles.push(filePath);
              result.isValid = false;
            } else {
              // File exists and is in database - check hash
              try {
                const parsed = yield* storage.readPrompt(filePath);
                const { frontmatter, content } = parsed;
                const fullContent = JSON.stringify(frontmatter) + content;
                const hash = yield* storage.computeHash(fullContent);

                if (hash !== dbPrompt.content_hash) {
                  result.hashMismatches.push(filePath);
                  result.isValid = false;
                }
              } catch {
                // If we can't read the file, consider it a hash mismatch
                result.hashMismatches.push(filePath);
                result.isValid = false;
              }
            }
          }

          return result;
        }),
    });
  })
);
