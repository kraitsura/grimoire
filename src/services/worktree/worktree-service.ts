/**
 * Worktree Service
 *
 * Core service that wraps git worktree operations.
 * Handles creating, listing, and removing worktrees with support for:
 * - Auto-copying config files (e.g., .env, .envrc)
 * - Running post-create hooks (e.g., bun install)
 * - Tracking state for linked issues
 */

import { Context, Effect, Layer } from "effect";
import { join, basename } from "path";
import { glob } from "glob";
import type {
  WorktreeInfo,
  WorktreeListItem,
  WorktreeCreateOptions,
  WorktreeRemoveOptions,
  WorktreeMetadata,
} from "../../models/worktree";
import {
  sanitizeBranchName,
  isProtectedBranch,
  PROTECTED_BRANCHES,
  WORKTREE_METADATA_DIR,
  getWorktreeInfoPath,
} from "../../models/worktree";
import {
  WorktreeError,
  WorktreeNotFoundError,
  WorktreeAlreadyExistsError,
  BranchNotFoundError,
  GitOperationError,
  WorktreeDirtyError,
  HookExecutionError,
  NotInGitRepoError,
  ProtectedBranchError,
  FileCopyError,
} from "../../models/worktree-errors";
import { WorktreeStateService } from "./worktree-state-service";
import { WorktreeConfigService, type WorktreeConfigData } from "./worktree-config-service";

/**
 * Execute a shell command and return stdout/stderr
 */
const execCommand = (
  command: string,
  cwd?: string
): Effect.Effect<{ stdout: string; stderr: string; exitCode: number }, never> =>
  Effect.tryPromise({
    try: async () => {
      const proc = Bun.spawn(["sh", "-c", command], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
    },
    catch: (error) => ({
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    }),
  }).pipe(
    Effect.catchAll((result) =>
      Effect.succeed(result as { stdout: string; stderr: string; exitCode: number })
    )
  );

/**
 * Get the git repository root
 */
const getGitRoot = (
  cwd: string
): Effect.Effect<string, NotInGitRepoError> =>
  Effect.gen(function* () {
    const result = yield* execCommand("git rev-parse --show-toplevel", cwd);
    if (result.exitCode !== 0) {
      return yield* Effect.fail(new NotInGitRepoError({ path: cwd }));
    }
    return result.stdout;
  });

/**
 * Get the main repository root (not worktree root)
 * Works from main repo, worktree, or any subdirectory
 */
const getMainRepoRoot = (
  cwd: string
): Effect.Effect<string, NotInGitRepoError> =>
  Effect.gen(function* () {
    // Use git-common-dir to detect if in worktree
    const commonDirResult = yield* execCommand("git rev-parse --git-common-dir", cwd);
    if (commonDirResult.exitCode !== 0) {
      return yield* Effect.fail(new NotInGitRepoError({ path: cwd }));
    }

    const commonDir = commonDirResult.stdout.trim();

    // If commonDir is absolute path, we're in a worktree - extract repo root
    if (commonDir.startsWith("/")) {
      // commonDir is like: /Users/.../repo/.git
      // Return parent directory
      return commonDir.replace(/\/\.git$/, "");
    }

    // If relative (like ".git"), we're in main repo - use show-toplevel
    const toplevelResult = yield* execCommand("git rev-parse --show-toplevel", cwd);
    if (toplevelResult.exitCode !== 0) {
      return yield* Effect.fail(new NotInGitRepoError({ path: cwd }));
    }
    return toplevelResult.stdout;
  });

/**
 * Check if a branch exists
 */
const branchExists = (
  repoRoot: string,
  branch: string
): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const result = yield* execCommand(
      `git rev-parse --verify refs/heads/${branch}`,
      repoRoot
    );
    return result.exitCode === 0;
  });

/**
 * Create a new branch from HEAD
 */
const createBranch = (
  repoRoot: string,
  branch: string
): Effect.Effect<void, GitOperationError> =>
  Effect.gen(function* () {
    const result = yield* execCommand(`git branch "${branch}"`, repoRoot);
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new GitOperationError({
          command: `git branch "${branch}"`,
          stderr: result.stderr,
          exitCode: result.exitCode,
        })
      );
    }
  });

/**
 * Get list of uncommitted changes in a directory
 */
