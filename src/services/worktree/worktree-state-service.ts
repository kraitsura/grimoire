/**
 * Worktree State Service
 *
 * Manages persistent state for worktrees stored in .worktrees/.state.json.
 * Tracks which worktrees exist, their branches, and linked issues.
 */

import { Context, Effect, Layer } from "effect";
import { join } from "path";
import type { WorktreeState } from "../../models/worktree";
import { DEFAULT_WORKTREE_STATE } from "../../models/worktree";
import {
  WorktreeStateReadError,
  WorktreeStateWriteError,
} from "../../models/worktree-errors";

// Mutable internal types for state manipulation
type MutableWorktreeEntry = {
  name: string;
  branch: string;
  linkedIssue?: string;
  createdAt: string;
  metadata?: {
    createdBy?: "user" | "agent";
    sessionId?: string;
  };
};

type MutableWorktreeState = {
  version: number;
  worktrees: MutableWorktreeEntry[];
};

/**
 * Get the state file path for a repository
 */
const getStateFilePath = (repoRoot: string, basePath: string): string => {
  return join(repoRoot, basePath, ".state.json");
};

/**
 * Parse JSON state file content
 */
const parseStateFile = (
  content: string
): Effect.Effect<MutableWorktreeState, WorktreeStateReadError> =>
  Effect.try({
    try: () => {
      const parsed = JSON.parse(content) as MutableWorktreeState;
      // Ensure we have required structure
      return {
        version: parsed.version || 1,
        worktrees: parsed.worktrees || [],
      };
    },
    catch: (error) =>
      new WorktreeStateReadError({
        message: `Failed to parse state file: ${error instanceof Error ? error.message : String(error)}`,
      }),
  });

/**
 * Read the state file for a repository
 */
const readStateFile = (
  repoRoot: string,
  basePath: string
): Effect.Effect<MutableWorktreeState, WorktreeStateReadError> =>
  Effect.gen(function* () {
    const statePath = getStateFilePath(repoRoot, basePath);
    const file = Bun.file(statePath);

    const exists = yield* Effect.promise(() => file.exists());
    if (!exists) {
      // Return default state if file doesn't exist
      return { ...DEFAULT_WORKTREE_STATE, worktrees: [] };
    }

    const content = yield* Effect.promise(() => file.text());
    return yield* parseStateFile(content);
  }).pipe(
    Effect.catchAll(() => {
      // On any error, return default state
      return Effect.succeed({ ...DEFAULT_WORKTREE_STATE, worktrees: [] });
    })
  );

/**
 * Write the state file atomically
 */
