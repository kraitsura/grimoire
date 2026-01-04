/**
 * Tag Service Tests
 *
 * Comprehensive unit tests for the TagService which manages tag operations
 * across both the SQLite database and file system.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Effect, Layer, Ref } from "effect";
import {
  TagService,
  TagServiceLive,
} from "../../src/services/tag-service";
import { SqlService } from "../../src/services/sql-service";
import { PromptStorageService } from "../../src/services/prompt-storage-service";
import { StorageError } from "../../src/models";
import {
  runTest,
  TestSqlWithMigrationsLive,
  resetUuidCounter,
  FIXED_DATE,
} from "../utils";

/**
 * Mock file storage for testing
 * Tracks files in memory for verification
 */
interface MockFileState {
  files: Map<string, { frontmatter: Record<string, unknown>; content: string }>;
}

const createMockPromptStorage = (
  initialFiles: Array<{
    filePath: string;
    frontmatter: { id: string; name: string; tags?: string[] };
    content: string;
  }> = []
): { layer: Layer.Layer<PromptStorageService>; getFiles: () => Promise<MockFileState["files"]> } => {
  const stateRef = Ref.unsafeMake<MockFileState>({
    files: new Map(
      initialFiles.map((f) => [
        f.filePath,
        {
          frontmatter: { ...f.frontmatter, created: FIXED_DATE, updated: FIXED_DATE },
          content: f.content,
        },
      ])
    ),
  });

  const getFiles = async () => {
    const state = await Effect.runPromise(Ref.get(stateRef));
    return state.files;
  };

  const layer = Layer.succeed(PromptStorageService, {
    readPrompt: (path: string) =>
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef);
        const file = state.files.get(path);
        if (!file) {
          return yield* Effect.fail(new StorageError({ message: `File not found: ${path}` }));
        }
        return {
          frontmatter: file.frontmatter as {
            id: string;
            name: string;
            tags?: string[];
            created: Date;
            updated: Date;
          },
          content: file.content,
        };
      }),

    writePrompt: (path: string, frontmatter: Record<string, unknown>, content: string) =>
      Effect.gen(function* () {
        yield* Ref.update(stateRef, (state) => {
          state.files.set(path, { frontmatter, content });
          return state;
        });
      }),

    listPrompts: () =>
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef);
        return Array.from(state.files.keys());
      }),

    computeHash: (content: string) => Effect.succeed(`hash-${content.length}`),
  } as PromptStorageService["Type"]);

  return { layer, getFiles };
};

/**
 * Seed the database with test prompts and tags
 */
