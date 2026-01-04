/**
 * Version Service Tests
 *
 * Comprehensive tests for the VersionService which manages prompt
 * versioning and history tracking.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { Effect, Layer } from "effect";
import {
  VersionService,
  VersionServiceLive,
  VersionNotFoundError,
} from "../../src/services/version-service";
import { SqlService } from "../../src/services/sql-service";
import { createTestSqlLayer, runTest } from "../utils";

describe("VersionService", () => {
  // Create the test SQL layer (in-memory with migrations)
  const TestSqlLayer = createTestSqlLayer();

  // Helper to run effects with proper layer composition
  const runEffect = async <A, E>(effect: Effect.Effect<A, E, any>) =>
    runTest(
      effect.pipe(
        Effect.provide(VersionServiceLive),
        Effect.provide(TestSqlLayer),
        Effect.scoped
      )
    );

  // Helper to create a prompt in the database for testing
  const createTestPrompt = (promptId: string) =>
    Effect.gen(function* () {
      const sql = yield* SqlService;
      yield* sql.run(
        `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at, is_template, version)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 0, 1)`,
        [promptId, `Test Prompt ${promptId}`, `hash-${promptId}`, `/test/${promptId}.md`]
      );
    });

  describe("createVersion", () => {
    test("creates first version on main branch", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-1");

        const version = yield* versionService.createVersion({
          promptId: "prompt-1",
          content: "Initial content",
          frontmatter: { name: "Test Prompt" },
          changeReason: "Initial version",
        });

        return version;
      });

      const result = await runEffect(program);

      expect(result.promptId).toBe("prompt-1");
      expect(result.version).toBe(1);
      expect(result.content).toBe("Initial content");
      expect(result.frontmatter).toEqual({ name: "Test Prompt" });
      expect(result.changeReason).toBe("Initial version");
      expect(result.branch).toBe("main");
      expect(result.parentVersion).toBeNull();
    });

    test("creates subsequent versions with incrementing version numbers", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-2");

        // Create first version
        const v1 = yield* versionService.createVersion({
          promptId: "prompt-2",
          content: "Version 1 content",
          frontmatter: { name: "Test" },
        });

        // Create second version
        const v2 = yield* versionService.createVersion({
          promptId: "prompt-2",
          content: "Version 2 content",
          frontmatter: { name: "Test Updated" },
          changeReason: "Updated content",
        });

        return { v1, v2 };
      });

      const result = await runEffect(program);

      expect(result.v1.version).toBe(1);
      expect(result.v2.version).toBe(2);
      expect(result.v2.parentVersion).toBe(1);
    });

    test("creates versions on different branches independently", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-3");

        // Create version on main
        const mainV1 = yield* versionService.createVersion({
          promptId: "prompt-3",
          content: "Main branch content",
          frontmatter: { name: "Test" },
          branch: "main",
        });

        // Create version on feature branch
        const featureV1 = yield* versionService.createVersion({
          promptId: "prompt-3",
          content: "Feature branch content",
          frontmatter: { name: "Test Feature" },
          branch: "feature",
        });

        // Create another version on main
        const mainV2 = yield* versionService.createVersion({
          promptId: "prompt-3",
          content: "Main branch v2",
          frontmatter: { name: "Test" },
          branch: "main",
        });

        return { mainV1, mainV2, featureV1 };
      });

      const result = await runEffect(program);

      expect(result.mainV1.version).toBe(1);
      expect(result.mainV1.branch).toBe("main");
      expect(result.mainV2.version).toBe(2);
      expect(result.mainV2.branch).toBe("main");
      expect(result.featureV1.version).toBe(1);
      expect(result.featureV1.branch).toBe("feature");
    });
  });

  describe("getVersion", () => {
    test("retrieves a specific version", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-4");

        yield* versionService.createVersion({
          promptId: "prompt-4",
          content: "Version 1",
          frontmatter: { name: "Test" },
        });

        yield* versionService.createVersion({
          promptId: "prompt-4",
          content: "Version 2",
          frontmatter: { name: "Test Updated" },
        });

        const version = yield* versionService.getVersion("prompt-4", 1);

        return version;
      });

      const result = await runEffect(program);

      expect(result.version).toBe(1);
      expect(result.content).toBe("Version 1");
    });

    test("fails when version does not exist", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-5");

        return yield* versionService.getVersion("prompt-5", 99);
      });

      await expect(runEffect(program)).rejects.toThrow();
    });

    test("retrieves version from specific branch", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-6");

        yield* versionService.createVersion({
          promptId: "prompt-6",
          content: "Main content",
          frontmatter: {},
          branch: "main",
        });

        yield* versionService.createVersion({
          promptId: "prompt-6",
          content: "Feature content",
          frontmatter: {},
          branch: "feature",
        });

        const featureVersion = yield* versionService.getVersion("prompt-6", 1, "feature");

        return featureVersion;
      });

      const result = await runEffect(program);

      expect(result.content).toBe("Feature content");
      expect(result.branch).toBe("feature");
    });
  });

  describe("listVersions", () => {
    test("lists all versions for a prompt", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-7");

        yield* versionService.createVersion({
          promptId: "prompt-7",
          content: "V1",
          frontmatter: {},
        });

        yield* versionService.createVersion({
          promptId: "prompt-7",
          content: "V2",
          frontmatter: {},
        });

        yield* versionService.createVersion({
          promptId: "prompt-7",
          content: "V3",
          frontmatter: {},
        });

        const versions = yield* versionService.listVersions("prompt-7");

        return versions;
      });

      const result = await runEffect(program);

      expect(result.length).toBe(3);
      // Should be in descending order
      expect(result[0].version).toBe(3);
      expect(result[1].version).toBe(2);
      expect(result[2].version).toBe(1);
    });

    test("respects limit option", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-8");

        for (let i = 0; i < 5; i++) {
          yield* versionService.createVersion({
            promptId: "prompt-8",
            content: `V${i + 1}`,
            frontmatter: {},
          });
        }

        const versions = yield* versionService.listVersions("prompt-8", { limit: 2 });

        return versions;
      });

      const result = await runEffect(program);

      expect(result.length).toBe(2);
      expect(result[0].version).toBe(5);
      expect(result[1].version).toBe(4);
    });

    test("filters by branch", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-9");

        yield* versionService.createVersion({
          promptId: "prompt-9",
          content: "Main 1",
          frontmatter: {},
          branch: "main",
        });

        yield* versionService.createVersion({
          promptId: "prompt-9",
          content: "Feature 1",
          frontmatter: {},
          branch: "feature",
        });

        yield* versionService.createVersion({
          promptId: "prompt-9",
          content: "Main 2",
          frontmatter: {},
          branch: "main",
        });

        const mainVersions = yield* versionService.listVersions("prompt-9", { branch: "main" });
        const featureVersions = yield* versionService.listVersions("prompt-9", { branch: "feature" });

        return { mainVersions, featureVersions };
      });

      const result = await runEffect(program);

      expect(result.mainVersions.length).toBe(2);
      expect(result.featureVersions.length).toBe(1);
    });

    test("returns empty array for prompt with no versions", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-10");

        const versions = yield* versionService.listVersions("prompt-10");

        return versions;
      });

      const result = await runEffect(program);

      expect(result.length).toBe(0);
    });
  });

  describe("getHead", () => {
    test("gets the latest version", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-11");

        yield* versionService.createVersion({
          promptId: "prompt-11",
          content: "Old content",
          frontmatter: {},
        });

        yield* versionService.createVersion({
          promptId: "prompt-11",
          content: "Latest content",
          frontmatter: {},
        });

        const head = yield* versionService.getHead("prompt-11");

        return head;
      });

      const result = await runEffect(program);

      expect(result.version).toBe(2);
      expect(result.content).toBe("Latest content");
    });

    test("gets head of specific branch", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-12");

        yield* versionService.createVersion({
          promptId: "prompt-12",
          content: "Main",
          frontmatter: {},
          branch: "main",
        });

        yield* versionService.createVersion({
          promptId: "prompt-12",
          content: "Feature head",
          frontmatter: {},
          branch: "feature",
        });

        const featureHead = yield* versionService.getHead("prompt-12", "feature");

        return featureHead;
      });

      const result = await runEffect(program);

      expect(result.content).toBe("Feature head");
      expect(result.branch).toBe("feature");
    });

    test("fails when no versions exist", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-13");

        return yield* versionService.getHead("prompt-13");
      });

      await expect(runEffect(program)).rejects.toThrow();
    });
  });

  describe("rollback", () => {
    test("creates a new version with old content when createBackup is true", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-14");

        yield* versionService.createVersion({
          promptId: "prompt-14",
          content: "Original content",
          frontmatter: { name: "Original" },
        });

        yield* versionService.createVersion({
          promptId: "prompt-14",
          content: "Modified content",
          frontmatter: { name: "Modified" },
        });

        const rollbackVersion = yield* versionService.rollback("prompt-14", 1, {
          createBackup: true,
        });

        const allVersions = yield* versionService.listVersions("prompt-14");

        return { rollbackVersion, allVersions };
      });

      const result = await runEffect(program);

      expect(result.allVersions.length).toBe(3);
      expect(result.rollbackVersion.version).toBe(3);
      expect(result.rollbackVersion.content).toBe("Original content");
      expect(result.rollbackVersion.changeReason).toBe("Rollback to version 1");
      expect(result.rollbackVersion.parentVersion).toBe(1);
    });

    test("returns target version without creating new when createBackup is false", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-15");

        yield* versionService.createVersion({
          promptId: "prompt-15",
          content: "V1",
          frontmatter: {},
        });

        yield* versionService.createVersion({
          promptId: "prompt-15",
          content: "V2",
          frontmatter: {},
        });

        const rollbackVersion = yield* versionService.rollback("prompt-15", 1, {
          createBackup: false,
        });

        const allVersions = yield* versionService.listVersions("prompt-15");

        return { rollbackVersion, allVersions };
      });

      const result = await runEffect(program);

      expect(result.allVersions.length).toBe(2);
      expect(result.rollbackVersion.version).toBe(1);
    });

    test("fails when target version does not exist", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-16");

        yield* versionService.createVersion({
          promptId: "prompt-16",
          content: "V1",
          frontmatter: {},
        });

        return yield* versionService.rollback("prompt-16", 99);
      });

      await expect(runEffect(program)).rejects.toThrow();
    });
  });

  describe("diff", () => {
    test("computes diff between two versions", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-17");

        yield* versionService.createVersion({
          promptId: "prompt-17",
          content: "Line 1\nLine 2\nLine 3",
          frontmatter: {},
        });

        yield* versionService.createVersion({
          promptId: "prompt-17",
          content: "Line 1\nModified Line 2\nLine 3\nLine 4",
          frontmatter: {},
        });

        const diff = yield* versionService.diff("prompt-17", 1, 2);

        return diff;
      });

      const result = await runEffect(program);

      expect(result.additions).toBeGreaterThan(0);
      expect(result.deletions).toBeGreaterThan(0);
      expect(result.changes).toContain("Modified Line 2");
    });

    test("returns zero additions/deletions for identical versions", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-18");

        yield* versionService.createVersion({
          promptId: "prompt-18",
          content: "Same content",
          frontmatter: {},
        });

        yield* versionService.createVersion({
          promptId: "prompt-18",
          content: "Same content",
          frontmatter: {},
        });

        const diff = yield* versionService.diff("prompt-18", 1, 2);

        return diff;
      });

      const result = await runEffect(program);

      expect(result.additions).toBe(0);
      expect(result.deletions).toBe(0);
    });

    test("fails when from version does not exist", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-19");

        yield* versionService.createVersion({
          promptId: "prompt-19",
          content: "V1",
          frontmatter: {},
        });

        return yield* versionService.diff("prompt-19", 99, 1);
      });

      await expect(runEffect(program)).rejects.toThrow();
    });

    test("fails when to version does not exist", async () => {
      const program = Effect.gen(function* () {
        const versionService = yield* VersionService;

        yield* createTestPrompt("prompt-20");

        yield* versionService.createVersion({
          promptId: "prompt-20",
          content: "V1",
          frontmatter: {},
        });

        return yield* versionService.diff("prompt-20", 1, 99);
      });

      await expect(runEffect(program)).rejects.toThrow();
    });
  });
});
