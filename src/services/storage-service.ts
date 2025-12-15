/**
 * Storage Service - High-level prompt CRUD operations
 *
 * Coordinates between SqlService (database) and PromptStorageService (file system)
 * to provide a unified interface for managing prompts.
 */

import { Context, Effect, Layer, Option } from "effect";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, rename, appendFile } from "node:fs/promises";
import type { Prompt, Frontmatter } from "../models";
import { StorageError, PromptNotFoundError, DuplicateNameError, SqlError } from "../models";
import { SqlService } from "./sql-service";
import { PromptStorageService } from "./prompt-storage-service";
import { SyncService } from "./sync-service";
import { sanitizeFtsQuery } from "./search-service";

/**
 * Log file path for error tracking
 */
const getErrorLogPath = (): string => join(homedir(), ".grimoire", "errors.log");

/**
 * Patterns that look like API keys - used for sanitization
 */
const API_KEY_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/g, // OpenAI keys
  /sk-ant-[a-zA-Z0-9_-]{20,}/g, // Anthropic keys
  /AIza[a-zA-Z0-9_-]{30,}/g, // Google API keys
  /[a-zA-Z0-9_-]{32,}/g, // Generic long tokens (fallback)
];

/**
 * Sanitize a string by redacting potential API keys and secrets
 * This prevents accidental logging of sensitive data
 */
const sanitizeForLog = (message: string): string => {
  let sanitized = message;

  // Redact known API key patterns
  for (const pattern of API_KEY_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      // Keep first 4 and last 4 chars for debugging, redact the rest
      if (match.length > 12) {
        return `${match.slice(0, 4)}...[REDACTED]...${match.slice(-4)}`;
      }
      return "[REDACTED]";
    });
  }

  // Also redact anything that looks like it might be in an API key context
  sanitized = sanitized.replace(
    /(?:api[_-]?key|secret|token|password|credential)s?\s*[:=]\s*["']?([^"'\s]+)["']?/gi,
    (match: string, value: string) => match.replace(value, "[REDACTED]")
  );

  return sanitized;
};

/**
 * Log an error to the errors.log file
 * Fails silently if logging itself fails (we don't want logging to break the app)
 * Sanitizes error messages to prevent API key leakage
 */
const logError = (context: string, id: string, error: unknown): Effect.Effect<void, never> =>
  Effect.tryPromise({
    try: async () => {
      const timestamp = new Date().toISOString();
      const rawMessage = error instanceof Error ? error.message : String(error);
      const errorMessage = sanitizeForLog(rawMessage);
      const logLine = `${timestamp} | ${context} | ${id} | ${errorMessage}\n`;
      await appendFile(getErrorLogPath(), logLine);
    },
    catch: () => undefined, // Silently ignore logging failures
  }).pipe(Effect.ignore);

/**
 * Input for creating a new prompt
 */
export interface CreatePromptInput {
  name: string;
  content: string;
  tags?: string[];
  isTemplate?: boolean;
  isFavorite?: boolean;
  favoriteOrder?: number;
  isPinned?: boolean;
  pinOrder?: number;
}

/**
 * Input for updating an existing prompt
 */
export interface UpdatePromptInput {
  name?: string;
  content?: string;
  tags?: string[];
  isTemplate?: boolean;
  isFavorite?: boolean;
  favoriteOrder?: number;
  isPinned?: boolean;
  pinOrder?: number;
}

/**
 * Database row structure for prompts table
 */
interface PromptRow {
  id: string;
  name: string;
  content_hash: string;
  file_path: string;
  created_at: string;
  updated_at: string;
  is_template: number;
  version: number;
  is_favorite?: number;
  favorite_order?: number;
  is_pinned?: number;
  pin_order?: number;
}

/**
 * Database row structure for tags table
 */
interface TagRow {
  id: number;
  name: string;
}

/**
 * Storage service interface - manages prompt CRUD operations
 */
interface StorageServiceImpl {
  readonly getAll: Effect.Effect<Prompt[], StorageError | SqlError>;
  readonly getById: (
    id: string
  ) => Effect.Effect<Prompt, PromptNotFoundError | StorageError | SqlError>;
  readonly getByName: (
    name: string
  ) => Effect.Effect<Prompt, PromptNotFoundError | StorageError | SqlError>;
  readonly create: (
    input: CreatePromptInput
  ) => Effect.Effect<Prompt, DuplicateNameError | StorageError | SqlError>;
  readonly update: (
    id: string,
    input: UpdatePromptInput
  ) => Effect.Effect<Prompt, PromptNotFoundError | StorageError | SqlError>;
  readonly delete: (
    id: string,
    hard?: boolean
  ) => Effect.Effect<void, PromptNotFoundError | StorageError | SqlError>;
  readonly findByTags: (tags: string[]) => Effect.Effect<Prompt[], StorageError | SqlError>;
  readonly search: (query: string) => Effect.Effect<Prompt[], StorageError | SqlError>;
}

