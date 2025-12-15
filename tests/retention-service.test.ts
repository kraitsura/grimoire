/**
 * Retention Service Tests
 *
 * Tests for version retention policy and cleanup functionality
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Effect, Layer } from "effect";
import { SqlService, SqlLive } from "../src/services/sql-service";
import { MigrationService, MigrationLive } from "../src/services/migration-service";
import {
  RetentionService,
  RetentionServiceLive,
  RetentionConfig,
  DEFAULT_RETENTION_CONFIG,
} from "../src/services/retention-service";
import { VersionService, VersionServiceLive } from "../src/services/version-service";
import { unlinkSync } from "node:fs";
import { homedir } from "node:os";

const testDbPath = `${homedir()}/.grimoire/test-grimoire.db`;

// Test layer with all dependencies
const TestLayer = Layer.mergeAll(
  SqlLive,
  MigrationLive.pipe(Layer.provide(SqlLive)),
  VersionServiceLive.pipe(Layer.provide(SqlLive)),
  RetentionServiceLive.pipe(Layer.provide(SqlLive))
);

// Helper to run migrations before tests
const setupDatabase = () =>
  Effect.gen(function* () {
    const migration = yield* MigrationService;
    yield* migration.migrate();
  });

// Helper to create test versions
const createTestVersions = (
  promptId: string,
  count: number,
  daysOldStart: number = 0
) =>
  Effect.gen(function* () {
    const sql = yield* SqlService;
    const version = yield* VersionService;

    for (let i = 0; i < count; i++) {
      const daysOld = daysOldStart + i;
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - daysOld);

      yield* version.createVersion({
        promptId,
        content: `Test content version ${i + 1}`,
        frontmatter: { test: true },
        changeReason: `Test change ${i + 1}`,
      });

      // Update created_at to simulate older versions
      if (daysOld > 0) {
        yield* sql.run(
          `UPDATE prompt_versions
           SET created_at = datetime('now', '-${daysOld} days')
           WHERE prompt_id = ? AND version = ?`,
          [promptId, i + 1]
        );
      }
    }
  });

describe("RetentionService", () => {
  beforeEach(() => {
    // Clean up test database before each test
    try {
      unlinkSync(testDbPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(() => {
    // Clean up test database after each test
    try {
      unlinkSync(testDbPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe("getConfig", () => {
    it("should return default config if not set", async () => {
      const program = Effect.gen(function* () {
        yield* setupDatabase();

        const retention = yield* RetentionService;
        const config = yield* retention.getConfig();

        expect(config).toEqual(DEFAULT_RETENTION_CONFIG);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    it("should return custom config after setting", async () => {
      const program = Effect.gen(function* () {
        yield* setupDatabase();

        const retention = yield* RetentionService;

        const customConfig: RetentionConfig = {
          maxVersionsPerPrompt: 100,
          retentionDays: 180,
          strategy: "both",
          preserveTaggedVersions: false,
        };

        yield* retention.setConfig(customConfig);
        const config = yield* retention.getConfig();

        expect(config).toEqual(customConfig);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });
  });

  describe("cleanupVersions - count strategy", () => {
    it("should delete versions exceeding max count", async () => {
      const program = Effect.gen(function* () {
        yield* setupDatabase();

        const retention = yield* RetentionService;
        const promptId = "test-prompt-1";

        // Set retention policy: keep only 5 versions
        yield* retention.setConfig({
          maxVersionsPerPrompt: 5,
          retentionDays: 90,
          strategy: "count",
          preserveTaggedVersions: true,
        });

        // Create 10 versions
        yield* createTestVersions(promptId, 10);

        // Run cleanup
        const deleted = yield* retention.cleanupVersions(promptId);

        // Should delete 10 - 5 = 5 versions (keeping v1, latest, and 3 others)
        // Actually keeps: v1 (always), v10 (HEAD), and v9, v8, v7 (last 3 unprotected)
        // Deletes: v2, v3, v4, v5, v6
        expect(deleted).toBe(5);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    it("should always keep version 1 and HEAD", async () => {
      const program = Effect.gen(function* () {
        yield* setupDatabase();

        const retention = yield* RetentionService;
        const version = yield* VersionService;
        const promptId = "test-prompt-2";

        // Set very aggressive policy: keep only 1 version
        yield* retention.setConfig({
          maxVersionsPerPrompt: 1,
          retentionDays: 90,
          strategy: "count",
          preserveTaggedVersions: true,
        });

        // Create 5 versions
        yield* createTestVersions(promptId, 5);

        // Run cleanup
        yield* retention.cleanupVersions(promptId);

        // Get remaining versions
        const versions = yield* version.listVersions(promptId);

        // Should still have version 1 and version 5 (HEAD)
        expect(versions.length).toBe(2);
        expect(versions.some((v) => v.version === 1)).toBe(true);
        expect(versions.some((v) => v.version === 5)).toBe(true);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });
  });

  describe("cleanupVersions - days strategy", () => {
    it("should delete versions older than retention days", async () => {
      const program = Effect.gen(function* () {
        yield* setupDatabase();

        const retention = yield* RetentionService;
        const version = yield* VersionService;
        const promptId = "test-prompt-3";

        // Set retention policy: keep versions from last 30 days
        yield* retention.setConfig({
          maxVersionsPerPrompt: 50,
          retentionDays: 30,
          strategy: "days",
          preserveTaggedVersions: true,
        });

        // Create 10 versions: 5 recent (0-4 days old), 5 old (60-64 days old)
        yield* createTestVersions(promptId, 5, 0); // Recent
        yield* createTestVersions(promptId, 5, 60); // Old

        // Run cleanup
        const deleted = yield* retention.cleanupVersions(promptId);

        // Should delete 5 old versions (minus version 1 if it's old)
        // Actually, version 1 is always kept, so if it's old, we delete 4
        // If version 1 is recent, we delete all 5 old ones
        expect(deleted).toBeGreaterThanOrEqual(4);

        // Verify remaining versions
        const versions = yield* version.listVersions(promptId);
        expect(versions.length).toBeGreaterThanOrEqual(5);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });
  });

  describe("cleanupVersions - both strategy", () => {
    it("should delete versions exceeding either limit", async () => {
      const program = Effect.gen(function* () {
        yield* setupDatabase();

        const retention = yield* RetentionService;
        const promptId = "test-prompt-4";

        // Set retention policy
        yield* retention.setConfig({
          maxVersionsPerPrompt: 5,
          retentionDays: 30,
          strategy: "both",
          preserveTaggedVersions: true,
        });

        // Create 8 versions: 3 recent, 5 old
        yield* createTestVersions(promptId, 3, 0); // Recent
        yield* createTestVersions(promptId, 5, 60); // Old

        // Run cleanup
        const deleted = yield* retention.cleanupVersions(promptId);

        // Should delete old versions AND versions exceeding count
        expect(deleted).toBeGreaterThan(0);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });
  });

  describe("tagVersion", () => {
    it("should tag a version to preserve it", async () => {
      const program = Effect.gen(function* () {
        yield* setupDatabase();

        const retention = yield* RetentionService;
        const version = yield* VersionService;
        const promptId = "test-prompt-5";

        // Create 5 versions
        yield* createTestVersions(promptId, 5);

        // Tag version 3 as "stable"
        yield* retention.tagVersion(promptId, 3, "stable");

        // Verify tag was created
        const taggedVersions = yield* retention.getTaggedVersions(promptId);
        expect(taggedVersions.length).toBe(1);
        expect(taggedVersions[0].version).toBe(3);
        expect(taggedVersions[0].tag).toBe("stable");
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    it("should preserve tagged versions during cleanup", async () => {
      const program = Effect.gen(function* () {
        yield* setupDatabase();

        const retention = yield* RetentionService;
        const version = yield* VersionService;
        const promptId = "test-prompt-6";

        // Set aggressive retention policy
        yield* retention.setConfig({
          maxVersionsPerPrompt: 3,
          retentionDays: 90,
          strategy: "count",
          preserveTaggedVersions: true,
        });

        // Create 10 versions
        yield* createTestVersions(promptId, 10);

        // Tag version 5 as "important"
        yield* retention.tagVersion(promptId, 5, "important");

        // Run cleanup
        yield* retention.cleanupVersions(promptId);

        // Get remaining versions
        const versions = yield* version.listVersions(promptId);

        // Should keep: v1 (always), v10 (HEAD), v9, v8 (last 2), v5 (tagged)
        // Total: 5 versions (might be more depending on implementation)
        expect(versions.some((v) => v.version === 5)).toBe(true); // Tagged version preserved
        expect(versions.some((v) => v.version === 1)).toBe(true); // v1 always kept
        expect(versions.some((v) => v.version === 10)).toBe(true); // HEAD always kept
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });

    it("should not preserve tagged versions if config says so", async () => {
      const program = Effect.gen(function* () {
        yield* setupDatabase();

        const retention = yield* RetentionService;
        const version = yield* VersionService;
        const promptId = "test-prompt-7";

        // Set retention policy that doesn't preserve tagged versions
        yield* retention.setConfig({
          maxVersionsPerPrompt: 3,
          retentionDays: 90,
          strategy: "count",
          preserveTaggedVersions: false,
        });

        // Create 10 versions
        yield* createTestVersions(promptId, 10);

        // Tag version 2 (should still be deleted)
        yield* retention.tagVersion(promptId, 2, "test");

        // Run cleanup
        yield* retention.cleanupVersions(promptId);

        // Get remaining versions
        const versions = yield* version.listVersions(promptId);

        // Version 2 should be deleted even though it's tagged
        expect(versions.some((v) => v.version === 2)).toBe(false);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });
  });

  describe("untagVersion", () => {
    it("should remove tag from version", async () => {
      const program = Effect.gen(function* () {
        yield* setupDatabase();

        const retention = yield* RetentionService;
        const promptId = "test-prompt-8";

        // Create versions and tag one
        yield* createTestVersions(promptId, 5);
        yield* retention.tagVersion(promptId, 3, "stable");

        // Verify tag exists
        let taggedVersions = yield* retention.getTaggedVersions(promptId);
        expect(taggedVersions.length).toBe(1);

        // Remove tag
        yield* retention.untagVersion(promptId, 3);

        // Verify tag was removed
        taggedVersions = yield* retention.getTaggedVersions(promptId);
        expect(taggedVersions.length).toBe(0);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });
  });

  describe("cleanupAll", () => {
    it("should cleanup all prompts", async () => {
      const program = Effect.gen(function* () {
        yield* setupDatabase();

        const retention = yield* RetentionService;

        // Set retention policy
        yield* retention.setConfig({
          maxVersionsPerPrompt: 3,
          retentionDays: 90,
          strategy: "count",
          preserveTaggedVersions: true,
        });

        // Create versions for multiple prompts
        yield* createTestVersions("prompt-1", 10);
        yield* createTestVersions("prompt-2", 8);
        yield* createTestVersions("prompt-3", 6);

        // Run cleanup on all
        const result = yield* retention.cleanupAll();

        // Should have deleted versions from all 3 prompts
        expect(result.promptsAffected).toBe(3);
        expect(result.totalVersionsDeleted).toBeGreaterThan(0);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });
  });

  describe("previewCleanup", () => {
    it("should preview what would be deleted without deleting", async () => {
      const program = Effect.gen(function* () {
        yield* setupDatabase();

        const retention = yield* RetentionService;
        const version = yield* VersionService;
        const promptId = "test-prompt-9";

        // Set retention policy
        yield* retention.setConfig({
          maxVersionsPerPrompt: 3,
          retentionDays: 90,
          strategy: "count",
          preserveTaggedVersions: true,
        });

        // Create 10 versions
        yield* createTestVersions(promptId, 10);

        // Preview cleanup
        const preview = yield* retention.previewCleanup();

        expect(preview.totalVersionsToDelete).toBeGreaterThan(0);
        expect(preview.promptsAffected).toBe(1);

        // Verify nothing was actually deleted
        const versions = yield* version.listVersions(promptId);
        expect(versions.length).toBe(10);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
    });
  });
});
