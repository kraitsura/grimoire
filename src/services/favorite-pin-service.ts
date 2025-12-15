/**
 * Favorite and Pin Services - Manages favorite and pinned prompts
 *
 * Coordinates between SqlService (database) and PromptStorageService (file system)
 * to ensure favorite and pin states are consistently stored in both locations.
 */

import { Context, Effect, Layer } from "effect";
import { SqlService } from "./sql-service";
import { PromptStorageService } from "./prompt-storage-service";
import type { Prompt } from "../models";
import { PromptNotFoundError, SqlError, StorageError } from "../models";

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
  is_favorite?: number;
  favorite_order?: number;
  is_pinned?: number;
  pin_order?: number;
}

/**
 * Database row structure for tags table
 */
interface TagRow {
  id: number;
  name: string;
}

/**
 * Convert database row to Prompt object
 */
const rowToPrompt = (row: PromptRow, content: string, tags?: string[]): Prompt => ({
  id: row.id,
  name: row.name,
  created: new Date(row.created_at),
  updated: new Date(row.updated_at),
  version: row.version,
  isTemplate: row.is_template === 1,
  isFavorite: row.is_favorite === 1,
  favoriteOrder: row.favorite_order,
  isPinned: row.is_pinned === 1,
  pinOrder: row.pin_order,
  content,
  filePath: row.file_path,
  tags,
});

/**
 * Favorite service interface - manages favorite operations
 */
interface FavoriteServiceImpl {
  /**
   * Toggle favorite status for a prompt
   * Returns the new state (true if now favorite, false if removed)
   */
  readonly toggle: (
    promptId: string
  ) => Effect.Effect<boolean, PromptNotFoundError | SqlError | StorageError>;

  /**
   * Add a prompt to favorites
   */
  readonly add: (
    promptId: string
  ) => Effect.Effect<void, PromptNotFoundError | SqlError | StorageError>;

  /**
   * Remove a prompt from favorites
   */
  readonly remove: (
    promptId: string
  ) => Effect.Effect<void, PromptNotFoundError | SqlError | StorageError>;

  /**
   * List all favorite prompts (ordered by favorite_order)
   */
  readonly list: () => Effect.Effect<Prompt[], SqlError | StorageError>;

  /**
   * Reorder favorites based on array of prompt IDs
   */
  readonly reorder: (promptIds: string[]) => Effect.Effect<void, SqlError | StorageError>;
}

/**
 * Favorite service tag
 */
export class FavoriteService extends Context.Tag("FavoriteService")<
  FavoriteService,
  FavoriteServiceImpl
>() {}

/**
 * Pin service interface - manages pinned operations
 */
interface PinServiceImpl {
  /**
   * Toggle pin status for a prompt
   * Returns the new state (true if now pinned, false if unpinned)
   */
  readonly toggle: (
    promptId: string
  ) => Effect.Effect<boolean, PromptNotFoundError | SqlError | StorageError>;

  /**
   * Pin a prompt
   */
  readonly pin: (
    promptId: string
  ) => Effect.Effect<void, PromptNotFoundError | SqlError | StorageError>;

  /**
   * Unpin a prompt
   */
  readonly unpin: (
    promptId: string
  ) => Effect.Effect<void, PromptNotFoundError | SqlError | StorageError>;

  /**
   * List all pinned prompts (ordered by pin_order)
   */
  readonly list: () => Effect.Effect<Prompt[], SqlError | StorageError>;

  /**
   * Reorder pinned prompts based on array of prompt IDs
   */
  readonly reorder: (promptIds: string[]) => Effect.Effect<void, SqlError | StorageError>;
}

/**
 * Pin service tag
 */
export class PinService extends Context.Tag("PinService")<PinService, PinServiceImpl>() {}

/**
 * Favorite service implementation
 */
