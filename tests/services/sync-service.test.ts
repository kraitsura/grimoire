/**
 * SyncService Unit Tests
 *
 * Tests the synchronization service that keeps:
 * - Filesystem (markdown files) in sync with
 * - SQLite database (metadata, FTS index)
 *
 * Uses mock PromptStorageService and in-memory SQLite.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Effect, Layer, Ref } from "effect";
import { SyncService, SyncLive, type SyncResult, type IntegrityResult } from "../../src/services/sync-service";
import { SqlService } from "../../src/services/sql-service";
import { PromptStorageService } from "../../src/services/prompt-storage-service";
import { StorageError } from "../../src/models";
import type { Frontmatter } from "../../src/models/prompt";
import {
  runTest,
  createTestSqlLayer,
  FIXED_DATE,
  resetUuidCounter,
  testUuid,
} from "../utils";

/**
 * Create a mock PromptStorageService that stores files in memory
 */
const createMockPromptStorageLayer = (
  initialFiles: Record<string, { frontmatter: Frontmatter; content: string }> = {}
) => {
  return Layer.effect(
    PromptStorageService,
    Effect.gen(function* () {
      const filesRef = yield* Ref.make<Map<string, { frontmatter: Frontmatter; content: string }>>(
        new Map(Object.entries(initialFiles))
      );

      return PromptStorageService.of({
        readPrompt: (path: string) =>
          Effect.gen(function* () {
            const files = yield* Ref.get(filesRef);
            const file = files.get(path);
            if (!file) {
              return yield* Effect.fail(
                new StorageError({ message: `Failed to read prompt file: ${path}` })
              );
            }
            return {
              frontmatter: file.frontmatter,
              content: file.content,
            };
          }),

        writePrompt: (path: string, frontmatter: Frontmatter, content: string) =>
          Effect.gen(function* () {
            yield* Ref.update(filesRef, (files) => {
              files.set(path, { frontmatter, content });
              return files;
            });
          }),

        listPrompts: () =>
          Effect.gen(function* () {
            const files = yield* Ref.get(filesRef);
            return Array.from(files.keys()).filter((p) => p.endsWith(".md"));
          }),

        computeHash: (content: string) =>
          Effect.sync(() => {
            const hasher = new Bun.CryptoHasher("sha256");
            hasher.update(content);
            return hasher.digest("hex");
          }),
      });
    })
  );
};

/**
 * Create the test layer stack with specified initial files
 */
const createSyncTestLayer = (
  initialFiles: Record<string, { frontmatter: Frontmatter; content: string }> = {}
) => {
  const sqlLayer = createTestSqlLayer();
  const promptStorageLayer = createMockPromptStorageLayer(initialFiles);

  const syncLayer = SyncLive.pipe(
    Layer.provide(sqlLayer),
    Layer.provide(promptStorageLayer)
  );

  return Layer.mergeAll(sqlLayer, promptStorageLayer, syncLayer);
};

/**
 * Helper to create a mock file entry
 */
const createMockFileEntry = (
  id: string,
  name: string,
  content: string,
  options: Partial<Frontmatter> = {}
): { frontmatter: Frontmatter; content: string } => ({
  frontmatter: {
    id,
    name,
    created: options.created ?? FIXED_DATE,
    updated: options.updated ?? FIXED_DATE,
    tags: options.tags,
    version: options.version ?? 1,
    isTemplate: options.isTemplate,
    isFavorite: options.isFavorite,
    favoriteOrder: options.favoriteOrder,
    isPinned: options.isPinned,
    pinOrder: options.pinOrder,
  },
  content,
});

