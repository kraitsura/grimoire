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
          const result: SyncResult = {
            filesScanned: 0,
            filesUpdated: 0,
            filesCreated: 0,
            filesRemoved: 0,
            errors: [],
          };

          // Step 1: Get all files from filesystem
          const filePaths = yield* storage.listPrompts();
          result.filesScanned = filePaths.length;

          // Step 2: Get all prompts from database
          const dbPrompts = yield* sql.query<PromptRow>(
            "SELECT id, file_path, content_hash FROM prompts"
          );

          // Create a map of file paths to database records for quick lookup
          const dbPromptsByPath = new Map(dbPrompts.map((p) => [p.file_path, p]));

          // Create a set of file paths that exist on disk
          const filePathSet = new Set(filePaths);

          // Step 3: Process each file
          for (const filePath of filePaths) {
            try {
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

                // Insert tags if present
                if (frontmatter.tags && frontmatter.tags.length > 0) {
                  for (const tagName of frontmatter.tags) {
                    // Insert tag if it doesn't exist
                    yield* sql.run(`INSERT OR IGNORE INTO tags (name) VALUES (?)`, [tagName]);

                    // Get tag ID
                    const tagRows = yield* sql.query<TagRow>(`SELECT id FROM tags WHERE name = ?`, [
                      tagName,
                    ]);

                    if (tagRows.length > 0) {
                      // Link prompt to tag
                      yield* sql.run(
                        `INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)`,
                        [frontmatter.id, tagRows[0].id]
                      );
                    }
                  }
                }

                result.filesCreated++;
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

                // Update tags - remove old ones and add new ones
                yield* sql.run(`DELETE FROM prompt_tags WHERE prompt_id = ?`, [frontmatter.id]);

                if (frontmatter.tags && frontmatter.tags.length > 0) {
                  for (const tagName of frontmatter.tags) {
                    // Insert tag if it doesn't exist
                    yield* sql.run(`INSERT OR IGNORE INTO tags (name) VALUES (?)`, [tagName]);

                    // Get tag ID
                    const tagRows = yield* sql.query<TagRow>(`SELECT id FROM tags WHERE name = ?`, [
                      tagName,
                    ]);

                    if (tagRows.length > 0) {
                      // Link prompt to tag
                      yield* sql.run(
                        `INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)`,
                        [frontmatter.id, tagRows[0].id]
                      );
                    }
                  }
                }

                result.filesUpdated++;
              }
              // else: hash matches, no update needed
            } catch (error) {
              // Record error but continue processing other files
              const errorMsg = error instanceof Error ? error.message : String(error);
              result.errors.push(`Failed to sync ${basename(filePath)}: ${errorMsg}`);
            }
          }

          // Step 4: Remove database records for files that no longer exist
          for (const dbPrompt of dbPrompts) {
            if (!filePathSet.has(dbPrompt.file_path)) {
              try {
                // Delete from FTS index first
                yield* sql.run(`DELETE FROM prompts_fts WHERE prompt_id = ?`, [dbPrompt.id]);
                // Delete from prompts table
                yield* sql.run(`DELETE FROM prompts WHERE id = ?`, [dbPrompt.id]);
                result.filesRemoved++;
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                result.errors.push(`Failed to remove ${dbPrompt.id}: ${errorMsg}`);
              }
            }
          }

          return result;
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

          // Update tags
          yield* sql.run(`DELETE FROM prompt_tags WHERE prompt_id = ?`, [frontmatter.id]);

          if (frontmatter.tags && frontmatter.tags.length > 0) {
            for (const tagName of frontmatter.tags) {
              // Insert tag if it doesn't exist
              yield* sql.run(`INSERT OR IGNORE INTO tags (name) VALUES (?)`, [tagName]);

              // Get tag ID
              const tagRows = yield* sql.query<TagRow>(`SELECT id FROM tags WHERE name = ?`, [
                tagName,
              ]);

              if (tagRows.length > 0) {
                // Link prompt to tag
                yield* sql.run(
                  `INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)`,
                  [frontmatter.id, tagRows[0].id]
                );
              }
            }
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
