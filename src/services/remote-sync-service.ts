/**
 * Remote Sync Service - Git-based synchronization for prompts
 *
 * Manages git operations for syncing prompts to a remote repository.
 * Handles configuration, push, pull, conflict resolution, and status checking.
 */

import { Context, Effect, Layer } from "effect";
import { Schema } from "@effect/schema";
import { homedir } from "node:os";
import { join } from "node:path";
import { StorageError } from "../models";

/**
 * Git sync configuration
 */
export interface SyncConfig {
  provider: "git";
  remote: string; // Git URL
  branch?: string;
  autoSync?: boolean;
}

/**
 * Result of a sync operation (push or pull)
 */
export interface SyncResult {
  success: boolean;
  filesChanged: number;
  conflicts: string[];
}

/**
 * Current sync status
 */
export interface SyncStatus {
  isConfigured: boolean;
  remote?: string;
  branch?: string;
  ahead: number;
  behind: number;
  hasConflicts: boolean;
}

/**
 * Conflict resolution strategy
 */
export interface Resolution {
  file: string;
  strategy: "ours" | "theirs" | "manual";
  content?: string; // For manual resolution
}

/**
 * Push options
 */
export interface PushOptions {
  message?: string;
  force?: boolean;
}

/**
 * Pull options
 */
export interface PullOptions {
  strategy?: "merge" | "rebase";
}

/**
 * Schema for sync configuration
 */
export const SyncConfigSchema = Schema.Struct({
  provider: Schema.Literal("git"),
  remote: Schema.String,
  branch: Schema.optional(Schema.String),
  autoSync: Schema.optional(Schema.Boolean),
});

/**
 * Remote sync service interface - manages git-based sync
 */
interface RemoteSyncServiceImpl {
  /**
   * Configure git sync
   * @param config - Sync configuration
   * @returns Effect that succeeds or fails with StorageError
   */
  readonly configure: (config: SyncConfig) => Effect.Effect<void, StorageError>;

  /**
   * Push local changes to remote
   * @param options - Push options
   * @returns Effect that succeeds with SyncResult or fails with StorageError
   */
  readonly push: (options?: PushOptions) => Effect.Effect<SyncResult, StorageError>;

  /**
   * Pull remote changes
   * @param options - Pull options
   * @returns Effect that succeeds with SyncResult or fails with StorageError
   */
  readonly pull: (options?: PullOptions) => Effect.Effect<SyncResult, StorageError>;

  /**
   * Get current sync status
   * @returns Effect that succeeds with SyncStatus or fails with StorageError
   */
  readonly getStatus: () => Effect.Effect<SyncStatus, StorageError>;

  /**
   * Resolve merge conflicts
   * @param resolutions - Array of conflict resolutions
   * @returns Effect that succeeds or fails with StorageError
   */
  readonly resolveConflicts: (resolutions: Resolution[]) => Effect.Effect<void, StorageError>;
}

/**
 * Remote sync service tag
 */
export class RemoteSyncService extends Context.Tag("RemoteSyncService")<
  RemoteSyncService,
  RemoteSyncServiceImpl
>() {}

/**
 * Get the grimoire directory path
 */
const getGrimoireDir = (): string => {
  return join(homedir(), ".grimoire");
};

/**
 * Get the prompts directory path
 */
const getPromptsDir = (): string => {
  return join(getGrimoireDir(), "prompts");
};

/**
 * Get the sync config file path
 */
const getSyncConfigPath = (): string => {
  return join(getGrimoireDir(), "sync-config.json");
};

/**
 * Run a git command in the prompts directory (with guaranteed process cleanup)
 */
