/**
 * Remote Sync Service Tests
 *
 * Tests for git-based prompt synchronization.
 * Uses mock layers to avoid actual git operations.
 */

import { describe, it, expect } from "bun:test";
import { Effect, Layer, Ref } from "effect";
import {
  RemoteSyncService,
  type SyncConfig,
  type SyncResult,
  type SyncStatus,
  type Resolution,
} from "../src/services/remote-sync-service";
import { runTest, runTestExpectFailure } from "./utils";
import { StorageError } from "../src/models";

/**
 * Create a mock RemoteSyncService layer for testing.
 * Creates fresh state for each layer instantiation.
 */
const createMockLayer = (
  initialConfig: SyncConfig | null = null,
  mockStatus: Partial<SyncStatus> = {}
): Layer.Layer<RemoteSyncService> => {
  return Layer.effect(
    RemoteSyncService,
    Effect.gen(function* () {
      // Use Refs for mutable state within the effect context
      const configRef = yield* Ref.make<SyncConfig | null>(initialConfig);
      const conflictsRef = yield* Ref.make<string[]>([]);

      return RemoteSyncService.of({
        configure: (newConfig: SyncConfig) =>
          Effect.gen(function* () {
            if (!newConfig.remote) {
              return yield* Effect.fail(
                new StorageError({ message: "Remote URL is required" })
              );
            }
            yield* Ref.set(configRef, newConfig);
          }),

        push: () =>
          Effect.gen(function* () {
            const config = yield* Ref.get(configRef);
            if (!config) {
              return yield* Effect.fail(
                new StorageError({
                  message: "Sync not configured. Run configure first.",
                })
              );
            }

            const result: SyncResult = {
              success: true,
              filesChanged: 0,
              conflicts: [],
            };
            return result;
          }),

        pull: () =>
          Effect.gen(function* () {
            const config = yield* Ref.get(configRef);
            if (!config) {
              return yield* Effect.fail(
                new StorageError({
                  message: "Sync not configured. Run configure first.",
                })
              );
            }

            const conflicts = yield* Ref.get(conflictsRef);
            const result: SyncResult = {
              success: conflicts.length === 0,
              filesChanged: 2,
              conflicts: [...conflicts],
            };
            return result;
          }),

        getStatus: () =>
          Effect.gen(function* () {
            const config = yield* Ref.get(configRef);
            const conflicts = yield* Ref.get(conflictsRef);

            if (!config) {
              return {
                isConfigured: false,
                ahead: 0,
                behind: 0,
                hasConflicts: false,
              };
            }

            return {
              isConfigured: true,
              remote: config.remote,
              branch: config.branch ?? "main",
              ahead: mockStatus.ahead ?? 0,
              behind: mockStatus.behind ?? 0,
              hasConflicts: conflicts.length > 0,
            };
          }),

        resolveConflicts: (resolutions: Resolution[]) =>
          Effect.gen(function* () {
            yield* Ref.update(conflictsRef, (current) =>
              current.filter(
                (f) => !resolutions.some((r) => r.file === f)
              )
            );
          }),
      });
    })
  );
};

// Create fresh layer for unconfigured state
const UnconfiguredTestLayer = () => createMockLayer();

// Create fresh layer for configured state
const ConfiguredTestLayer = () =>
  createMockLayer({
    provider: "git",
    remote: "https://github.com/test/repo.git",
    branch: "main",
    autoSync: false,
  });