const getUncommittedChanges = (
  path: string
): Effect.Effect<number, never> =>
  Effect.gen(function* () {
    const result = yield* execCommand("git status --porcelain", path);
    if (result.exitCode !== 0) {
      return 0;
    }
    const lines = result.stdout.split("\n").filter((l) => l.trim().length > 0);
    return lines.length;
  });

/**
 * Get number of unpushed commits (commits ahead of remote)
 */
const getUnpushedCommits = (
  path: string
): Effect.Effect<number, never> =>
  Effect.gen(function* () {
    // First check if there's a remote tracking branch
    const trackingResult = yield* execCommand(
      "git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null",
      path
    );
    if (trackingResult.exitCode !== 0 || !trackingResult.stdout.trim()) {
      // No tracking branch - check if there are any commits that could be pushed
      // by comparing to origin/<branch>
      const branchResult = yield* execCommand("git rev-parse --abbrev-ref HEAD", path);
      if (branchResult.exitCode !== 0) return 0;
      const branch = branchResult.stdout.trim();

      // Check if origin/<branch> exists
      const remoteRefResult = yield* execCommand(`git rev-parse --verify origin/${branch} 2>/dev/null`, path);
      if (remoteRefResult.exitCode !== 0) {
        // Remote branch doesn't exist - count all commits as unpushed
        const allCommitsResult = yield* execCommand("git rev-list HEAD --count 2>/dev/null", path);
        if (allCommitsResult.exitCode === 0) {
          return parseInt(allCommitsResult.stdout.trim(), 10) || 0;
        }
        return 0;
      }

      // Remote branch exists, count commits ahead
      const aheadResult = yield* execCommand(`git rev-list origin/${branch}..HEAD --count 2>/dev/null`, path);
      if (aheadResult.exitCode === 0) {
        return parseInt(aheadResult.stdout.trim(), 10) || 0;
      }
      return 0;
    }

    // Has tracking branch - use rev-list to count ahead commits
    const upstream = trackingResult.stdout.trim();
    const aheadResult = yield* execCommand(`git rev-list ${upstream}..HEAD --count 2>/dev/null`, path);
    if (aheadResult.exitCode === 0) {
      return parseInt(aheadResult.stdout.trim(), 10) || 0;
    }
    return 0;
  });

/**
 * Check if a branch has been merged to main/master
 */
const isBranchMerged = (
  repoRoot: string,
  branch: string
): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    // Try main first, then master
    for (const mainBranch of PROTECTED_BRANCHES) {
      const result = yield* execCommand(
        `git branch --merged ${mainBranch} 2>/dev/null | grep -q "^\\s*${branch}$"`,
        repoRoot
      );
      if (result.exitCode === 0) {
        return true;
      }
    }
    return false;
  });

/**
 * Copy files matching glob patterns to destination
 */
const copyFiles = (
  repoRoot: string,
  destPath: string,
  patterns: string[]
): Effect.Effect<string[], FileCopyError> =>
  Effect.gen(function* () {
    const copiedFiles: string[] = [];

    for (const pattern of patterns) {
      const matches = yield* Effect.tryPromise({
        try: () => glob(pattern, { cwd: repoRoot, nodir: true }),
        catch: () => [] as string[],
      }).pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

      for (const file of matches) {
        const srcPath = join(repoRoot, file);
        const dstPath = join(destPath, basename(file));

        yield* Effect.tryPromise({
          try: async () => {
            const content = await Bun.file(srcPath).arrayBuffer();
            await Bun.write(dstPath, content);
          },
          catch: (error) =>
            new FileCopyError({
              source: srcPath,
              destination: dstPath,
              cause: error instanceof Error ? error.message : String(error),
            }),
        });

        copiedFiles.push(basename(file));
      }
    }

    return copiedFiles;
  });

/**
 * Run post-create hooks in a worktree
 */
const runHooks = (
  worktreePath: string,
  hooks: string[]
): Effect.Effect<void, HookExecutionError> =>
  Effect.gen(function* () {
    for (const hook of hooks) {
      const result = yield* execCommand(hook, worktreePath);
      if (result.exitCode !== 0) {
        return yield* Effect.fail(
          new HookExecutionError({
            hook,
            stderr: result.stderr,
            exitCode: result.exitCode,
          })
        );
      }
    }
  });

