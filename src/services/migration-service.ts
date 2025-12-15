/**
 * Migration Service - SQLite schema versioning system
 */

import { Context, Effect, Layer } from "effect";
import { SqlError } from "../models";
import { SqlService } from "./sql-service";

/**
 * Represents a database migration
 */
export interface Migration {
  version: number;
  description: string;
  up: string[]; // SQL statements to apply
}

/**
 * Migration service interface
 */
interface MigrationServiceImpl {
  /**
   * Get the current schema version from the database
   * Returns 0 if no migrations have been applied yet
   */
  readonly getCurrentVersion: () => Effect.Effect<number, SqlError>;

  /**
   * Run all pending migrations
   * Returns array of version numbers that were applied
   */
  readonly migrate: () => Effect.Effect<number[], SqlError>;

  /**
   * Get list of migrations that haven't been applied yet
   */
  readonly getPending: () => Effect.Effect<Migration[], SqlError>;
}

/**
 * Migration service tag
 */
export class MigrationService extends Context.Tag("MigrationService")<
  MigrationService,
  MigrationServiceImpl
>() {}

/**
 * All migrations in order
 */
const migrations: Migration[] = [
  {
    version: 1,
    description: "Initial schema with prompts, tags, and versioning",
    up: [
      `CREATE TABLE prompts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_template INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1
      )`,
      `CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      )`,
      `CREATE TABLE prompt_tags (
        prompt_id TEXT REFERENCES prompts(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (prompt_id, tag_id)
      )`,
      `CREATE TABLE prompt_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt_id TEXT REFERENCES prompts(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    version: 2,
    description: "Add FTS5 full-text search",
    up: [
      // FTS5 virtual table - Note: prompts table has content_hash not content
      // We need to add a content column first or store content in FTS
      `CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
      name,
      tags,
      content='',
      tokenize='porter unicode61'
    )`,

      // Insert trigger
      `CREATE TRIGGER IF NOT EXISTS prompts_ai AFTER INSERT ON prompts BEGIN
      INSERT INTO prompts_fts(rowid, name, tags)
      VALUES (new.rowid, new.name, '');
    END`,

      // Update trigger
      `CREATE TRIGGER IF NOT EXISTS prompts_au AFTER UPDATE ON prompts BEGIN
      UPDATE prompts_fts SET name = new.name
      WHERE rowid = old.rowid;
    END`,

      // Delete trigger
      `CREATE TRIGGER IF NOT EXISTS prompts_ad AFTER DELETE ON prompts BEGIN
      DELETE FROM prompts_fts WHERE rowid = old.rowid;
    END`,
    ],
  },
  {
    version: 3,
    description: "Add favorite and pin fields",
    up: [
      `ALTER TABLE prompts ADD COLUMN is_favorite INTEGER DEFAULT 0`,
      `ALTER TABLE prompts ADD COLUMN favorite_order INTEGER`,
      `ALTER TABLE prompts ADD COLUMN is_pinned INTEGER DEFAULT 0`,
      `ALTER TABLE prompts ADD COLUMN pin_order INTEGER`,
    ],
  },
  {
    version: 4,
    description: "Add branches table for A/B testing",
    up: [
      `CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_from_version INTEGER,
        is_active INTEGER DEFAULT 0,
        UNIQUE(prompt_id, name)
      )`,
      // Create main branch for all existing prompts
      `INSERT INTO branches (id, prompt_id, name, is_active, created_at)
       SELECT
         lower(hex(randomblob(16))),
         id,
         'main',
         1,
         datetime('now')
       FROM prompts`,
    ],
  },
  {
    version: 5,
    description: "Add branch and frontmatter columns to prompt_versions",
    up: [
      `ALTER TABLE prompt_versions ADD COLUMN branch TEXT DEFAULT 'main'`,
      `ALTER TABLE prompt_versions ADD COLUMN frontmatter TEXT DEFAULT '{}'`,
      `ALTER TABLE prompt_versions ADD COLUMN change_reason TEXT`,
      `ALTER TABLE prompt_versions ADD COLUMN parent_version INTEGER`,
    ],
  },
  {
    version: 6,
    description: "Add usage_logs table for tracking prompt usage analytics",
    up: [
      `CREATE TABLE IF NOT EXISTS usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt_id TEXT NOT NULL,
        action TEXT NOT NULL,
        timestamp TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_usage_prompt ON usage_logs(prompt_id)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_action ON usage_logs(action)`,
    ],
  },
  {
    version: 7,
    description: "Add version_tags and config tables for retention policy",
    up: [
      `CREATE TABLE IF NOT EXISTS version_tags (
        prompt_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        tag TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (prompt_id, version),
        FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_version_tags_prompt ON version_tags(prompt_id)`,
      `CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `INSERT INTO config (key, value) VALUES
        ('retention.maxVersionsPerPrompt', '50'),
        ('retention.retentionDays', '90'),
        ('retention.strategy', '"count"'),
        ('retention.preserveTaggedVersions', 'true')`,
    ],
  },
  {
    version: 8,
    description: "Fix FTS5 implementation - replace contentless with content-storing table",
    up: [
      // Drop old triggers that don't work with contentless FTS
      `DROP TRIGGER IF EXISTS prompts_ai`,
      `DROP TRIGGER IF EXISTS prompts_au`,
      `DROP TRIGGER IF EXISTS prompts_ad`,

      // Drop the broken contentless FTS table
      `DROP TABLE IF EXISTS prompts_fts`,

      // Create new FTS5 table that stores content (not contentless)
      // This allows DELETE, snippet(), and proper search functionality
      `CREATE VIRTUAL TABLE prompts_fts USING fts5(
        prompt_id UNINDEXED,
        name,
        content,
        tags,
        tokenize='porter unicode61'
      )`,

      // Mark that FTS needs rebuilding (handled by MigrationService post-migration)
      `INSERT OR REPLACE INTO config (key, value) VALUES ('fts.needsRebuild', 'true')`,
    ],
  },
];

