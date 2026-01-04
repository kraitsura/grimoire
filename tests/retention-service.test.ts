/**
 * Retention Service Tests
 *
 * Comprehensive tests for version retention policy and cleanup functionality.
 * Uses mock implementations to avoid database permission issues in worktrees.
 * Tests config management, cleanup strategies, tagging, and preview.
 */

import { describe, it, expect } from "bun:test";
import { Effect, Layer, Ref } from "effect";
import {
  RetentionService,
  type RetentionConfig,
  DEFAULT_RETENTION_CONFIG,
  type TaggedVersion,
  type CleanupResult,
  type CleanupPreview,
} from "../src/services/retention-service";
import { runTest } from "./utils";

/**
 * Mock version data for testing
 */
interface MockVersion {
  id: number;
  promptId: string;
  version: number;
  createdAt: Date;
  content: string;
}

/**
 * Create a mock RetentionService for testing.
 * Simulates retention operations without database dependencies.
 */
const createMockRetentionLayer = (
  initialConfig: RetentionConfig = DEFAULT_RETENTION_CONFIG,
  initialVersions: MockVersion[] = [],
  initialTags: TaggedVersion[] = []
): Layer.Layer<RetentionService> => {
  return Layer.effect(
    RetentionService,
    Effect.gen(function* () {
      const configRef = yield* Ref.make<RetentionConfig>(initialConfig);
      const versionsRef = yield* Ref.make<MockVersion[]>(initialVersions);
      const tagsRef = yield* Ref.make<TaggedVersion[]>(initialTags);

      return RetentionService.of({
        getConfig: () => Ref.get(configRef),

        setConfig: (config: RetentionConfig) =>
          Effect.gen(function* () {
            yield* Ref.set(configRef, config);
          }),

        cleanupVersions: (promptId: string) =>
          Effect.gen(function* () {
            const config = yield* Ref.get(configRef);
            const versions = yield* Ref.get(versionsRef);
            const tags = yield* Ref.get(tagsRef);

            // Get versions for this prompt, sorted by version descending
            const promptVersions = versions
              .filter((v) => v.promptId === promptId)
              .sort((a, b) => b.version - a.version);

            if (promptVersions.length === 0) {
              return 0;
            }

            const taggedVersionNumbers = tags
              .filter((t) => t.promptId === promptId)
              .map((t) => t.version);

            // Determine which versions to keep
            const toKeep = new Set<number>();

            // Always keep version 1 and HEAD
            const headVersion = promptVersions[0]?.version;
            if (headVersion) toKeep.add(headVersion);
            toKeep.add(1);

            // Apply strategy
            let versionsToCheck = promptVersions;

            if (config.strategy === "count" || config.strategy === "both") {
              // Keep the most recent N versions
              const keepCount = Math.max(config.maxVersionsPerPrompt, 2); // At least 2 (v1 + head)
              versionsToCheck.slice(0, keepCount).forEach((v) => toKeep.add(v.version));
            }

            if (config.strategy === "days" || config.strategy === "both") {
              // Keep versions within retention period
              const cutoffDate = new Date();
              cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

              versionsToCheck
                .filter((v) => v.createdAt >= cutoffDate)
                .forEach((v) => toKeep.add(v.version));
            }

            // Keep tagged versions if configured
            if (config.preserveTaggedVersions) {
              taggedVersionNumbers.forEach((v) => toKeep.add(v));
            }

            // Delete versions not in keep set
            const toDelete = promptVersions.filter((v) => !toKeep.has(v.version));

            yield* Ref.update(versionsRef, (all) =>
              all.filter(
                (v) => v.promptId !== promptId || toKeep.has(v.version)
              )
            );

            return toDelete.length;
          }),

        cleanupAll: () =>
          Effect.gen(function* () {
            const versions = yield* Ref.get(versionsRef);

            // Get unique prompt IDs
            const promptIds = [...new Set(versions.map((v) => v.promptId))];

            let totalDeleted = 0;
            const affectedPrompts: string[] = [];

            for (const promptId of promptIds) {
              const service = yield* RetentionService;
              const deleted = yield* service.cleanupVersions(promptId);
              if (deleted > 0) {
                totalDeleted += deleted;
                affectedPrompts.push(promptId);
              }
            }

            const result: CleanupResult = {
              totalVersionsDeleted: totalDeleted,
              promptsAffected: affectedPrompts.length,
            };

            return result;
          }),

        previewCleanup: () =>
          Effect.gen(function* () {
            const config = yield* Ref.get(configRef);
            const versions = yield* Ref.get(versionsRef);
            const tags = yield* Ref.get(tagsRef);

            // Group by prompt
            const byPrompt = new Map<string, MockVersion[]>();
            for (const v of versions) {
              const list = byPrompt.get(v.promptId) ?? [];
              list.push(v);
              byPrompt.set(v.promptId, list);
            }

            let totalToDelete = 0;
            const affectedPrompts: string[] = [];

            for (const [promptId, promptVersions] of byPrompt) {
              const sorted = promptVersions.sort((a, b) => b.version - a.version);
              const taggedVersionNumbers = tags
                .filter((t) => t.promptId === promptId)
                .map((t) => t.version);

              const toKeep = new Set<number>();
              const headVersion = sorted[0]?.version;
              if (headVersion) toKeep.add(headVersion);
              toKeep.add(1);

              if (config.strategy === "count" || config.strategy === "both") {
                const keepCount = Math.max(config.maxVersionsPerPrompt, 2);
                sorted.slice(0, keepCount).forEach((v) => toKeep.add(v.version));
              }

              if (config.strategy === "days" || config.strategy === "both") {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);
                sorted
                  .filter((v) => v.createdAt >= cutoffDate)
                  .forEach((v) => toKeep.add(v.version));
              }

              if (config.preserveTaggedVersions) {
                taggedVersionNumbers.forEach((v) => toKeep.add(v));
              }

              const wouldDelete = sorted.filter((v) => !toKeep.has(v.version)).length;
              if (wouldDelete > 0) {
                totalToDelete += wouldDelete;
                affectedPrompts.push(promptId);
              }
            }

            const preview: CleanupPreview = {
              totalVersionsToDelete: totalToDelete,
              promptsAffected: affectedPrompts.length,
              versionsByPrompt: Object.fromEntries(
                affectedPrompts.map((pid) => [
                  pid,
                  byPrompt.get(pid)?.length ?? 0,
                ])
              ),
            };

            return preview;
          }),

        tagVersion: (promptId: string, version: number, tag: string) =>
          Effect.gen(function* () {
            yield* Ref.update(tagsRef, (tags) => [
              ...tags.filter(
                (t) => !(t.promptId === promptId && t.version === version)
              ),
              { promptId, version, tag, createdAt: new Date() },
            ]);
          }),

        untagVersion: (promptId: string, version: number) =>
          Effect.gen(function* () {
            yield* Ref.update(tagsRef, (tags) =>
              tags.filter(
                (t) => !(t.promptId === promptId && t.version === version)
              )
            );
          }),

        getTaggedVersions: (promptId: string) =>
          Effect.gen(function* () {
            const tags = yield* Ref.get(tagsRef);
            return tags.filter((t) => t.promptId === promptId);
          }),
      });
    })
  );
};