const writeStateFile = (
  repoRoot: string,
  basePath: string,
  state: MutableWorktreeState
): Effect.Effect<void, WorktreeStateWriteError> =>
  Effect.gen(function* () {
    const statePath = getStateFilePath(repoRoot, basePath);
    const stateDir = join(repoRoot, basePath);
    const tempPath = `${statePath}.tmp`;

    try {
      // Ensure directory exists
      yield* Effect.promise(() =>
        import("fs/promises").then((fs) => fs.mkdir(stateDir, { recursive: true }))
      );

      // Serialize state to JSON
      const content = JSON.stringify(state, null, 2);

      // Write to temp file
      yield* Effect.promise(() => Bun.write(tempPath, content));

      // Atomic rename
      yield* Effect.promise(() =>
        import("fs/promises").then((fs) => fs.rename(tempPath, statePath))
      );
    } catch (error) {
      return yield* Effect.fail(
        new WorktreeStateWriteError({
          message: `Failed to write state file: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
  });

// Service interface
interface WorktreeStateServiceImpl {
  /**
   * Get the full worktree state
   */
  readonly getState: (
    repoRoot: string,
    basePath?: string
  ) => Effect.Effect<WorktreeState, WorktreeStateReadError>;

  /**
   * Get a worktree entry by name
   */
  readonly getWorktree: (
    repoRoot: string,
    name: string,
    basePath?: string
  ) => Effect.Effect<MutableWorktreeEntry | null, WorktreeStateReadError>;

  /**
   * Get a worktree entry by branch name
   */
  readonly getWorktreeByBranch: (
    repoRoot: string,
    branch: string,
    basePath?: string
  ) => Effect.Effect<MutableWorktreeEntry | null, WorktreeStateReadError>;

  /**
   * Add a worktree to state
   */
  readonly addWorktree: (
    repoRoot: string,
    entry: MutableWorktreeEntry,
    basePath?: string
  ) => Effect.Effect<void, WorktreeStateReadError | WorktreeStateWriteError>;

  /**
   * Remove a worktree from state
   */
  readonly removeWorktree: (
    repoRoot: string,
    name: string,
    basePath?: string
  ) => Effect.Effect<void, WorktreeStateReadError | WorktreeStateWriteError>;

  /**
   * Update a worktree entry
   */
  readonly updateWorktree: (
    repoRoot: string,
    name: string,
    updates: Partial<Pick<MutableWorktreeEntry, "linkedIssue" | "metadata">>,
    basePath?: string
  ) => Effect.Effect<void, WorktreeStateReadError | WorktreeStateWriteError>;

  /**
   * List all worktree entries
   */
  readonly listWorktrees: (
    repoRoot: string,
    basePath?: string
  ) => Effect.Effect<MutableWorktreeEntry[], WorktreeStateReadError>;

  /**
   * Check if state file exists
   */
  readonly hasState: (
    repoRoot: string,
    basePath?: string
  ) => Effect.Effect<boolean, never>;
}

// Service tag
export class WorktreeStateService extends Context.Tag("WorktreeStateService")<
  WorktreeStateService,
  WorktreeStateServiceImpl
>() {}

// Default base path
const DEFAULT_BASE_PATH = ".worktrees";

// Service implementation
const makeWorktreeStateService = (): WorktreeStateServiceImpl => ({
  getState: (repoRoot: string, basePath = DEFAULT_BASE_PATH) =>
    readStateFile(repoRoot, basePath),

  getWorktree: (repoRoot: string, name: string, basePath = DEFAULT_BASE_PATH) =>
    Effect.gen(function* () {
      const state = yield* readStateFile(repoRoot, basePath);
      return state.worktrees.find((w) => w.name === name) || null;
    }),

  getWorktreeByBranch: (repoRoot: string, branch: string, basePath = DEFAULT_BASE_PATH) =>
    Effect.gen(function* () {
      const state = yield* readStateFile(repoRoot, basePath);
      return state.worktrees.find((w) => w.branch === branch) || null;
    }),

  addWorktree: (repoRoot: string, entry: MutableWorktreeEntry, basePath = DEFAULT_BASE_PATH) =>
    Effect.gen(function* () {
      const state = yield* readStateFile(repoRoot, basePath);

      // Check if worktree already exists
      const existing = state.worktrees.find((w) => w.name === entry.name);
      if (existing) {
        return; // Already exists, no-op
      }

      // Add new worktree entry
      state.worktrees.push(entry);
      yield* writeStateFile(repoRoot, basePath, state);
    }),

  removeWorktree: (repoRoot: string, name: string, basePath = DEFAULT_BASE_PATH) =>
    Effect.gen(function* () {
      const state = yield* readStateFile(repoRoot, basePath);

      // Filter out the worktree
      const newWorktrees = state.worktrees.filter((w) => w.name !== name);
      if (newWorktrees.length !== state.worktrees.length) {
        state.worktrees = newWorktrees;
        yield* writeStateFile(repoRoot, basePath, state);
      }
    }),

  updateWorktree: (
    repoRoot: string,
    name: string,
    updates: Partial<Pick<MutableWorktreeEntry, "linkedIssue" | "metadata">>,
    basePath = DEFAULT_BASE_PATH
  ) =>
    Effect.gen(function* () {
      const state = yield* readStateFile(repoRoot, basePath);

      const worktree = state.worktrees.find((w) => w.name === name);
      if (!worktree) {
        return; // Not found, no-op
      }

      // Apply updates
      if (updates.linkedIssue !== undefined) {
        worktree.linkedIssue = updates.linkedIssue;
      }
      if (updates.metadata !== undefined) {
        worktree.metadata = { ...worktree.metadata, ...updates.metadata };
      }

      yield* writeStateFile(repoRoot, basePath, state);
    }),

  listWorktrees: (repoRoot: string, basePath = DEFAULT_BASE_PATH) =>
    Effect.gen(function* () {
      const state = yield* readStateFile(repoRoot, basePath);
      return [...state.worktrees];
    }),

  hasState: (repoRoot: string, basePath = DEFAULT_BASE_PATH) =>
    Effect.gen(function* () {
      const statePath = getStateFilePath(repoRoot, basePath);
      const file = Bun.file(statePath);
      return yield* Effect.promise(() => file.exists());
    }),
});

// Live layer
export const WorktreeStateServiceLive = Layer.succeed(
  WorktreeStateService,
  makeWorktreeStateService()
);
