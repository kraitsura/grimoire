/**
 * Archive Service - Manages archiving and restoring prompts
 *
 * Provides functionality to archive prompts (move to archive directory),
 * list archived prompts, restore them, and purge old archives.
 */

import { Context, Effect, Layer } from "effect";
import { rename, unlink, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { SqlService } from "./sql-service";
import { PromptStorageService } from "./prompt-storage-service";
import { StorageError, PromptNotFoundError } from "../models";

/**
 * Represents an archived prompt with metadata
 */
export interface ArchivedPrompt {
  id: string;
  name: string;
  archivedAt: Date;
  originalPath: string;
  archivePath: string;
}

/**
 * Database row structure for archived prompts
 */
interface ArchivedPromptRow {
  id: string;
  name: string;
  archived_at: string;
  original_path: string;
  archive_path: string;
}

/**
 * Database row structure for prompts table
 */
interface PromptRow {
  id: string;
  name: string;
  file_path: string;
}

/**
 * Archive service interface - manages prompt archiving operations
 */
interface ArchiveServiceImpl {
  /**
   * Archive prompts by name
   * @param promptNames - Array of prompt names to archive
   * @returns Effect that succeeds with count of archived prompts or fails with error
   */
  readonly archive: (
    promptNames: string[]
  ) => Effect.Effect<number, PromptNotFoundError | StorageError, never>;

  /**
   * List all archived prompts
   * @returns Effect that succeeds with array of archived prompts or fails with error
   */
  readonly list: () => Effect.Effect<ArchivedPrompt[], StorageError, never>;

  /**
   * Restore archived prompts by name
   * @param promptNames - Array of prompt names to restore
   * @returns Effect that succeeds with count of restored prompts or fails with error
   */
  readonly restore: (
    promptNames: string[]
  ) => Effect.Effect<number, PromptNotFoundError | StorageError, never>;

  /**
   * Purge archived prompts older than a specific date
   * @param olderThan - Optional date threshold (defaults to all archives)
   * @returns Effect that succeeds with count of purged prompts or fails with error
   */
  readonly purge: (olderThan?: Date) => Effect.Effect<number, StorageError, never>;
}

/**
 * Archive service tag
 */
export class ArchiveService extends Context.Tag("ArchiveService")<
  ArchiveService,
  ArchiveServiceImpl
>() {}

/**
 * Get the prompts directory path
 */
const getPromptsDir = (): string => {
  return join(homedir(), ".grimoire", "prompts");
};

/**
 * Get the archive directory path
 */
const getArchiveDir = (): string => {
  return join(homedir(), ".grimoire", "archive");
};

/**
 * Ensure archive directory exists
 */
const ensureArchiveDirectory = (): Effect.Effect<void, StorageError> =>
  Effect.tryPromise({
    try: async () => {
      const archiveDir = getArchiveDir();
      await mkdir(archiveDir, { recursive: true });
    },
    catch: (error) =>
      new StorageError({
        message: "Failed to create archive directory",
        cause: error,
      }),
  });

/**
 * Convert database row to ArchivedPrompt object
 */
const rowToArchivedPrompt = (row: ArchivedPromptRow): ArchivedPrompt => ({
  id: row.id,
  name: row.name,
  archivedAt: new Date(row.archived_at),
  originalPath: row.original_path,
  archivePath: row.archive_path,
});

/**
 * Archive service implementation
 */
export const ArchiveServiceLive = Layer.effect(
  ArchiveService,
  Effect.gen(function* () {
    // Get service dependencies
    const sql = yield* SqlService;
    const promptStorage = yield* PromptStorageService;

    // Ensure archive directory exists
    yield* ensureArchiveDirectory();

    // Ensure archived_prompts table exists
    yield* sql.run(
      `CREATE TABLE IF NOT EXISTS archived_prompts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        archived_at TEXT NOT NULL,
        original_path TEXT NOT NULL,
        archive_path TEXT NOT NULL
      )`
    );

    return ArchiveService.of({
      archive: (promptNames: string[]) =>
        Effect.gen(function* () {
          if (promptNames.length === 0) {
            return 0;
          }

          let archivedCount = 0;

          for (const name of promptNames) {
            // Find the prompt by name
            const rows = yield* sql.query<PromptRow>(
              "SELECT id, name, file_path FROM prompts WHERE name = ?",
              [name]
            ).pipe(
              Effect.mapError((error) =>
                new StorageError({
                  message: "Failed to query prompt",
                  cause: error,
                })
              )
            );

            if (rows.length === 0) {
              return yield* Effect.fail(
                new PromptNotFoundError({ id: `name:${name}` })
              );
            }

            const row = rows[0];
            const now = new Date();

            // Ensure archive directory exists
            yield* ensureArchiveDirectory();

            // Define archive path
            const archivePath = join(getArchiveDir(), `${row.id}.md`);

            // Move file to archive
            yield* Effect.tryPromise({
              try: () => rename(row.file_path, archivePath),
              catch: (error) =>
                new StorageError({
                  message: `Failed to archive file: ${row.file_path}`,
                  cause: error,
                }),
            });

            // Record in archived_prompts table
            yield* sql.run(
              `INSERT INTO archived_prompts (id, name, archived_at, original_path, archive_path)
               VALUES (?, ?, ?, ?, ?)`,
              [row.id, row.name, now.toISOString(), row.file_path, archivePath]
            ).pipe(
              Effect.mapError((error) =>
                new StorageError({
                  message: "Failed to insert archived prompt record",
                  cause: error,
                })
              )
            );

            // Remove from FTS index
            yield* sql.run("DELETE FROM prompts_fts WHERE prompt_id = ?", [row.id]).pipe(
              Effect.mapError((error) =>
                new StorageError({
                  message: "Failed to delete from FTS index",
                  cause: error,
                })
              )
            );

            // Remove from prompts table and related tables
            yield* sql.run("DELETE FROM prompts WHERE id = ?", [row.id]).pipe(
              Effect.mapError((error) =>
                new StorageError({
                  message: "Failed to delete prompt",
                  cause: error,
                })
              )
            );

            archivedCount++;
          }

          return archivedCount;
        }),

      list: () =>
        Effect.gen(function* () {
          // Query all archived prompts
          const rows = yield* sql.query<ArchivedPromptRow>(
            "SELECT * FROM archived_prompts ORDER BY archived_at DESC"
          ).pipe(
            Effect.mapError((error) =>
              new StorageError({
                message: "Failed to query archived prompts",
                cause: error,
              })
            )
          );

          return rows.map(rowToArchivedPrompt);
        }),

      restore: (promptNames: string[]) =>
        Effect.gen(function* () {
          if (promptNames.length === 0) {
            return 0;
          }

          let restoredCount = 0;

          for (const name of promptNames) {
            // Find the archived prompt by name
            const rows = yield* sql.query<ArchivedPromptRow>(
              "SELECT * FROM archived_prompts WHERE name = ?",
              [name]
            ).pipe(
              Effect.mapError((error) =>
                new StorageError({
                  message: "Failed to query archived prompt",
                  cause: error,
                })
              )
            );

            if (rows.length === 0) {
              return yield* Effect.fail(
                new PromptNotFoundError({ id: `name:${name}` })
              );
            }

            const row = rows[0];
            const now = new Date();

            // Define restore path (back to prompts directory)
            const restorePath = join(getPromptsDir(), `${row.id}.md`);

            // Move file back to prompts directory
            yield* Effect.tryPromise({
              try: () => rename(row.archive_path, restorePath),
              catch: (error) =>
                new StorageError({
                  message: `Failed to restore file: ${row.archive_path}`,
                  cause: error,
                }),
            });

            // Read the prompt file to get metadata
            const parsed = yield* promptStorage.readPrompt(restorePath);

            // Compute content hash
            const contentHash = yield* promptStorage.computeHash(parsed.content);

            // Re-insert into prompts table
            yield* sql.run(
              `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at, is_template, version)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                row.id,
                parsed.frontmatter.name,
                contentHash,
                restorePath,
                parsed.frontmatter.created.toISOString(),
                now.toISOString(),
                parsed.frontmatter.isTemplate ? 1 : 0,
                parsed.frontmatter.version ?? 1,
              ]
            ).pipe(
              Effect.mapError((error) =>
                new StorageError({
                  message: "Failed to re-insert prompt",
                  cause: error,
                })
              )
            );

            // Re-insert tags if they exist
            if (parsed.frontmatter.tags && parsed.frontmatter.tags.length > 0) {
              for (const tagName of parsed.frontmatter.tags) {
                // Insert or get tag
                yield* sql.run(
                  "INSERT OR IGNORE INTO tags (name) VALUES (?)",
                  [tagName]
                ).pipe(
                  Effect.mapError((error) =>
                    new StorageError({
                      message: "Failed to insert tag",
                      cause: error,
                    })
                  )
                );

                // Get tag id
                const tagRows = yield* sql.query<{ id: number }>(
                  "SELECT id FROM tags WHERE name = ?",
                  [tagName]
                ).pipe(
                  Effect.mapError((error) =>
                    new StorageError({
                      message: "Failed to query tag",
                      cause: error,
                    })
                  )
                );

                if (tagRows.length > 0) {
                  // Link tag to prompt
                  yield* sql.run(
                    "INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)",
                    [row.id, tagRows[0].id]
                  ).pipe(
                    Effect.mapError((error) =>
                      new StorageError({
                        message: "Failed to link tag to prompt",
                        cause: error,
                      })
                    )
                  );
                }
              }
            }

            // Remove from archived_prompts table
            yield* sql.run("DELETE FROM archived_prompts WHERE id = ?", [
              row.id,
            ]).pipe(
              Effect.mapError((error) =>
                new StorageError({
                  message: "Failed to delete archived prompt record",
                  cause: error,
                })
              )
            );

            restoredCount++;
          }

          return restoredCount;
        }),

      purge: (olderThan?: Date) =>
        Effect.gen(function* () {
          // Query archived prompts based on date filter
          let rows: ArchivedPromptRow[];

          if (olderThan) {
            rows = yield* sql.query<ArchivedPromptRow>(
              "SELECT * FROM archived_prompts WHERE archived_at < ?",
              [olderThan.toISOString()]
            ).pipe(
              Effect.mapError((error) =>
                new StorageError({
                  message: "Failed to query archived prompts",
                  cause: error,
                })
              )
            );
          } else {
            rows = yield* sql.query<ArchivedPromptRow>(
              "SELECT * FROM archived_prompts"
            ).pipe(
              Effect.mapError((error) =>
                new StorageError({
                  message: "Failed to query archived prompts",
                  cause: error,
                })
              )
            );
          }

          let purgedCount = 0;

          for (const row of rows) {
            // Delete the archived file
            yield* Effect.tryPromise({
              try: () => unlink(row.archive_path),
              catch: (error) =>
                new StorageError({
                  message: `Failed to delete archived file: ${row.archive_path}`,
                  cause: error,
                }),
            });

            // Remove from archived_prompts table
            yield* sql.run("DELETE FROM archived_prompts WHERE id = ?", [
              row.id,
            ]).pipe(
              Effect.mapError((error) =>
                new StorageError({
                  message: "Failed to delete archived prompt record",
                  cause: error,
                })
              )
            );

            purgedCount++;
          }

          return purgedCount;
        }),
    });
  })
);
