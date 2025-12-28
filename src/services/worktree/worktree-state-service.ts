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

// Mutable internal types for state manipulation (v2 schema)
interface MutableWorktreeLog {
  time: string;
  message: string;
  author?: string;
  type?: "log" | "handoff" | "interrupt";
  metadata?: {
    nextStage?: string;
    reason?: string;
  };
}

interface MutableWorktreeCheckpoint {
  hash: string;
  message: string;
  time: string;
  author?: string;
}

interface MutableStageTransition {
  from: string;
  to: string;
  time: string;
  agent?: string;
}

interface MutableWorktreeEntry {
  // Core fields
  name: string;
  branch: string;
  createdAt: string;
  linkedIssue?: string;
  metadata?: {
    createdBy?: "user" | "agent";
    sessionId?: string;
  };
  // Issue provider
  issueProvider?: "beads" | "github" | "linear" | "jira" | "none";
  // Progress tracking
  logs?: MutableWorktreeLog[];
  checkpoints?: MutableWorktreeCheckpoint[];
  // Session management / Coordination
  claimedBy?: string;
  claimedAt?: string;
  claimExpiresAt?: string;
  // Experiment tracking
  parentWorktree?: string;
  isExperiment?: boolean;
  // Pipeline stages
  currentStage?: "plan" | "implement" | "test" | "review";
  stageHistory?: MutableStageTransition[];
  // Swarm coordination - parent/child tracking
  parentSession?: string;
  childWorktrees?: string[];
  spawnedAt?: string;
  completedAt?: string;
  mergeStatus?: "pending" | "ready" | "merged" | "conflict" | "abandoned";
}

interface MutableWorktreeState {
  version: 2;
  worktrees: MutableWorktreeEntry[];
}

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
      // Return v2 structure
      return {
        version: 2 as const,
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
      return { version: 2 as const, worktrees: [] as MutableWorktreeEntry[] };
    }

    const content = yield* Effect.promise(() => file.text());
    return yield* parseStateFile(content);
  }).pipe(
    Effect.catchAll(() => {
      // On any error, return default state
      return Effect.succeed({ version: 2 as const, worktrees: [] as MutableWorktreeEntry[] });
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
    updates: Partial<Pick<MutableWorktreeEntry,
      | "linkedIssue"
      | "metadata"
      | "issueProvider"
      | "logs"
      | "checkpoints"
      | "claimedBy"
      | "claimedAt"
      | "claimExpiresAt"
      | "parentWorktree"
      | "isExperiment"
      | "currentStage"
      | "stageHistory"
      // Swarm coordination
      | "parentSession"
      | "childWorktrees"
      | "spawnedAt"
      | "completedAt"
      | "mergeStatus"
    >>,
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

  /**
   * Add a child worktree reference to a parent worktree
   */
  readonly addChildWorktree: (
    repoRoot: string,
    parentName: string,
    childName: string,
    basePath?: string
  ) => Effect.Effect<void, WorktreeStateReadError | WorktreeStateWriteError>;

  /**
   * Find a worktree by its session ID
   */
  readonly getWorktreeBySessionId: (
    repoRoot: string,
    sessionId: string,
    basePath?: string
  ) => Effect.Effect<MutableWorktreeEntry | null, WorktreeStateReadError>;
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
    updates: Partial<Pick<MutableWorktreeEntry,
      | "linkedIssue"
      | "metadata"
      | "issueProvider"
      | "logs"
      | "checkpoints"
      | "claimedBy"
      | "claimedAt"
      | "claimExpiresAt"
      | "parentWorktree"
      | "isExperiment"
      | "currentStage"
      | "stageHistory"
      // Swarm coordination
      | "parentSession"
      | "childWorktrees"
      | "spawnedAt"
      | "completedAt"
      | "mergeStatus"
    >>,
    basePath = DEFAULT_BASE_PATH
  ) =>
    Effect.gen(function* () {
      const state = yield* readStateFile(repoRoot, basePath);

      const worktree = state.worktrees.find((w) => w.name === name);
      if (!worktree) {
        return; // Not found, no-op
      }

      // Apply updates - core fields
      if (updates.linkedIssue !== undefined) {
        worktree.linkedIssue = updates.linkedIssue;
      }
      if (updates.metadata !== undefined) {
        worktree.metadata = { ...worktree.metadata, ...updates.metadata };
      }
      if (updates.issueProvider !== undefined) {
        worktree.issueProvider = updates.issueProvider;
      }

      // Progress tracking
      if (updates.logs !== undefined) {
        worktree.logs = updates.logs;
      }
      if (updates.checkpoints !== undefined) {
        worktree.checkpoints = updates.checkpoints;
      }

      // Session management / Coordination
      if (updates.claimedBy !== undefined) {
        worktree.claimedBy = updates.claimedBy;
      }
      if (updates.claimedAt !== undefined) {
        worktree.claimedAt = updates.claimedAt;
      }
      if (updates.claimExpiresAt !== undefined) {
        worktree.claimExpiresAt = updates.claimExpiresAt;
      }

      // Experiment tracking
      if (updates.parentWorktree !== undefined) {
        worktree.parentWorktree = updates.parentWorktree;
      }
      if (updates.isExperiment !== undefined) {
        worktree.isExperiment = updates.isExperiment;
      }

      // Pipeline stages
      if (updates.currentStage !== undefined) {
        worktree.currentStage = updates.currentStage;
      }
      if (updates.stageHistory !== undefined) {
        worktree.stageHistory = updates.stageHistory;
      }

      // Swarm coordination - parent/child tracking
      if (updates.parentSession !== undefined) {
        worktree.parentSession = updates.parentSession;
      }
      if (updates.childWorktrees !== undefined) {
        worktree.childWorktrees = updates.childWorktrees;
      }
      if (updates.spawnedAt !== undefined) {
        worktree.spawnedAt = updates.spawnedAt;
      }
      if (updates.completedAt !== undefined) {
        worktree.completedAt = updates.completedAt;
      }
      if (updates.mergeStatus !== undefined) {
        worktree.mergeStatus = updates.mergeStatus;
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

  addChildWorktree: (
    repoRoot: string,
    parentName: string,
    childName: string,
    basePath = DEFAULT_BASE_PATH
  ) =>
    Effect.gen(function* () {
      const state = yield* readStateFile(repoRoot, basePath);

      const parent = state.worktrees.find((w) => w.name === parentName);
      if (!parent) {
        return; // Parent not found, no-op
      }

      // Initialize childWorktrees if not exists
      if (!parent.childWorktrees) {
        parent.childWorktrees = [];
      }

      // Add child if not already present
      if (!parent.childWorktrees.includes(childName)) {
        parent.childWorktrees.push(childName);
        yield* writeStateFile(repoRoot, basePath, state);
      }
    }),

  getWorktreeBySessionId: (repoRoot: string, sessionId: string, basePath = DEFAULT_BASE_PATH) =>
    Effect.gen(function* () {
      const state = yield* readStateFile(repoRoot, basePath);
      return state.worktrees.find((w) => w.metadata?.sessionId === sessionId) || null;
    }),
});

// Live layer
export const WorktreeStateServiceLive = Layer.succeed(
  WorktreeStateService,
  makeWorktreeStateService()
);