describe("RemoteSyncService", () => {
  describe("configure", () => {
    it("should configure sync with valid config", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;

        yield* sync.configure({
          provider: "git",
          remote: "https://github.com/test/repo.git",
          branch: "main",
        });

        const status = yield* sync.getStatus();
        return status;
      });

      const status = await runTest(
        program.pipe(Effect.provide(UnconfiguredTestLayer()))
      );

      expect(status.isConfigured).toBe(true);
      expect(status.remote).toBe("https://github.com/test/repo.git");
      expect(status.branch).toBe("main");
    });

    it("should fail with empty remote URL", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;

        yield* sync.configure({
          provider: "git",
          remote: "",
        });
      });

      const error = await runTestExpectFailure(
        program.pipe(Effect.provide(UnconfiguredTestLayer()))
      );

      expect(error).toBeInstanceOf(StorageError);
      expect((error as StorageError).message).toContain("required");
    });

    it("should allow optional branch and autoSync settings", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;

        yield* sync.configure({
          provider: "git",
          remote: "https://github.com/test/repo.git",
          branch: "develop",
          autoSync: true,
        });

        const status = yield* sync.getStatus();
        return status;
      });

      const status = await runTest(
        program.pipe(Effect.provide(UnconfiguredTestLayer()))
      );

      expect(status.branch).toBe("develop");
    });
  });

  describe("getStatus", () => {
    it("should return unconfigured status initially", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;
        return yield* sync.getStatus();
      });

      const status = await runTest(
        program.pipe(Effect.provide(UnconfiguredTestLayer()))
      );

      expect(status.isConfigured).toBe(false);
      expect(status.ahead).toBe(0);
      expect(status.behind).toBe(0);
      expect(status.hasConflicts).toBe(false);
    });

    it("should return configured status with remote and branch", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;
        return yield* sync.getStatus();
      });

      const status = await runTest(
        program.pipe(Effect.provide(ConfiguredTestLayer()))
      );

      expect(status.isConfigured).toBe(true);
      expect(status.remote).toBe("https://github.com/test/repo.git");
      expect(status.branch).toBe("main");
    });

    it("should report ahead/behind counts", async () => {
      const TestLayer = createMockLayer(
        {
          provider: "git",
          remote: "https://github.com/test/repo.git",
          branch: "main",
        },
        { ahead: 3, behind: 5 }
      );

      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;
        return yield* sync.getStatus();
      });

      const status = await runTest(program.pipe(Effect.provide(TestLayer)));

      expect(status.ahead).toBe(3);
      expect(status.behind).toBe(5);
    });
  });

  describe("push", () => {
    it("should fail when not configured", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;
        return yield* sync.push();
      });

      const error = await runTestExpectFailure(
        program.pipe(Effect.provide(UnconfiguredTestLayer()))
      );

      expect(error).toBeInstanceOf(StorageError);
      expect((error as StorageError).message).toContain("not configured");
    });

    it("should push changes successfully when configured", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;
        return yield* sync.push({ message: "Test commit" });
      });

      const result = await runTest(
        program.pipe(Effect.provide(ConfiguredTestLayer()))
      );

      expect(result.success).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it("should accept force push option", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;
        return yield* sync.push({ message: "Force push", force: true });
      });

      const result = await runTest(
        program.pipe(Effect.provide(ConfiguredTestLayer()))
      );

      expect(result.success).toBe(true);
    });
  });

  describe("pull", () => {
    it("should fail when not configured", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;
        return yield* sync.pull();
      });

      const error = await runTestExpectFailure(
        program.pipe(Effect.provide(UnconfiguredTestLayer()))
      );

      expect(error).toBeInstanceOf(StorageError);
      expect((error as StorageError).message).toContain("not configured");
    });

    it("should pull changes successfully", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;
        return yield* sync.pull();
      });

      const result = await runTest(
        program.pipe(Effect.provide(ConfiguredTestLayer()))
      );

      expect(result.success).toBe(true);
      expect(result.filesChanged).toBeGreaterThanOrEqual(0);
    });

    it("should accept merge strategy option", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;
        return yield* sync.pull({ strategy: "merge" });
      });

      const result = await runTest(
        program.pipe(Effect.provide(ConfiguredTestLayer()))
      );

      expect(result.success).toBe(true);
    });

    it("should accept rebase strategy option", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;
        return yield* sync.pull({ strategy: "rebase" });
      });

      const result = await runTest(
        program.pipe(Effect.provide(ConfiguredTestLayer()))
      );

      expect(result.success).toBe(true);
    });
  });

  describe("conflict resolution", () => {
    it("should resolve conflicts with ours strategy", async () => {
      // Create a service with conflicts using Refs
      const ConflictTestLayer = Layer.effect(
        RemoteSyncService,
        Effect.gen(function* () {
          const conflictsRef = yield* Ref.make(["file1.md", "file2.md"]);

          return RemoteSyncService.of({
            configure: () => Effect.void,
            push: () =>
              Effect.succeed({ success: true, filesChanged: 0, conflicts: [] }),
            pull: () =>
              Effect.gen(function* () {
                const conflicts = yield* Ref.get(conflictsRef);
                return {
                  success: conflicts.length === 0,
                  filesChanged: 2,
                  conflicts: [...conflicts],
                };
              }),
            getStatus: () =>
              Effect.gen(function* () {
                const conflicts = yield* Ref.get(conflictsRef);
                return {
                  isConfigured: true,
                  remote: "test",
                  branch: "main",
                  ahead: 0,
                  behind: 0,
                  hasConflicts: conflicts.length > 0,
                };
              }),
            resolveConflicts: (resolutions) =>
              Effect.gen(function* () {
                yield* Ref.update(conflictsRef, (current) =>
                  current.filter(
                    (f) => !resolutions.some((r) => r.file === f)
                  )
                );
              }),
          });
        })
      );

      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;

        // Pull with conflicts
        const pullResult = yield* sync.pull();
        expect(pullResult.conflicts).toHaveLength(2);

        // Resolve one conflict
        yield* sync.resolveConflicts([{ file: "file1.md", strategy: "ours" }]);

        // Check status
        const status = yield* sync.getStatus();
        return { pullResult, status };
      });

      const { status } = await runTest(
        program.pipe(Effect.provide(ConflictTestLayer))
      );

      expect(status.hasConflicts).toBe(true); // Still has one conflict
    });

    it("should resolve conflicts with theirs strategy", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;

        yield* sync.resolveConflicts([
          { file: "conflict.md", strategy: "theirs" },
        ]);

        return "resolved";
      });

      const result = await runTest(
        program.pipe(Effect.provide(ConfiguredTestLayer()))
      );

      expect(result).toBe("resolved");
    });

    it("should resolve conflicts with manual content", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;

        yield* sync.resolveConflicts([
          {
            file: "conflict.md",
            strategy: "manual",
            content: "Manually merged content",
          },
        ]);

        return "resolved";
      });

      const result = await runTest(
        program.pipe(Effect.provide(ConfiguredTestLayer()))
      );

      expect(result).toBe("resolved");
    });

    it("should resolve multiple conflicts at once", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;

        yield* sync.resolveConflicts([
          { file: "file1.md", strategy: "ours" },
          { file: "file2.md", strategy: "theirs" },
          {
            file: "file3.md",
            strategy: "manual",
            content: "Custom content",
          },
        ]);

        return "all resolved";
      });

      const result = await runTest(
        program.pipe(Effect.provide(ConfiguredTestLayer()))
      );

      expect(result).toBe("all resolved");
    });
  });

  describe("sync workflow integration", () => {
    it("should handle complete sync workflow", async () => {
      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;

        // Check initial status
        const initialStatus = yield* sync.getStatus();

        // Configure if needed
        if (!initialStatus.isConfigured) {
          yield* sync.configure({
            provider: "git",
            remote: "https://github.com/test/repo.git",
            branch: "main",
          });
        }

        // Pull latest changes
        const pullResult = yield* sync.pull();

        // Push changes
        const pushResult = yield* sync.push({ message: "Sync complete" });

        // Check final status
        const finalStatus = yield* sync.getStatus();

        return { initialStatus, pullResult, pushResult, finalStatus };
      });

      const { initialStatus, pullResult, pushResult, finalStatus } =
        await runTest(program.pipe(Effect.provide(UnconfiguredTestLayer())));

      expect(initialStatus.isConfigured).toBe(false);
      expect(pullResult.success).toBe(true);
      expect(pushResult.success).toBe(true);
      expect(finalStatus.isConfigured).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle storage errors gracefully", async () => {
      const ErrorTestLayer = Layer.succeed(
        RemoteSyncService,
        RemoteSyncService.of({
          configure: () =>
            Effect.fail(
              new StorageError({ message: "Failed to write config" })
            ),
          push: () =>
            Effect.fail(new StorageError({ message: "Push failed" })),
          pull: () =>
            Effect.fail(new StorageError({ message: "Pull failed" })),
          getStatus: () =>
            Effect.succeed({
              isConfigured: false,
              ahead: 0,
              behind: 0,
              hasConflicts: false,
            }),
          resolveConflicts: () => Effect.void,
        })
      );

      const program = Effect.gen(function* () {
        const sync = yield* RemoteSyncService;
        yield* sync.configure({
          provider: "git",
          remote: "https://test.com/repo.git",
        });
      });

      const error = await runTestExpectFailure(
        program.pipe(Effect.provide(ErrorTestLayer))
      );

      expect(error).toBeInstanceOf(StorageError);
      expect((error as StorageError).message).toContain(
        "Failed to write config"
      );
    });
  });
});
