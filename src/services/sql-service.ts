/**
 * SQL Service - SQLite database access using Bun's native SQLite
 */

import { Context, Effect, Layer } from "effect";
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { SqlError } from "../models";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { homedir } from "node:os";

/**
 * SQL service interface - manages SQLite database operations
 */
interface SqlServiceImpl {
  /**
   * Execute a SELECT query and return results
   * @param sql - SQL query string
   * @param params - Optional query parameters
   * @returns Effect that succeeds with array of results or fails with SqlError
   */
  readonly query: <T>(sql: string, params?: SQLQueryBindings[]) => Effect.Effect<T[], SqlError>;

  /**
   * Execute a non-SELECT query (INSERT, UPDATE, DELETE, etc.)
   * @param sql - SQL query string
   * @param params - Optional query parameters
   * @returns Effect that succeeds with void or fails with SqlError
   */
  readonly run: (sql: string, params?: SQLQueryBindings[]) => Effect.Effect<void, SqlError>;

  /**
   * Execute multiple operations within a transaction
   * @param effect - Effect to run within transaction
   * @returns Effect that succeeds with result or fails with error or SqlError
   */
  readonly transaction: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E | SqlError>;
}

/**
 * SQL service tag
 */
export class SqlService extends Context.Tag("SqlService")<SqlService, SqlServiceImpl>() {}

/**
 * Get the database path in the user's home directory
 */
const getDbPath = (): string => {
  return `${homedir()}/.grimoire/grimoire.db`;
};

/**
 * Ensure the database directory exists
 */
const ensureDbDirectory = (): Effect.Effect<void, SqlError> =>
  Effect.tryPromise({
    try: async () => {
      const dbPath = getDbPath();
      const dir = dirname(dbPath);
      await mkdir(dir, { recursive: true });
    },
    catch: (error) =>
      new SqlError({
        message: "Failed to create database directory",
        cause: error,
      }),
  });

/**
 * Initialize a new SQLite database with required settings
 */
const initializeDatabase = (dbPath: string): Effect.Effect<Database, SqlError> =>
  Effect.try({
    try: () => {
      const db = new Database(dbPath);

      // Enable WAL mode for better concurrency
      db.exec("PRAGMA journal_mode = WAL");

      // Enable foreign key constraints
      db.exec("PRAGMA foreign_keys = ON");

      return db;
    },
    catch: (error) =>
      new SqlError({
        message: "Failed to initialize database",
        cause: error,
      }),
  });

/**
 * SQL service implementation
 */
export const SqlLive = Layer.effect(
  SqlService,
  Effect.gen(function* () {
    // Ensure the database directory exists
    yield* ensureDbDirectory();

    // Get the database path
    const dbPath = getDbPath();

    // Initialize the database
    const db = yield* initializeDatabase(dbPath);

    return SqlService.of({
      query: <T>(sql: string, params?: SQLQueryBindings[]) =>
        Effect.try({
          try: () => {
            const stmt = db.prepare(sql);
            const results = params ? stmt.all(...params) : stmt.all();
            return results as T[];
          },
          catch: (error) =>
            new SqlError({
              message: "Query execution failed",
              query: sql,
              cause: error,
            }),
        }),

      run: (sql: string, params?: SQLQueryBindings[]) =>
        Effect.try({
          try: () => {
            const stmt = db.prepare(sql);
            if (params) {
              stmt.run(...params);
            } else {
              stmt.run();
            }
          },
          catch: (error) =>
            new SqlError({
              message: "Statement execution failed",
              query: sql,
              cause: error,
            }),
        }),

      transaction: <A, E>(effect: Effect.Effect<A, E>) =>
        Effect.gen(function* () {
          // Begin transaction
          yield* Effect.try({
            try: () => {
              db.exec("BEGIN TRANSACTION");
            },
            catch: (error) =>
              new SqlError({
                message: "Failed to begin transaction",
                cause: error,
              }),
          });

          // Try to execute the effect
          const result = yield* Effect.either(effect);

          // Commit or rollback based on result
          if (result._tag === "Right") {
            yield* Effect.try({
              try: () => {
                db.exec("COMMIT");
              },
              catch: (error) =>
                new SqlError({
                  message: "Failed to commit transaction",
                  cause: error,
                }),
            });
            return result.right;
          } else {
            yield* Effect.try({
              try: () => {
                db.exec("ROLLBACK");
              },
              catch: (error) =>
                new SqlError({
                  message: "Failed to rollback transaction",
                  cause: error,
                }),
            });
            return yield* Effect.fail(result.left);
          }
        }),
    });
  })
);