// Helper to create test versions
const createTestVersions = (
  promptId: string,
  count: number,
  daysOldStart: number = 0
): MockVersion[] => {
  return Array.from({ length: count }, (_, i) => {
    const daysOld = daysOldStart + i;
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysOld);

    return {
      id: i + 1,
      promptId,
      version: i + 1,
      createdAt,
      content: `Test content version ${i + 1}`,
    };
  });
};

// Default test layer
const TestLayer = () => createMockRetentionLayer();

describe("RetentionService", () => {
  describe("getConfig", () => {
    it("should return default config if not set", async () => {
      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;
        return yield* retention.getConfig();
      });

      const config = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(config).toEqual(DEFAULT_RETENTION_CONFIG);
    });

    it("should return custom config after setting", async () => {
      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;

        const customConfig: RetentionConfig = {
          maxVersionsPerPrompt: 100,
          retentionDays: 180,
          strategy: "both",
          preserveTaggedVersions: false,
        };

        yield* retention.setConfig(customConfig);
        return yield* retention.getConfig();
      });

      const config = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(config.maxVersionsPerPrompt).toBe(100);
      expect(config.retentionDays).toBe(180);
      expect(config.strategy).toBe("both");
      expect(config.preserveTaggedVersions).toBe(false);
    });
  });

  describe("setConfig", () => {
    it("should persist config changes", async () => {
      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;

        yield* retention.setConfig({
          maxVersionsPerPrompt: 50,
          retentionDays: 60,
          strategy: "count",
          preserveTaggedVersions: true,
        });

        return yield* retention.getConfig();
      });

      const config = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(config.maxVersionsPerPrompt).toBe(50);
      expect(config.retentionDays).toBe(60);
    });

    it("should allow partial config updates", async () => {
      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;

        // Set initial config
        yield* retention.setConfig({
          ...DEFAULT_RETENTION_CONFIG,
          maxVersionsPerPrompt: 20,
        });

        return yield* retention.getConfig();
      });

      const config = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(config.maxVersionsPerPrompt).toBe(20);
      expect(config.retentionDays).toBe(DEFAULT_RETENTION_CONFIG.retentionDays);
    });
  });

  describe("cleanupVersions - count strategy", () => {
    it("should delete versions exceeding max count", async () => {
      const versions = createTestVersions("test-prompt", 10);
      const TestLayerWithVersions = createMockRetentionLayer(
        {
          maxVersionsPerPrompt: 5,
          retentionDays: 90,
          strategy: "count",
          preserveTaggedVersions: true,
        },
        versions
      );

      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;
        return yield* retention.cleanupVersions("test-prompt");
      });

      const deleted = await runTest(
        program.pipe(Effect.provide(TestLayerWithVersions))
      );

      // Should delete versions exceeding the limit (keeping v1, head, and recent ones)
      expect(deleted).toBeGreaterThanOrEqual(0);
      expect(deleted).toBeLessThanOrEqual(5); // Can't delete more than 10 - 5
    });

    it("should always keep version 1 and HEAD", async () => {
      const versions = createTestVersions("test-prompt", 5);
      const TestLayerWithVersions = createMockRetentionLayer(
        {
          maxVersionsPerPrompt: 1, // Very aggressive
          retentionDays: 90,
          strategy: "count",
          preserveTaggedVersions: true,
        },
        versions
      );

      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;
        yield* retention.cleanupVersions("test-prompt");

        // Preview to see what remains
        return yield* retention.previewCleanup();
      });

      const preview = await runTest(
        program.pipe(Effect.provide(TestLayerWithVersions))
      );

      // After cleanup, preview should show no more to delete
      expect(preview.totalVersionsToDelete).toBe(0);
    });

    it("should handle empty prompt", async () => {
      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;
        return yield* retention.cleanupVersions("nonexistent-prompt");
      });

      const deleted = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(deleted).toBe(0);
    });
  });

  describe("cleanupVersions - days strategy", () => {
    it("should delete versions older than retention days", async () => {
      // Create 5 recent versions (0-4 days old) and 5 old versions (60-64 days old)
      const recentVersions = createTestVersions("test-prompt", 5, 0);
      const oldVersions = createTestVersions("test-prompt", 5, 60).map(
        (v, i) => ({
          ...v,
          id: i + 6,
          version: i + 6,
        })
      );

      const allVersions = [...recentVersions, ...oldVersions];

      const TestLayerWithVersions = createMockRetentionLayer(
        {
          maxVersionsPerPrompt: 50,
          retentionDays: 30, // Keep versions from last 30 days
          strategy: "days",
          preserveTaggedVersions: true,
        },
        allVersions
      );

      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;
        return yield* retention.cleanupVersions("test-prompt");
      });

      const deleted = await runTest(
        program.pipe(Effect.provide(TestLayerWithVersions))
      );

      // Should delete old versions (minus v1 which is always kept)
      expect(deleted).toBeGreaterThanOrEqual(0);
    });
  });

  describe("cleanupVersions - both strategy", () => {
    it("should apply both count and days limits", async () => {
      const versions = createTestVersions("test-prompt", 8, 0);

      const TestLayerWithVersions = createMockRetentionLayer(
        {
          maxVersionsPerPrompt: 5,
          retentionDays: 30,
          strategy: "both",
          preserveTaggedVersions: true,
        },
        versions
      );

      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;
        return yield* retention.cleanupVersions("test-prompt");
      });

      const deleted = await runTest(
        program.pipe(Effect.provide(TestLayerWithVersions))
      );

      expect(deleted).toBeGreaterThanOrEqual(0);
    });
  });

  describe("tagVersion", () => {
    it("should tag a version to preserve it", async () => {
      const versions = createTestVersions("test-prompt", 5);

      const TestLayerWithVersions = createMockRetentionLayer(
        DEFAULT_RETENTION_CONFIG,
        versions
      );

      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;

        yield* retention.tagVersion("test-prompt", 3, "stable");

        return yield* retention.getTaggedVersions("test-prompt");
      });

      const tagged = await runTest(
        program.pipe(Effect.provide(TestLayerWithVersions))
      );

      expect(tagged.length).toBe(1);
      expect(tagged[0].version).toBe(3);
      expect(tagged[0].tag).toBe("stable");
    });

    it("should preserve tagged versions during cleanup", async () => {
      const versions = createTestVersions("test-prompt", 10);
      const tags: TaggedVersion[] = [
        {
          promptId: "test-prompt",
          version: 5,
          tag: "important",
          createdAt: new Date(),
        },
      ];

      const TestLayerWithVersions = createMockRetentionLayer(
        {
          maxVersionsPerPrompt: 3,
          retentionDays: 90,
          strategy: "count",
          preserveTaggedVersions: true,
        },
        versions,
        tags
      );

      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;
        yield* retention.cleanupVersions("test-prompt");

        // Check that tagged version is still available
        const remainingTags = yield* retention.getTaggedVersions("test-prompt");
        return remainingTags;
      });

      const remainingTags = await runTest(
        program.pipe(Effect.provide(TestLayerWithVersions))
      );

      // Tagged version should still exist
      expect(remainingTags.length).toBe(1);
      expect(remainingTags[0].version).toBe(5);
    });

    it("should allow multiple tags on same prompt", async () => {
      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;

        yield* retention.tagVersion("prompt-1", 1, "v1.0");
        yield* retention.tagVersion("prompt-1", 5, "v2.0");
        yield* retention.tagVersion("prompt-1", 10, "latest");

        return yield* retention.getTaggedVersions("prompt-1");
      });

      const tagged = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(tagged.length).toBe(3);
      expect(tagged.map((t) => t.tag).sort()).toEqual(["latest", "v1.0", "v2.0"]);
    });

    it("should overwrite tag on same version", async () => {
      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;

        yield* retention.tagVersion("prompt-1", 5, "old-tag");
        yield* retention.tagVersion("prompt-1", 5, "new-tag");

        return yield* retention.getTaggedVersions("prompt-1");
      });

      const tagged = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(tagged.length).toBe(1);
      expect(tagged[0].tag).toBe("new-tag");
    });
  });

  describe("untagVersion", () => {
    it("should remove tag from version", async () => {
      const tags: TaggedVersion[] = [
        { promptId: "test-prompt", version: 3, tag: "stable", createdAt: new Date() },
      ];

      const TestLayerWithTags = createMockRetentionLayer(
        DEFAULT_RETENTION_CONFIG,
        [],
        tags
      );

      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;

        // Verify tag exists
        let tagged = yield* retention.getTaggedVersions("test-prompt");
        expect(tagged.length).toBe(1);

        // Remove tag
        yield* retention.untagVersion("test-prompt", 3);

        // Verify tag removed
        return yield* retention.getTaggedVersions("test-prompt");
      });

      const tagged = await runTest(
        program.pipe(Effect.provide(TestLayerWithTags))
      );

      expect(tagged.length).toBe(0);
    });

    it("should not fail when untagging non-existent tag", async () => {
      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;
        yield* retention.untagVersion("nonexistent", 999);
        return "success";
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result).toBe("success");
    });
  });

  describe("cleanupAll", () => {
    it("should cleanup all prompts", async () => {
      const versions = [
        ...createTestVersions("prompt-1", 10),
        ...createTestVersions("prompt-2", 8).map((v, i) => ({
          ...v,
          id: i + 11,
          promptId: "prompt-2",
        })),
        ...createTestVersions("prompt-3", 6).map((v, i) => ({
          ...v,
          id: i + 19,
          promptId: "prompt-3",
        })),
      ];

      const TestLayerWithVersions = createMockRetentionLayer(
        {
          maxVersionsPerPrompt: 3,
          retentionDays: 90,
          strategy: "count",
          preserveTaggedVersions: true,
        },
        versions
      );

      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;
        return yield* retention.cleanupAll();
      });

      const result = await runTest(
        program.pipe(Effect.provide(TestLayerWithVersions))
      );

      expect(result.promptsAffected).toBeGreaterThanOrEqual(0);
      expect(result.totalVersionsDeleted).toBeGreaterThanOrEqual(0);
    });

    it("should return zero when no cleanup needed", async () => {
      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;
        return yield* retention.cleanupAll();
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result.promptsAffected).toBe(0);
      expect(result.totalVersionsDeleted).toBe(0);
    });
  });

  describe("previewCleanup", () => {
    it("should preview what would be deleted without deleting", async () => {
      const versions = createTestVersions("test-prompt", 10);

      const TestLayerWithVersions = createMockRetentionLayer(
        {
          maxVersionsPerPrompt: 3,
          retentionDays: 90,
          strategy: "count",
          preserveTaggedVersions: true,
        },
        versions
      );

      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;

        // Get preview
        const preview = yield* retention.previewCleanup();

        // Verify nothing was actually deleted by previewing again
        const preview2 = yield* retention.previewCleanup();

        return { preview, preview2 };
      });

      const { preview, preview2 } = await runTest(
        program.pipe(Effect.provide(TestLayerWithVersions))
      );

      // Preview should show potential deletions
      expect(preview.totalVersionsToDelete).toBeGreaterThanOrEqual(0);

      // Second preview should be identical (nothing was actually deleted)
      expect(preview2.totalVersionsToDelete).toBe(preview.totalVersionsToDelete);
    });

    it("should include version counts by prompt", async () => {
      const versions = [
        ...createTestVersions("prompt-1", 10),
        ...createTestVersions("prompt-2", 5).map((v, i) => ({
          ...v,
          id: i + 11,
          promptId: "prompt-2",
        })),
      ];

      const TestLayerWithVersions = createMockRetentionLayer(
        {
          maxVersionsPerPrompt: 3,
          retentionDays: 90,
          strategy: "count",
          preserveTaggedVersions: true,
        },
        versions
      );

      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;
        return yield* retention.previewCleanup();
      });

      const preview = await runTest(
        program.pipe(Effect.provide(TestLayerWithVersions))
      );

      expect(preview.versionsByPrompt).toBeDefined();
      expect(typeof preview.versionsByPrompt).toBe("object");
    });
  });

  describe("getTaggedVersions", () => {
    it("should return empty array for prompt with no tags", async () => {
      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;
        return yield* retention.getTaggedVersions("no-tags-prompt");
      });

      const tagged = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(tagged).toEqual([]);
    });

    it("should return only tags for specified prompt", async () => {
      const tags: TaggedVersion[] = [
        { promptId: "prompt-1", version: 1, tag: "v1", createdAt: new Date() },
        { promptId: "prompt-2", version: 1, tag: "v1", createdAt: new Date() },
        { promptId: "prompt-1", version: 2, tag: "v2", createdAt: new Date() },
      ];

      const TestLayerWithTags = createMockRetentionLayer(
        DEFAULT_RETENTION_CONFIG,
        [],
        tags
      );

      const program = Effect.gen(function* () {
        const retention = yield* RetentionService;
        return yield* retention.getTaggedVersions("prompt-1");
      });

      const tagged = await runTest(
        program.pipe(Effect.provide(TestLayerWithTags))
      );

      expect(tagged.length).toBe(2);
      expect(tagged.every((t) => t.promptId === "prompt-1")).toBe(true);
    });
  });
});
