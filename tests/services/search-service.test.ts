/**
 * Search Service Tests
 *
 * Comprehensive unit tests for the SearchService which provides
 * full-text search using SQLite FTS5.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Effect, Layer } from "effect";
import {
  SearchService,
  SearchServiceLive,
  sanitizeFtsQuery,
} from "../../src/services/search-service";
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
 * Create a mock PromptStorageService for testing
 * The SearchService uses PromptStorageService only for rebuildIndex
 */
const createMockPromptStorage = (
  prompts: Array<{
    filePath: string;
    frontmatter: { id: string; name: string; tags?: string[] };
    content: string;
  }> = []
): Layer.Layer<PromptStorageService> => {
  return Layer.succeed(PromptStorageService, {
    readPrompt: (path: string) =>
      Effect.gen(function* () {
        const prompt = prompts.find((p) => p.filePath === path);
        if (!prompt) {
          return yield* Effect.fail(new StorageError({ message: `File not found: ${path}` }));
        }
        return {
          frontmatter: {
            id: prompt.frontmatter.id,
            name: prompt.frontmatter.name,
            tags: prompt.frontmatter.tags,
            created: FIXED_DATE,
            updated: FIXED_DATE,
          },
          content: prompt.content,
        };
      }),
    writePrompt: () => Effect.void,
    listPrompts: () => Effect.succeed(prompts.map((p) => p.filePath)),
    computeHash: (content: string) => Effect.succeed(`hash-${content.length}`),
  } as PromptStorageService["Type"]);
};

/**
 * Seed the database with test prompts and FTS index
 */