const seedTestData = (
  prompts: Array<{
    id: string;
    name: string;
    filePath: string;
    tags?: string[];
  }>
): Effect.Effect<void, unknown, SqlService> =>
  Effect.gen(function* () {
    const sql = yield* SqlService;
    const now = FIXED_DATE.toISOString();

    for (const prompt of prompts) {
      // Insert into prompts table
      yield* sql.run(
        `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [prompt.id, prompt.name, `hash-${prompt.id}`, prompt.filePath, now, now]
      );

      // Insert tags
      if (prompt.tags && prompt.tags.length > 0) {
        for (const tagName of prompt.tags) {
          // Insert tag if not exists
          yield* sql.run(`INSERT OR IGNORE INTO tags (name) VALUES (?)`, [tagName]);

          // Get tag ID
          const tagRows = yield* sql.query<{ id: number }>(
            `SELECT id FROM tags WHERE name = ?`,
            [tagName]
          );
          const tagId = tagRows[0].id;

          // Link prompt to tag
          yield* sql.run(
            `INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)`,
            [prompt.id, tagId]
          );
        }
      }
    }
  });

/**
 * Create a test layer that provides both SqlService and TagService
 */
const createTestLayer = (
  initialFiles: Array<{
    filePath: string;
    frontmatter: { id: string; name: string; tags?: string[] };
    content: string;
  }> = []
) => {
  const { layer: MockPromptStorage, getFiles } = createMockPromptStorage(initialFiles);

  const TagLayer = TagServiceLive.pipe(
    Layer.provide(TestSqlWithMigrationsLive),
    Layer.provide(MockPromptStorage)
  );

  const layer = Layer.merge(TestSqlWithMigrationsLive, TagLayer);

  return { layer, getFiles };
};

describe("TagService", () => {
  beforeEach(() => {
    resetUuidCounter();
  });

  describe("listTags", () => {
    it("should return empty list when no tags exist", async () => {
      const { layer: TestLayer } = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const tagService = yield* TagService;
            return yield* tagService.listTags();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toEqual([]);
    });

    it("should return tags with counts sorted by count descending", async () => {
      const { layer: TestLayer } = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/p1.md", tags: ["coding", "typescript"] },
              { id: "p2", name: "Prompt 2", filePath: "/p2.md", tags: ["coding"] },
              { id: "p3", name: "Prompt 3", filePath: "/p3.md", tags: ["writing"] },
            ]);

            const tagService = yield* TagService;
            return yield* tagService.listTags();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(3);
      expect(result[0].name).toBe("coding");
      expect(result[0].count).toBe(2);
      expect(result[1].count).toBe(1);
      expect(result[2].count).toBe(1);
    });

    it("should sort alphabetically when counts are equal", async () => {
      const { layer: TestLayer } = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/p1.md", tags: ["zebra", "alpha", "mango"] },
            ]);

            const tagService = yield* TagService;
            return yield* tagService.listTags();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(3);
      expect(result[0].name).toBe("alpha");
      expect(result[1].name).toBe("mango");
      expect(result[2].name).toBe("zebra");
    });
  });

  describe("addTag", () => {
    it("should add a new tag to a prompt", async () => {
      const initialFiles = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Prompt 1", tags: [] as string[] },
          content: "Test content",
        },
      ];

      const { layer: TestLayer, getFiles } = createTestLayer(initialFiles);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/prompts/p1.md", tags: [] },
            ]);

            const tagService = yield* TagService;
            yield* tagService.addTag("p1", "coding");

            return yield* tagService.listTags();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(1);
      expect(result[0].name).toBe("coding");
      expect(result[0].count).toBe(1);

      const files = await getFiles();
      const file = files.get("/prompts/p1.md");
      expect(file?.frontmatter.tags).toContain("coding");
    });

    it("should not duplicate existing tag", async () => {
      const initialFiles = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Prompt 1", tags: ["coding"] },
          content: "Test content",
        },
      ];

      const { layer: TestLayer } = createTestLayer(initialFiles);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/prompts/p1.md", tags: ["coding"] },
            ]);

            const tagService = yield* TagService;
            yield* tagService.addTag("p1", "coding");

            return yield* tagService.listTags();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(1);
      expect(result[0].count).toBe(1);
    });

    it("should fail for non-existent prompt", async () => {
      const { layer: TestLayer } = createTestLayer();

      // The service throws SqlError (foreign key constraint) when the prompt doesn't exist
      // because the junction table insert fails before we check for prompt existence
      await expect(
        runTest(
          Effect.scoped(
            Effect.gen(function* () {
              const tagService = yield* TagService;
              yield* tagService.addTag("non-existent", "coding");
            }).pipe(Effect.provide(TestLayer))
          )
        )
      ).rejects.toThrow();
    });
  });

  describe("removeTag", () => {
    it("should remove a tag from a prompt", async () => {
      const initialFiles = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Prompt 1", tags: ["coding", "typescript"] },
          content: "Test content",
        },
      ];

      const { layer: TestLayer, getFiles } = createTestLayer(initialFiles);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/prompts/p1.md", tags: ["coding", "typescript"] },
            ]);

            const tagService = yield* TagService;
            yield* tagService.removeTag("p1", "coding");

            return yield* tagService.listTags();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(1);
      expect(result[0].name).toBe("typescript");

      const files = await getFiles();
      const file = files.get("/prompts/p1.md");
      expect(file?.frontmatter.tags).not.toContain("coding");
      expect(file?.frontmatter.tags).toContain("typescript");
    });

    it("should clean up unused tags", async () => {
      const initialFiles = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Prompt 1", tags: ["unique-tag"] },
          content: "Test content",
        },
      ];

      const { layer: TestLayer } = createTestLayer(initialFiles);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/prompts/p1.md", tags: ["unique-tag"] },
            ]);

            const tagService = yield* TagService;
            yield* tagService.removeTag("p1", "unique-tag");

            return yield* tagService.listTags();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(0);
    });

    it("should be case-insensitive", async () => {
      const initialFiles = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Prompt 1", tags: ["Coding"] },
          content: "Test content",
        },
      ];

      const { layer: TestLayer } = createTestLayer(initialFiles);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/prompts/p1.md", tags: ["Coding"] },
            ]);

            const tagService = yield* TagService;
            yield* tagService.removeTag("p1", "coding");

            return yield* tagService.listTags();
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(0);
    });
  });

  describe("renameTag", () => {
    it("should rename a tag across all prompts", async () => {
      const initialFiles = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Prompt 1", tags: ["js"] },
          content: "Test content",
        },
        {
          filePath: "/prompts/p2.md",
          frontmatter: { id: "p2", name: "Prompt 2", tags: ["js", "web"] },
          content: "Test content",
        },
      ];

      const { layer: TestLayer, getFiles } = createTestLayer(initialFiles);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/prompts/p1.md", tags: ["js"] },
              { id: "p2", name: "Prompt 2", filePath: "/prompts/p2.md", tags: ["js", "web"] },
            ]);

            const tagService = yield* TagService;
            const affectedCount = yield* tagService.renameTag("js", "javascript");
            const tags = yield* tagService.listTags();

            return { affectedCount, tags };
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.affectedCount).toBe(2);
      expect(result.tags.find((t) => t.name === "js")).toBeUndefined();
      expect(result.tags.find((t) => t.name === "javascript")?.count).toBe(2);

      const files = await getFiles();
      expect(files.get("/prompts/p1.md")?.frontmatter.tags).toContain("javascript");
      expect(files.get("/prompts/p2.md")?.frontmatter.tags).toContain("javascript");
    });

    it("should return 0 when renaming to same name", async () => {
      const { layer: TestLayer } = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/p1.md", tags: ["coding"] },
            ]);

            const tagService = yield* TagService;
            return yield* tagService.renameTag("coding", "CODING");
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toBe(0);
    });

    it("should be case-insensitive for matching", async () => {
      const initialFiles = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Prompt 1", tags: ["TypeScript"] },
          content: "Test content",
        },
      ];

      const { layer: TestLayer } = createTestLayer(initialFiles);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/prompts/p1.md", tags: ["TypeScript"] },
            ]);

            const tagService = yield* TagService;
            const count = yield* tagService.renameTag("typescript", "ts");
            const tags = yield* tagService.listTags();

            return { count, tags };
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.count).toBe(1);
      expect(result.tags[0].name).toBe("ts");
    });
  });

  describe("getPromptsWithTag", () => {
    it("should return all prompts with a specific tag", async () => {
      const initialFiles = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Prompt 1", tags: ["coding"] },
          content: "Content 1",
        },
        {
          filePath: "/prompts/p2.md",
          frontmatter: { id: "p2", name: "Prompt 2", tags: ["coding", "js"] },
          content: "Content 2",
        },
        {
          filePath: "/prompts/p3.md",
          frontmatter: { id: "p3", name: "Prompt 3", tags: ["writing"] },
          content: "Content 3",
        },
      ];

      const { layer: TestLayer } = createTestLayer(initialFiles);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/prompts/p1.md", tags: ["coding"] },
              { id: "p2", name: "Prompt 2", filePath: "/prompts/p2.md", tags: ["coding", "js"] },
              { id: "p3", name: "Prompt 3", filePath: "/prompts/p3.md", tags: ["writing"] },
            ]);

            const tagService = yield* TagService;
            return yield* tagService.getPromptsWithTag("coding");
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(2);
      expect(result.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
    });

    it("should return empty array for non-existent tag", async () => {
      const { layer: TestLayer } = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const tagService = yield* TagService;
            return yield* tagService.getPromptsWithTag("non-existent");
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toEqual([]);
    });

    it("should be case-insensitive", async () => {
      const initialFiles = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Prompt 1", tags: ["JavaScript"] },
          content: "Content 1",
        },
      ];

      const { layer: TestLayer } = createTestLayer(initialFiles);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/prompts/p1.md", tags: ["JavaScript"] },
            ]);

            const tagService = yield* TagService;
            return yield* tagService.getPromptsWithTag("javascript");
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(1);
      expect(result[0].id).toBe("p1");
    });

    it("should include full prompt data with tags and content", async () => {
      const initialFiles = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Full Prompt", tags: ["test", "complete"] },
          content: "This is the full content",
        },
      ];

      const { layer: TestLayer } = createTestLayer(initialFiles);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Full Prompt", filePath: "/prompts/p1.md", tags: ["test", "complete"] },
            ]);

            const tagService = yield* TagService;
            return yield* tagService.getPromptsWithTag("test");
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Full Prompt");
      expect(result[0].content).toBe("This is the full content");
      expect(result[0].tags).toEqual(["complete", "test"]);
      expect(result[0].filePath).toBe("/prompts/p1.md");
    });
  });

  describe("mergeTags", () => {
    it("should merge source tag into target tag", async () => {
      const initialFiles = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Prompt 1", tags: ["javascript"] },
          content: "Content 1",
        },
        {
          filePath: "/prompts/p2.md",
          frontmatter: { id: "p2", name: "Prompt 2", tags: ["js"] },
          content: "Content 2",
        },
      ];

      const { layer: TestLayer, getFiles } = createTestLayer(initialFiles);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/prompts/p1.md", tags: ["javascript"] },
              { id: "p2", name: "Prompt 2", filePath: "/prompts/p2.md", tags: ["js"] },
            ]);

            const tagService = yield* TagService;
            const affectedCount = yield* tagService.mergeTags("js", "javascript");
            const tags = yield* tagService.listTags();

            return { affectedCount, tags };
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.affectedCount).toBe(1);
      expect(result.tags.length).toBe(1);
      expect(result.tags[0].name).toBe("javascript");
      expect(result.tags[0].count).toBe(2);

      const files = await getFiles();
      expect(files.get("/prompts/p2.md")?.frontmatter.tags).toContain("javascript");
      expect(files.get("/prompts/p2.md")?.frontmatter.tags).not.toContain("js");
    });

    it("should not duplicate target tag if prompt already has it", async () => {
      const initialFiles = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Prompt 1", tags: ["js", "javascript"] },
          content: "Content 1",
        },
      ];

      const { layer: TestLayer } = createTestLayer(initialFiles);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/prompts/p1.md", tags: ["js", "javascript"] },
            ]);

            const tagService = yield* TagService;
            const affectedCount = yield* tagService.mergeTags("js", "javascript");
            const tags = yield* tagService.listTags();

            return { affectedCount, tags };
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.affectedCount).toBe(1);
      expect(result.tags.length).toBe(1);
      expect(result.tags[0].name).toBe("javascript");
      expect(result.tags[0].count).toBe(1);
    });

    it("should return 0 when merging same tag", async () => {
      const { layer: TestLayer } = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/p1.md", tags: ["coding"] },
            ]);

            const tagService = yield* TagService;
            return yield* tagService.mergeTags("coding", "CODING");
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toBe(0);
    });

    it("should create target tag if it does not exist", async () => {
      const initialFiles = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Prompt 1", tags: ["old-tag"] },
          content: "Content 1",
        },
      ];

      const { layer: TestLayer } = createTestLayer(initialFiles);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestData([
              { id: "p1", name: "Prompt 1", filePath: "/prompts/p1.md", tags: ["old-tag"] },
            ]);

            const tagService = yield* TagService;
            const affectedCount = yield* tagService.mergeTags("old-tag", "brand-new-tag");
            const tags = yield* tagService.listTags();

            return { affectedCount, tags };
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.affectedCount).toBe(1);
      expect(result.tags.length).toBe(1);
      expect(result.tags[0].name).toBe("brand-new-tag");
    });
  });
});
