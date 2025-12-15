/**
 * Retention Service - Manages version retention policies and cleanup
 *
 * Implements configurable version retention to manage storage efficiently.
 * Supports multiple retention strategies and preserves tagged versions.
 */

import { Context, Effect, Layer } from "effect";
import { Schema } from "@effect/schema";
import { SqlService } from "./sql-service";
import { VersionService } from "./version-service";
import { SqlError, StorageError, ConfigError } from "../models";

/**
 * Retention strategy types
 */
export type RetentionStrategy = "count" | "days" | "both";

/**
 * Version retention configuration
 */
export interface RetentionConfig {
  maxVersionsPerPrompt: number; // Keep last N versions
  retentionDays: number; // Or versions older than N days
  strategy: RetentionStrategy; // 'count', 'days', or 'both'
  preserveTaggedVersions: boolean; // Never delete tagged versions
}

/**
 * Default retention configuration
 */
export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  maxVersionsPerPrompt: 50,
  retentionDays: 90,
  strategy: "count",
  preserveTaggedVersions: true,
};

/**
 * Schema for retention configuration
 */
export const RetentionConfigSchema = Schema.Struct({
  maxVersionsPerPrompt: Schema.Number.pipe(Schema.int(), Schema.positive()),
  retentionDays: Schema.Number.pipe(Schema.int(), Schema.positive()),
  strategy: Schema.Literal("count", "days", "both"),
  preserveTaggedVersions: Schema.Boolean,
});

/**
 * Result of cleanup operation
 */
export interface CleanupResult {
  totalVersionsDeleted: number;
  promptsAffected: number;
  deletedVersions: Array<{ promptId: string; version: number }>;
}

/**
 * Preview of what would be deleted
 */
export interface CleanupPreview {
  totalVersionsToDelete: number;
  promptsAffected: number;
  versionsToDelete: Array<{
    promptId: string;
    version: number;
    createdAt: Date;
    reason: string;
  }>;
}

/**
 * Version tag information
 */
interface VersionTag {
  promptId: string;
  version: number;
  tag: string;
  createdAt: Date;
}

/**
 * Database row for version tags
 */
interface VersionTagRow {
  prompt_id: string;
  version: number;
  tag: string;
  created_at: string;
}

/**
 * Database row for versions with tag info
 */
interface VersionWithTagRow {
  id: number;
  prompt_id: string;
  version: number;
  created_at: string;
  has_tag: number;
  tag: string | null;
}

/**
 * Retention service interface
 */
interface RetentionServiceImpl {
  /**
   * Clean up versions for a specific prompt based on policy
   * @param promptId - Prompt identifier
   * @returns Effect that succeeds with number of versions deleted or fails with SqlError
   */
  readonly cleanupVersions: (
    promptId: string
  ) => Effect.Effect<number, SqlError | ConfigError>;

  /**
   * Clean up versions for all prompts based on policy
   * @returns Effect that succeeds with CleanupResult or fails with SqlError
   */
  readonly cleanupAll: () => Effect.Effect<
    CleanupResult,
    SqlError | ConfigError
  >;

  /**
   * Preview what would be deleted without actually deleting
   * @returns Effect that succeeds with CleanupPreview or fails with SqlError
   */
  readonly previewCleanup: () => Effect.Effect<
    CleanupPreview,
    SqlError | ConfigError
  >;

  /**
   * Tag a specific version to preserve it
   * @param promptId - Prompt identifier
   * @param version - Version number
   * @param tag - Tag name (e.g., "stable", "production")
   * @returns Effect that succeeds or fails with SqlError
   */
  readonly tagVersion: (
    promptId: string,
    version: number,
    tag: string
  ) => Effect.Effect<void, SqlError>;

  /**
   * Remove tag from a version
   * @param promptId - Prompt identifier
   * @param version - Version number
   * @returns Effect that succeeds or fails with SqlError
   */
  readonly untagVersion: (
    promptId: string,
    version: number
  ) => Effect.Effect<void, SqlError>;