const runGit = (args: string[]): Effect.Effect<string, StorageError> =>
  Effect.tryPromise({
    try: async () => {
      const proc = Bun.spawn(["git", ...args], {
        cwd: getPromptsDir(),
        stdout: "pipe",
        stderr: "pipe",
      });
      try {
        const exitCode = await proc.exited;
        if (exitCode !== 0) {
          const stderrText = await new Response(proc.stderr).text();
          throw new Error(`Git command failed: ${stderrText}`);
        }
        return await new Response(proc.stdout).text();
      } finally {
        // Ensure process is killed on error/interruption
        try {
          if (!proc.killed) {
            proc.kill();
          }
        } catch {
          // Ignore errors during cleanup
        }
      }
    },
    catch: (error) =>
      new StorageError({
        message: `Git error: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      }),
  });

/**
 * Read sync configuration
 */
const readConfig = (): Effect.Effect<SyncConfig | null, StorageError> =>
  Effect.gen(function* () {
    const configPath = getSyncConfigPath();
    const file = Bun.file(configPath);

    const exists = yield* Effect.tryPromise({
      try: () => file.exists(),
      catch: (error) =>
        new StorageError({
          message: "Failed to check config file existence",
          cause: error,
        }),
    });

    if (!exists) {
      return null;
    }

    const content = yield* Effect.tryPromise({
      try: () => file.text(),
      catch: (error) =>
        new StorageError({
          message: "Failed to read sync config",
          cause: error,
        }),
    });

    const json = yield* Effect.try({
      try: () => JSON.parse(content),
      catch: (error) =>
        new StorageError({
          message: "Failed to parse sync config",
          cause: error,
        }),
    });

    const config = yield* Schema.decodeUnknown(SyncConfigSchema)(json).pipe(
      Effect.mapError(
        (error) =>
          new StorageError({
            message: "Invalid sync config",
            cause: error,
          })
      )
    );

    return config;
  });

/**
 * Write sync configuration
 */
const writeConfig = (config: SyncConfig): Effect.Effect<void, StorageError> =>
  Effect.tryPromise({
    try: async () => {
      const configPath = getSyncConfigPath();
      await Bun.write(configPath, JSON.stringify(config, null, 2));
    },
    catch: (error) =>
      new StorageError({
        message: "Failed to write sync config",
        cause: error,
      }),
  });

/**
 * Check if directory is a git repository (with guaranteed process cleanup)
 */
const isGitRepo = (): Effect.Effect<boolean, StorageError> =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: async () => {
        const proc = Bun.spawn(["git", "rev-parse", "--git-dir"], {
          cwd: getPromptsDir(),
          stdout: "pipe",
          stderr: "pipe",
        });
        try {
          const exitCode = await proc.exited;
          return exitCode === 0;
        } finally {
          // Ensure process is killed on error/interruption
          try {
            if (!proc.killed) {
              proc.kill();
            }
          } catch {
            // Ignore errors during cleanup
          }
        }
      },
      catch: () => false,
    }).pipe(Effect.orElse(() => Effect.succeed(false)));

    return result;
  });

/**
 * Initialize git repository
 */
const initGitRepo = (config: SyncConfig): Effect.Effect<void, StorageError> =>
  Effect.gen(function* () {
    // Initialize git repo
    yield* runGit(["init"]);

    // Set default branch if specified
    const branch = config.branch ?? "main";
    yield* runGit(["checkout", "-b", branch]).pipe(Effect.catchAll(() => Effect.void));

    // Add remote
    yield* runGit(["remote", "add", "origin", config.remote]).pipe(
      Effect.catchAll(() => runGit(["remote", "set-url", "origin", config.remote]))
    );
  });

/**
 * Count files changed in working directory
 */
const countChangedFiles = (): Effect.Effect<number, StorageError> =>
  Effect.gen(function* () {
    const status = yield* runGit(["status", "--porcelain"]);
    const lines = status
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
    return lines.length;
  });

/**
 * Get list of conflicted files
 */
const getConflictedFiles = (): Effect.Effect<string[], StorageError> =>
  Effect.gen(function* () {
    const status = yield* runGit(["diff", "--name-only", "--diff-filter=U"]);
    const files = status
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
    return files;
  });

/**
 * Remote sync service implementation
 */
export const RemoteSyncServiceLive = Layer.succeed(
  RemoteSyncService,
  RemoteSyncService.of({
    configure: (config: SyncConfig) =>
        Effect.gen(function* () {
          // Validate config
          yield* Schema.decodeUnknown(SyncConfigSchema)(config).pipe(
            Effect.mapError(
              (error) =>
                new StorageError({
                  message: "Invalid sync config",
                  cause: error,
                })
            )
          );

          // Write config to file
          yield* writeConfig(config);

          // Check if git repo exists
          const isRepo = yield* isGitRepo();

          // Initialize git repo if needed
          if (!isRepo) {
            yield* initGitRepo(config);
          } else {
            // Update remote URL if repo already exists
            yield* runGit(["remote", "set-url", "origin", config.remote]).pipe(
              Effect.catchAll(() => runGit(["remote", "add", "origin", config.remote]))
            );

            // Update branch if specified
            if (config.branch) {
              yield* runGit(["checkout", "-B", config.branch]).pipe(
                Effect.catchAll(() => Effect.void)
              );
            }
          }
        }),

      push: (options?: PushOptions) =>
        Effect.gen(function* () {
          // Read config to ensure we're configured
          const config = yield* readConfig();
          if (!config) {
            return yield* Effect.fail(
              new StorageError({
                message: "Sync not configured. Run configure first.",
              })
            );
          }

          // Check for changes
          const changedFiles = yield* countChangedFiles();
          if (changedFiles === 0) {
            return {
              success: true,
              filesChanged: 0,
              conflicts: [],
            };
          }

          // Stage all changes
          yield* runGit(["add", "."]);

          // Commit changes
          const message = options?.message ?? "Sync prompts";
          yield* runGit(["commit", "-m", message]).pipe(
            Effect.catchAll(() => Effect.void) // Ignore if nothing to commit
          );

          // Push to remote
          const branch = config.branch ?? "main";
          const pushArgs = ["push", "origin", branch];
          if (options?.force) {
            pushArgs.push("--force");
          }

          yield* runGit(pushArgs);

          return {
            success: true,
            filesChanged: changedFiles,
            conflicts: [],
          };
        }),

      pull: (options?: PullOptions) =>
        Effect.gen(function* () {
          // Read config to ensure we're configured
          const config = yield* readConfig();
          if (!config) {
            return yield* Effect.fail(
              new StorageError({
                message: "Sync not configured. Run configure first.",
              })
            );
          }

          const branch = config.branch ?? "main";

          // Fetch from remote
          yield* runGit(["fetch", "origin", branch]);

          // Count files before pull
          const beforeFiles = yield* countChangedFiles();

          // Pull changes
          const strategy = options?.strategy ?? "merge";
          if (strategy === "rebase") {
            yield* runGit(["pull", "--rebase", "origin", branch]).pipe(
              Effect.catchAll((error) => {
                // Check if it's a conflict
                return Effect.fail(error);
              })
            );
          } else {
            yield* runGit(["pull", "origin", branch]).pipe(
              Effect.catchAll((error) => {
                // Check if it's a conflict
                return Effect.fail(error);
              })
            );
          }

          // Count files after pull
          const afterFiles = yield* countChangedFiles();

          // Check for conflicts
          const conflicts = yield* getConflictedFiles();

          return {
            success: conflicts.length === 0,
            filesChanged: Math.abs(afterFiles - beforeFiles),
            conflicts,
          };
        }),

      getStatus: () =>
        Effect.gen(function* () {
          // Read config
          const config = yield* readConfig();

          if (!config) {
            return {
              isConfigured: false,
              ahead: 0,
              behind: 0,
              hasConflicts: false,
            };
          }

          // Check if git repo exists
          const isRepo = yield* isGitRepo();
          if (!isRepo) {
            return {
              isConfigured: true,
              remote: config.remote,
              branch: config.branch,
              ahead: 0,
              behind: 0,
              hasConflicts: false,
            };
          }

          const branch = config.branch ?? "main";

          // Fetch to get latest remote state
          yield* runGit(["fetch", "origin", branch]).pipe(Effect.catchAll(() => Effect.void));

          // Get ahead/behind counts
          const revList = yield* runGit([
            "rev-list",
            "--left-right",
            "--count",
            `origin/${branch}...HEAD`,
          ]).pipe(Effect.catchAll(() => Effect.succeed("0\t0")));

          const [behindStr, aheadStr] = revList.trim().split("\t");
          const behind = parseInt(behindStr ?? "0", 10);
          const ahead = parseInt(aheadStr ?? "0", 10);

          // Check for conflicts
          const conflicts = yield* getConflictedFiles();

          return {
            isConfigured: true,
            remote: config.remote,
            branch,
            ahead,
            behind,
            hasConflicts: conflicts.length > 0,
          };
        }),

      resolveConflicts: (resolutions: Resolution[]) =>
        Effect.gen(function* () {
          for (const resolution of resolutions) {
            if (resolution.strategy === "ours") {
              // Keep our version
              yield* runGit(["checkout", "--ours", resolution.file]);
              yield* runGit(["add", resolution.file]);
            } else if (resolution.strategy === "theirs") {
              // Keep their version
              yield* runGit(["checkout", "--theirs", resolution.file]);
              yield* runGit(["add", resolution.file]);
            } else if (resolution.strategy === "manual" && resolution.content) {
              // Write manual resolution
              const filePath = join(getPromptsDir(), resolution.file);
              yield* Effect.tryPromise({
                try: async () => {
                  await Bun.write(filePath, resolution.content!);
                },
                catch: (error) =>
                  new StorageError({
                    message: `Failed to write resolved file: ${resolution.file}`,
                    cause: error,
                  }),
              });
              yield* runGit(["add", resolution.file]);
            }
          }
        }),
  })
);
