/**
 * Test Infrastructure Verification Tests
 *
 * These tests verify that the test utilities work correctly.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Effect, Layer } from "effect";
import {
  runTest,
  runTestExpectFailure,
  runScopedTest,
  runTestWithTimeout,
  TestTimeoutError,
  createMockLayer,
  TestSqlLive,
  TestSqlWithMigrationsLive,
  createTestSqlLayer,
  createPrompt,
  createFrontmatter,
  createVersion,
  createBranch,
  createSkillManifest,
  SAMPLE_PROMPTS,
  SAMPLE_SKILLS,
  FIXED_DATE,
  testUuid,
  resetUuidCounter,
  MockFsLive,
  MockFs,
  mockFsWithFiles,
  MockFsError,
  normalizeForSnapshot,
  stripAnsi,
  redactSensitive,
} from "./index";
import { SqlService } from "../../src/services/sql-service";

describe("Test Infrastructure", () => {
  beforeEach(() => {
    resetUuidCounter();
  });

  describe("runTest", () => {
    it("should run a successful Effect", async () => {
      const result = await runTest(Effect.succeed(42));
      expect(result).toBe(42);
    });

    it("should throw on Effect failure", async () => {
      const effect = Effect.fail(new Error("test error"));
      await expect(runTest(effect)).rejects.toThrow("test error");
    });
  });

  describe("runTestExpectFailure", () => {
    it("should return the error on failure", async () => {
      const error = await runTestExpectFailure(
        Effect.fail({ _tag: "TestError", message: "oops" })
      );
      expect(error._tag).toBe("TestError");
      expect(error.message).toBe("oops");
    });

    it("should throw if Effect succeeds", async () => {
      await expect(
        runTestExpectFailure(Effect.succeed("unexpected"))
      ).rejects.toThrow("Expected effect to fail");
    });
  });

  describe("runScopedTest", () => {
    it("should handle scoped effects with cleanup", async () => {
      let cleaned = false;
      const result = await runScopedTest(
        Effect.acquireRelease(
          Effect.succeed(42),
          () => Effect.sync(() => { cleaned = true; })
        )
      );
      expect(result).toBe(42);
      expect(cleaned).toBe(true);
    });
  });

  describe("runTestWithTimeout", () => {
    it("should complete fast effects", async () => {
      const result = await runTestWithTimeout(
        Effect.succeed(42),
        1000
      );
      expect(result).toBe(42);
    });

    it("should fail slow effects with TestTimeoutError", async () => {
      await expect(
        runTestWithTimeout(
          Effect.sleep("500 millis").pipe(Effect.map(() => 42)),
          50
        )
      ).rejects.toThrow("Test timed out after 50ms");
    });
  });

  describe("Fixtures", () => {
    it("should create unique UUIDs", () => {
      const id1 = testUuid();
      const id2 = testUuid();
      expect(id1).not.toBe(id2);
    });

    it("should reset UUID counter", () => {
      testUuid();
      resetUuidCounter();
      const id = testUuid();
      expect(id).toBe("test00000001-0000-0000-0000-000000000000");
    });

    it("should create a prompt with defaults", () => {
      const prompt = createPrompt();
      expect(prompt.id).toBeDefined();
      expect(prompt.name).toContain("Test Prompt");
      expect(prompt.content).toBeDefined();
      expect(prompt.created).toEqual(FIXED_DATE);
    });

    it("should create a prompt with custom values", () => {
      const prompt = createPrompt({
        name: "Custom",
        content: "Custom content",
        tags: ["a", "b"],
      });
      expect(prompt.name).toBe("Custom");
      expect(prompt.content).toBe("Custom content");
      expect(prompt.tags).toEqual(["a", "b"]);
    });

    it("should have sample prompts", () => {
      expect(SAMPLE_PROMPTS.simple).toBeDefined();
      expect(SAMPLE_PROMPTS.withTags.tags).toHaveLength(3);
      expect(SAMPLE_PROMPTS.template.isTemplate).toBe(true);
    });

    it("should create frontmatter", () => {
      const fm = createFrontmatter({ name: "Test" });
      expect(fm.name).toBe("Test");
      expect(fm.created).toEqual(FIXED_DATE);
    });

    it("should create versions", () => {
      const version = createVersion({ content: "v1 content" });
      expect(version.content).toBe("v1 content");
      expect(version.branch).toBe("main");
    });

    it("should create branches", () => {
      const branch = createBranch({ name: "feature" });
      expect(branch.name).toBe("feature");
      expect(branch.isActive).toBe(true);
    });

    it("should create skill manifests", () => {
      const skill = createSkillManifest({ name: "test-skill" });
      expect(skill.name).toBe("test-skill");
    });

    it("should have sample skills", () => {
      expect(SAMPLE_SKILLS.minimal).toBeDefined();
      expect(SAMPLE_SKILLS.withTools.allowed_tools).toContain("Read");
    });
  });

  describe("Mock Filesystem", () => {
    it("should provide an empty filesystem", async () => {
      const result = await runTest(
        Effect.gen(function* () {
          const fs = yield* MockFs;
          const files = yield* fs.listFiles();
          return files;
        }).pipe(Effect.provide(MockFsLive))
      );
      expect(result).toEqual([]);
    });

    it("should allow setting and reading files", async () => {
      const result = await runTest(
        Effect.gen(function* () {
          const fs = yield* MockFs;
          yield* fs.setFile("/test.txt", "hello");
          const content = yield* fs.readFile("/test.txt");
          return content;
        }).pipe(Effect.provide(MockFsLive))
      );
      expect(result).toBe("hello");
    });

    it("should pre-populate with files", async () => {
      const result = await runTest(
        Effect.gen(function* () {
          const fs = yield* MockFs;
          const content = yield* fs.readFile("/preset.txt");
          return content;
        }).pipe(
          Effect.provide(
            mockFsWithFiles({ "/preset.txt": "preset content" })
          )
        )
      );
      expect(result).toBe("preset content");
    });

    it("should inject errors via setError", async () => {
      const error = await runTestExpectFailure(
        Effect.gen(function* () {
          const fs = yield* MockFs;
          yield* fs.setFile("/test.txt", "content");
          yield* fs.setError("/test.txt", new Error("disk full"));
          return yield* fs.readFile("/test.txt");
        }).pipe(Effect.provide(MockFsLive))
      );
      expect(error).toBeInstanceOf(MockFsError);
      expect((error as MockFsError).message).toBe("disk full");
    });

    it("should clear errors via clearError", async () => {
      const result = await runTest(
        Effect.gen(function* () {
          const fs = yield* MockFs;
          yield* fs.setFile("/test.txt", "content");
          yield* fs.setError("/test.txt", new Error("disk full"));
          yield* fs.clearError("/test.txt");
          return yield* fs.readFile("/test.txt");
        }).pipe(Effect.provide(MockFsLive))
      );
      expect(result).toBe("content");
    });
  });

  describe("Snapshot Utilities", () => {
    it("should normalize paths", () => {
      const input = "/Users/john/Projects/grimoire";
      const normalized = normalizeForSnapshot(input);
      expect(normalized).toBe("/Users/<user>/Projects/grimoire");
    });

    it("should normalize timestamps", () => {
      const input = "Created at 2025-01-15T10:30:00.000Z";
      const normalized = normalizeForSnapshot(input);
      expect(normalized).toBe("Created at <timestamp>");
    });

    it("should normalize UUIDs", () => {
      const input = "ID: 550e8400-e29b-41d4-a716-446655440000";
      const normalized = normalizeForSnapshot(input);
      expect(normalized).toBe("ID: <uuid>");
    });

    it("should strip ANSI codes", () => {
      const input = "\x1b[31mred\x1b[0m and \x1b[32mgreen\x1b[0m";
      const stripped = stripAnsi(input);
      expect(stripped).toBe("red and green");
    });

    it("should redact API keys", () => {
      const input = "Key: sk-abc123def456789012345";
      const redacted = redactSensitive(input);
      expect(redacted).toBe("Key: <api-key>");
    });
  });

  describe("Mock SQLite", () => {
    it("should provide an in-memory database", async () => {
      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            const rows = yield* sql.query<{ result: number }>(
              "SELECT 1 + 1 AS result"
            );
            return rows[0].result;
          }).pipe(Effect.provide(TestSqlLive))
        )
      );
      expect(result).toBe(2);
    });

    it("should run migrations with createTestSqlLayer", async () => {
      const TestLayer = createTestSqlLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            // After migrations, prompts table should exist
            const tables = yield* sql.query<{ name: string }>(
              `SELECT name FROM sqlite_master WHERE type='table' AND name='prompts'`
            );
            return tables.length > 0;
          }).pipe(Effect.provide(TestLayer))
        )
      );
      expect(result).toBe(true);
    });

    it("should run migrations on same database with TestSqlWithMigrationsLive", async () => {
      // This test verifies the fix - migrations must run on the same DB that's returned
      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;

            // Verify prompts table exists (from migrations)
            const tables = yield* sql.query<{ name: string }>(
              `SELECT name FROM sqlite_master WHERE type='table' AND name='prompts'`
            );
            if (tables.length === 0) {
              return yield* Effect.fail(new Error("prompts table not found - migrations not run on this database"));
            }

            // Insert a prompt and verify it persists (using actual schema columns)
            const now = new Date().toISOString();
            yield* sql.run(
              `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
              ["test-id", "Test", "hash123", "/test/path.md", now, now]
            );

            const rows = yield* sql.query<{ id: string }>(
              `SELECT id FROM prompts WHERE id = ?`,
              ["test-id"]
            );

            return rows.length === 1;
          }).pipe(Effect.provide(TestSqlWithMigrationsLive))
        )
      );
      expect(result).toBe(true);
    });
  });
});