describe("SyncService", () => {
  beforeEach(() => {
    resetUuidCounter();
  });

  describe("syncFile", () => {
    it("should insert a new file into the database", async () => {
      const id = testUuid();
      const TestLayer = createSyncTestLayer({
        "/mock/prompts/test.md": createMockFileEntry(id, "Test Prompt", "Test content."),
      });

      await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sync = yield* SyncService;
            const sql = yield* SqlService;

            yield* sync.syncFile("/mock/prompts/test.md");

            const rows = yield* sql.query<{ id: string; name: string }>(
              "SELECT id, name FROM prompts WHERE id = ?",
              [id]
            );

            expect(rows).toHaveLength(1);
            expect(rows[0].name).toBe("Test Prompt");
          }).pipe(Effect.provide(TestLayer))
        )
      );
    });

    it("should update an existing file in the database", async () => {
      const id = testUuid();
      const TestLayer = createSyncTestLayer({
        "/mock/prompts/test.md": createMockFileEntry(id, "Original Name", "Original content."),
      });

      await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sync = yield* SyncService;
            const sql = yield* SqlService;
            const storage = yield* PromptStorageService;

            // First sync
            yield* sync.syncFile("/mock/prompts/test.md");

            // Update the file
            yield* storage.writePrompt(
              "/mock/prompts/test.md",
              {
                id,
                name: "Updated Name",
                created: FIXED_DATE,
                updated: new Date(),
                version: 2,
              },
              "Updated content."
            );

            // Sync again
            yield* sync.syncFile("/mock/prompts/test.md");

            const rows = yield* sql.query<{ name: string; version: number }>(
              "SELECT name, version FROM prompts WHERE id = ?",
              [id]
            );

            expect(rows[0].name).toBe("Updated Name");
            expect(rows[0].version).toBe(2);
          }).pipe(Effect.provide(TestLayer))
        )
      );
    });

    it("should add file to FTS index", async () => {
      const id = testUuid();
      const TestLayer = createSyncTestLayer({
        "/mock/prompts/test.md": createMockFileEntry(id, "Searchable Prompt", "Unique searchable content."),
      });

      await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sync = yield* SyncService;
            const sql = yield* SqlService;

            yield* sync.syncFile("/mock/prompts/test.md");

            // Check FTS entry exists
            const ftsRows = yield* sql.query<{ prompt_id: string }>(
              "SELECT prompt_id FROM prompts_fts WHERE prompt_id = ?",
              [id]
            );

            expect(ftsRows).toHaveLength(1);
          }).pipe(Effect.provide(TestLayer))
        )
      );
    });

    it("should sync tags to database", async () => {
      const id = testUuid();
      const TestLayer = createSyncTestLayer({
        "/mock/prompts/test.md": createMockFileEntry(id, "Tagged Prompt", "Content.", {
          tags: ["coding", "typescript"],
        }),
      });

      await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sync = yield* SyncService;
            const sql = yield* SqlService;

            yield* sync.syncFile("/mock/prompts/test.md");

            // Check tags were created
            const tags = yield* sql.query<{ name: string }>(
              `SELECT t.name FROM tags t
               JOIN prompt_tags pt ON t.id = pt.tag_id
               WHERE pt.prompt_id = ?
               ORDER BY t.name`,
              [id]
            );

            expect(tags).toHaveLength(2);
            expect(tags.map((t) => t.name)).toEqual(["coding", "typescript"]);
          }).pipe(Effect.provide(TestLayer))
        )
      );
    });
  });

  describe("fullSync", () => {
    it("should sync all files in the prompts directory", async () => {
      const id1 = testUuid();
      const id2 = testUuid();
      const TestLayer = createSyncTestLayer({
        "/mock/prompts/prompt1.md": createMockFileEntry(id1, "Prompt 1", "Content 1."),
        "/mock/prompts/prompt2.md": createMockFileEntry(id2, "Prompt 2", "Content 2."),
      });

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sync = yield* SyncService;
            return yield* sync.fullSync();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.filesScanned).toBe(2);
      expect(result.filesCreated).toBe(2);
      expect(result.filesUpdated).toBe(0);
      expect(result.filesRemoved).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should return correct counts for updated files", async () => {
      const id = testUuid();
      const TestLayer = createSyncTestLayer({
        "/mock/prompts/test.md": createMockFileEntry(id, "Test Prompt", "Content."),
      });

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sync = yield* SyncService;
            const storage = yield* PromptStorageService;

            // First sync
            yield* sync.fullSync();

            // Update file
            yield* storage.writePrompt(
              "/mock/prompts/test.md",
              {
                id,
                name: "Updated Prompt",
                created: FIXED_DATE,
                updated: new Date(),
                version: 2,
              },
              "Updated content."
            );

            // Sync again
            return yield* sync.fullSync();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.filesScanned).toBe(1);
      expect(result.filesCreated).toBe(0);
      expect(result.filesUpdated).toBe(1);
    });

    it("should handle empty prompts directory", async () => {
      const TestLayer = createSyncTestLayer({});

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sync = yield* SyncService;
            return yield* sync.fullSync();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.filesScanned).toBe(0);
      expect(result.filesCreated).toBe(0);
      expect(result.filesUpdated).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("checkIntegrity", () => {
    it("should return valid for empty state", async () => {
      const TestLayer = createSyncTestLayer({});

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sync = yield* SyncService;
            return yield* sync.checkIntegrity();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.isValid).toBe(true);
      expect(result.missingFiles).toHaveLength(0);
      expect(result.orphanedDbRecords).toHaveLength(0);
      expect(result.hashMismatches).toHaveLength(0);
    });

    it("should return valid after successful sync", async () => {
      const id = testUuid();
      const TestLayer = createSyncTestLayer({
        "/mock/prompts/test.md": createMockFileEntry(id, "Test Prompt", "Content."),
      });

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sync = yield* SyncService;

            // Sync first
            yield* sync.fullSync();

            // Check integrity
            return yield* sync.checkIntegrity();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.isValid).toBe(true);
    });

    it("should detect missing files (files in DB but not on disk)", async () => {
      const id = testUuid();
      const TestLayer = createSyncTestLayer({
        "/mock/prompts/test.md": createMockFileEntry(id, "Test Prompt", "Content."),
      });

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sync = yield* SyncService;
            const sql = yield* SqlService;

            // Sync the file
            yield* sync.fullSync();

            // Manually add a database record for a non-existent file
            const now = new Date().toISOString();
            yield* sql.run(
              `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              ["orphaned-id", "Orphaned", "hash", "/mock/prompts/missing.md", now, now]
            );

            // Check integrity
            return yield* sync.checkIntegrity();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.isValid).toBe(false);
      expect(result.orphanedDbRecords).toContain("/mock/prompts/missing.md");
    });
  });
});