export const FavoriteServiceLive = Layer.effect(
  FavoriteService,
  Effect.gen(function* () {
    // Get service dependencies
    const sql = yield* SqlService;
    const promptStorage = yield* PromptStorageService;

    /**
     * Update prompt file frontmatter with favorite state
     */
    const updatePromptFavorite = (
      promptId: string,
      isFavorite: boolean,
      favoriteOrder?: number
    ): Effect.Effect<void, PromptNotFoundError | SqlError | StorageError> =>
      Effect.gen(function* () {
        // Get prompt file path from database
        const rows = yield* sql.query<PromptRow>("SELECT * FROM prompts WHERE id = ?", [promptId]);

        if (rows.length === 0) {
          return yield* Effect.fail(new PromptNotFoundError({ id: promptId }));
        }

        const row = rows[0];

        // Read current file
        const parsed = yield* promptStorage.readPrompt(row.file_path);

        // Update frontmatter with favorite state
        const updatedFrontmatter = {
          ...parsed.frontmatter,
          isFavorite,
          favoriteOrder,
          updated: new Date(),
        };

        // Write updated file
        yield* promptStorage.writePrompt(row.file_path, updatedFrontmatter, parsed.content);
      });

    /**
     * Get all tags for a prompt from the database
     */
    const getPromptTags = (promptId: string): Effect.Effect<string[], SqlError> =>
      Effect.gen(function* () {
        const tagRows = yield* sql.query<TagRow>(
          `SELECT t.name
           FROM tags t
           JOIN prompt_tags pt ON t.id = pt.tag_id
           WHERE pt.prompt_id = ?
           ORDER BY t.name`,
          [promptId]
        );

        return tagRows.map((t) => t.name);
      });

    return FavoriteService.of({
      toggle: (promptId: string) =>
        Effect.gen(function* () {
          // Get current state
          const rows = yield* sql.query<PromptRow>("SELECT is_favorite FROM prompts WHERE id = ?", [
            promptId,
          ]);

          if (rows.length === 0) {
            return yield* Effect.fail(new PromptNotFoundError({ id: promptId }));
          }

          const isFavorite = rows[0].is_favorite === 1;
          const newState = !isFavorite;

          if (newState) {
            // Adding to favorites - get the max order and add 1
            const maxRows = yield* sql.query<{ max_order: number | null }>(
              "SELECT MAX(favorite_order) as max_order FROM prompts WHERE is_favorite = 1"
            );
            const nextOrder = (maxRows[0]?.max_order ?? -1) + 1;

            // Update database
            yield* sql.run("UPDATE prompts SET is_favorite = 1, favorite_order = ? WHERE id = ?", [
              nextOrder,
              promptId,
            ]);

            // Update file
            yield* updatePromptFavorite(promptId, true, nextOrder);
          } else {
            // Removing from favorites
            yield* sql.run(
              "UPDATE prompts SET is_favorite = 0, favorite_order = NULL WHERE id = ?",
              [promptId]
            );

            // Update file
            yield* updatePromptFavorite(promptId, false, undefined);
          }

          return newState;
        }),

      add: (promptId: string) =>
        Effect.gen(function* () {
          // Check if prompt exists
          const rows = yield* sql.query<PromptRow>("SELECT is_favorite FROM prompts WHERE id = ?", [
            promptId,
          ]);

          if (rows.length === 0) {
            return yield* Effect.fail(new PromptNotFoundError({ id: promptId }));
          }

          // If already favorite, do nothing
          if (rows[0].is_favorite === 1) {
            return;
          }

          // Get the max order and add 1
          const maxRows = yield* sql.query<{ max_order: number | null }>(
            "SELECT MAX(favorite_order) as max_order FROM prompts WHERE is_favorite = 1"
          );
          const nextOrder = (maxRows[0]?.max_order ?? -1) + 1;

          // Update database
          yield* sql.run("UPDATE prompts SET is_favorite = 1, favorite_order = ? WHERE id = ?", [
            nextOrder,
            promptId,
          ]);

          // Update file
          yield* updatePromptFavorite(promptId, true, nextOrder);
        }),

      remove: (promptId: string) =>
        Effect.gen(function* () {
          // Check if prompt exists
          const rows = yield* sql.query<PromptRow>("SELECT is_favorite FROM prompts WHERE id = ?", [
            promptId,
          ]);

          if (rows.length === 0) {
            return yield* Effect.fail(new PromptNotFoundError({ id: promptId }));
          }

          // Update database
          yield* sql.run("UPDATE prompts SET is_favorite = 0, favorite_order = NULL WHERE id = ?", [
            promptId,
          ]);

          // Update file
          yield* updatePromptFavorite(promptId, false, undefined);
        }),

      list: () =>
        Effect.gen(function* () {
          // Query database for all favorite prompts
          const rows = yield* sql.query<PromptRow>(
            `SELECT * FROM prompts
             WHERE is_favorite = 1
             ORDER BY favorite_order ASC, updated_at DESC`
          );

          // Build prompts with content and tags
          const prompts: Prompt[] = [];
          for (const row of rows) {
            try {
              // Read file content
              const parsed = yield* promptStorage.readPrompt(row.file_path);

              // Get all tags for this prompt
              const tags = yield* getPromptTags(row.id);

              prompts.push(rowToPrompt(row, parsed.content, tags));
            } catch {
              // Skip prompts that can't be read
              continue;
            }
          }

          return prompts;
        }),

      reorder: (promptIds: string[]) =>
        Effect.gen(function* () {
          // Use transaction to ensure atomic reordering
          yield* sql.transaction(
            Effect.gen(function* () {
              // Update each prompt with its new order
              for (let i = 0; i < promptIds.length; i++) {
                const promptId = promptIds[i];

                // Update database
                yield* sql.run(
                  "UPDATE prompts SET favorite_order = ? WHERE id = ? AND is_favorite = 1",
                  [i, promptId]
                );

                // Update file
                const rows = yield* sql.query<PromptRow>("SELECT * FROM prompts WHERE id = ?", [
                  promptId,
                ]);

                if (rows.length > 0) {
                  const row = rows[0];
                  const parsed = yield* promptStorage.readPrompt(row.file_path);

                  const updatedFrontmatter = {
                    ...parsed.frontmatter,
                    favoriteOrder: i,
                    updated: new Date(),
                  };

                  yield* promptStorage.writePrompt(
                    row.file_path,
                    updatedFrontmatter,
                    parsed.content
                  );
                }
              }
            })
          );
        }),
    });
  })
);

