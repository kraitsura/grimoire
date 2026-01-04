/**
 * SqlService Unit Tests
 *
 * Tests the core SQL service functionality including:
 * - Query execution
 * - Statement execution (INSERT, UPDATE, DELETE)
 * - Transaction handling (commit and rollback)
 * - Error handling
 */

import { describe, it, expect } from "bun:test";
import { Effect, Layer } from "effect";
import { SqlService } from "../../src/services/sql-service";
import { SqlError } from "../../src/models";
import {
  runTest,
  runTestExpectError,
  TestSqlLive,
  createTestSqlLayer,
} from "../utils";

describe("SqlService", () => {
  describe("query", () => {
    it("should execute a simple SELECT query", async () => {
      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            const rows = yield* sql.query<{ result: number }>("SELECT 1 + 1 AS result");
            return rows;
          }).pipe(Effect.provide(TestSqlLive))
        )
      );
      expect(result).toHaveLength(1);
      expect(result[0].result).toBe(2);
    });

    it("should execute query with parameters", async () => {
      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            const rows = yield* sql.query<{ value: number }>(
              "SELECT ? + ? AS value",
              [5, 10]
            );
            return rows;
          }).pipe(Effect.provide(TestSqlLive))
        )
      );
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(15);
    });

    it("should return empty array for no results", async () => {
      const TestLayer = createTestSqlLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            const rows = yield* sql.query<{ id: string }>(
              "SELECT id FROM prompts WHERE id = ?",
              ["non-existent-id"]
            );
            return rows;
          }).pipe(Effect.provide(TestLayer))
        )
      );
      expect(result).toHaveLength(0);
    });

    it("should fail with SqlError for invalid SQL", async () => {
      const error = await runTestExpectError(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            return yield* sql.query("SELECT * FROM nonexistent_table");
          }).pipe(Effect.provide(TestSqlLive))
        ),
        (e): e is SqlError => e._tag === "SqlError"
      );
      expect(error._tag).toBe("SqlError");
      expect(error.message).toBe("Query execution failed");
    });
  });

  describe("run", () => {
    it("should execute CREATE TABLE statement", async () => {
      await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            yield* sql.run(`
              CREATE TABLE test_table (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL
              )
            `);
            // Verify table exists
            const rows = yield* sql.query<{ name: string }>(
              `SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'`
            );
            expect(rows).toHaveLength(1);
          }).pipe(Effect.provide(TestSqlLive))
        )
      );
    });

    it("should execute INSERT statement with parameters", async () => {
      await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            yield* sql.run("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");
            yield* sql.run("INSERT INTO items (name) VALUES (?)", ["test-item"]);
            const rows = yield* sql.query<{ name: string }>(
              "SELECT name FROM items"
            );
            expect(rows).toHaveLength(1);
            expect(rows[0].name).toBe("test-item");
          }).pipe(Effect.provide(TestSqlLive))
        )
      );
    });

    it("should execute UPDATE statement", async () => {
      await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            yield* sql.run("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");
            yield* sql.run("INSERT INTO items (name) VALUES (?)", ["original"]);
            yield* sql.run("UPDATE items SET name = ? WHERE id = 1", ["updated"]);
            const rows = yield* sql.query<{ name: string }>(
              "SELECT name FROM items WHERE id = 1"
            );
            expect(rows[0].name).toBe("updated");
          }).pipe(Effect.provide(TestSqlLive))
        )
      );
    });

    it("should execute DELETE statement", async () => {
      await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            yield* sql.run("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");
            yield* sql.run("INSERT INTO items (name) VALUES (?)", ["to-delete"]);
            yield* sql.run("DELETE FROM items WHERE name = ?", ["to-delete"]);
            const rows = yield* sql.query<{ id: number }>("SELECT id FROM items");
            expect(rows).toHaveLength(0);
          }).pipe(Effect.provide(TestSqlLive))
        )
      );
    });

    it("should fail with SqlError for invalid statement", async () => {
      const error = await runTestExpectError(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            return yield* sql.run("INSERT INTO nonexistent_table VALUES (1)");
          }).pipe(Effect.provide(TestSqlLive))
        ),
        (e): e is SqlError => e._tag === "SqlError"
      );
      expect(error._tag).toBe("SqlError");
      expect(error.message).toBe("Statement execution failed");
    });
  });

  describe("transaction", () => {
    it("should commit successful transaction", async () => {
      await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            yield* sql.run("CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)");
            yield* sql.run("INSERT INTO accounts VALUES (1, 100)");
            yield* sql.run("INSERT INTO accounts VALUES (2, 50)");

            yield* sql.transaction(
              Effect.gen(function* () {
                yield* sql.run("UPDATE accounts SET balance = balance - 30 WHERE id = 1");
                yield* sql.run("UPDATE accounts SET balance = balance + 30 WHERE id = 2");
              })
            );

            const rows = yield* sql.query<{ id: number; balance: number }>(
              "SELECT * FROM accounts ORDER BY id"
            );
            expect(rows[0].balance).toBe(70);
            expect(rows[1].balance).toBe(80);
          }).pipe(Effect.provide(TestSqlLive))
        )
      );
    });

    it("should rollback failed transaction", async () => {
      await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            yield* sql.run("CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)");
            yield* sql.run("INSERT INTO accounts VALUES (1, 100)");
            yield* sql.run("INSERT INTO accounts VALUES (2, 50)");

            // Try a transaction that will fail
            const result = yield* Effect.either(
              sql.transaction(
                Effect.gen(function* () {
                  yield* sql.run("UPDATE accounts SET balance = balance - 30 WHERE id = 1");
                  // This will cause the transaction to fail
                  return yield* Effect.fail(new Error("Simulated failure"));
                })
              )
            );

            expect(result._tag).toBe("Left");

            // Verify rollback - balances should be unchanged
            const rows = yield* sql.query<{ id: number; balance: number }>(
              "SELECT * FROM accounts ORDER BY id"
            );
            expect(rows[0].balance).toBe(100);
            expect(rows[1].balance).toBe(50);
          }).pipe(Effect.provide(TestSqlLive))
        )
      );
    });

    it("should return value from successful transaction", async () => {
      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            yield* sql.run("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");

            const insertedId = yield* sql.transaction(
              Effect.gen(function* () {
                yield* sql.run("INSERT INTO items (name) VALUES (?)", ["item1"]);
                const rows = yield* sql.query<{ id: number }>(
                  "SELECT last_insert_rowid() as id"
                );
                return rows[0].id;
              })
            );

            return insertedId;
          }).pipe(Effect.provide(TestSqlLive))
        )
      );
      expect(result).toBe(1);
    });

    it("should propagate error from failed transaction", async () => {
      class CustomError {
        readonly _tag = "CustomError";
        constructor(readonly message: string) {}
      }

      const error = await runTestExpectError(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            yield* sql.run("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");

            return yield* sql.transaction(
              Effect.gen(function* () {
                yield* sql.run("INSERT INTO items (name) VALUES (?)", ["item1"]);
                return yield* Effect.fail(new CustomError("Custom failure"));
              })
            );
          }).pipe(Effect.provide(TestSqlLive))
        ),
        (e): e is CustomError => (e as CustomError)._tag === "CustomError"
      );
      expect(error._tag).toBe("CustomError");
      expect(error.message).toBe("Custom failure");
    });
  });

  describe("createTestSqlLayer (with migrations)", () => {
    it("should have prompts table after migrations", async () => {
      const TestLayer = createTestSqlLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            const tables = yield* sql.query<{ name: string }>(
              `SELECT name FROM sqlite_master WHERE type='table' AND name='prompts'`
            );
            return tables.length > 0;
          }).pipe(Effect.provide(TestLayer))
        )
      );
      expect(result).toBe(true);
    });

    it("should have tags table after migrations", async () => {
      const TestLayer = createTestSqlLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            const tables = yield* sql.query<{ name: string }>(
              `SELECT name FROM sqlite_master WHERE type='table' AND name='tags'`
            );
            return tables.length > 0;
          }).pipe(Effect.provide(TestLayer))
        )
      );
      expect(result).toBe(true);
    });

    it("should have prompts_fts table after migrations", async () => {
      const TestLayer = createTestSqlLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            const tables = yield* sql.query<{ name: string }>(
              `SELECT name FROM sqlite_master WHERE type='table' AND name='prompts_fts'`
            );
            return tables.length > 0;
          }).pipe(Effect.provide(TestLayer))
        )
      );
      expect(result).toBe(true);
    });

    it("should allow CRUD operations on prompts table", async () => {
      const TestLayer = createTestSqlLayer();

      await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            const now = new Date().toISOString();

            // Insert
            yield* sql.run(
              `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              ["test-id", "Test Prompt", "hash123", "/test/path.md", now, now]
            );

            // Read
            const rows = yield* sql.query<{ id: string; name: string }>(
              "SELECT id, name FROM prompts WHERE id = ?",
              ["test-id"]
            );
            expect(rows).toHaveLength(1);
            expect(rows[0].name).toBe("Test Prompt");

            // Update
            yield* sql.run(
              "UPDATE prompts SET name = ? WHERE id = ?",
              ["Updated Prompt", "test-id"]
            );

            const updated = yield* sql.query<{ name: string }>(
              "SELECT name FROM prompts WHERE id = ?",
              ["test-id"]
            );
            expect(updated[0].name).toBe("Updated Prompt");

            // Delete
            yield* sql.run("DELETE FROM prompts WHERE id = ?", ["test-id"]);

            const deleted = yield* sql.query<{ id: string }>(
              "SELECT id FROM prompts WHERE id = ?",
              ["test-id"]
            );
            expect(deleted).toHaveLength(0);
          }).pipe(Effect.provide(TestLayer))
        )
      );
    });
  });
});
