import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  BranchService,
  BranchServiceLive,
} from "../../src/services/branch-service";
import { SqlService } from "../../src/services/sql-service";
import { MigrationService, MigrationLive } from "../../src/services/migration-service";
import { VersionService, VersionServiceLive } from "../../src/services/version-service";
import { TestSqlWithMigrationsLive } from "../utils";

describe("BranchService", () => {
  // Create a test layer with in-memory database (migrations already run)
  const TestLayer = Layer.mergeAll(
    TestSqlWithMigrationsLive,
    VersionServiceLive.pipe(Layer.provide(TestSqlWithMigrationsLive)),
    BranchServiceLive.pipe(
      Layer.provide(Layer.mergeAll(
        TestSqlWithMigrationsLive,
        VersionServiceLive.pipe(Layer.provide(TestSqlWithMigrationsLive))
      ))
    )
  );

  const runEffect = <A, E>(effect: Effect.Effect<A, E, any>) =>
    Effect.runPromise(Effect.scoped(effect.pipe(Effect.provide(TestLayer))) as Effect.Effect<A, E, never>);

  // Helper to create a test prompt with main branch
  const createTestPrompt = (promptId: string) =>
    Effect.gen(function* () {
      const sql = yield* SqlService;
      const versionService = yield* VersionService;

      // Create prompt
      yield* sql.run(
        `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [promptId, `Test Prompt ${promptId}`, `hash-${promptId}`, `/test/${promptId}.md`]
      );

      // Create main branch
      yield* sql.run(
        `INSERT INTO branches (id, prompt_id, name, is_active, created_at)
         VALUES (?, ?, 'main', 1, datetime('now'))`,
        [crypto.randomUUID(), promptId]
      );

      // Create initial version
      yield* versionService.createVersion({
        promptId,
        content: "Test content",
        frontmatter: { name: `Test Prompt ${promptId}` },
        branch: "main",
      });
    });

  describe("createBranch", () => {
    test("creates a new branch from main", async () => {
      const program = Effect.gen(function* () {
        const branchService = yield* BranchService;
        const versionService = yield* VersionService;
        const sql = yield* SqlService;

        // Create a test prompt first
        const promptId = "test-prompt-1";
        yield* sql.run(
          `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [promptId, "Test Prompt", "hash1", "/test/path1.md"]
        );

        // Create main branch
        yield* sql.run(
          `INSERT INTO branches (id, prompt_id, name, is_active, created_at)
           VALUES (?, ?, 'main', 1, datetime('now'))`,
          [crypto.randomUUID(), promptId]
        );

        // Create a version on main
        yield* versionService.createVersion({
          promptId,
          content: "Test content",
          frontmatter: { name: "Test Prompt" },
          branch: "main",
        });

        // Create a new branch
        const branch = yield* branchService.createBranch({
          promptId,
          name: "experiment",
        });

        return branch;
      });

      const branch = await runEffect(program);
      expect(branch.name).toBe("experiment");
      expect(branch.promptId).toBe("test-prompt-1");
      expect(branch.isActive).toBe(false);
      expect(branch.createdFromVersion).toBe(1);
    });

    test("fails when branch name already exists", async () => {
      const program = Effect.gen(function* () {
        const branchService = yield* BranchService;
        const versionService = yield* VersionService;

        const promptId = "test-prompt-2";
        yield* versionService.createVersion({
          promptId,
          content: "Test content",
          frontmatter: { name: "Test Prompt 2" },
          branch: "main",
        });

        // Create first branch
        yield* branchService.createBranch({
          promptId,
          name: "feature",
        });

        // Try to create duplicate
        return yield* branchService.createBranch({
          promptId,
          name: "feature",
        });
      });

      await expect(runEffect(program)).rejects.toThrow();
    });
  });

  describe("listBranches", () => {
    test("lists all branches for a prompt", async () => {
      const program = Effect.gen(function* () {
        const branchService = yield* BranchService;
        const versionService = yield* VersionService;
        const sql = yield* SqlService;

        const promptId = "test-prompt-3";

        // Set up prompt and main branch first
        yield* sql.run(
          `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [promptId, "Test Prompt 3", "hash3", "/test/path3.md"]
        );
        yield* sql.run(
          `INSERT INTO branches (id, prompt_id, name, is_active, created_at)
           VALUES (?, ?, 'main', 1, datetime('now'))`,
          [crypto.randomUUID(), promptId]
        );

        yield* versionService.createVersion({
          promptId,
          content: "Test content",
          frontmatter: { name: "Test Prompt 3" },
          branch: "main",
        });

        yield* branchService.createBranch({
          promptId,
          name: "branch-a",
        });

        yield* branchService.createBranch({
          promptId,
          name: "branch-b",
        });

        const branches = yield* branchService.listBranches(promptId);
        return branches;
      });

      const branches = await runEffect(program);
      expect(branches.length).toBeGreaterThanOrEqual(2);
      const branchNames = branches.map((b) => b.name);
      expect(branchNames).toContain("branch-a");
      expect(branchNames).toContain("branch-b");
    });
  });

  describe("switchBranch", () => {
    test("switches active branch", async () => {
      const program = Effect.gen(function* () {
        const branchService = yield* BranchService;
        const versionService = yield* VersionService;
        const sql = yield* SqlService;

        const promptId = "test-prompt-4";

        // Set up prompt and main branch first
        yield* sql.run(
          `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [promptId, "Test Prompt 4", "hash4", "/test/path4.md"]
        );
        yield* sql.run(
          `INSERT INTO branches (id, prompt_id, name, is_active, created_at)
           VALUES (?, ?, 'main', 1, datetime('now'))`,
          [crypto.randomUUID(), promptId]
        );

        yield* versionService.createVersion({
          promptId,
          content: "Test content",
          frontmatter: { name: "Test Prompt 4" },
          branch: "main",
        });

        yield* branchService.createBranch({
          promptId,
          name: "dev",
        });

        // Switch to dev branch
        const switched = yield* branchService.switchBranch(promptId, "dev");

        // Verify it's active
        const activeBranch = yield* branchService.getActiveBranch(promptId);

        return { switched, activeBranch };
      });

      const { switched, activeBranch } = await runEffect(program);
      expect(switched.name).toBe("dev");
      expect(switched.isActive).toBe(true);
      expect(activeBranch.name).toBe("dev");
    });

    test("fails when branch does not exist", async () => {
      const program = Effect.gen(function* () {
        const branchService = yield* BranchService;
        const versionService = yield* VersionService;
        const sql = yield* SqlService;

        const promptId = "test-prompt-5";

        // Set up prompt and main branch first
        yield* sql.run(
          `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [promptId, "Test Prompt 5", "hash5", "/test/path5.md"]
        );
        yield* sql.run(
          `INSERT INTO branches (id, prompt_id, name, is_active, created_at)
           VALUES (?, ?, 'main', 1, datetime('now'))`,
          [crypto.randomUUID(), promptId]
        );

        yield* versionService.createVersion({
          promptId,
          content: "Test content",
          frontmatter: { name: "Test Prompt 5" },
          branch: "main",
        });

        return yield* branchService.switchBranch(promptId, "nonexistent");
      });

      await expect(runEffect(program)).rejects.toThrow();
    });
  });

  describe("deleteBranch", () => {
    test("deletes a branch without versions", async () => {
      const program = Effect.gen(function* () {
        const branchService = yield* BranchService;
        const versionService = yield* VersionService;
        const sql = yield* SqlService;

        const promptId = "test-prompt-6";

        // Set up prompt and main branch first
        yield* sql.run(
          `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [promptId, "Test Prompt 6", "hash6", "/test/path6.md"]
        );
        yield* sql.run(
          `INSERT INTO branches (id, prompt_id, name, is_active, created_at)
           VALUES (?, ?, 'main', 1, datetime('now'))`,
          [crypto.randomUUID(), promptId]
        );

        yield* versionService.createVersion({
          promptId,
          content: "Test content",
          frontmatter: { name: "Test Prompt 6" },
          branch: "main",
        });

        yield* branchService.createBranch({
          promptId,
          name: "temp",
        });

        // Delete the branch
        yield* branchService.deleteBranch(promptId, "temp");

        // Verify it's gone
        const branches = yield* branchService.listBranches(promptId);
        return branches;
      });

      const branches = await runEffect(program);
      const branchNames = branches.map((b) => b.name);
      expect(branchNames).not.toContain("temp");
    });

    test("fails to delete branch with unmerged changes", async () => {
      const program = Effect.gen(function* () {
        const branchService = yield* BranchService;
        const versionService = yield* VersionService;
        const sql = yield* SqlService;

        const promptId = "test-prompt-7";

        // Set up prompt and main branch first
        yield* sql.run(
          `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [promptId, "Test Prompt 7", "hash7", "/test/path7.md"]
        );
        yield* sql.run(
          `INSERT INTO branches (id, prompt_id, name, is_active, created_at)
           VALUES (?, ?, 'main', 1, datetime('now'))`,
          [crypto.randomUUID(), promptId]
        );

        yield* versionService.createVersion({
          promptId,
          content: "Test content",
          frontmatter: { name: "Test Prompt 7" },
          branch: "main",
        });

        yield* branchService.createBranch({
          promptId,
          name: "feature",
        });

        // Create a version on the feature branch
        yield* versionService.createVersion({
          promptId,
          content: "Feature content",
          frontmatter: { name: "Test Prompt 7" },
          branch: "feature",
        });

        // Try to delete branch with versions
        return yield* branchService.deleteBranch(promptId, "feature");
      });

      await expect(runEffect(program)).rejects.toThrow();
    });
  });

  describe("compareBranches", () => {
    test("compares two branches", async () => {
      const program = Effect.gen(function* () {
        const branchService = yield* BranchService;
        const versionService = yield* VersionService;
        const sql = yield* SqlService;

        const promptId = "test-prompt-8";

        // Set up prompt and main branch first
        yield* sql.run(
          `INSERT INTO prompts (id, name, content_hash, file_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [promptId, "Test Prompt 8", "hash8", "/test/path8.md"]
        );
        yield* sql.run(
          `INSERT INTO branches (id, prompt_id, name, is_active, created_at)
           VALUES (?, ?, 'main', 1, datetime('now'))`,
          [crypto.randomUUID(), promptId]
        );

        // Create version on main
        yield* versionService.createVersion({
          promptId,
          content: "Main content",
          frontmatter: { name: "Test Prompt 8" },
          branch: "main",
        });

        yield* branchService.createBranch({
          promptId,
          name: "feature",
        });

        // Create version on feature branch
        yield* versionService.createVersion({
          promptId,
          content: "Feature content",
          frontmatter: { name: "Test Prompt 8" },
          branch: "feature",
        });

        const comparison = yield* branchService.compareBranches(
          promptId,
          "feature",
          "main"
        );

        return comparison;
      });

      const comparison = await runEffect(program);
      expect(comparison).toHaveProperty("ahead");
      expect(comparison).toHaveProperty("behind");
      expect(comparison).toHaveProperty("canMerge");
    });
  });
});
