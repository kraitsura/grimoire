/**
 * Archive Service Tests
 *
 * Comprehensive tests for the ArchiveService which manages
 * archiving, restoring, and purging prompts.
 */

import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  ArchiveService,
  ArchiveServiceLive,
} from "../../src/services/archive-service";
import { SqlService } from "../../src/services/sql-service";
import { PromptStorageService } from "../../src/services/prompt-storage-service";
import { createTestSqlLayer, runTest } from "../utils";
import { PromptNotFoundError, StorageError } from "../../src/models";

describe("ArchiveService", () => {
  // Create a minimal mock for PromptStorageService
  const MockPromptStorageLive = Layer.succeed(PromptStorageService, {
    readPrompt: (path: string) =>
      Effect.succeed({
        frontmatter: {
          id: "test-id",
          name: "Restored Prompt",
          created: new Date("2025-01-01"),
          updated: new Date("2025-01-01"),
          tags: ["tag1", "tag2"],
          version: 1,
          isTemplate: false,
        },
        content: "Restored content",
      }),
    writePrompt: () => Effect.void,
    computeHash: (content: string) => Effect.succeed(`hash-${content.length}`),
    readMetadataOnly: () => Effect.die("Not implemented"),
  });

  // Create the test SQL layer (in-memory with migrations)
  const TestSqlLayer = createTestSqlLayer();

  // Helper to run effects with proper layer composition
  // ArchiveService needs both SqlService and PromptStorageService
  const runEffect = async <A, E>(effect: Effect.Effect<A, E, any>) =>
    runTest(
      effect.pipe(
        Effect.provide(ArchiveServiceLive),
        Effect.provide(MockPromptStorageLive),
        Effect.provide(TestSqlLayer),
        Effect.scoped
      )
    );

  // Helper to insert a test prompt
  const insertTestPrompt = (name: string, id?: string) =>
    Effect.gen(function* () {
      const sql = yield* SqlService;
      const promptId = id ?? crypto.randomUUID();
      const filePath = `/test/prompts/${promptId}.md`;

      yield* sql.run(
        `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at, is_template, version)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 0, 1)`,
        [promptId, name, `hash-${promptId}`, filePath]
      );

      return { promptId, filePath };
    });

  // Helper to insert a test archived prompt
  const insertArchivedPrompt = (name: string, daysAgo = 0) =>
    Effect.gen(function* () {
      const sql = yield* SqlService;
      const promptId = crypto.randomUUID();
      const archivePath = `/test/archive/${promptId}.md`;
      const originalPath = `/test/prompts/${promptId}.md`;

      const archivedAt = new Date();
      archivedAt.setDate(archivedAt.getDate() - daysAgo);

      yield* sql.run(
        `INSERT INTO archived_prompts (id, name, archived_at, original_path, archive_path)
         VALUES (?, ?, ?, ?, ?)`,
        [promptId, name, archivedAt.toISOString(), originalPath, archivePath]
      );

      return { promptId, archivePath, originalPath };
    });

  describe("archive", () => {
    test("returns 0 when given empty array", async () => {
      const program = Effect.gen(function* () {
        const archiveService = yield* ArchiveService;
        return yield* archiveService.archive([]);
      });

      const result = await runEffect(program);
      expect(result).toBe(0);
    });
  });

  describe("list", () => {
    test("returns empty array when no archived prompts", async () => {
      const program = Effect.gen(function* () {
        const archiveService = yield* ArchiveService;
        return yield* archiveService.list();
      });

      const result = await runEffect(program);
      expect(result).toEqual([]);
    });

    test("returns archived prompts sorted by date descending", async () => {
      const program = Effect.gen(function* () {
        const archiveService = yield* ArchiveService;

        // Insert archived prompts with different dates
        yield* insertArchivedPrompt("Older Archive", 10);
        yield* insertArchivedPrompt("Newer Archive", 1);
        yield* insertArchivedPrompt("Oldest Archive", 30);

        return yield* archiveService.list();
      });

      const result = await runEffect(program);
      expect(result.length).toBe(3);
      // Should be sorted by archived_at DESC
      expect(result[0].name).toBe("Newer Archive");
      expect(result[1].name).toBe("Older Archive");
      expect(result[2].name).toBe("Oldest Archive");
    });

    test("returns all properties of archived prompts", async () => {
      const program = Effect.gen(function* () {
        const archiveService = yield* ArchiveService;
        yield* insertArchivedPrompt("Test Archive", 0);
        return yield* archiveService.list();
      });

      const result = await runEffect(program);
      expect(result.length).toBe(1);
      const archived = result[0];

      expect(archived).toHaveProperty("id");
      expect(archived).toHaveProperty("name");
      expect(archived).toHaveProperty("archivedAt");
      expect(archived).toHaveProperty("originalPath");
      expect(archived).toHaveProperty("archivePath");
      expect(archived.name).toBe("Test Archive");
      expect(archived.archivedAt).toBeInstanceOf(Date);
    });
  });

  describe("restore", () => {
    test("returns 0 when given empty array", async () => {
      const program = Effect.gen(function* () {
        const archiveService = yield* ArchiveService;
        return yield* archiveService.restore([]);
      });

      const result = await runEffect(program);
      expect(result).toBe(0);
    });

    test("fails when archived prompt does not exist", async () => {
      const program = Effect.gen(function* () {
        const archiveService = yield* ArchiveService;
        return yield* archiveService.restore(["nonexistent"]);
      });

      await expect(runEffect(program)).rejects.toThrow();
    });
  });

  describe("database operations", () => {
    test("creates archived_prompts table on initialization", async () => {
      const program = Effect.gen(function* () {
        const sql = yield* SqlService;
        const _ = yield* ArchiveService;

        const tables = yield* sql.query<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='archived_prompts'"
        );

        return tables;
      });

      const result = await runEffect(program);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("archived_prompts");
    });

    test("archived_prompts table has correct schema", async () => {
      const program = Effect.gen(function* () {
        const sql = yield* SqlService;
        const _ = yield* ArchiveService;

        const columns = yield* sql.query<{ name: string; type: string }>(
          "PRAGMA table_info(archived_prompts)"
        );

        return columns;
      });

      const result = await runEffect(program);
      const columnNames = result.map((c) => c.name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("name");
      expect(columnNames).toContain("archived_at");
      expect(columnNames).toContain("original_path");
      expect(columnNames).toContain("archive_path");
    });
  });

  describe("edge cases", () => {
    test("handles multiple archives of same prompt name", async () => {
      const program = Effect.gen(function* () {
        const archiveService = yield* ArchiveService;

        // Archive prompts with same name but different IDs
        yield* insertArchivedPrompt("Duplicate Name", 1);
        yield* insertArchivedPrompt("Duplicate Name", 2);

        const archived = yield* archiveService.list();
        return archived;
      });

      const result = await runEffect(program);
      expect(result.length).toBe(2);
      expect(result[0].name).toBe("Duplicate Name");
      expect(result[1].name).toBe("Duplicate Name");
      // But they should have different IDs
      expect(result[0].id).not.toBe(result[1].id);
    });

    test("handles special characters in prompt names", async () => {
      const program = Effect.gen(function* () {
        const archiveService = yield* ArchiveService;

        yield* insertArchivedPrompt("Prompt with 'quotes' and \"double quotes\"", 0);
        yield* insertArchivedPrompt("Prompt with emoji 🎉", 0);
        yield* insertArchivedPrompt("Prompt with unicode: 日本語", 0);

        const archived = yield* archiveService.list();
        return archived;
      });

      const result = await runEffect(program);
      expect(result.length).toBe(3);
      const names = result.map((a) => a.name);
      expect(names).toContain("Prompt with 'quotes' and \"double quotes\"");
      expect(names).toContain("Prompt with emoji 🎉");
      expect(names).toContain("Prompt with unicode: 日本語");
    });
  });
});
