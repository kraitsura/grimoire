/**
 * Version Service - Manages prompt versioning and history
 */

import { Context, Effect, Layer, Data } from "effect";
import { SqlService } from "./sql-service";
import { SqlError } from "../models";

/**
 * Error for version not found
 */
export class VersionNotFoundError extends Data.TaggedError("VersionNotFoundError")<{
  promptId: string;
  version?: number;
  branch?: string;
}> {}

/**
 * Parameters for creating a new version
 */
export interface CreateVersionParams {
  promptId: string;
  content: string;
  frontmatter: Record<string, unknown>;
  changeReason?: string;
  branch?: string;
}

/**
 * A specific version of a prompt
 */
export interface PromptVersion {
  id: number;
  promptId: string;
  version: number;
  content: string;
  frontmatter: Record<string, unknown>;
  changeReason?: string;
  branch: string;
  parentVersion?: number;
  createdAt: Date;
}

/**
 * Options for listing versions
 */
export interface ListVersionsOptions {
  branch?: string;
  limit?: number;
}

/**
 * Options for rollback operation
 */
export interface RollbackOptions {
  createBackup?: boolean;
  branch?: string;
}

/**
 * Result of a diff operation
 */
export interface DiffResult {
  additions: number;
  deletions: number;
  changes: string;
}

/**
 * Version service interface
 */
interface VersionServiceImpl {
  readonly createVersion: (
    params: CreateVersionParams
  ) => Effect.Effect<PromptVersion, SqlError, never>;

  readonly getVersion: (
    promptId: string,
    version: number,
    branch?: string
  ) => Effect.Effect<PromptVersion, VersionNotFoundError | SqlError, never>;

  readonly listVersions: (
    promptId: string,
    options?: ListVersionsOptions
  ) => Effect.Effect<PromptVersion[], SqlError, never>;

  readonly getHead: (
    promptId: string,
    branch?: string
  ) => Effect.Effect<PromptVersion, VersionNotFoundError | SqlError, never>;

  readonly rollback: (
    promptId: string,
    targetVersion: number,
    options?: RollbackOptions
  ) => Effect.Effect<PromptVersion, SqlError | VersionNotFoundError, never>;

  readonly diff: (
    promptId: string,
    fromVersion: number,
    toVersion: number
  ) => Effect.Effect<DiffResult, SqlError | VersionNotFoundError, never>;
}

/**
 * Version service tag
 */
export class VersionService extends Context.Tag("VersionService")<
  VersionService,
  VersionServiceImpl
>() {}

/**
 * Database row representation of a prompt version
 */
interface VersionRow {
  id: number;
  prompt_id: string;
  version: number;
  content: string;
  frontmatter: string;
  change_reason?: string;
  branch: string;
  parent_version?: number;
  created_at: string;
}

/**
 * Convert database row to PromptVersion
 */
const rowToVersion = (row: VersionRow): PromptVersion => ({
  id: row.id,
  promptId: row.prompt_id,
  version: row.version,
  content: row.content,
  frontmatter: JSON.parse(row.frontmatter),
  changeReason: row.change_reason,
  branch: row.branch,
  parentVersion: row.parent_version,
  createdAt: new Date(row.created_at),
});

/**
 * Calculate the next version number for a prompt on a specific branch
 */
const getNextVersion = (
  sql: Context.Tag.Service<SqlService>,
  promptId: string,
  branch: string
): Effect.Effect<number, SqlError, never> =>
  Effect.gen(function* () {
    const rows = yield* sql.query<{ max_version: number | null }>(
      `SELECT MAX(version) as max_version
       FROM prompt_versions
       WHERE prompt_id = ? AND branch = ?`,
      [promptId, branch]
    );

    const maxVersion = rows[0]?.max_version ?? 0;
    return maxVersion + 1;
  });

/**
 * Compute a simple line-based diff between two text strings
 */
const computeDiff = (fromContent: string, toContent: string): DiffResult => {
  const fromLines = fromContent.split("\n");
  const toLines = toContent.split("\n");

  let additions = 0;
  let deletions = 0;
  const changes: string[] = [];

  // Simple line-based diff (not LCS, just comparing line counts)
  const maxLen = Math.max(fromLines.length, toLines.length);

  for (let i = 0; i < maxLen; i++) {
    const fromLine = fromLines[i];
    const toLine = toLines[i];

    if (fromLine === undefined && toLine !== undefined) {
      additions++;
      changes.push(`+ ${toLine}`);
    } else if (fromLine !== undefined && toLine === undefined) {
      deletions++;
      changes.push(`- ${fromLine}`);
    } else if (fromLine !== toLine) {
      deletions++;
      additions++;
      changes.push(`- ${fromLine}`);
      changes.push(`+ ${toLine}`);
    }
  }

  return {
    additions,
    deletions,
    changes: changes.join("\n"),
  };
};

/**
 * Version service implementation
 */
