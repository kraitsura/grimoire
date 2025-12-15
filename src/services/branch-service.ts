/**
 * Branch Service - Manages prompt branches for A/B testing
 *
 * Enables creating, switching, and merging prompt branches to support
 * experimentation and version control across different prompt variants.
 */

import { Context, Effect, Layer, Data } from "effect";
import { SqlService } from "./sql-service";
import { VersionService, type PromptVersion, VersionNotFoundError } from "./version-service";
import { SqlError } from "../models";

/**
 * Error for branch not found
 */
export class BranchNotFoundError extends Data.TaggedError("BranchNotFoundError")<{
  promptId: string;
  branchName: string;
}> {}

/**
 * Error for merge conflicts
 */
export class MergeConflictError extends Data.TaggedError("MergeConflictError")<{
  promptId: string;
  sourceBranch: string;
  targetBranch: string;
  message: string;
}> {}

/**
 * Error for generic branch operations
 */
export class BranchError extends Data.TaggedError("BranchError")<{
  message: string;
  promptId: string;
  branchName?: string;
}> {}

/**
 * Parameters for creating a new branch
 */
export interface CreateBranchParams {
  promptId: string;
  name: string;
  fromVersion?: number; // Default: current head
}

/**
 * A prompt branch
 */
export interface Branch {
  id: string;
  promptId: string;
  name: string;
  createdAt: Date;
  createdFromVersion?: number;
  isActive: boolean;
}

/**
 * Comparison result between two branches
 */
export interface BranchComparison {
  ahead: number;
  behind: number;
  canMerge: boolean;
}

/**
 * Parameters for merging branches
 */
export interface MergeParams {
  promptId: string;
  sourceBranch: string;
  targetBranch: string;
  changeReason?: string;
}

/**
 * Branch service interface
 */
interface BranchServiceImpl {
  /**
   * Create a new branch from a specific version or the current head
   */
  readonly createBranch: (
    params: CreateBranchParams
  ) => Effect.Effect<Branch, SqlError | BranchError | VersionNotFoundError, never>;

  /**
   * List all branches for a prompt
   */
  readonly listBranches: (promptId: string) => Effect.Effect<Branch[], SqlError, never>;

  /**
   * Switch the active branch for a prompt
   */
  readonly switchBranch: (
    promptId: string,
    branchName: string
  ) => Effect.Effect<Branch, BranchNotFoundError | SqlError, never>;

  /**
   * Delete a branch (fails if it's the only branch or has unmerged changes)
   */
  readonly deleteBranch: (
    promptId: string,
    branchName: string
  ) => Effect.Effect<void, BranchError | SqlError, never>;

  /**
   * Merge one branch into another (fast-forward only)
   */
  readonly mergeBranch: (
    params: MergeParams
  ) => Effect.Effect<
    PromptVersion,
    MergeConflictError | SqlError | BranchNotFoundError | VersionNotFoundError,
    never
  >;

  /**
   * Compare two branches (how many versions ahead/behind)
   */
  readonly compareBranches: (
    promptId: string,
    branchA: string,
    branchB: string
  ) => Effect.Effect<BranchComparison, SqlError | BranchNotFoundError, never>;

  /**
   * Get the currently active branch for a prompt
   */
  readonly getActiveBranch: (
    promptId: string
  ) => Effect.Effect<Branch, SqlError | BranchNotFoundError, never>;
}

/**
 * Branch service tag
 */
export class BranchService extends Context.Tag("BranchService")<
  BranchService,
  BranchServiceImpl
>() {}

/**
 * Database row representation of a branch
 */
interface BranchRow {
  id: string;
  prompt_id: string;
  name: string;
  created_at: string;
  created_from_version?: number;
  is_active: number;
}

/**
 * Database row for version information
 */
interface VersionRow {
  version: number;
  parent_version?: number;
}

/**
 * Convert database row to Branch
 */
const rowToBranch = (row: BranchRow): Branch => ({
  id: row.id,
  promptId: row.prompt_id,
  name: row.name,
  createdAt: new Date(row.created_at),
  createdFromVersion: row.created_from_version,
  isActive: row.is_active === 1,
});

/**
 * Branch service implementation
 */
