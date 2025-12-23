/**
 * Worktree Domain Error Types
 *
 * Typed error variants for worktree operations using Effect's Data.TaggedError.
 */

import { Data } from "effect";

/**
 * Generic worktree operation error
 */
export class WorktreeError extends Data.TaggedError("WorktreeError")<{
  message: string;
}> {}

/**
 * Error when a worktree is not found by name
 */
export class WorktreeNotFoundError extends Data.TaggedError("WorktreeNotFoundError")<{
  name: string;
}> {
  get message(): string {
    return `Worktree '${this.name}' not found`;
  }
}

/**
 * Error when attempting to create a worktree that already exists
 */
export class WorktreeAlreadyExistsError extends Data.TaggedError("WorktreeAlreadyExistsError")<{
  name: string;
  branch: string;
}> {
  get message(): string {
    return `Worktree '${this.name}' already exists for branch '${this.branch}'`;
  }
}

/**
 * Error when a git branch is not found
 */
export class BranchNotFoundError extends Data.TaggedError("BranchNotFoundError")<{
  branch: string;
}> {
  get message(): string {
    return `Branch '${this.branch}' not found`;
  }
}

/**
 * Error when a git operation fails
 */
export class GitOperationError extends Data.TaggedError("GitOperationError")<{
  command: string;
  stderr: string;
  exitCode: number;
}> {
  get message(): string {
    return `Git command failed (exit ${this.exitCode}): ${this.command}\n${this.stderr}`;
  }
}

/**
 * Error when worktree has uncommitted changes and force is not set
 */
export class WorktreeDirtyError extends Data.TaggedError("WorktreeDirtyError")<{
  name: string;
  uncommittedChanges: number;
}> {
  get message(): string {
    return `Worktree '${this.name}' has ${this.uncommittedChanges} uncommitted changes. Use --force to remove anyway.`;
  }
}

/**
 * Error when a post-create hook fails
 */
export class HookExecutionError extends Data.TaggedError("HookExecutionError")<{
  hook: string;
  stderr: string;
  exitCode?: number;
}> {
  get message(): string {
    return `Hook '${this.hook}' failed${this.exitCode ? ` (exit ${this.exitCode})` : ""}: ${this.stderr}`;
  }
}

/**
 * Error when worktree state file cannot be read
 */
export class WorktreeStateReadError extends Data.TaggedError("WorktreeStateReadError")<{
  message: string;
}> {}

/**
 * Error when worktree state file cannot be written
 */
export class WorktreeStateWriteError extends Data.TaggedError("WorktreeStateWriteError")<{
  message: string;
}> {}

/**
 * Error when worktree config file cannot be read
 */
export class WorktreeConfigReadError extends Data.TaggedError("WorktreeConfigReadError")<{
  message: string;
  path?: string;
}> {}

/**
 * Error when not inside a git repository
 */
export class NotInGitRepoError extends Data.TaggedError("NotInGitRepoError")<{
  path: string;
}> {
  get message(): string {
    return `Not in a git repository: ${this.path}`;
  }
}

/**
 * Error when trying to delete a protected branch (main/master)
 */
export class ProtectedBranchError extends Data.TaggedError("ProtectedBranchError")<{
  branch: string;
}> {
  get message(): string {
    return `Cannot delete protected branch '${this.branch}'`;
  }
}

/**
 * Error when file copy operation fails
 */
export class FileCopyError extends Data.TaggedError("FileCopyError")<{
  source: string;
  destination: string;
  cause?: string;
}> {
  get message(): string {
    return `Failed to copy '${this.source}' to '${this.destination}'${this.cause ? `: ${this.cause}` : ""}`;
  }
}
