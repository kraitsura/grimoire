/**
 * Completion Helpers - Fast, minimal functions for shell tab completion
 *
 * These functions are designed to be fast (<100ms) and fail silently.
 * They output completable values one per line to stdout.
 */

import { Effect, Layer } from "effect";
import { SqlService, SqlLive } from "../services/sql-service";
import { MigrationService, MigrationLive } from "../services/migration-service";
import {
  WorktreeService,
  WorktreeServiceLive,
} from "../services/worktree/worktree-service";

/**
 * Minimal layer for prompt name queries - SqlService + Migration
 */
const PromptCompletionLive = Layer.mergeAll(
  SqlLive,
  MigrationLive.pipe(Layer.provide(SqlLive))
);

/**
 * List all prompt names for tab completion
 * Outputs one name per line, fails silently on error
 */
export const listPromptNamesForCompletion: Effect.Effect<void, never, never> = Effect.gen(
  function* () {
    // Run migrations first to ensure DB is ready
    const migration = yield* MigrationService;
    yield* migration.migrate();

    const sql = yield* SqlService;
    const rows = yield* sql.query<{ name: string }>(
      "SELECT name FROM prompts ORDER BY name"
    );
    for (const row of rows) {
      console.log(row.name);
    }
  }
).pipe(
  Effect.provide(PromptCompletionLive),
  Effect.catchAll(() => Effect.void) // Fail silently
) as Effect.Effect<void, never, never>;

/**
 * List all worktree names for tab completion
 * Outputs one name per line, fails silently on error
 */
export const listWorktreeNamesForCompletion: Effect.Effect<void, never, never> = Effect.gen(
  function* () {
    const service = yield* WorktreeService;
    const cwd = process.cwd();
    const worktrees = yield* service.list(cwd);
    for (const wt of worktrees) {
      console.log(wt.name);
    }
  }
).pipe(
  Effect.provide(WorktreeServiceLive),
  Effect.catchAll(() => Effect.void) // Fail silently
) as Effect.Effect<void, never, never>;