export const VersionServiceLive = Layer.effect(
  VersionService,
  Effect.gen(function* () {
    const sql = yield* SqlService;

    return VersionService.of({
      createVersion: (params: CreateVersionParams) =>
        Effect.gen(function* () {
          const branch = params.branch ?? "main";
          const nextVersion = yield* getNextVersion(sql, params.promptId, branch);

          // Get parent version (the current head of this branch, if it exists)
          const parentRows = yield* sql.query<{ version: number }>(
            `SELECT version
             FROM prompt_versions
             WHERE prompt_id = ? AND branch = ?
             ORDER BY version DESC
             LIMIT 1`,
            [params.promptId, branch]
          );

          const parentVersion = parentRows[0]?.version;

          // Insert the new version
          yield* sql.run(
            `INSERT INTO prompt_versions
             (prompt_id, version, content, frontmatter, change_reason, branch, parent_version, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
              params.promptId,
              nextVersion,
              params.content,
              JSON.stringify(params.frontmatter),
              params.changeReason ?? null,
              branch,
              parentVersion ?? null,
            ]
          );

          // Retrieve the newly created version
          const rows = yield* sql.query<VersionRow>(
            `SELECT * FROM prompt_versions
             WHERE prompt_id = ? AND version = ? AND branch = ?`,
            [params.promptId, nextVersion, branch]
          );

          if (rows.length === 0) {
            return yield* Effect.die(new Error("Failed to retrieve newly created version"));
          }

          return rowToVersion(rows[0]);
        }),

      getVersion: (promptId: string, version: number, branch?: string) =>
        Effect.gen(function* () {
          const branchName = branch ?? "main";

          const rows = yield* sql.query<VersionRow>(
            `SELECT * FROM prompt_versions
             WHERE prompt_id = ? AND version = ? AND branch = ?`,
            [promptId, version, branchName]
          );

          if (rows.length === 0) {
            return yield* Effect.fail(
              new VersionNotFoundError({ promptId, version, branch: branchName })
            );
          }

          return rowToVersion(rows[0]);
        }),

      listVersions: (promptId: string, options?: ListVersionsOptions) =>
        Effect.gen(function* () {
          const branch = options?.branch ?? "main";
          const limit = options?.limit;

          let query = `SELECT * FROM prompt_versions
                       WHERE prompt_id = ? AND branch = ?
                       ORDER BY version DESC`;

          const params: (string | number)[] = [promptId, branch];

          if (limit !== undefined && limit > 0) {
            query += ` LIMIT ?`;
            params.push(limit);
          }

          const rows = yield* sql.query<VersionRow>(query, params);
          return rows.map(rowToVersion);
        }),

      getHead: (promptId: string, branch?: string) =>
        Effect.gen(function* () {
          const branchName = branch ?? "main";

          const rows = yield* sql.query<VersionRow>(
            `SELECT * FROM prompt_versions
             WHERE prompt_id = ? AND branch = ?
             ORDER BY version DESC
             LIMIT 1`,
            [promptId, branchName]
          );

          if (rows.length === 0) {
            return yield* Effect.fail(new VersionNotFoundError({ promptId, branch: branchName }));
          }

          return rowToVersion(rows[0]);
        }),

      rollback: (promptId: string, targetVersion: number, options?: RollbackOptions) =>
        Effect.gen(function* () {
          const branch = options?.branch ?? "main";
          const createBackup = options?.createBackup ?? true;

          // Get the target version
          const targetRows = yield* sql.query<VersionRow>(
            `SELECT * FROM prompt_versions
             WHERE prompt_id = ? AND version = ? AND branch = ?`,
            [promptId, targetVersion, branch]
          );

          if (targetRows.length === 0) {
            return yield* Effect.fail(
              new VersionNotFoundError({ promptId, version: targetVersion, branch })
            );
          }

          const targetVersionData = rowToVersion(targetRows[0]);

          // If createBackup is true, create a new version with the rollback content
          if (createBackup) {
            const nextVersion = yield* getNextVersion(sql, promptId, branch);

            yield* sql.run(
              `INSERT INTO prompt_versions
               (prompt_id, version, content, frontmatter, change_reason, branch, parent_version, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
              [
                promptId,
                nextVersion,
                targetVersionData.content,
                JSON.stringify(targetVersionData.frontmatter),
                `Rollback to version ${targetVersion}`,
                branch,
                targetVersion,
              ]
            );

            // Return the newly created rollback version
            const newRows = yield* sql.query<VersionRow>(
              `SELECT * FROM prompt_versions
               WHERE prompt_id = ? AND version = ? AND branch = ?`,
              [promptId, nextVersion, branch]
            );

            return rowToVersion(newRows[0]);
          }

          // If not creating a backup, just return the target version
          return targetVersionData;
        }),

      diff: (promptId: string, fromVersion: number, toVersion: number) =>
        Effect.gen(function* () {
          // Get both versions (assuming same branch for simplicity)
          const fromRows = yield* sql.query<VersionRow>(
            `SELECT * FROM prompt_versions
             WHERE prompt_id = ? AND version = ?`,
            [promptId, fromVersion]
          );

          const toRows = yield* sql.query<VersionRow>(
            `SELECT * FROM prompt_versions
             WHERE prompt_id = ? AND version = ?`,
            [promptId, toVersion]
          );

          if (fromRows.length === 0) {
            return yield* Effect.fail(new VersionNotFoundError({ promptId, version: fromVersion }));
          }

          if (toRows.length === 0) {
            return yield* Effect.fail(new VersionNotFoundError({ promptId, version: toVersion }));
          }

          const fromContent = fromRows[0].content;
          const toContent = toRows[0].content;

          return computeDiff(fromContent, toContent);
        }),
    });
  })
);