  /**
   * Get all tagged versions for a prompt
   * @param promptId - Prompt identifier
   * @returns Effect that succeeds with array of VersionTag or fails with SqlError
   */
  readonly getTaggedVersions: (
    promptId: string
  ) => Effect.Effect<VersionTag[], SqlError>;

  /**
   * Get current retention configuration
   * @returns Effect that succeeds with RetentionConfig or fails with SqlError
   */
  readonly getConfig: () => Effect.Effect<RetentionConfig, SqlError>;

  /**
   * Update retention configuration
   * @param config - New retention configuration
   * @returns Effect that succeeds or fails with SqlError
   */
  readonly setConfig: (
    config: RetentionConfig
  ) => Effect.Effect<void, SqlError | ConfigError>;
}

/**
 * Retention service tag
 */
export class RetentionService extends Context.Tag("RetentionService")<
  RetentionService,
  RetentionServiceImpl
>() {}

/**
 * Get versions to delete for a prompt based on retention policy
 */
const getVersionsToDelete = (
  sql: Context.Tag.Service<SqlService>,
  promptId: string,
  config: RetentionConfig,
  branch: string = "main"
): Effect.Effect<number[], SqlError, never> =>
  Effect.gen(function* () {
    // Get all versions with tag information
    const rows = yield* sql.query<VersionWithTagRow>(
      `SELECT
        pv.id,
        pv.prompt_id,
        pv.version,
        pv.created_at,
        CASE WHEN vt.tag IS NOT NULL THEN 1 ELSE 0 END as has_tag,
        vt.tag
       FROM prompt_versions pv
       LEFT JOIN version_tags vt ON pv.prompt_id = vt.prompt_id AND pv.version = vt.version
       WHERE pv.prompt_id = ? AND pv.branch = ?
       ORDER BY pv.version DESC`,
      [promptId, branch]
    );

    if (rows.length === 0) {
      return [];
    }

    const versionsToDelete: number[] = [];

    // Always keep version 1 and HEAD (latest version)
    const latestVersion = rows[0].version;
    const protectedVersions = new Set([1, latestVersion]);

    // Add tagged versions to protected set if policy says so
    if (config.preserveTaggedVersions) {
      rows.forEach((row: VersionWithTagRow) => {
        if (row.has_tag) {
          protectedVersions.add(row.version);
        }
      });
    }

    // Apply retention strategy
    switch (config.strategy) {
      case "count": {
        // Keep only the last N versions (excluding protected)
        const unprotectedVersions = rows.filter(
          (row: VersionWithTagRow) => !protectedVersions.has(row.version)
        );
        if (unprotectedVersions.length > config.maxVersionsPerPrompt) {
          const toDelete = unprotectedVersions.slice(
            config.maxVersionsPerPrompt
          );
          versionsToDelete.push(...toDelete.map((row: VersionWithTagRow) => row.version));
        }
        break;
      }

      case "days": {
        // Delete versions older than N days (excluding protected)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

        rows.forEach((row: VersionWithTagRow) => {
          if (protectedVersions.has(row.version)) {
            return;
          }
          const createdAt = new Date(row.created_at);
          if (createdAt < cutoffDate) {
            versionsToDelete.push(row.version);
          }
        });
        break;
      }

      case "both": {
        // Delete if either: more than N versions OR older than N days
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

        const unprotectedVersions = rows.filter(
          (row: VersionWithTagRow) => !protectedVersions.has(row.version)
        );

        // Track which versions to delete
        const toDeleteSet = new Set<number>();

        // Add versions beyond count limit
        if (unprotectedVersions.length > config.maxVersionsPerPrompt) {
          const excessVersions = unprotectedVersions.slice(
            config.maxVersionsPerPrompt
          );
          excessVersions.forEach((row: VersionWithTagRow) => toDeleteSet.add(row.version));
        }

        // Add versions beyond time limit
        unprotectedVersions.forEach((row: VersionWithTagRow) => {
          const createdAt = new Date(row.created_at);
          if (createdAt < cutoffDate) {
            toDeleteSet.add(row.version);
          }
        });

        versionsToDelete.push(...Array.from(toDeleteSet));
        break;
      }
    }

    return versionsToDelete;
  });