/**
 * Pin service implementation
 */
export const PinServiceLive = Layer.effect(
  PinService,
  Effect.gen(function* () {
    // Get service dependencies
    const sql = yield* SqlService;
    const promptStorage = yield* PromptStorageService;

    /**
     * Update prompt file frontmatter with pin state
     */
    const updatePromptPin = (
      promptId: string,
      isPinned: boolean,
      pinOrder?: number
    ): Effect.Effect<void, PromptNotFoundError | SqlError | StorageError> =>
      Effect.gen(function* () {
        // Get prompt file path from database
        const rows = yield* sql.query<PromptRow>("SELECT * FROM prompts WHERE id = ?", [promptId]);

        if (rows.length === 0) {
          return yield* Effect.fail(new PromptNotFoundError({ id: promptId }));
        }

        const row = rows[0];

        // Read current file
        const parsed = yield* promptStorage.readPrompt(row.file_path);

        // Update frontmatter with pin state
        const updatedFrontmatter = {
          ...parsed.frontmatter,
          isPinned,
          pinOrder,
          updated: new Date(),
        };

        // Write updated file
        yield* promptStorage.writePrompt(row.file_path, updatedFrontmatter, parsed.content);
      });

    /**
     * Get all tags for a prompt from the database
     */
    const getPromptTags = (promptId: string): Effect.Effect<string[], SqlError> =>
      Effect.gen(function* () {
        const tagRows = yield* sql.query<TagRow>(
          `SELECT t.name
           FROM tags t
           JOIN prompt_tags pt ON t.id = pt.tag_id
           WHERE pt.prompt_id = ?
           ORDER BY t.name`,
          [promptId]
        );

        return tagRows.map((t) => t.name);
      });

    return PinService.of({
      toggle: (promptId: string) =>
        Effect.gen(function* () {
          // Get current state
          const rows = yield* sql.query<PromptRow>("SELECT is_pinned FROM prompts WHERE id = ?", [
            promptId,
          ]);

          if (rows.length === 0) {
            return yield* Effect.fail(new PromptNotFoundError({ id: promptId }));
          }

          const isPinned = rows[0].is_pinned === 1;
          const newState = !isPinned;

          if (newState) {
            // Pinning - get the max order and add 1
            const maxRows = yield* sql.query<{ max_order: number | null }>(
              "SELECT MAX(pin_order) as max_order FROM prompts WHERE is_pinned = 1"
            );
            const nextOrder = (maxRows[0]?.max_order ?? -1) + 1;

            // Update database
            yield* sql.run("UPDATE prompts SET is_pinned = 1, pin_order = ? WHERE id = ?", [
              nextOrder,
              promptId,
            ]);

            // Update file
            yield* updatePromptPin(promptId, true, nextOrder);
          } else {
            // Unpinning
            yield* sql.run("UPDATE prompts SET is_pinned = 0, pin_order = NULL WHERE id = ?", [
              promptId,
            ]);

            // Update file
            yield* updatePromptPin(promptId, false, undefined);
          }

          return newState;
        }),

      pin: (promptId: string) =>
        Effect.gen(function* () {
          // Check if prompt exists
          const rows = yield* sql.query<PromptRow>("SELECT is_pinned FROM prompts WHERE id = ?", [
            promptId,
          ]);

          if (rows.length === 0) {
            return yield* Effect.fail(new PromptNotFoundError({ id: promptId }));
          }

          // If already pinned, do nothing
          if (rows[0].is_pinned === 1) {
            return;
          }

          // Get the max order and add 1
          const maxRows = yield* sql.query<{ max_order: number | null }>(
            "SELECT MAX(pin_order) as max_order FROM prompts WHERE is_pinned = 1"
          );
          const nextOrder = (maxRows[0]?.max_order ?? -1) + 1;

          // Update database
          yield* sql.run("UPDATE prompts SET is_pinned = 1, pin_order = ? WHERE id = ?", [
            nextOrder,
            promptId,
          ]);

          // Update file
          yield* updatePromptPin(promptId, true, nextOrder);
        }),

      unpin: (promptId: string) =>
        Effect.gen(function* () {
          // Check if prompt exists
          const rows = yield* sql.query<PromptRow>("SELECT is_pinned FROM prompts WHERE id = ?", [
            promptId,
          ]);

          if (rows.length === 0) {
            return yield* Effect.fail(new PromptNotFoundError({ id: promptId }));
          }

          // Update database
          yield* sql.run("UPDATE prompts SET is_pinned = 0, pin_order = NULL WHERE id = ?", [
            promptId,
          ]);

          // Update file
          yield* updatePromptPin(promptId, false, undefined);
        }),

      list: () =>
        Effect.gen(function* () {
          // Query database for all pinned prompts
          const rows = yield* sql.query<PromptRow>(
            `SELECT * FROM prompts
             WHERE is_pinned = 1
             ORDER BY pin_order ASC, updated_at DESC`
          );

          // Build prompts with content and tags
          const prompts: Prompt[] = [];
          for (const row of rows) {
            try {
              // Read file content
              const parsed = yield* promptStorage.readPrompt(row.file_path);

              // Get all tags for this prompt
              const tags = yield* getPromptTags(row.id);

              prompts.push(rowToPrompt(row, parsed.content, tags));
            } catch {
              // Skip prompts that can't be read
              continue;
            }
          }

          return prompts;
        }),

      reorder: (promptIds: string[]) =>
        Effect.gen(function* () {
          // Use transaction to ensure atomic reordering
          yield* sql.transaction(
            Effect.gen(function* () {
              // Update each prompt with its new order
              for (let i = 0; i < promptIds.length; i++) {
                const promptId = promptIds[i];

                // Update database
                yield* sql.run("UPDATE prompts SET pin_order = ? WHERE id = ? AND is_pinned = 1", [
                  i,
                  promptId,
                ]);

                // Update file
                const rows = yield* sql.query<PromptRow>("SELECT * FROM prompts WHERE id = ?", [
                  promptId,
                ]);

                if (rows.length > 0) {
                  const row = rows[0];
                  const parsed = yield* promptStorage.readPrompt(row.file_path);

                  const updatedFrontmatter = {
                    ...parsed.frontmatter,
                    pinOrder: i,
                    updated: new Date(),
                  };

                  yield* promptStorage.writePrompt(
                    row.file_path,
                    updatedFrontmatter,
                    parsed.content
                  );
                }
              }
            })
          );
        }),
    });
  })
);