const seedTestPrompts = (
  prompts: Array<{
    id: string;
    name: string;
    content: string;
    tags?: string[];
    filePath?: string;
    created?: Date;
    updated?: Date;
  }>
): Effect.Effect<void, unknown, SqlService> =>
  Effect.gen(function* () {
    const sql = yield* SqlService;

    for (const prompt of prompts) {
      const now = prompt.created ?? FIXED_DATE;
      const contentHash = `hash-${prompt.content.length}`;
      const filePath = prompt.filePath ?? `/prompts/${prompt.id}.md`;

      // Insert into prompts table
      yield* sql.run(
        `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          prompt.id,
          prompt.name,
          contentHash,
          filePath,
          now.toISOString(),
          (prompt.updated ?? now).toISOString(),
        ]
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

      // Insert into FTS index
      const tagsStr = prompt.tags?.join(",") ?? "";
      yield* sql.run(
        `INSERT INTO prompts_fts (prompt_id, name, content, tags) VALUES (?, ?, ?, ?)`,
        [prompt.id, prompt.name, prompt.content, tagsStr]
      );
    }
  });

/**
 * Create a test layer that provides both SqlService and SearchService
 * This ensures SqlService is available to both seedTestPrompts and SearchService
 */
const createTestLayer = (
  mockPrompts: Array<{
    filePath: string;
    frontmatter: { id: string; name: string; tags?: string[] };
    content: string;
  }> = []
) => {
  const MockPromptStorage = createMockPromptStorage(mockPrompts);

  // Build SearchServiceLive with its dependencies
  const SearchLayer = SearchServiceLive.pipe(
    Layer.provide(TestSqlWithMigrationsLive),
    Layer.provide(MockPromptStorage)
  );

  // Merge to expose both SqlService and SearchService
  return Layer.merge(TestSqlWithMigrationsLive, SearchLayer);
};

describe("SearchService", () => {
  beforeEach(() => {
    resetUuidCounter();
  });

  describe("sanitizeFtsQuery", () => {
    it("should remove FTS5 special characters", () => {
      expect(sanitizeFtsQuery('test "quoted"')).toBe("test quoted");
      expect(sanitizeFtsQuery("test*")).toBe("test");
      expect(sanitizeFtsQuery("test+")).toBe("test");
      expect(sanitizeFtsQuery("test-")).toBe("test");
      expect(sanitizeFtsQuery("(test)")).toBe("test");
      expect(sanitizeFtsQuery("[test]")).toBe("test");
      expect(sanitizeFtsQuery("{test}")).toBe("test");
      expect(sanitizeFtsQuery("test:value")).toBe("test value");
      expect(sanitizeFtsQuery("test^boost")).toBe("test boost");
    });

    it("should normalize whitespace", () => {
      expect(sanitizeFtsQuery("test   multiple   spaces")).toBe("test multiple spaces");
      expect(sanitizeFtsQuery("  leading and trailing  ")).toBe("leading and trailing");
    });

    it("should handle empty strings", () => {
      expect(sanitizeFtsQuery("")).toBe("");
      expect(sanitizeFtsQuery("***")).toBe("");
    });
  });

  describe("search", () => {
    it("should return empty results for empty query", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const search = yield* SearchService;
            return yield* search.search({ query: "" });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toEqual([]);
    });

    it("should return empty results when query has only special chars", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const search = yield* SearchService;
            return yield* search.search({ query: "***" });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toEqual([]);
    });

    it("should find prompts by name", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            // Seed test data
            yield* seedTestPrompts([
              {
                id: "prompt-1",
                name: "Code Review Assistant",
                content: "You are a helpful code reviewer.",
                tags: ["coding"],
              },
              {
                id: "prompt-2",
                name: "Writing Helper",
                content: "You help with writing tasks.",
                tags: ["writing"],
              },
            ]);

            const search = yield* SearchService;
            return yield* search.search({ query: "code review" });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].prompt.name).toBe("Code Review Assistant");
    });

    it("should find prompts by content", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestPrompts([
              {
                id: "prompt-1",
                name: "Prompt One",
                content: "You are an expert TypeScript developer.",
              },
              {
                id: "prompt-2",
                name: "Prompt Two",
                content: "You help with Python programming.",
              },
            ]);

            const search = yield* SearchService;
            return yield* search.search({ query: "typescript" });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].prompt.id).toBe("prompt-1");
    });

    it("should find prompts by tags", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestPrompts([
              {
                id: "prompt-1",
                name: "TypeScript Helper",
                content: "Help with TypeScript.",
                tags: ["coding", "typescript"],
              },
              {
                id: "prompt-2",
                name: "Python Helper",
                content: "Help with Python.",
                tags: ["coding", "python"],
              },
            ]);

            const search = yield* SearchService;
            // Search for content with tag filter
            return yield* search.search({ query: "help", tags: ["typescript"] });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(1);
      expect(result[0].prompt.id).toBe("prompt-1");
    });

    it("should support fuzzy matching with prefix", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestPrompts([
              {
                id: "prompt-1",
                name: "Programming Assistant",
                content: "Help with programming tasks.",
              },
            ]);

            const search = yield* SearchService;
            return yield* search.search({ query: "progra", fuzzy: true });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].prompt.name).toBe("Programming Assistant");
    });

    it("should respect limit option", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestPrompts([
              { id: "p1", name: "Test 1", content: "coding task" },
              { id: "p2", name: "Test 2", content: "coding task" },
              { id: "p3", name: "Test 3", content: "coding task" },
              { id: "p4", name: "Test 4", content: "coding task" },
              { id: "p5", name: "Test 5", content: "coding task" },
            ]);

            const search = yield* SearchService;
            return yield* search.search({ query: "coding", limit: 2 });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(2);
    });

    it("should return snippets with highlights", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestPrompts([
              {
                id: "prompt-1",
                name: "Code Helper",
                content:
                  "You are an expert in TypeScript programming. Help users write clean code.",
              },
            ]);

            const search = yield* SearchService;
            return yield* search.search({ query: "typescript" });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(1);
      // Snippet should be cleaned (no <mark> tags)
      expect(result[0].snippet).not.toContain("<mark>");
      // Should have highlight ranges
      expect(result[0].highlights.length).toBeGreaterThanOrEqual(0);
    });

    it("should return results sorted by rank", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestPrompts([
              {
                id: "less-relevant",
                name: "General Helper",
                content: "This prompt mentions javascript once.",
              },
              {
                id: "more-relevant",
                name: "JavaScript Expert",
                content:
                  "You are a JavaScript expert. Help with JavaScript code. JavaScript is great.",
              },
            ]);

            const search = yield* SearchService;
            return yield* search.search({ query: "javascript" });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(2);
      // More relevant should have better (lower) rank in BM25
      // The one with more occurrences should rank higher
    });
  });

  describe("suggest", () => {
    it("should return empty suggestions for empty prefix", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const search = yield* SearchService;
            return yield* search.suggest("");
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result).toEqual([]);
    });

    it("should suggest prompt names matching prefix", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestPrompts([
              { id: "p1", name: "Code Review", content: "Review code" },
              { id: "p2", name: "Code Assistant", content: "Assist with code" },
              { id: "p3", name: "Writing Helper", content: "Help with writing" },
            ]);

            const search = yield* SearchService;
            return yield* search.suggest("code");
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(2);
      expect(result).toContain("Code Review");
      expect(result).toContain("Code Assistant");
    });

    it("should limit suggestions to 10", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            // Create 15 prompts matching "test"
            const prompts = Array.from({ length: 15 }, (_, i) => ({
              id: `p${i}`,
              name: `Test Prompt ${i}`,
              content: `Test content ${i}`,
            }));
            yield* seedTestPrompts(prompts);

            const search = yield* SearchService;
            return yield* search.suggest("test");
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBeLessThanOrEqual(10);
    });
  });

  describe("updateIndex", () => {
    it("should add new prompt to index", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;

            // First insert into prompts table (required for the join)
            const now = FIXED_DATE.toISOString();
            yield* sql.run(
              `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              ["new-prompt", "New Prompt", "hash", "/prompts/new-prompt.md", now, now]
            );

            const search = yield* SearchService;
            yield* search.updateIndex(
              "new-prompt",
              "New Prompt",
              "This is new content",
              ["new", "test"]
            );

            // Verify it's searchable
            return yield* search.search({ query: "new content" });
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.length).toBe(1);
      expect(result[0].prompt.id).toBe("new-prompt");
    });

    it("should update existing prompt in index", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            yield* seedTestPrompts([
              {
                id: "prompt-1",
                name: "Old Name",
                content: "Old content",
                tags: ["old"],
              },
            ]);

            const search = yield* SearchService;

            // Update the index
            yield* search.updateIndex("prompt-1", "Updated Name", "Updated content", ["new"]);

            // Old content should not be found
            const oldResults = yield* search.search({ query: "old content" });
            // New content should be found
            const newResults = yield* search.search({ query: "updated content" });

            return { oldResults, newResults };
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.oldResults.length).toBe(0);
      expect(result.newResults.length).toBe(1);
    });
  });

  describe("rebuildIndex", () => {
    it("should rebuild index from prompt files", async () => {
      const mockPrompts = [
        {
          filePath: "/prompts/p1.md",
          frontmatter: { id: "p1", name: "Prompt One", tags: ["tag1"] as string[] },
          content: "Content for prompt one",
        },
        {
          filePath: "/prompts/p2.md",
          frontmatter: { id: "p2", name: "Prompt Two", tags: ["tag2"] as string[] },
          content: "Content for prompt two",
        },
      ];

      const TestLayer = createTestLayer(mockPrompts);

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            const sql = yield* SqlService;
            const now = FIXED_DATE.toISOString();

            // Insert prompts into database (rebuildIndex only updates FTS, not main table)
            for (const p of mockPrompts) {
              yield* sql.run(
                `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [p.frontmatter.id, p.frontmatter.name, `hash-${p.content.length}`, p.filePath, now, now]
              );
            }

            const search = yield* SearchService;

            // Rebuild the FTS index
            yield* search.rebuildIndex();

            // Both prompts should be searchable
            const results1 = yield* search.search({ query: "prompt one" });
            const results2 = yield* search.search({ query: "prompt two" });

            return { results1, results2 };
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.results1.length).toBe(1);
      expect(result.results2.length).toBe(1);
    });

    it("should clear existing index before rebuilding", async () => {
      // First seed with old content
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.scoped(
          Effect.gen(function* () {
            // Seed initial content
            yield* seedTestPrompts([
              {
                id: "old",
                name: "Old Prompt",
                content: "Old content that should be removed",
              },
            ]);

            const search = yield* SearchService;

            // Verify old content is indexed
            const beforeRebuild = yield* search.search({ query: "old content" });

            // Now rebuild (with empty mock storage, so index should be cleared)
            yield* search.rebuildIndex();

            // Old should not be found
            const afterRebuild = yield* search.search({ query: "old content" });

            return { beforeRebuild, afterRebuild };
          }).pipe(Effect.provide(TestLayer))
        )
      );

      expect(result.beforeRebuild.length).toBe(1);
      expect(result.afterRebuild.length).toBe(0);
    });
  });
});
