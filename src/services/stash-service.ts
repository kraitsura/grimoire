/**
 * Stash Service - Stack-based clipboard stash with optional named items
 *
 * Provides functionality to stash clipboard content, pop items from the stack,
 * and manage named stash items for later retrieval.
 */

import { Context, Effect, Layer } from "effect";
import { SqlService } from "./sql-service";
import { SqlError, StashEmptyError, StashItemNotFoundError } from "../models";
import { type StashItem, type StashItemRow, rowToStashItem } from "../models/stash";

/**
 * Stash service interface - manages clipboard stash operations
 */
interface StashServiceImpl {
  /**
   * Push content onto the stack with optional name
   * @param content - The content to stash
   * @param name - Optional name for the stash item
   * @returns Effect that succeeds with the created StashItem
   */
  readonly push: (content: string, name?: string) => Effect.Effect<StashItem, SqlError>;

  /**
   * Pop the most recent item from the stack (removes it)
   * @returns Effect that succeeds with the popped StashItem or fails if empty
   */
  readonly pop: () => Effect.Effect<StashItem, StashEmptyError | SqlError>;

  /**
   * Pop a specific item by name (removes it)
   * @param name - The name of the stash item to pop
   * @returns Effect that succeeds with the popped StashItem or fails if not found
   */
  readonly popByName: (name: string) => Effect.Effect<StashItem, StashItemNotFoundError | SqlError>;

  /**
   * Peek at the most recent item without removing
   * @returns Effect that succeeds with the StashItem or null if empty
   */
  readonly peek: () => Effect.Effect<StashItem | null, SqlError>;

  /**
   * List all stashed items (most recent first)
   * @returns Effect that succeeds with array of StashItems
   */
  readonly list: () => Effect.Effect<StashItem[], SqlError>;

  /**
   * Get a specific item by name without removing
   * @param name - The name of the stash item
   * @returns Effect that succeeds with the StashItem or fails if not found
   */
  readonly getByName: (name: string) => Effect.Effect<StashItem, StashItemNotFoundError | SqlError>;

  /**
   * Delete a specific item by id
   * @param id - The id of the stash item to delete
   * @returns Effect that succeeds with void or fails if not found
   */
  readonly delete: (id: string) => Effect.Effect<void, StashItemNotFoundError | SqlError>;

  /**
   * Clear all stashed items
   * @returns Effect that succeeds with count of deleted items
   */
  readonly clear: () => Effect.Effect<number, SqlError>;
}

/**
 * Stash service tag
 */
export class StashService extends Context.Tag("StashService")<StashService, StashServiceImpl>() {}

/**
 * Stash service implementation
 */
export const StashServiceLive = Layer.effect(
  StashService,
  Effect.gen(function* () {
    const sql = yield* SqlService;

    // Create stash table if not exists
    yield* sql.run(`
      CREATE TABLE IF NOT EXISTS stash (
        id TEXT PRIMARY KEY,
        name TEXT,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        stack_order INTEGER NOT NULL
      )
    `);

    // Create index on stack_order for efficient LIFO operations
    yield* sql.run(`
      CREATE INDEX IF NOT EXISTS idx_stash_stack_order ON stash(stack_order DESC)
    `);

    // Create unique index on name (only for non-null names)
    yield* sql.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stash_name ON stash(name) WHERE name IS NOT NULL
    `);

    return StashService.of({
      push: (content: string, name?: string) =>
        Effect.gen(function* () {
          const id = crypto.randomUUID();
          const now = new Date();

          // Get max stack_order and increment
          const rows = yield* sql.query<{ max_order: number | null }>(
            "SELECT MAX(stack_order) as max_order FROM stash"
          );
          const nextOrder = (rows[0]?.max_order ?? -1) + 1;

          yield* sql.run(
            `INSERT INTO stash (id, name, content, created_at, stack_order)
             VALUES (?, ?, ?, ?, ?)`,
            [id, name ?? null, content, now.toISOString(), nextOrder]
          );

          return {
            id,
            name,
            content,
            createdAt: now,
            stackOrder: nextOrder,
          };
        }),

      pop: () =>
        Effect.gen(function* () {
          // Get the most recent item
          const rows = yield* sql.query<StashItemRow>(
            "SELECT * FROM stash ORDER BY stack_order DESC LIMIT 1"
          );

          if (rows.length === 0) {
            return yield* Effect.fail(
              new StashEmptyError({
                message: "Stash is empty",
              })
            );
          }

          const row = rows[0];

          // Delete it
          yield* sql.run("DELETE FROM stash WHERE id = ?", [row.id]);

          return rowToStashItem(row);
        }),

      popByName: (name: string) =>
        Effect.gen(function* () {
          const rows = yield* sql.query<StashItemRow>("SELECT * FROM stash WHERE name = ?", [name]);

          if (rows.length === 0) {
            return yield* Effect.fail(
              new StashItemNotFoundError({
                identifier: name,
              })
            );
          }

          const row = rows[0];
          yield* sql.run("DELETE FROM stash WHERE id = ?", [row.id]);

          return rowToStashItem(row);
        }),

      peek: () =>
        Effect.gen(function* () {
          const rows = yield* sql.query<StashItemRow>(
            "SELECT * FROM stash ORDER BY stack_order DESC LIMIT 1"
          );
          return rows.length > 0 ? rowToStashItem(rows[0]) : null;
        }),

      list: () =>
        Effect.gen(function* () {
          const rows = yield* sql.query<StashItemRow>(
            "SELECT * FROM stash ORDER BY stack_order DESC"
          );
          return rows.map(rowToStashItem);
        }),

      getByName: (name: string) =>
        Effect.gen(function* () {
          const rows = yield* sql.query<StashItemRow>("SELECT * FROM stash WHERE name = ?", [name]);

          if (rows.length === 0) {
            return yield* Effect.fail(
              new StashItemNotFoundError({
                identifier: name,
              })
            );
          }

          return rowToStashItem(rows[0]);
        }),

      delete: (id: string) =>
        Effect.gen(function* () {
          const rows = yield* sql.query<{ id: string }>("SELECT id FROM stash WHERE id = ?", [id]);

          if (rows.length === 0) {
            return yield* Effect.fail(
              new StashItemNotFoundError({
                identifier: id,
              })
            );
          }

          yield* sql.run("DELETE FROM stash WHERE id = ?", [id]);
        }),

      clear: () =>
        Effect.gen(function* () {
          const countRows = yield* sql.query<{ count: number }>(
            "SELECT COUNT(*) as count FROM stash"
          );
          const count = countRows[0]?.count ?? 0;

          yield* sql.run("DELETE FROM stash");

          return count;
        }),
    });
  })
);

export type { StashServiceImpl, StashItem };