/**
 * Migrate old worktree info file to new location if it exists
 */
const migrateWorktreeInfo = (worktreePath: string): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const oldPath = join(worktreePath, ".worktree-info.json");
    const newPath = getWorktreeInfoPath(worktreePath);
    const grimDir = join(worktreePath, WORKTREE_METADATA_DIR);

    // Check if old file exists
    const oldFile = Bun.file(oldPath);
    const oldExists = yield* Effect.promise(() => oldFile.exists());

    if (!oldExists) {
      return; // Nothing to migrate
    }

    // Create .grim directory
    yield* Effect.tryPromise({
      try: async () => {
        const fs = await import("fs/promises");
        await fs.mkdir(grimDir, { recursive: true });
      },
      catch: () => undefined,
    }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

    // Read old file
    const content = yield* Effect.tryPromise({
      try: () => oldFile.text(),
      catch: () => "",
    }).pipe(Effect.catchAll(() => Effect.succeed("")));

    if (!content) {
      return; // Old file is empty or unreadable
    }

    // Write to new location
    yield* Effect.tryPromise({
      try: () => Bun.write(newPath, content),
      catch: () => undefined,
    }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

    // Delete old file
    yield* Effect.tryPromise({
      try: async () => {
        const fs = await import("fs/promises");
        await fs.unlink(oldPath);
      },
      catch: () => undefined,
    }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
  });

/**
 * Write worktree metadata file to .grim/info.json
 */
const writeMetadataFile = (
  worktreePath: string,
  metadata: WorktreeMetadata
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    // Create .grim directory
    const grimDir = join(worktreePath, WORKTREE_METADATA_DIR);
    yield* Effect.tryPromise({
      try: async () => {
        const fs = await import("fs/promises");
        await fs.mkdir(grimDir, { recursive: true });
      },
      catch: () => undefined,
    }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

    // Write metadata file
    const metadataPath = getWorktreeInfoPath(worktreePath);
    yield* Effect.tryPromise({
      try: () => Bun.write(metadataPath, JSON.stringify(metadata, null, 2)),
      catch: () => undefined,
    }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
  });

// Service interface
interface WorktreeServiceImpl {
  /**
   * Create a new worktree
   */
  readonly create: (
    cwd: string,
    options: WorktreeCreateOptions
  ) => Effect.Effect<
    WorktreeInfo,
    | WorktreeError
    | WorktreeAlreadyExistsError
    | BranchNotFoundError
    | GitOperationError
    | NotInGitRepoError
    | HookExecutionError
    | FileCopyError
  >;

  /**
   * List all worktrees with status
   */
  readonly list: (
    cwd: string
  ) => Effect.Effect<WorktreeListItem[], NotInGitRepoError>;

  /**
   * Remove a worktree
   */
  readonly remove: (
    cwd: string,
    name: string,
    options?: WorktreeRemoveOptions
  ) => Effect.Effect<
    void,
    | WorktreeNotFoundError
    | WorktreeDirtyError
    | GitOperationError
    | NotInGitRepoError
    | ProtectedBranchError
  >;

  /**
   * Get a worktree by name
   */
  readonly get: (
    cwd: string,
    name: string
  ) => Effect.Effect<WorktreeInfo, WorktreeNotFoundError | NotInGitRepoError>;

  /**
   * Get absolute path to a worktree
   */
  readonly getPath: (
    cwd: string,
    name: string
  ) => Effect.Effect<string, WorktreeNotFoundError | NotInGitRepoError>;

  /**
   * Find worktree by branch name
   */
  readonly findByBranch: (
    cwd: string,
    branch: string
  ) => Effect.Effect<WorktreeInfo | null, NotInGitRepoError>;

  /**
   * Check if running inside a worktree
   */
  readonly isInWorktree: (
    cwd: string
  ) => Effect.Effect<boolean, never>;

  /**
   * Get worktree context if running inside one
   */
  readonly getWorktreeContext: (
    cwd: string
  ) => Effect.Effect<WorktreeMetadata | null, never>;
}

// Service tag
export class WorktreeService extends Context.Tag("WorktreeService")<
  WorktreeService,
  WorktreeServiceImpl
>() {}

// Service implementation
const makeWorktreeService = (): WorktreeServiceImpl => {
  const stateService = WorktreeStateService.pipe(
    Effect.map((svc) => svc),
    Effect.provideService(WorktreeStateService, {
      getState: (repoRoot, basePath) =>
        Effect.gen(function* () {
          const file = Bun.file(join(repoRoot, basePath || ".worktrees", ".state.json"));
          const exists = yield* Effect.promise(() => file.exists());
          if (!exists) return { version: 1, worktrees: [] };
          const content = yield* Effect.promise(() => file.text());
          return JSON.parse(content);
        }).pipe(Effect.catchAll(() => Effect.succeed({ version: 1, worktrees: [] }))),
      getWorktree: () => Effect.succeed(null),
      getWorktreeByBranch: () => Effect.succeed(null),
      addWorktree: (repoRoot, entry, basePath = ".worktrees") =>
        Effect.gen(function* () {
          const statePath = join(repoRoot, basePath, ".state.json");
          const file = Bun.file(statePath);
          const exists = yield* Effect.promise(() => file.exists());
          const state = exists
            ? JSON.parse(yield* Effect.promise(() => file.text()))
            : { version: 1, worktrees: [] };
          state.worktrees.push(entry);
          yield* Effect.promise(() =>
            import("fs/promises").then((fs) => fs.mkdir(join(repoRoot, basePath), { recursive: true }))
          );
          yield* Effect.promise(() => Bun.write(statePath, JSON.stringify(state, null, 2)));
        }).pipe(Effect.catchAll(() => Effect.succeed(undefined))),
      removeWorktree: (repoRoot, name, basePath = ".worktrees") =>
        Effect.gen(function* () {
          const statePath = join(repoRoot, basePath, ".state.json");
          const file = Bun.file(statePath);
          const exists = yield* Effect.promise(() => file.exists());
          if (!exists) return;
          const state = JSON.parse(yield* Effect.promise(() => file.text()));
          state.worktrees = state.worktrees.filter((w: { name: string }) => w.name !== name);
          yield* Effect.promise(() => Bun.write(statePath, JSON.stringify(state, null, 2)));
        }).pipe(Effect.catchAll(() => Effect.succeed(undefined))),
      updateWorktree: () => Effect.succeed(undefined),
      listWorktrees: (repoRoot, basePath = ".worktrees") =>
        Effect.gen(function* () {
          const statePath = join(repoRoot, basePath, ".state.json");
          const file = Bun.file(statePath);
          const exists = yield* Effect.promise(() => file.exists());
          if (!exists) return [];
          const state = JSON.parse(yield* Effect.promise(() => file.text()));
          return state.worktrees || [];
        }).pipe(Effect.catchAll(() => Effect.succeed([]))),
      hasState: (repoRoot, basePath = ".worktrees") =>
        Effect.promise(() => Bun.file(join(repoRoot, basePath, ".state.json")).exists()),
      addChildWorktree: () => Effect.succeed(undefined),
      getWorktreeBySessionId: () => Effect.succeed(null),
    })
  );

  const configService = WorktreeConfigService.pipe(
    Effect.map((svc) => svc),
    Effect.provideService(WorktreeConfigService, {
      getConfig: () => Effect.succeed({
        config: {
          basePath: ".worktrees",
          copyPatterns: [".env*", ".envrc", ".tool-versions", ".nvmrc", ".node-version"],
          postCreateHooks: [],
          copyDependencies: false,
          issuePrefix: "",
        },
        source: "default" as const,
      }),
      getConfigValues: () => Effect.succeed({
        basePath: ".worktrees",
        copyPatterns: [".env*", ".envrc", ".tool-versions", ".nvmrc", ".node-version"],
        postCreateHooks: [],
        copyDependencies: false,
        issuePrefix: "",
      }),
      getBasePath: () => Effect.succeed(".worktrees"),
      setProjectConfig: () => Effect.succeed(undefined),
      setUserConfig: () => Effect.succeed(undefined),
      resetProjectConfig: () => Effect.succeed(undefined),
      addCopyPattern: () => Effect.succeed(undefined),
      removeCopyPattern: () => Effect.succeed(undefined),
      addPostCreateHook: () => Effect.succeed(undefined),
      removePostCreateHook: () => Effect.succeed(undefined),
    })
  );

  const getConfig = (repoRoot: string): Effect.Effect<WorktreeConfigData, never> =>
    Effect.succeed({
      basePath: ".worktrees",
      copyPatterns: [".env*", ".envrc", ".tool-versions", ".nvmrc", ".node-version"],
      postCreateHooks: [],
      copyDependencies: false,
      issuePrefix: "",
    });

  return {
    create: (cwd: string, options: WorktreeCreateOptions) =>
      Effect.gen(function* () {
        const repoRoot = yield* getGitRoot(cwd);
        const config = yield* getConfig(repoRoot);

        // Sanitize branch name for directory name
        const name = options.name || sanitizeBranchName(options.branch);
        const worktreePath = join(repoRoot, config.basePath, name);

        // Check if branch exists
        const exists = yield* branchExists(repoRoot, options.branch);
        if (!exists) {
          if (options.createBranch) {
            yield* createBranch(repoRoot, options.branch);
          } else {
            return yield* Effect.fail(new BranchNotFoundError({ branch: options.branch }));
          }
        }

        // Check if worktree already exists
        const stateEntry = yield* Effect.tryPromise({
          try: async () => {
            const statePath = join(repoRoot, config.basePath, ".state.json");
            const file = Bun.file(statePath);
            if (!(await file.exists())) return null;
            const state = JSON.parse(await file.text());
            return state.worktrees?.find((w: { name: string }) => w.name === name) || null;
          },
          catch: () => null,
        }).pipe(Effect.catchAll(() => Effect.succeed(null)));

        if (stateEntry) {
          return yield* Effect.fail(
            new WorktreeAlreadyExistsError({ name, branch: options.branch })
          );
        }

        // Create the worktree
        const addResult = yield* execCommand(
          `git worktree add "${worktreePath}" "${options.branch}"`,
          repoRoot
        );
        if (addResult.exitCode !== 0) {
          return yield* Effect.fail(
            new GitOperationError({
              command: `git worktree add "${worktreePath}" "${options.branch}"`,
              stderr: addResult.stderr,
              exitCode: addResult.exitCode,
            })
          );
        }

        // Copy config files
        let copiedFiles: string[] = [];
        if (!options.skipCopy) {
          copiedFiles = yield* copyFiles(repoRoot, worktreePath, config.copyPatterns);
        }

        // Run post-create hooks
        if (!options.skipHooks && config.postCreateHooks.length > 0) {
          yield* runHooks(worktreePath, config.postCreateHooks);
        }

        const now = new Date().toISOString();

        // Write metadata file
        const metadata: WorktreeMetadata = {
          name,
          branch: options.branch,
          linkedIssue: options.linkedIssue,
          createdAt: now,
          createdBy: options.createdBy,
          sessionId: options.sessionId,
          parentRepo: repoRoot,
        };
        yield* writeMetadataFile(worktreePath, metadata);

        // Update state
        yield* Effect.tryPromise({
          try: async () => {
            const statePath = join(repoRoot, config.basePath, ".state.json");
            await import("fs/promises").then((fs) =>
              fs.mkdir(join(repoRoot, config.basePath), { recursive: true })
            );
            const file = Bun.file(statePath);
            const state = (await file.exists())
              ? JSON.parse(await file.text())
              : { version: 1, worktrees: [] };
            state.worktrees.push({
              name,
              branch: options.branch,
              linkedIssue: options.linkedIssue,
              createdAt: now,
              metadata: options.createdBy ? { createdBy: options.createdBy, sessionId: options.sessionId } : undefined,
            });
            await Bun.write(statePath, JSON.stringify(state, null, 2));
          },
          catch: () => undefined,
        }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

        return {
          name,
          branch: options.branch,
          path: worktreePath,
          createdAt: now,
          linkedIssue: options.linkedIssue,
          metadata: options.createdBy
            ? { createdBy: options.createdBy, sessionId: options.sessionId }
            : undefined,
        };
      }),

    list: (cwd: string) =>
      Effect.gen(function* () {
        const repoRoot = yield* getMainRepoRoot(cwd);
        const config = yield* getConfig(repoRoot);

        // Get worktrees from git
        const result = yield* execCommand("git worktree list --porcelain", repoRoot);
        if (result.exitCode !== 0) {
          return [];
        }

        // Parse git worktree list output - collect all matches first
        const basePath = join(repoRoot, config.basePath);
        const gitWorktrees: { path: string; branch: string }[] = [];
        const lines = result.stdout.split("\n");
        let current: Partial<{ path: string; branch: string }> = {};

        for (const line of lines) {
          if (line.startsWith("worktree ")) {
            current.path = line.substring(9);
          } else if (line.startsWith("branch refs/heads/")) {
            current.branch = line.substring(18);
          } else if (line === "") {
            if (current.path && current.branch) {
              if (current.path.startsWith(basePath)) {
                gitWorktrees.push({ path: current.path, branch: current.branch });
              }
            }
            current = {};
          }
        }

        // Handle the last entry (trim() removes trailing newline, so last entry may not hit blank line)
        if (current.path && current.branch && current.path.startsWith(basePath)) {
          gitWorktrees.push({ path: current.path, branch: current.branch });
        }

        // Now process each worktree (yield* outside the loop body)
        const entries: WorktreeListItem[] = [];
        for (const wt of gitWorktrees) {
          const name = basename(wt.path);
          const uncommittedChanges = yield* getUncommittedChanges(wt.path);
          const unpushedCommits = yield* getUnpushedCommits(wt.path);
          const merged = yield* isBranchMerged(repoRoot, wt.branch);

          // Get state info
          const stateEntry = yield* Effect.tryPromise({
            try: async () => {
              const statePath = join(repoRoot, config.basePath, ".state.json");
              const file = Bun.file(statePath);
              if (!(await file.exists())) return null;
              const state = JSON.parse(await file.text());
              return state.worktrees?.find((w: { name: string }) => w.name === name) || null;
            },
            catch: () => null,
          }).pipe(Effect.catchAll(() => Effect.succeed(null)));

          entries.push({
            name,
            branch: wt.branch,
            path: wt.path,
            createdAt: stateEntry?.createdAt || new Date().toISOString(),
            linkedIssue: stateEntry?.linkedIssue,
            status: merged ? "stale" : "active",
            uncommittedChanges: uncommittedChanges > 0 ? uncommittedChanges : undefined,
            unpushedCommits: unpushedCommits > 0 ? unpushedCommits : undefined,
            metadata: stateEntry?.metadata,
          });
        }

        return entries;
      }),

    remove: (cwd: string, name: string, options?: WorktreeRemoveOptions) =>
      Effect.gen(function* () {
        const repoRoot = yield* getGitRoot(cwd);
        const config = yield* getConfig(repoRoot);
        const worktreePath = join(repoRoot, config.basePath, name);

        // Check worktree exists
        const dirExists = yield* Effect.promise(() => Bun.file(join(worktreePath, ".git")).exists());
        if (!dirExists) {
          return yield* Effect.fail(new WorktreeNotFoundError({ name }));
        }

        // Check for uncommitted changes
        if (!options?.force) {
          const uncommitted = yield* getUncommittedChanges(worktreePath);
          if (uncommitted > 0) {
            return yield* Effect.fail(
              new WorktreeDirtyError({ name, uncommittedChanges: uncommitted })
            );
          }
        }

        // Get branch name before removing
        const branchResult = yield* execCommand("git rev-parse --abbrev-ref HEAD", worktreePath);
        const branch = branchResult.stdout;

        // Remove the worktree
        const removeResult = yield* execCommand(
          `git worktree remove "${worktreePath}"${options?.force ? " --force" : ""}`,
          repoRoot
        );
        if (removeResult.exitCode !== 0) {
          return yield* Effect.fail(
            new GitOperationError({
              command: `git worktree remove "${worktreePath}"`,
              stderr: removeResult.stderr,
              exitCode: removeResult.exitCode,
            })
          );
        }

        // Optionally delete the branch
        if (options?.deleteBranch && branch) {
          if (isProtectedBranch(branch)) {
            return yield* Effect.fail(new ProtectedBranchError({ branch }));
          }
          yield* execCommand(`git branch -d "${branch}"`, repoRoot);
        }

        // Update state
        yield* Effect.tryPromise({
          try: async () => {
            const statePath = join(repoRoot, config.basePath, ".state.json");
            const file = Bun.file(statePath);
            if (!(await file.exists())) return;
            const state = JSON.parse(await file.text());
            state.worktrees = state.worktrees.filter((w: { name: string }) => w.name !== name);
            await Bun.write(statePath, JSON.stringify(state, null, 2));
          },
          catch: () => undefined,
        }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
      }),

    get: (cwd: string, name: string) =>
      Effect.gen(function* () {
        const repoRoot = yield* getGitRoot(cwd);
        const config = yield* getConfig(repoRoot);
        const worktreePath = join(repoRoot, config.basePath, name);

        // Check if worktree exists
        const gitFile = Bun.file(join(worktreePath, ".git"));
        const exists = yield* Effect.promise(() => gitFile.exists());
        if (!exists) {
          return yield* Effect.fail(new WorktreeNotFoundError({ name }));
        }

        // Get branch
        const branchResult = yield* execCommand("git rev-parse --abbrev-ref HEAD", worktreePath);
        const branch = branchResult.stdout || name;

        // Get state entry
        const stateEntry = yield* Effect.tryPromise({
          try: async () => {
            const statePath = join(repoRoot, config.basePath, ".state.json");
            const file = Bun.file(statePath);
            if (!(await file.exists())) return null;
            const state = JSON.parse(await file.text());
            return state.worktrees?.find((w: { name: string }) => w.name === name) || null;
          },
          catch: () => null,
        }).pipe(Effect.catchAll(() => Effect.succeed(null)));

        return {
          name,
          branch,
          path: worktreePath,
          createdAt: stateEntry?.createdAt || new Date().toISOString(),
          linkedIssue: stateEntry?.linkedIssue,
          metadata: stateEntry?.metadata,
        };
      }),

    getPath: (cwd: string, name: string) =>
      Effect.gen(function* () {
        const repoRoot = yield* getGitRoot(cwd);
        const config = yield* getConfig(repoRoot);
        const worktreePath = join(repoRoot, config.basePath, name);

        // Check if worktree exists
        const gitFile = Bun.file(join(worktreePath, ".git"));
        const exists = yield* Effect.promise(() => gitFile.exists());
        if (!exists) {
          return yield* Effect.fail(new WorktreeNotFoundError({ name }));
        }

        return worktreePath;
      }),

    findByBranch: (cwd: string, branch: string) =>
      Effect.gen(function* () {
        const repoRoot = yield* getGitRoot(cwd);
        const config = yield* getConfig(repoRoot);

        // Get state
        const stateEntry = yield* Effect.tryPromise({
          try: async () => {
            const statePath = join(repoRoot, config.basePath, ".state.json");
            const file = Bun.file(statePath);
            if (!(await file.exists())) return null;
            const state = JSON.parse(await file.text());
            return state.worktrees?.find((w: { branch: string }) => w.branch === branch) || null;
          },
          catch: () => null,
        }).pipe(Effect.catchAll(() => Effect.succeed(null)));

        if (!stateEntry) {
          return null;
        }

        const worktreePath = join(repoRoot, config.basePath, stateEntry.name);
        return {
          name: stateEntry.name,
          branch: stateEntry.branch,
          path: worktreePath,
          createdAt: stateEntry.createdAt,
          linkedIssue: stateEntry.linkedIssue,
          metadata: stateEntry.metadata,
        };
      }),

    isInWorktree: (cwd: string) =>
      Effect.succeed(cwd.includes("/.worktrees/")),

    getWorktreeContext: (cwd: string) =>
      Effect.gen(function* () {
        if (!cwd.includes("/.worktrees/")) {
          return null;
        }

        // Auto-migrate old metadata file if it exists
        yield* migrateWorktreeInfo(cwd);

        // Try to read .grim/info.json
        const metadataPath = getWorktreeInfoPath(cwd);
        const result = yield* Effect.tryPromise({
          try: async () => {
            const file = Bun.file(metadataPath);
            if (!(await file.exists())) return null;
            return JSON.parse(await file.text()) as WorktreeMetadata;
          },
          catch: () => null,
        }).pipe(Effect.catchAll(() => Effect.succeed(null)));

        return result;
      }),
  };
};

// Live layer
export const WorktreeServiceLive = Layer.succeed(
  WorktreeService,
  makeWorktreeService()
);

// Export utility for getting main repo root (needed by commands)
export { getMainRepoRoot };