/**
 * Storage service tag
 */
export class StorageService extends Context.Tag("StorageService")<
  StorageService,
  StorageServiceImpl
>() {}

/**
 * Get the prompts directory path
 */
const getPromptsDir = (): string => {
  return join(homedir(), ".grimoire", "prompts");
};

/**
 * Get the archive directory path
 */
const getArchiveDir = (): string => {
  return join(homedir(), ".grimoire", "archive");
};

/**
 * Ensure archive directory exists
 */
const ensureArchiveDirectory = (): Effect.Effect<void, StorageError> =>
  Effect.tryPromise({
    try: async () => {
      const archiveDir = getArchiveDir();
      await mkdir(archiveDir, { recursive: true });
    },
    catch: (error) =>
      new StorageError({
        message: "Failed to create archive directory",
        cause: error,
      }),
  });

/**
 * Convert database row to Prompt object
 */
const rowToPrompt = (row: PromptRow, content: string, tags?: string[]): Prompt => ({
  id: row.id,
  name: row.name,
  created: new Date(row.created_at),
  updated: new Date(row.updated_at),
  version: row.version,
  isTemplate: row.is_template === 1,
  isFavorite: row.is_favorite === 1,
  favoriteOrder: row.favorite_order,
  isPinned: row.is_pinned === 1,
  pinOrder: row.pin_order,
  content,
  filePath: row.file_path,
  tags,
});

/**
 * Storage service implementation
 */
