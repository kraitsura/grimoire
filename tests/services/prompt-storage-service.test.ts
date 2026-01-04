/**
 * PromptStorageService Unit Tests
 *
 * Tests the prompt storage service functionality including:
 * - Reading prompts from markdown files with frontmatter
 * - Writing prompts with frontmatter to files
 * - Listing prompt files in the prompts directory
 * - Computing content hashes
 *
 * Note: These tests use the MockPromptStorageService to avoid
 * actual filesystem operations and enable isolated testing.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Effect, Layer } from "effect";
import { PromptStorageService } from "../../src/services/prompt-storage-service";
import { StorageError } from "../../src/models";
import type { Frontmatter } from "../../src/models/prompt";
import {
  runTest,
  runTestExpectError,
  FIXED_DATE,
  resetUuidCounter,
  testUuid,
} from "../utils";
import {
  MockPromptStorageLive,
  mockPromptStorageWithFiles,
  createMockFile,
} from "../utils/mock-prompt-storage";

describe("PromptStorageService", () => {
  beforeEach(() => {
    resetUuidCounter();
  });

  describe("readPrompt", () => {
    it("should read a prompt with basic frontmatter", async () => {
      const id = testUuid();
      const TestLayer = mockPromptStorageWithFiles({
        "/mock/.grimoire/prompts/test.md": createMockFile(
          id,
          "Test Prompt",
          "This is the content."
        ),
      });

      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          return yield* storage.readPrompt("/mock/.grimoire/prompts/test.md");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.frontmatter.id).toBe(id);
      expect(result.frontmatter.name).toBe("Test Prompt");
      expect(result.content).toBe("This is the content.");
    });

    it("should read a prompt with tags", async () => {
      const id = testUuid();
      const TestLayer = mockPromptStorageWithFiles({
        "/mock/.grimoire/prompts/tagged.md": createMockFile(
          id,
          "Tagged Prompt",
          "Content with tags.",
          { tags: ["coding", "typescript", "testing"] }
        ),
      });

      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          return yield* storage.readPrompt("/mock/.grimoire/prompts/tagged.md");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.frontmatter.tags).toEqual(["coding", "typescript", "testing"]);
    });

    it("should read a prompt with all optional fields", async () => {
      const id = testUuid();
      const TestLayer = mockPromptStorageWithFiles({
        "/mock/.grimoire/prompts/full.md": createMockFile(
          id,
          "Full Prompt",
          "Full content.",
          {
            tags: ["tag1"],
            version: 5,
            isTemplate: true,
            isFavorite: true,
            favoriteOrder: 1,
            isPinned: true,
            pinOrder: 2,
          }
        ),
      });

      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          return yield* storage.readPrompt("/mock/.grimoire/prompts/full.md");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.frontmatter.version).toBe(5);
      expect(result.frontmatter.isTemplate).toBe(true);
      expect(result.frontmatter.isFavorite).toBe(true);
      expect(result.frontmatter.favoriteOrder).toBe(1);
      expect(result.frontmatter.isPinned).toBe(true);
      expect(result.frontmatter.pinOrder).toBe(2);
    });

    it("should fail when file does not exist", async () => {
      const error = await runTestExpectError(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          return yield* storage.readPrompt("/mock/.grimoire/prompts/nonexistent.md");
        }).pipe(Effect.provide(MockPromptStorageLive)),
        (e): e is StorageError => e._tag === "StorageError"
      );

      expect(error._tag).toBe("StorageError");
      expect(error.message).toContain("Failed to read prompt file");
    });
  });

  describe("writePrompt", () => {
    it("should write a prompt and read it back", async () => {
      const id = testUuid();
      const frontmatter: Frontmatter = {
        id,
        name: "Written Prompt",
        created: FIXED_DATE,
        updated: FIXED_DATE,
        tags: ["test"],
        version: 1,
      };

      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          const path = "/mock/.grimoire/prompts/written.md";

          yield* storage.writePrompt(path, frontmatter, "Written content.");

          return yield* storage.readPrompt(path);
        }).pipe(Effect.provide(MockPromptStorageLive))
      );

      expect(result.frontmatter.id).toBe(id);
      expect(result.frontmatter.name).toBe("Written Prompt");
      expect(result.content).toBe("Written content.");
    });

    it("should overwrite existing prompt", async () => {
      const id = testUuid();
      const initialFrontmatter: Frontmatter = {
        id,
        name: "Original",
        created: FIXED_DATE,
        updated: FIXED_DATE,
      };
      const updatedFrontmatter: Frontmatter = {
        id,
        name: "Updated",
        created: FIXED_DATE,
        updated: new Date(),
        version: 2,
      };

      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          const path = "/mock/.grimoire/prompts/overwrite.md";

          yield* storage.writePrompt(path, initialFrontmatter, "Original content");
          yield* storage.writePrompt(path, updatedFrontmatter, "Updated content");

          return yield* storage.readPrompt(path);
        }).pipe(Effect.provide(MockPromptStorageLive))
      );

      expect(result.frontmatter.name).toBe("Updated");
      expect(result.frontmatter.version).toBe(2);
      expect(result.content).toBe("Updated content");
    });

    it("should write prompt with template flag", async () => {
      const id = testUuid();
      const frontmatter: Frontmatter = {
        id,
        name: "Template Prompt",
        created: FIXED_DATE,
        updated: FIXED_DATE,
        isTemplate: true,
      };

      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          const path = "/mock/.grimoire/prompts/template.md";

          yield* storage.writePrompt(
            path,
            frontmatter,
            "You are a {{role}}. Your task is {{task}}."
          );

          return yield* storage.readPrompt(path);
        }).pipe(Effect.provide(MockPromptStorageLive))
      );

      expect(result.frontmatter.isTemplate).toBe(true);
      expect(result.content).toContain("{{role}}");
    });
  });

  describe("listPrompts", () => {
    it("should return empty array when no prompts exist", async () => {
      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          return yield* storage.listPrompts();
        }).pipe(Effect.provide(MockPromptStorageLive))
      );

      expect(result).toEqual([]);
    });

    it("should list all prompt files", async () => {
      const TestLayer = mockPromptStorageWithFiles({
        "/mock/.grimoire/prompts/prompt1.md": createMockFile(
          testUuid(),
          "Prompt 1",
          "Content 1"
        ),
        "/mock/.grimoire/prompts/prompt2.md": createMockFile(
          testUuid(),
          "Prompt 2",
          "Content 2"
        ),
        "/mock/.grimoire/prompts/prompt3.md": createMockFile(
          testUuid(),
          "Prompt 3",
          "Content 3"
        ),
      });

      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          return yield* storage.listPrompts();
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result).toHaveLength(3);
      expect(result).toContain("/mock/.grimoire/prompts/prompt1.md");
      expect(result).toContain("/mock/.grimoire/prompts/prompt2.md");
      expect(result).toContain("/mock/.grimoire/prompts/prompt3.md");
    });

    it("should only list .md files", async () => {
      const TestLayer = mockPromptStorageWithFiles({
        "/mock/.grimoire/prompts/valid.md": createMockFile(
          testUuid(),
          "Valid",
          "Content"
        ),
        "/mock/.grimoire/prompts/readme.txt": createMockFile(
          testUuid(),
          "Invalid",
          "Should not appear"
        ),
      });

      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          return yield* storage.listPrompts();
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toBe("/mock/.grimoire/prompts/valid.md");
    });
  });

  describe("computeHash", () => {
    it("should compute SHA256 hash of content", async () => {
      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          return yield* storage.computeHash("test content");
        }).pipe(Effect.provide(MockPromptStorageLive))
      );

      // SHA256 hash is 64 hex characters
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]+$/);
    });

    it("should produce same hash for same content", async () => {
      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          const hash1 = yield* storage.computeHash("identical content");
          const hash2 = yield* storage.computeHash("identical content");
          return { hash1, hash2 };
        }).pipe(Effect.provide(MockPromptStorageLive))
      );

      expect(result.hash1).toBe(result.hash2);
    });

    it("should produce different hash for different content", async () => {
      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          const hash1 = yield* storage.computeHash("content A");
          const hash2 = yield* storage.computeHash("content B");
          return { hash1, hash2 };
        }).pipe(Effect.provide(MockPromptStorageLive))
      );

      expect(result.hash1).not.toBe(result.hash2);
    });

    it("should hash empty string", async () => {
      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          return yield* storage.computeHash("");
        }).pipe(Effect.provide(MockPromptStorageLive))
      );

      // SHA256 of empty string is well-known
      expect(result).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    it("should handle unicode content", async () => {
      const result = await runTest(
        Effect.gen(function* () {
          const storage = yield* PromptStorageService;
          return yield* storage.computeHash("日本語テスト 🎉");
        }).pipe(Effect.provide(MockPromptStorageLive))
      );

      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]+$/);
    });
  });
});
