/**
 * Worktree Domain Types
 *
 * Defines schemas and types for git worktree management.
 * Worktrees enable isolated parallel development environments.
 */

import { Schema } from "@effect/schema";

/**
 * Worktree configuration schema
 *
 * Defines how worktrees behave - where they're stored, what to copy, etc.
 */
export const WorktreeConfigSchema = Schema.Struct({
  /** Where to store worktrees relative to repo root (default: ".worktrees") */
  basePath: Schema.optional(Schema.String.pipe(Schema.minLength(1))),

  /** Glob patterns for files to copy to new worktrees */
  copyPatterns: Schema.optional(Schema.Array(Schema.String)),

  /** Commands to run after creating a worktree */
  postCreateHooks: Schema.optional(Schema.Array(Schema.String)),

  /** Whether to copy node_modules/vendor (large dirs) - generally not recommended */
  copyDependencies: Schema.optional(Schema.Boolean),

  /** Default issue prefix for branch-to-issue detection (e.g., "GRIM-" or "grimoire-") */
  issuePrefix: Schema.optional(Schema.String),
});

/**
 * Worktree metadata stored in .worktree-info.json within each worktree
 */
export const WorktreeMetadataSchema = Schema.Struct({
  /** Directory name in .worktrees/ */
  name: Schema.String.pipe(Schema.minLength(1)),

  /** Git branch name */
  branch: Schema.String.pipe(Schema.minLength(1)),

  /** Beads issue ID if linked */
  linkedIssue: Schema.optional(Schema.String),

  /** When the worktree was created */
  createdAt: Schema.String,

  /** Who/what created it */
  createdBy: Schema.optional(Schema.Literal("user", "agent")),

  /** Session ID for agent tracking */
  sessionId: Schema.optional(Schema.String),

  /** Parent repository path */
  parentRepo: Schema.String,
});

/**
 * Full worktree info including runtime path
 */
export const WorktreeInfoSchema = Schema.Struct({
  /** Directory name in .worktrees/ */
  name: Schema.String.pipe(Schema.minLength(1)),

  /** Git branch name */
  branch: Schema.String.pipe(Schema.minLength(1)),

  /** Absolute path to worktree */
  path: Schema.String.pipe(Schema.minLength(1)),

  /** When the worktree was created */
  createdAt: Schema.String,

  /** Beads issue ID if linked */
  linkedIssue: Schema.optional(Schema.String),

  /** Additional metadata */
  metadata: Schema.optional(
    Schema.Struct({
      /** Who/what created it */
      createdBy: Schema.optional(Schema.Literal("user", "agent")),
      /** Session ID for agent tracking */
      sessionId: Schema.optional(Schema.String),
    })
  ),
});

/**
 * Worktree status for list display
 */
export const WorktreeStatusSchema = Schema.Literal(
  "active",    // Branch exists and not merged
  "stale",     // Branch has been merged to main/master
  "orphaned"   // Git worktree exists but not in state file
);

/**
 * Extended worktree info with runtime status
 */
export const WorktreeListItemSchema = Schema.extend(
  WorktreeInfoSchema,
  Schema.Struct({
    status: WorktreeStatusSchema,
    /** Number of uncommitted changes (from git status) */
    uncommittedChanges: Schema.optional(Schema.Number),
  })
);

/**
 * Worktree state stored in .worktrees/.state.json
 */
export const WorktreeStateSchema = Schema.Struct({
  /** Schema version for migrations */
  version: Schema.Number.pipe(Schema.int()),

  /** List of managed worktrees */
  worktrees: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      branch: Schema.String,
      linkedIssue: Schema.optional(Schema.String),
      createdAt: Schema.String,
      metadata: Schema.optional(
        Schema.Struct({
          createdBy: Schema.optional(Schema.Literal("user", "agent")),
          sessionId: Schema.optional(Schema.String),
        })
      ),
    })
  ),
});

// Type exports

/**
 * Worktree configuration
 */
export type WorktreeConfig = Schema.Schema.Type<typeof WorktreeConfigSchema>;

/**
 * Worktree metadata (stored in each worktree)
 */
export type WorktreeMetadata = Schema.Schema.Type<typeof WorktreeMetadataSchema>;

/**
 * Full worktree info
 */
export type WorktreeInfo = Schema.Schema.Type<typeof WorktreeInfoSchema>;

/**
 * Worktree status
 */
export type WorktreeStatus = Schema.Schema.Type<typeof WorktreeStatusSchema>;

/**
 * Worktree list item with status
 */
export type WorktreeListItem = Schema.Schema.Type<typeof WorktreeListItemSchema>;

/**
 * Worktree state
 */
export type WorktreeState = Schema.Schema.Type<typeof WorktreeStateSchema>;

// Default configuration values

/**
 * Default worktree configuration
 */
export const DEFAULT_WORKTREE_CONFIG: Required<WorktreeConfig> = {
  basePath: ".worktrees",
  copyPatterns: [".env*", ".envrc", ".tool-versions", ".nvmrc", ".node-version"],
  postCreateHooks: [],
  copyDependencies: false,
  issuePrefix: "",
};

/**
 * Default empty worktree state
 */
export const DEFAULT_WORKTREE_STATE: WorktreeState = {
  version: 1,
  worktrees: [],
};

/**
 * Protected branches that cannot be deleted
 */
export const PROTECTED_BRANCHES = ["main", "master"] as const;

/**
 * Worktree create options
 */
export interface WorktreeCreateOptions {
  /** Branch name to create worktree from */
  branch: string;
  /** Custom directory name (defaults to sanitized branch name) */
  name?: string;
  /** Link to a beads issue */
  linkedIssue?: string;
  /** Skip copying config files */
  skipCopy?: boolean;
  /** Skip running post-create hooks */
  skipHooks?: boolean;
  /** Create new branch if it doesn't exist */
  createBranch?: boolean;
  /** Who/what is creating this */
  createdBy?: "user" | "agent";
  /** Session ID for agent tracking */
  sessionId?: string;
}

/**
 * Worktree remove options
 */
export interface WorktreeRemoveOptions {
  /** Also delete the git branch */
  deleteBranch?: boolean;
  /** Force removal even with uncommitted changes */
  force?: boolean;
}

/**
 * Sanitize a branch name for use as a directory name
 * Handles slashes and special characters
 */
export function sanitizeBranchName(branch: string): string {
  return branch
    .replace(/\//g, "-")     // Replace slashes with dashes
    .replace(/[^a-zA-Z0-9-_.]/g, "") // Remove other special chars
    .replace(/^-+|-+$/g, ""); // Trim leading/trailing dashes
}

/**
 * Check if a branch name is protected
 */
export function isProtectedBranch(branch: string): boolean {
  return PROTECTED_BRANCHES.includes(branch as typeof PROTECTED_BRANCHES[number]);
}