export const StorageServiceLive = Layer.effect(
  StorageService,
  Effect.gen(function* () {
    // Get service dependencies
    const sql = yield* SqlService;
    const promptStorage = yield* PromptStorageService;
    const sync = yield* SyncService;

    return StorageService.of({
      getAll: Effect.gen(function* () {
        // Query database for all prompts
        const rows = yield* sql.query<PromptRow>("SELECT * FROM prompts ORDER BY updated_at DESC");

        // Process each row, logging failures and converting to None
        const processRow = (row: PromptRow) =>
          Effect.gen(function* () {
            const parsed = yield* promptStorage.readPrompt(row.file_path);
            const tagRows = yield* sql.query<TagRow>(
              `SELECT t.name
               FROM tags t
               JOIN prompt_tags pt ON t.id = pt.tag_id
               WHERE pt.prompt_id = ?`,
              [row.id]
            );
            const tags = tagRows.map((t) => t.name);
            return rowToPrompt(row, parsed.content, tags);
          }).pipe(
            Effect.tapError((error) => logError("getAll", row.id, error)),
            Effect.option
          );

        // Process all rows and filter out failures (None values)
        const results = yield* Effect.all(rows.map(processRow));
        return results.filter(Option.isSome).map((opt) => opt.value);
      }),

      getById: (id: string) =>
        Effect.gen(function* () {
          // Query database
          const rows = yield* sql.query<PromptRow>("SELECT * FROM prompts WHERE id = ?", [id]);

          if (rows.length === 0) {
            return yield* Effect.fail(new PromptNotFoundError({ id }));
          }

          const row = rows[0];

          // Read file content
          const parsed = yield* promptStorage.readPrompt(row.file_path);

          // Get tags
          const tagRows = yield* sql.query<TagRow>(
            `SELECT t.name
             FROM tags t
             JOIN prompt_tags pt ON t.id = pt.tag_id
             WHERE pt.prompt_id = ?`,
            [id]
          );
          const tags = tagRows.map((t) => t.name);

          return rowToPrompt(row, parsed.content, tags);
        }),

      getByName: (name: string) =>
        Effect.gen(function* () {
          // Query database
          const rows = yield* sql.query<PromptRow>("SELECT * FROM prompts WHERE name = ?", [name]);

          if (rows.length === 0) {
            return yield* Effect.fail(new PromptNotFoundError({ id: `name:${name}` }));
          }

          const row = rows[0];

          // Read file content
          const parsed = yield* promptStorage.readPrompt(row.file_path);

          // Get tags
          const tagRows = yield* sql.query<TagRow>(
            `SELECT t.name
             FROM tags t
             JOIN prompt_tags pt ON t.id = pt.tag_id
             WHERE pt.prompt_id = ?`,
            [row.id]
          );
          const tags = tagRows.map((t) => t.name);

          return rowToPrompt(row, parsed.content, tags);
        }),

      create: (input: CreatePromptInput) =>
        Effect.gen(function* () {
          // Check if name already exists
          const existing = yield* sql.query<PromptRow>("SELECT id FROM prompts WHERE name = ?", [
            input.name,
          ]);

          if (existing.length > 0) {
            return yield* Effect.fail(new DuplicateNameError({ name: input.name }));
          }

          // Generate UUID
          const id = crypto.randomUUID();
          const now = new Date();

          // Build frontmatter - only include defined optional fields (YAML can't serialize undefined)
          const frontmatter: Frontmatter = {
            id,
            name: input.name,
            tags: input.tags ?? [],
            created: now,
            updated: now,
            version: 1,
            isTemplate: input.isTemplate ?? false,
            ...(input.isFavorite !== undefined && { isFavorite: input.isFavorite }),
            ...(input.favoriteOrder !== undefined && { favoriteOrder: input.favoriteOrder }),
            ...(input.isPinned !== undefined && { isPinned: input.isPinned }),
            ...(input.pinOrder !== undefined && { pinOrder: input.pinOrder }),
          };

          // Write markdown file
          const filePath = join(getPromptsDir(), `${id}.md`);
          yield* promptStorage.writePrompt(filePath, frontmatter, input.content);

          // Sync file to database (this handles both database insert and tags)
          yield* sync.syncFile(filePath);

          // Return the created prompt
          return {
            id,
            name: input.name,
            content: input.content,
            tags: input.tags,
            created: now,
            updated: now,
            version: 1,
            isTemplate: input.isTemplate ?? false,
            isFavorite: input.isFavorite,
            favoriteOrder: input.favoriteOrder,
            isPinned: input.isPinned,
            pinOrder: input.pinOrder,
            filePath,
          };
        }),

      update: (id: string, input: UpdatePromptInput) =>
        Effect.gen(function* () {
          // Find existing prompt
          const rows = yield* sql.query<PromptRow>("SELECT * FROM prompts WHERE id = ?", [id]);

          if (rows.length === 0) {
            return yield* Effect.fail(new PromptNotFoundError({ id }));
          }

          const row = rows[0];

          // Read current file
          const parsed = yield* promptStorage.readPrompt(row.file_path);

          // Get current tags if not updating them
          let currentTags = parsed.frontmatter.tags ?? [];
          if (!input.tags) {
            const tagRows = yield* sql.query<TagRow>(
              `SELECT t.name
               FROM tags t
               JOIN prompt_tags pt ON t.id = pt.tag_id
               WHERE pt.prompt_id = ?`,
              [id]
            );
            currentTags = tagRows.map((t) => t.name);
          }

          // Merge updates with existing data
          const now = new Date();
          const updatedFrontmatter = {
            ...parsed.frontmatter,
            name: input.name ?? parsed.frontmatter.name,
            tags: input.tags ?? currentTags,
            updated: now,
            version: (parsed.frontmatter.version ?? 1) + 1,
            isTemplate: input.isTemplate ?? parsed.frontmatter.isTemplate ?? false,
            isFavorite: input.isFavorite ?? parsed.frontmatter.isFavorite,
            favoriteOrder: input.favoriteOrder ?? parsed.frontmatter.favoriteOrder,
            isPinned: input.isPinned ?? parsed.frontmatter.isPinned,
            pinOrder: input.pinOrder ?? parsed.frontmatter.pinOrder,
          };

          const updatedContent = input.content ?? parsed.content;

          // Write updated file
          yield* promptStorage.writePrompt(row.file_path, updatedFrontmatter, updatedContent);

          // Sync file to database
          yield* sync.syncFile(row.file_path);

          // Return updated prompt
          return {
            id,
            name: updatedFrontmatter.name,
            content: updatedContent,
            tags: updatedFrontmatter.tags,
            created: parsed.frontmatter.created,
            updated: now,
            version: updatedFrontmatter.version,
            isTemplate: updatedFrontmatter.isTemplate,
            isFavorite: updatedFrontmatter.isFavorite,
            favoriteOrder: updatedFrontmatter.favoriteOrder,
            isPinned: updatedFrontmatter.isPinned,
            pinOrder: updatedFrontmatter.pinOrder,
            filePath: row.file_path,
          };
        }),

      delete: (id: string, hard = false) =>
        Effect.gen(function* () {
          // Find existing prompt
          const rows = yield* sql.query<PromptRow>("SELECT * FROM prompts WHERE id = ?", [id]);

          if (rows.length === 0) {
            return yield* Effect.fail(new PromptNotFoundError({ id }));
          }

          const row = rows[0];

          if (hard) {
            // Hard delete: remove file and database record
            yield* Effect.tryPromise({
              try: async () => {
                await Bun.file(row.file_path).writer().end();
                await Bun.file(row.file_path).unlink?.();
              },
              catch: (error) =>
                new StorageError({
                  message: `Failed to delete file: ${row.file_path}`,
                  cause: error,
                }),
            });

            // Remove from FTS index
            yield* sql.run("DELETE FROM prompts_fts WHERE prompt_id = ?", [id]);

            // Remove from database
            yield* sql.run("DELETE FROM prompts WHERE id = ?", [id]);
          } else {
            // Soft delete: move to archive
            yield* ensureArchiveDirectory();

            const archivePath = join(getArchiveDir(), `${id}.md`);

            yield* Effect.tryPromise({
              try: () => rename(row.file_path, archivePath),
              catch: (error) =>
                new StorageError({
                  message: `Failed to archive file: ${row.file_path}`,
                  cause: error,
                }),
            });

            // Remove from FTS index (archived prompts are not searchable)
            yield* sql.run("DELETE FROM prompts_fts WHERE prompt_id = ?", [id]);

            // Update database record to point to archive
            yield* sql.run("UPDATE prompts SET file_path = ? WHERE id = ?", [archivePath, id]);
          }
        }),

      findByTags: (tags: string[]) =>
        Effect.gen(function* () {
          if (tags.length === 0) {
            return [];
          }

          // Build query with placeholders for each tag
          const placeholders = tags.map(() => "?").join(",");
          const query = `
            SELECT DISTINCT p.*
            FROM prompts p
            JOIN prompt_tags pt ON p.id = pt.prompt_id
            JOIN tags t ON pt.tag_id = t.id
            WHERE t.name IN (${placeholders})
            ORDER BY p.updated_at DESC
          `;

          const rows = yield* sql.query<PromptRow>(query, tags);

          // Process each row, logging failures and converting to None
          const processRow = (row: PromptRow) =>
            Effect.gen(function* () {
              const parsed = yield* promptStorage.readPrompt(row.file_path);
              const tagRows = yield* sql.query<TagRow>(
                `SELECT t.name
                 FROM tags t
                 JOIN prompt_tags pt ON t.id = pt.tag_id
                 WHERE pt.prompt_id = ?`,
                [row.id]
              );
              const promptTags = tagRows.map((t) => t.name);
              return rowToPrompt(row, parsed.content, promptTags);
            }).pipe(
              Effect.tapError((error) => logError("findByTags", row.id, error)),
              Effect.option
            );

          // Process all rows and filter out failures (None values)
          const results = yield* Effect.all(rows.map(processRow));
          return results.filter(Option.isSome).map((opt) => opt.value);
        }),

      search: (query: string) =>
        Effect.gen(function* () {
          // Sanitize query to prevent FTS5 syntax errors
          const sanitized = sanitizeFtsQuery(query);
          if (!sanitized) {
            return [];
          }

          // Use FTS5 search on prompts_fts table
          const rows = yield* sql.query<PromptRow>(
            `SELECT p.*
             FROM prompts p
             JOIN prompts_fts fts ON p.id = fts.prompt_id
             WHERE prompts_fts MATCH ?
             ORDER BY bm25(prompts_fts)`,
            [sanitized]
          );

          // Process each row, logging failures and converting to None
          const processRow = (row: PromptRow) =>
            Effect.gen(function* () {
              const parsed = yield* promptStorage.readPrompt(row.file_path);
              const tagRows = yield* sql.query<TagRow>(
                `SELECT t.name
                 FROM tags t
                 JOIN prompt_tags pt ON t.id = pt.tag_id
                 WHERE pt.prompt_id = ?`,
                [row.id]
              );
              const tags = tagRows.map((t) => t.name);
              return rowToPrompt(row, parsed.content, tags);
            }).pipe(
              Effect.tapError((error) => logError("search", row.id, error)),
              Effect.option
            );

          // Process all rows and filter out failures (None values)
          const results = yield* Effect.all(rows.map(processRow));
          return results.filter(Option.isSome).map((opt) => opt.value);
        }),
    });
  })
);