/**
 * Convert database row to VersionTag
 */
const rowToVersionTag = (row: VersionTagRow): VersionTag => ({
  promptId: row.prompt_id,
  version: row.version,
  tag: row.tag,
  createdAt: new Date(row.created_at),
});

/**
 * Retention service implementation
 */
export const RetentionServiceLive = Layer.effect(
  RetentionService,
  Effect.gen(function* () {
    const sql = yield* SqlService;

    // Helper to get config from within the service
    const getConfigInternal = () =>
      Effect.gen(function* () {
        const rows = yield* sql.query<{ key: string; value: string }>(
          `SELECT key, value FROM config WHERE key LIKE 'retention.%'`
        );

        if (rows.length === 0) {
          // Return default config if not configured
          return DEFAULT_RETENTION_CONFIG;
        }

        // Parse config from rows
        const configObj: Record<string, unknown> = {};
        rows.forEach((row) => {
          const key = row.key.replace("retention.", "");
          let value: unknown = row.value;

          // Parse JSON values
          try {
            value = JSON.parse(row.value);
          } catch {
            // Keep as string if not JSON
          }

          configObj[key] = value;
        });

        // Merge with defaults for any missing values
        const config = {
          ...DEFAULT_RETENTION_CONFIG,
          ...configObj,
        };

        return config as RetentionConfig;
      });

    return RetentionService.of({
      cleanupVersions: (promptId: string) =>
        Effect.gen(function* () {
          // Get current config
          const config = yield* getConfigInternal();

          // Get versions to delete
          const versionsToDelete = yield* getVersionsToDelete(
            sql,
            promptId,
            config
          );

          if (versionsToDelete.length === 0) {
            return 0;
          }

          // Delete versions
          const placeholders = versionsToDelete.map(() => "?").join(",");
          yield* sql.run(
            `DELETE FROM prompt_versions
             WHERE prompt_id = ? AND version IN (${placeholders})`,
            [promptId, ...versionsToDelete]
          );

          return versionsToDelete.length;
        }),

      cleanupAll: () =>
        Effect.gen(function* () {
          // Get current config
          const config = yield* getConfigInternal();

          // Get all unique prompt IDs from versions
          const promptRows = yield* sql.query<{ prompt_id: string }>(
            `SELECT DISTINCT prompt_id FROM prompt_versions`
          );

          const deletedVersions: Array<{ promptId: string; version: number }> =
            [];
          const promptsAffected = new Set<string>();

          // Clean up each prompt
          for (const row of promptRows) {
            const versionsToDelete = yield* getVersionsToDelete(
              sql,
              row.prompt_id,
              config
            );

            if (versionsToDelete.length > 0) {
              promptsAffected.add(row.prompt_id);

              // Delete versions
              const placeholders = versionsToDelete.map(() => "?").join(",");
              yield* sql.run(
                `DELETE FROM prompt_versions
                 WHERE prompt_id = ? AND version IN (${placeholders})`,
                [row.prompt_id, ...versionsToDelete]
              );

              // Track what was deleted
              versionsToDelete.forEach((version) => {
                deletedVersions.push({ promptId: row.prompt_id, version });
              });
            }
          }

          return {
            totalVersionsDeleted: deletedVersions.length,
            promptsAffected: promptsAffected.size,
            deletedVersions,
          };
        }),

      previewCleanup: () =>
        Effect.gen(function* () {
          // Get current config
          const config = yield* getConfigInternal();

          // Get all unique prompt IDs from versions
          const promptRows = yield* sql.query<{ prompt_id: string }>(
            `SELECT DISTINCT prompt_id FROM prompt_versions`
          );

          const versionsToDelete: Array<{
            promptId: string;
            version: number;
            createdAt: Date;
            reason: string;
          }> = [];
          const promptsAffected = new Set<string>();

          // Preview cleanup for each prompt
          for (const row of promptRows) {
            const toDelete = yield* getVersionsToDelete(
              sql,
              row.prompt_id,
              config
            );

            if (toDelete.length > 0) {
              promptsAffected.add(row.prompt_id);

              // Get details for preview
              const placeholders = toDelete.map(() => "?").join(",");
              const detailRows = yield* sql.query<{
                version: number;
                created_at: string;
              }>(
                `SELECT version, created_at
                 FROM prompt_versions
                 WHERE prompt_id = ? AND version IN (${placeholders})`,
                [row.prompt_id, ...toDelete]
              );

              detailRows.forEach((detail) => {
                let reason = "";
                const createdAt = new Date(detail.created_at);
                const age = Math.floor(
                  (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
                );

                if (config.strategy === "count") {
                  reason = `Exceeds max versions (${config.maxVersionsPerPrompt})`;
                } else if (config.strategy === "days") {
                  reason = `Older than ${config.retentionDays} days (${age} days old)`;
                } else {
                  reason = `Exceeds limits (${age} days old, max ${config.maxVersionsPerPrompt} versions)`;
                }

                versionsToDelete.push({
                  promptId: row.prompt_id,
                  version: detail.version,
                  createdAt,
                  reason,
                });
              });
            }
          }

          return {
            totalVersionsToDelete: versionsToDelete.length,
            promptsAffected: promptsAffected.size,
            versionsToDelete,
          };
        }),

      tagVersion: (promptId: string, version: number, tag: string) =>
        Effect.gen(function* () {
          // Check if version exists
          const versionRows = yield* sql.query<{ id: number }>(
            `SELECT id FROM prompt_versions WHERE prompt_id = ? AND version = ?`,
            [promptId, version]
          );

          if (versionRows.length === 0) {
            return yield* Effect.fail(
              new SqlError({
                message: `Version ${version} not found for prompt ${promptId}`,
              })
            );
          }

          // Insert or update tag
          yield* sql.run(
            `INSERT INTO version_tags (prompt_id, version, tag, created_at)
             VALUES (?, ?, ?, datetime('now'))
             ON CONFLICT(prompt_id, version) DO UPDATE SET tag = excluded.tag`,
            [promptId, version, tag]
          );
        }),

      untagVersion: (promptId: string, version: number) =>
        Effect.gen(function* () {
          yield* sql.run(
            `DELETE FROM version_tags WHERE prompt_id = ? AND version = ?`,
            [promptId, version]
          );
        }),

      getTaggedVersions: (promptId: string) =>
        Effect.gen(function* () {
          const rows = yield* sql.query<VersionTagRow>(
            `SELECT prompt_id, version, tag, created_at
             FROM version_tags
             WHERE prompt_id = ?
             ORDER BY version DESC`,
            [promptId]
          );

          return rows.map(rowToVersionTag);
        }),

      getConfig: getConfigInternal,

      setConfig: (config: RetentionConfig) =>
        Effect.gen(function* () {
          // Validate config
          yield* Effect.try({
            try: () => Schema.decodeSync(RetentionConfigSchema)(config),
            catch: (error) =>
              new ConfigError({
                message: "Invalid retention configuration",
                key: "retention",
              }),
          });

          // Store each config value
          const configEntries: Array<[string, unknown]> = [
            ["retention.maxVersionsPerPrompt", config.maxVersionsPerPrompt],
            ["retention.retentionDays", config.retentionDays],
            ["retention.strategy", config.strategy],
            [
              "retention.preserveTaggedVersions",
              config.preserveTaggedVersions,
            ],
          ];

          for (const [key, value] of configEntries) {
            yield* sql.run(
              `INSERT INTO config (key, value)
               VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
              [key, JSON.stringify(value)]
            );
          }
        }),
    });
  })
);
