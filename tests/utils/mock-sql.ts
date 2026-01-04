/**
 * Mock SQLite Service
 *
 * In-memory SQLite implementation for testing database operations.
 * Uses Bun's native SQLite with :memory: database for fast, isolated tests.
 * Each test gets a fresh database instance.
 */

import { Effect, Layer, Scope } from "effect";
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { SqlService } from "../../src/services/sql-service";
import { MigrationService, MigrationLive } from "../../src/services/migration-service";
import { SqlError } from "../../src/models";

/**
 * Create an in-memory SQLite database for testing.
 * The database is automatically cleaned up when the scope closes.
 */
export const createTestDatabase = (): Effect.Effect<Database, SqlError, Scope.Scope> => {
  return Effect.acquireRelease(
    Effect.try({
      try: () => {
        const db = new Database(":memory:");

        // Enable WAL mode equivalent for in-memory (doesn't apply but matches prod)
        db.exec("PRAGMA foreign_keys = ON");

        return db;
      },
      catch: (error) =>
        new SqlError({
          message: "Failed to create test database",
          cause: error,
        }),
    }),
    (db) =>
      Effect.sync(() => {
        db.close();
      })
  );
};

/**
 * Create a SqlService implementation using an in-memory database
 */
const createSqlServiceFromDb = (db: Database): SqlService["Type"] => ({
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

      const result = yield* Effect.either(effect);

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

/**
 * Layer that provides an in-memory SQLite database.
 * Use this for unit tests that need isolated database access.
 */
export const TestSqlLive: Layer.Layer<SqlService, SqlError> = Layer.scoped(
  SqlService,
  Effect.gen(function* () {
    const db = yield* createTestDatabase();
    return createSqlServiceFromDb(db);
  })
);

/**
 * Layer that provides in-memory SQLite with migrations already run.
 * Use this for integration tests that need a fully initialized database.
 *
 * Note: Prefer `createTestSqlLayer()` for most use cases as it provides
 * both SqlService and MigrationService in a single composable layer.
 */
export const TestSqlWithMigrationsLive: Layer.Layer<SqlService, SqlError> = Layer.scoped(
  SqlService,
  Effect.gen(function* () {
    const db = yield* createTestDatabase();
    const sqlService = createSqlServiceFromDb(db);

    // Run migrations on the SAME database instance
    const migrationService = yield* Effect.provide(
      MigrationService,
      MigrationLive.pipe(Layer.provide(Layer.succeed(SqlService, sqlService)))
    );
    yield* migrationService.migrate();

    return sqlService;
  })
);

/**
 * Create a test layer with an in-memory database and run migrations.
 * This is the recommended way to create a database layer for tests.
 *
 * @example
 * ```ts
 * describe("MyService", () => {
 *   const TestLayer = createTestSqlLayer();
 *
 *   it("should work", async () => {
 *     const program = Effect.gen(function* () {
 *       const service = yield* MyService;
 *       return yield* service.doSomething();
 *     }).pipe(
 *       Effect.provide(MyServiceLive),
 *       Effect.provide(TestLayer)
 *     );
 *
 *     await Effect.runPromise(Effect.scoped(program));
 *   });
 * });
 * ```
 */
export const createTestSqlLayer = (): Layer.Layer<SqlService | MigrationService, SqlError> => {
  return Layer.unwrapScoped(
    Effect.gen(function* () {
      const db = yield* createTestDatabase();
      const sqlService = createSqlServiceFromDb(db);

      const sqlLayer = Layer.succeed(SqlService, sqlService);
      const migrationLayer = MigrationLive.pipe(Layer.provide(sqlLayer));

      // Run migrations
      const migration = yield* Effect.provide(MigrationService, migrationLayer);
      yield* migration.migrate();

      return Layer.merge(sqlLayer, migrationLayer);
    })
  );
};

/**
 * Helper to seed the database with test data.
 * Use after migrations to set up test fixtures.
 */
export const seedDatabase = <E>(
  seedFn: (sql: SqlService["Type"]) => Effect.Effect<void, E>
): Effect.Effect<void, E | SqlError, SqlService> => {
  return Effect.gen(function* () {
    const sql = yield* SqlService;
    yield* seedFn(sql);
  });
};

/**
 * Execute raw SQL statements for test setup.
 * Useful for creating specific test scenarios.
 */
export const execSql = (
  statements: string[]
): Effect.Effect<void, SqlError, SqlService> => {
  return Effect.gen(function* () {
    const sql = yield* SqlService;
    for (const statement of statements) {
      yield* sql.run(statement);
    }
  });
};

/**
 * Query helper that asserts a single result or fails.
 */
export const queryOne = <T>(
  sqlQuery: string,
  params?: SQLQueryBindings[]
): Effect.Effect<T, SqlError, SqlService> => {
  return Effect.gen(function* () {
    const sql = yield* SqlService;
    const results = yield* sql.query<T>(sqlQuery, params);
    if (results.length === 0) {
      return yield* Effect.fail(
        new SqlError({ message: `Expected 1 result, got 0`, query: sqlQuery })
      );
    }
    if (results.length > 1) {
      return yield* Effect.fail(
        new SqlError({
          message: `Expected 1 result, got ${results.length}`,
          query: sqlQuery,
        })
      );
    }
    return results[0];
  });
};

/**
 * Count rows in a table.
 */
export const countRows = (
  tableName: string,
  where?: string
): Effect.Effect<number, SqlError, SqlService> => {
  return Effect.gen(function* () {
    const sql = yield* SqlService;
    const query = where
      ? `SELECT COUNT(*) as count FROM ${tableName} WHERE ${where}`
      : `SELECT COUNT(*) as count FROM ${tableName}`;
    const results = yield* sql.query<{ count: number }>(query);
    return results[0]?.count ?? 0;
  });
};

/**
 * Check if a table exists.
 */
export const tableExists = (
  tableName: string
): Effect.Effect<boolean, SqlError, SqlService> => {
  return Effect.gen(function* () {
    const sql = yield* SqlService;
    const results = yield* sql.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName]
    );
    return results.length > 0;
  });
};

/**
 * Clear all data from a table without dropping it.
 */
export const clearTable = (
  tableName: string
): Effect.Effect<void, SqlError, SqlService> => {
  return Effect.gen(function* () {
    const sql = yield* SqlService;
    yield* sql.run(`DELETE FROM ${tableName}`);
  });
};

/**
 * Clear all data from all tables (useful between tests).
 */
export const clearAllTables = (): Effect.Effect<void, SqlError, SqlService> => {
  return Effect.gen(function* () {
    const sql = yield* SqlService;

    // Get all table names
    const tables = yield* sql.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_migrations%'`
    );

    // Disable foreign key checks temporarily
    yield* sql.run("PRAGMA foreign_keys = OFF");

    // Clear each table
    for (const { name } of tables) {
      yield* sql.run(`DELETE FROM ${name}`);
    }

    // Re-enable foreign key checks
    yield* sql.run("PRAGMA foreign_keys = ON");
  });
};