/**
 * Schema version row from database
 */
interface SchemaVersionRow {
  version: number;
  description: string;
  applied_at: string;
}

/**
 * Migration service implementation
 */
export const MigrationLive = Layer.effect(
  MigrationService,
  Effect.gen(function* () {
    // Get SqlService dependency
    const sql = yield* SqlService;

    // Ensure schema_versions table exists
    yield* sql.run(
      `CREATE TABLE IF NOT EXISTS schema_versions (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
      )`
    );

    // Auto-run pending migrations on layer construction
    const versionRows = yield* sql.query<SchemaVersionRow>(
      "SELECT version FROM schema_versions ORDER BY version DESC LIMIT 1"
    );
    const currentVersion = versionRows.length > 0 ? versionRows[0].version : 0;
    const pendingMigrations = migrations.filter((m) => m.version > currentVersion);

    for (const migration of pendingMigrations) {
      yield* sql.transaction(
        Effect.gen(function* () {
          for (const statement of migration.up) {
            yield* sql.run(statement);
          }
          yield* sql.run("INSERT INTO schema_versions (version, description) VALUES (?, ?)", [
            migration.version,
            migration.description,
          ]);
        })
      );
    }

    return MigrationService.of({
      getCurrentVersion: () =>
        Effect.gen(function* () {
          const rows = yield* sql.query<SchemaVersionRow>(
            "SELECT version FROM schema_versions ORDER BY version DESC LIMIT 1"
          );

          // Return 0 if no migrations have been applied
          return rows.length > 0 ? rows[0].version : 0;
        }),

      getPending: () =>
        Effect.gen(function* () {
          // Get current version from database
          const rows = yield* sql.query<SchemaVersionRow>(
            "SELECT version FROM schema_versions ORDER BY version DESC LIMIT 1"
          );
          const currentVersion = rows.length > 0 ? rows[0].version : 0;

          // Filter migrations to only those not yet applied
          const pending = migrations.filter((m) => m.version > currentVersion);

          return pending;
        }),

      migrate: () =>
        Effect.gen(function* () {
          // Get current version
          const rows = yield* sql.query<SchemaVersionRow>(
            "SELECT version FROM schema_versions ORDER BY version DESC LIMIT 1"
          );
          const currentVersion = rows.length > 0 ? rows[0].version : 0;

          // Get pending migrations
          const pending = migrations.filter((m) => m.version > currentVersion);

          // Track which versions were applied
          const appliedVersions: number[] = [];

          // Run each migration in a transaction
          for (const migration of pending) {
            yield* sql.transaction(
              Effect.gen(function* () {
                // Execute all SQL statements in the migration
                for (const statement of migration.up) {
                  yield* sql.run(statement);
                }

                // Record that this migration was applied
                yield* sql.run("INSERT INTO schema_versions (version, description) VALUES (?, ?)", [
                  migration.version,
                  migration.description,
                ]);

                appliedVersions.push(migration.version);
              })
            );
          }

          return appliedVersions;
        }),
    });
  })
);
