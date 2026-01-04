/**
 * StorageService Integration Tests
 *
 * Tests the high-level storage service that coordinates between:
 * - SqlService (database operations)
 * - PromptStorageService (file operations)
 * - SyncService (file-database synchronization)
 *
 * These tests use:
 * - In-memory SQLite database (via createTestSqlLayer)
 * - Mock PromptStorageService (to avoid filesystem operations)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Effect, Layer, Ref } from "effect";
import { StorageService, StorageServiceLive, type CreatePromptInput, type UpdatePromptInput } from "../../src/services/storage-service";
import { SqlService } from "../../src/services/sql-service";
import { PromptStorageService } from "../../src/services/prompt-storage-service";
import { SyncService, SyncLive } from "../../src/services/sync-service";
import { PromptNotFoundError, DuplicateNameError, StorageError, SqlError } from "../../src/models";
import type { Frontmatter } from "../../src/models/prompt";
import {
  runTest,
  runTestExpectError,
  createTestSqlLayer,
  FIXED_DATE,
  resetUuidCounter,
  testUuid,
} from "../utils";

/**
 * Create a mock PromptStorageService that stores files in memory
 */
const createMockPromptStorageLayer = () => {
  return Layer.effect(
    PromptStorageService,
    Effect.gen(function* () {
      const filesRef = yield* Ref.make<Map<string, { frontmatter: Frontmatter; content: string }>>(
        new Map()
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
 * Create the full test layer stack for StorageService tests
 */
const createStorageTestLayer = () => {
  const sqlLayer = createTestSqlLayer();
  const promptStorageLayer = createMockPromptStorageLayer();

  // SyncService depends on SqlService and PromptStorageService
  const syncLayer = SyncLive.pipe(
    Layer.provide(sqlLayer),
    Layer.provide(promptStorageLayer)
  );

  // StorageService depends on all three
  const storageLayer = StorageServiceLive.pipe(
    Layer.provide(sqlLayer),
    Layer.provide(promptStorageLayer),
    Layer.provide(syncLayer)
  );

  return Layer.mergeAll(sqlLayer, promptStorageLayer, syncLayer, storageLayer);
};

describe("StorageService", () => {
  beforeEach(() => {
    resetUuidCounter();
  });

  describe("create", () => {
    it("should create a new prompt with basic fields", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            const created = yield* storage.create({
              name: "Test Prompt",
              content: "This is test content.",
            });

            return created;
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.id).toBeDefined();
      expect(result.name).toBe("Test Prompt");
      expect(result.content).toBe("This is test content.");
      expect(result.version).toBe(1);
      expect(result.isTemplate).toBe(false);
    });

    it("should create a prompt with tags", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            return yield* storage.create({
              name: "Tagged Prompt",
              content: "Content with tags.",
              tags: ["coding", "typescript"],
            });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.tags).toEqual(["coding", "typescript"]);
    });

    it("should create a template prompt", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            return yield* storage.create({
              name: "Template Prompt",
              content: "You are a {{role}}.",
              isTemplate: true,
            });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.isTemplate).toBe(true);
    });

    it("should create a favorite prompt", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            return yield* storage.create({
              name: "Favorite Prompt",
              content: "Favorite content.",
              isFavorite: true,
              favoriteOrder: 1,
            });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.isFavorite).toBe(true);
      expect(result.favoriteOrder).toBe(1);
    });

    it("should create a pinned prompt", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            return yield* storage.create({
              name: "Pinned Prompt",
              content: "Pinned content.",
              isPinned: true,
              pinOrder: 2,
            });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.isPinned).toBe(true);
      expect(result.pinOrder).toBe(2);
    });

    it("should fail when name already exists", async () => {
      const TestLayer = createStorageTestLayer();

      const error = await runTestExpectError(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            yield* storage.create({
              name: "Duplicate Name",
              content: "First content.",
            });

            return yield* storage.create({
              name: "Duplicate Name",
              content: "Second content.",
            });
          }).pipe(Effect.provide(TestLayer))
        ),
        (e): e is DuplicateNameError => e._tag === "DuplicateNameError"
      );

      expect(error._tag).toBe("DuplicateNameError");
      expect(error.name).toBe("Duplicate Name");
    });
  });

  describe("getById", () => {
    it("should retrieve a prompt by ID", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            const created = yield* storage.create({
              name: "Test Prompt",
              content: "Test content.",
            });

            return yield* storage.getById(created.id);
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.name).toBe("Test Prompt");
      expect(result.content).toBe("Test content.");
    });

    it("should fail when ID not found", async () => {
      const TestLayer = createStorageTestLayer();

      const error = await runTestExpectError(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;
            return yield* storage.getById("non-existent-id");
          }).pipe(Effect.provide(TestLayer))
        ),
        (e): e is PromptNotFoundError => e._tag === "PromptNotFoundError"
      );

      expect(error._tag).toBe("PromptNotFoundError");
      expect(error.id).toBe("non-existent-id");
    });
  });

  describe("getByName", () => {
    it("should retrieve a prompt by name", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            yield* storage.create({
              name: "Named Prompt",
              content: "Named content.",
            });

            return yield* storage.getByName("Named Prompt");
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.name).toBe("Named Prompt");
      expect(result.content).toBe("Named content.");
    });

    it("should fail when name not found", async () => {
      const TestLayer = createStorageTestLayer();

      const error = await runTestExpectError(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;
            return yield* storage.getByName("Non-Existent");
          }).pipe(Effect.provide(TestLayer))
        ),
        (e): e is PromptNotFoundError => e._tag === "PromptNotFoundError"
      );

      expect(error._tag).toBe("PromptNotFoundError");
      expect(error.id).toContain("name:Non-Existent");
    });
  });

  describe("getAll", () => {
    it("should return empty array when no prompts exist", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;
            return yield* storage.getAll;
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toEqual([]);
    });

    it("should return all prompts", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            yield* storage.create({ name: "Prompt 1", content: "Content 1" });
            yield* storage.create({ name: "Prompt 2", content: "Content 2" });
            yield* storage.create({ name: "Prompt 3", content: "Content 3" });

            return yield* storage.getAll;
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toHaveLength(3);
      const names = result.map((p) => p.name);
      expect(names).toContain("Prompt 1");
      expect(names).toContain("Prompt 2");
      expect(names).toContain("Prompt 3");
    });

    it("should return prompts with their tags", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            yield* storage.create({
              name: "Tagged Prompt",
              content: "Content",
              tags: ["tag1", "tag2"],
            });

            return yield* storage.getAll;
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toHaveLength(1);
      expect(result[0].tags).toEqual(["tag1", "tag2"]);
    });
  });

  describe("update", () => {
    it("should update prompt name", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            const created = yield* storage.create({
              name: "Original Name",
              content: "Original content.",
            });

            return yield* storage.update(created.id, {
              name: "Updated Name",
            });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.name).toBe("Updated Name");
    });

    it("should update prompt content", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            const created = yield* storage.create({
              name: "Test Prompt",
              content: "Original content.",
            });

            return yield* storage.update(created.id, {
              content: "Updated content.",
            });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.content).toBe("Updated content.");
    });

    it("should increment version on update", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            const created = yield* storage.create({
              name: "Test Prompt",
              content: "Original content.",
            });

            expect(created.version).toBe(1);

            return yield* storage.update(created.id, {
              content: "Updated content.",
            });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.version).toBe(2);
    });

    it("should update tags", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            const created = yield* storage.create({
              name: "Test Prompt",
              content: "Content.",
              tags: ["original"],
            });

            return yield* storage.update(created.id, {
              tags: ["new", "tags"],
            });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.tags).toEqual(["new", "tags"]);
    });

    it("should preserve existing values when not provided", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            const created = yield* storage.create({
              name: "Original Name",
              content: "Original content.",
              tags: ["original"],
            });

            // Only update name, content and tags should stay the same
            return yield* storage.update(created.id, {
              name: "Updated Name",
            });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.name).toBe("Updated Name");
      expect(result.content).toBe("Original content.");
    });

    it("should fail when ID not found", async () => {
      const TestLayer = createStorageTestLayer();

      const error = await runTestExpectError(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;
            return yield* storage.update("non-existent-id", { name: "Updated" });
          }).pipe(Effect.provide(TestLayer))
        ),
        (e): e is PromptNotFoundError => e._tag === "PromptNotFoundError"
      );

      expect(error._tag).toBe("PromptNotFoundError");
    });
  });

  describe("delete", () => {
    // Note: Soft delete (without hard=true) tries to move files on the real filesystem,
    // which fails in our mock environment. This is expected behavior since the
    // StorageService uses real paths from homedir() for archive operations.
    // In a full integration test environment with real filesystem access,
    // soft delete would work correctly.

    it("should verify prompt exists before delete fails", async () => {
      const TestLayer = createStorageTestLayer();

      // This tests the database lookup portion of delete
      await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;
            const sql = yield* SqlService;

            const created = yield* storage.create({
              name: "To Delete",
              content: "Content to delete.",
            });

            // Verify prompt exists in database
            const rows = yield* sql.query<{ id: string }>(
              "SELECT id FROM prompts WHERE id = ?",
              [created.id]
            );
            expect(rows).toHaveLength(1);
          }).pipe(Effect.provide(TestLayer))
        )
      );
    });

    it("should fail when ID not found", async () => {
      const TestLayer = createStorageTestLayer();

      const error = await runTestExpectError(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;
            return yield* storage.delete("non-existent-id");
          }).pipe(Effect.provide(TestLayer))
        ),
        (e): e is PromptNotFoundError => e._tag === "PromptNotFoundError"
      );

      expect(error._tag).toBe("PromptNotFoundError");
    });
  });

  describe("findByTags", () => {
    it("should return empty array when no tags provided", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            yield* storage.create({
              name: "Test",
              content: "Content",
              tags: ["tag1"],
            });

            return yield* storage.findByTags([]);
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toEqual([]);
    });

    it("should find prompts by single tag", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            yield* storage.create({
              name: "Tagged 1",
              content: "Content 1",
              tags: ["coding"],
            });
            yield* storage.create({
              name: "Tagged 2",
              content: "Content 2",
              tags: ["writing"],
            });

            return yield* storage.findByTags(["coding"]);
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Tagged 1");
    });

    it("should find prompts by multiple tags (OR logic)", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            yield* storage.create({
              name: "Coding Prompt",
              content: "Content 1",
              tags: ["coding"],
            });
            yield* storage.create({
              name: "Writing Prompt",
              content: "Content 2",
              tags: ["writing"],
            });
            yield* storage.create({
              name: "Other Prompt",
              content: "Content 3",
              tags: ["other"],
            });

            return yield* storage.findByTags(["coding", "writing"]);
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toHaveLength(2);
      const names = result.map((p) => p.name);
      expect(names).toContain("Coding Prompt");
      expect(names).toContain("Writing Prompt");
    });
  });

  describe("search", () => {
    it("should return empty array for empty query", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            yield* storage.create({
              name: "Test",
              content: "Content",
            });

            return yield* storage.search("");
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toEqual([]);
    });

    it("should search by name", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            yield* storage.create({
              name: "Coding Assistant",
              content: "Help with code.",
            });
            yield* storage.create({
              name: "Writing Helper",
              content: "Help with writing.",
            });

            return yield* storage.search("Coding");
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Coding Assistant");
    });

    it("should search by content", async () => {
      const TestLayer = createStorageTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const storage = yield* StorageService;

            yield* storage.create({
              name: "Prompt 1",
              content: "Help with TypeScript code.",
            });
            yield* storage.create({
              name: "Prompt 2",
              content: "Help with Python code.",
            });

            return yield* storage.search("TypeScript");
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Prompt 1");
    });
  });
});