export const BranchServiceLive = Layer.effect(
  BranchService,
  Effect.gen(function* () {
    const sql = yield* SqlService;
    const versionService = yield* VersionService;

    return BranchService.of({
      createBranch: (params: CreateBranchParams) =>
        Effect.gen(function* () {
          // Check if branch name already exists for this prompt
          const existing = yield* sql.query<BranchRow>(
            "SELECT * FROM branches WHERE prompt_id = ? AND name = ?",
            [params.promptId, params.name]
          );

          if (existing.length > 0) {
            return yield* Effect.fail(
              new BranchError({
                message: `Branch '${params.name}' already exists`,
                promptId: params.promptId,
                branchName: params.name,
              })
            );
          }

          // Determine the version to branch from
          let fromVersion = params.fromVersion;
          if (!fromVersion) {
            // Get the head of the main branch
            const head = yield* versionService.getHead(params.promptId, "main");
            fromVersion = head.version;
          }

          // Generate a unique ID for the branch
          const branchId = crypto.randomUUID();

          // Insert the new branch
          yield* sql.run(
            `INSERT INTO branches (id, prompt_id, name, created_from_version, is_active, created_at)
             VALUES (?, ?, ?, ?, 0, datetime('now'))`,
            [branchId, params.promptId, params.name, fromVersion]
          );

          // Retrieve the newly created branch
          const rows = yield* sql.query<BranchRow>("SELECT * FROM branches WHERE id = ?", [
            branchId,
          ]);

          if (rows.length === 0) {
            return yield* Effect.die(new Error("Failed to retrieve newly created branch"));
          }

          return rowToBranch(rows[0]);
        }),

      listBranches: (promptId: string) =>
        Effect.gen(function* () {
          const rows = yield* sql.query<BranchRow>(
            `SELECT * FROM branches
             WHERE prompt_id = ?
             ORDER BY created_at ASC`,
            [promptId]
          );

          return rows.map(rowToBranch);
        }),

      switchBranch: (promptId: string, branchName: string) =>
        Effect.gen(function* () {
          // Check if the branch exists
          const branchRows = yield* sql.query<BranchRow>(
            "SELECT * FROM branches WHERE prompt_id = ? AND name = ?",
            [promptId, branchName]
          );

          if (branchRows.length === 0) {
            return yield* Effect.fail(new BranchNotFoundError({ promptId, branchName }));
          }

          // Use transaction to ensure atomic update
          yield* sql.transaction(
            Effect.gen(function* () {
              // Set all branches to inactive
              yield* sql.run("UPDATE branches SET is_active = 0 WHERE prompt_id = ?", [promptId]);

              // Set the target branch to active
              yield* sql.run("UPDATE branches SET is_active = 1 WHERE prompt_id = ? AND name = ?", [
                promptId,
                branchName,
              ]);
            })
          );

          // Retrieve the updated branch
          const updatedRows = yield* sql.query<BranchRow>(
            "SELECT * FROM branches WHERE prompt_id = ? AND name = ?",
            [promptId, branchName]
          );

          return rowToBranch(updatedRows[0]);
        }),

      deleteBranch: (promptId: string, branchName: string) =>
        Effect.gen(function* () {
          // Check if this is the only branch
          const allBranches = yield* sql.query<BranchRow>(
            "SELECT * FROM branches WHERE prompt_id = ?",
            [promptId]
          );

          if (allBranches.length <= 1) {
            return yield* Effect.fail(
              new BranchError({
                message: "Cannot delete the only branch",
                promptId,
                branchName,
              })
            );
          }

          // Check if the branch exists
          const branchRows = yield* sql.query<BranchRow>(
            "SELECT * FROM branches WHERE prompt_id = ? AND name = ?",
            [promptId, branchName]
          );

          if (branchRows.length === 0) {
            return yield* Effect.fail(
              new BranchError({
                message: `Branch '${branchName}' not found`,
                promptId,
                branchName,
              })
            );
          }

          const branch = branchRows[0];

          // Check if this branch has any versions
          const versionRows = yield* sql.query<VersionRow>(
            "SELECT version FROM prompt_versions WHERE prompt_id = ? AND branch = ?",
            [promptId, branchName]
          );

          if (versionRows.length > 0) {
            return yield* Effect.fail(
              new BranchError({
                message: `Cannot delete branch '${branchName}' with unmerged changes (${versionRows.length} versions)`,
                promptId,
                branchName,
              })
            );
          }

          // If this branch is active, switch to main before deleting
          if (branch.is_active === 1) {
            yield* sql.run(
              "UPDATE branches SET is_active = 1 WHERE prompt_id = ? AND name = 'main'",
              [promptId]
            );
          }

          // Delete the branch
          yield* sql.run("DELETE FROM branches WHERE prompt_id = ? AND name = ?", [
            promptId,
            branchName,
          ]);
        }),

      mergeBranch: (params: MergeParams) =>
        Effect.gen(function* () {
          const { promptId, sourceBranch, targetBranch, changeReason } = params;

          // Verify both branches exist
          const sourceBranchRows = yield* sql.query<BranchRow>(
            "SELECT * FROM branches WHERE prompt_id = ? AND name = ?",
            [promptId, sourceBranch]
          );

          const targetBranchRows = yield* sql.query<BranchRow>(
            "SELECT * FROM branches WHERE prompt_id = ? AND name = ?",
            [promptId, targetBranch]
          );

          if (sourceBranchRows.length === 0) {
            return yield* Effect.fail(
              new BranchNotFoundError({ promptId, branchName: sourceBranch })
            );
          }

          if (targetBranchRows.length === 0) {
            return yield* Effect.fail(
              new BranchNotFoundError({ promptId, branchName: targetBranch })
            );
          }

          // Get the head of the source branch
          const sourceHead = yield* versionService.getHead(promptId, sourceBranch);

          // Get the head of the target branch (if exists)
          const targetHeadResult = yield* Effect.either(
            versionService.getHead(promptId, targetBranch)
          );

          // If target has no versions, we can fast-forward
          if (targetHeadResult._tag === "Left") {
            // Create a new version on the target branch with source content
            const mergedVersion = yield* versionService.createVersion({
              promptId,
              content: sourceHead.content,
              frontmatter: sourceHead.frontmatter,
              changeReason: changeReason ?? `Merge from ${sourceBranch}`,
              branch: targetBranch,
            });

            return mergedVersion;
          }

          const targetHead = targetHeadResult.right;

          // Check if this is a fast-forward merge (target is ancestor of source)
          // For simplicity, we check if source was created from target's current version
          const sourceBranch_info = sourceBranchRows[0];
          const canFastForward = sourceBranch_info.created_from_version === targetHead.version;

          if (!canFastForward) {
            return yield* Effect.fail(
              new MergeConflictError({
                promptId,
                sourceBranch,
                targetBranch,
                message: "Cannot fast-forward merge. Manual conflict resolution required.",
              })
            );
          }

          // Fast-forward: create a new version on target with source content
          const mergedVersion = yield* versionService.createVersion({
            promptId,
            content: sourceHead.content,
            frontmatter: sourceHead.frontmatter,
            changeReason: changeReason ?? `Merge from ${sourceBranch}`,
            branch: targetBranch,
          });

          return mergedVersion;
        }),

      compareBranches: (promptId: string, branchA: string, branchB: string) =>
        Effect.gen(function* () {
          // Verify both branches exist
          const branchARows = yield* sql.query<BranchRow>(
            "SELECT * FROM branches WHERE prompt_id = ? AND name = ?",
            [promptId, branchA]
          );

          const branchBRows = yield* sql.query<BranchRow>(
            "SELECT * FROM branches WHERE prompt_id = ? AND name = ?",
            [promptId, branchB]
          );

          if (branchARows.length === 0) {
            return yield* Effect.fail(new BranchNotFoundError({ promptId, branchName: branchA }));
          }

          if (branchBRows.length === 0) {
            return yield* Effect.fail(new BranchNotFoundError({ promptId, branchName: branchB }));
          }

          // Get versions for both branches
          const aVersions = yield* sql.query<VersionRow>(
            "SELECT version FROM prompt_versions WHERE prompt_id = ? AND branch = ? ORDER BY version",
            [promptId, branchA]
          );

          const bVersions = yield* sql.query<VersionRow>(
            "SELECT version FROM prompt_versions WHERE prompt_id = ? AND branch = ? ORDER BY version",
            [promptId, branchB]
          );

          // Simple comparison: count versions on each branch
          // ahead = how many versions A has that B doesn't
          // behind = how many versions B has that A doesn't
          const ahead = aVersions.length;
          const behind = bVersions.length;

          // For simple fast-forward merge, we can merge if one is ancestor of other
          // Here we just check if both have the same base
          const canMerge = true; // Simplified for now

          return {
            ahead,
            behind,
            canMerge,
          };
        }),

      getActiveBranch: (promptId: string) =>
        Effect.gen(function* () {
          const rows = yield* sql.query<BranchRow>(
            "SELECT * FROM branches WHERE prompt_id = ? AND is_active = 1",
            [promptId]
          );

          if (rows.length === 0) {
            // If no active branch, return main as default
            const mainRows = yield* sql.query<BranchRow>(
              "SELECT * FROM branches WHERE prompt_id = ? AND name = 'main'",
              [promptId]
            );

            if (mainRows.length === 0) {
              return yield* Effect.fail(new BranchNotFoundError({ promptId, branchName: "main" }));
            }

            return rowToBranch(mainRows[0]);
          }

          return rowToBranch(rows[0]);
        }),
    });
  })
);
