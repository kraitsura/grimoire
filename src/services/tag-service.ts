/**
 * Tag Service - Manages tag operations across database and file system
 *
 * Coordinates between SqlService (database) and PromptStorageService (file system)
 * to ensure tags are consistently stored in both locations.
 */

import { Context, Effect, Layer } from "effect";
import { SqlService } from "./sql-service";
import { PromptStorageService } from "./prompt-storage-service";
import type { Prompt } from "../models";
import { PromptNotFoundError, SqlError, StorageError } from "../models";

/**
 * Tag with usage count
 */
export interface TagWithCount {
  name: string;
  count: number;
}

/**
 * Database row structure for tags table
 */
interface TagRow {
  id: number;
  name: string;
}

/**
 * Database row structure for tag counts
 */
interface TagCountRow {
  name: string;
  count: number;
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
}

/**
 * Tag service interface - manages tag operations
 */
interface TagServiceImpl {
  /**
   * Add a tag to a prompt (updates both database and file)
   */
  readonly addTag: (
    promptId: string,
    tagName: string
  ) => Effect.Effect<void, PromptNotFoundError | SqlError | StorageError, never>;

  /**
   * Remove a tag from a prompt (updates both database and file)
   */
  readonly removeTag: (
    promptId: string,
    tagName: string
  ) => Effect.Effect<void, PromptNotFoundError | SqlError | StorageError, never>;

  /**
   * List all tags with their usage counts (sorted by count descending)
   */
  readonly listTags: () => Effect.Effect<TagWithCount[], SqlError, never>;

  /**
   * Rename a tag across all prompts (updates database and all affected files)
   * Returns the number of prompts affected
   */
  readonly renameTag: (
    oldName: string,
    newName: string
  ) => Effect.Effect<number, SqlError | StorageError, never>;

  /**
   * Get all prompts that have a specific tag
   */
  readonly getPromptsWithTag: (
    tagName: string
  ) => Effect.Effect<Prompt[], SqlError | StorageError, never>;

  /**
   * Merge one tag into another (moves all prompts from source to target)
   * Returns the number of prompts affected
   */
  readonly mergeTags: (
    source: string,
    target: string
  ) => Effect.Effect<number, SqlError | StorageError | PromptNotFoundError, never>;
}

/**
 * Tag service tag
 */
export class TagService extends Context.Tag("TagService")<
  TagService,
  TagServiceImpl
>() {}

/**
 * Tag service implementation
 */
export const TagServiceLive = Layer.effect(
  TagService,
  Effect.gen(function* () {
    // Get service dependencies
    const sql = yield* SqlService;
    const promptStorage = yield* PromptStorageService;

    /**
     * Get or create a tag by name (case-insensitive)
     * Returns the tag ID
     */
    const getOrCreateTag = (tagName: string): Effect.Effect<number, SqlError> =>
      Effect.gen(function* () {
        // Normalize tag name to lowercase for case-insensitive matching
        const normalizedName = tagName.toLowerCase();

        // Try to find existing tag
        const existing = yield* sql.query<TagRow>(
          "SELECT id FROM tags WHERE LOWER(name) = ?",
          [normalizedName]
        );

        if (existing.length > 0) {
          return existing[0].id;
        }

        // Create new tag
        yield* sql.run("INSERT INTO tags (name) VALUES (?)", [tagName]);

        // Get the ID of the newly created tag
        const created = yield* sql.query<TagRow>(
          "SELECT id FROM tags WHERE LOWER(name) = ?",
          [normalizedName]
        );

        return created[0].id;
      });

    /**
     * Update prompt file frontmatter with new tags
     */
    const updatePromptTags = (
      promptId: string,
      tags: string[]
    ): Effect.Effect<void, PromptNotFoundError | SqlError | StorageError> =>
      Effect.gen(function* () {
        // Get prompt file path from database
        const rows = yield* sql.query<PromptRow>(
          "SELECT * FROM prompts WHERE id = ?",
          [promptId]
        );

        if (rows.length === 0) {
          return yield* Effect.fail(new PromptNotFoundError({ id: promptId }));
        }

        const row = rows[0];

        // Read current file
        const parsed = yield* promptStorage.readPrompt(row.file_path);

        // Update frontmatter with new tags
        const updatedFrontmatter = {
          ...parsed.frontmatter,
          tags,
          updated: new Date(),
        };

        // Write updated file
        yield* promptStorage.writePrompt(
          row.file_path,
          updatedFrontmatter,
          parsed.content
        );
      });

    /**
     * Get all tags for a prompt from the database
     */
    const getPromptTags = (
      promptId: string
    ): Effect.Effect<string[], SqlError> =>
      Effect.gen(function* () {
        const tagRows = yield* sql.query<TagRow>(
          `SELECT t.name
           FROM tags t
           JOIN prompt_tags pt ON t.id = pt.tag_id
           WHERE pt.prompt_id = ?
           ORDER BY t.name`,
          [promptId]
        );

        return tagRows.map((t) => t.name);
      });

    return TagService.of({
      addTag: (promptId: string, tagName: string) =>
        Effect.gen(function* () {
          // Get or create the tag
          const tagId = yield* getOrCreateTag(tagName);

          // Add to junction table (ignore if already exists)
          yield* sql.run(
            "INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)",
            [promptId, tagId]
          );

          // Get updated tags list
          const tags = yield* getPromptTags(promptId);

          // Update the prompt file
          yield* updatePromptTags(promptId, tags);
        }),

      removeTag: (promptId: string, tagName: string) =>
        Effect.gen(function* () {
          // Normalize tag name for case-insensitive matching
          const normalizedName = tagName.toLowerCase();

          // Remove from junction table
          yield* sql.run(
            `DELETE FROM prompt_tags
             WHERE prompt_id = ?
             AND tag_id IN (SELECT id FROM tags WHERE LOWER(name) = ?)`,
            [promptId, normalizedName]
          );

          // Get updated tags list
          const tags = yield* getPromptTags(promptId);

          // Update the prompt file
          yield* updatePromptTags(promptId, tags);

          // Clean up unused tags
          yield* sql.run(
            `DELETE FROM tags
             WHERE id NOT IN (SELECT DISTINCT tag_id FROM prompt_tags)`
          );
        }),

      listTags: () =>
        Effect.gen(function* () {
          const rows = yield* sql.query<TagCountRow>(
            `SELECT t.name, COUNT(pt.prompt_id) as count
             FROM tags t
             LEFT JOIN prompt_tags pt ON t.id = pt.tag_id
             GROUP BY t.id, t.name
             ORDER BY count DESC, t.name ASC`
          );

          return rows;
        }),

      renameTag: (oldName: string, newName: string) =>
        Effect.gen(function* () {
          // Normalize names for case-insensitive matching
          const normalizedOld = oldName.toLowerCase();
          const normalizedNew = newName.toLowerCase();

          // If names are the same (case-insensitive), do nothing
          if (normalizedOld === normalizedNew) {
            return 0;
          }

          // Find all prompts with the old tag
          const promptRows = yield* sql.query<PromptRow>(
            `SELECT DISTINCT p.*
             FROM prompts p
             JOIN prompt_tags pt ON p.id = pt.prompt_id
             JOIN tags t ON pt.tag_id = t.id
             WHERE LOWER(t.name) = ?`,
            [normalizedOld]
          );

          // Use transaction for atomic rename
          yield* sql.transaction(
            Effect.gen(function* () {
              // Update the tag name in the database
              yield* sql.run("UPDATE tags SET name = ? WHERE LOWER(name) = ?", [
                newName,
                normalizedOld,
              ]);

              // Update all affected prompt files
              for (const row of promptRows) {
                // Read current file
                const parsed = yield* promptStorage.readPrompt(row.file_path);

                // Replace old tag with new tag in frontmatter
                const updatedTags = (parsed.frontmatter.tags ?? []).map((tag) =>
                  tag.toLowerCase() === normalizedOld ? newName : tag
                );

                // Update frontmatter
                const updatedFrontmatter = {
                  ...parsed.frontmatter,
                  tags: updatedTags,
                  updated: new Date(),
                };

                // Write updated file
                yield* promptStorage.writePrompt(
                  row.file_path,
                  updatedFrontmatter,
                  parsed.content
                );
              }
            })
          );

          return promptRows.length;
        }),

      getPromptsWithTag: (tagName: string) =>
        Effect.gen(function* () {
          // Normalize tag name for case-insensitive matching
          const normalizedName = tagName.toLowerCase();

          // Find all prompts with this tag
          const rows = yield* sql.query<PromptRow>(
            `SELECT p.*
             FROM prompts p
             JOIN prompt_tags pt ON p.id = pt.prompt_id
             JOIN tags t ON pt.tag_id = t.id
             WHERE LOWER(t.name) = ?
             ORDER BY p.updated_at DESC`,
            [normalizedName]
          );

          // Build prompts with content and tags
          const prompts: Prompt[] = [];
          for (const row of rows) {
            // Read file content
            const parsed = yield* promptStorage.readPrompt(row.file_path);

            // Get all tags for this prompt
            const tags = yield* getPromptTags(row.id);

            prompts.push({
              id: row.id,
              name: row.name,
              created: new Date(row.created_at),
              updated: new Date(row.updated_at),
              version: row.version,
              isTemplate: row.is_template === 1,
              content: parsed.content,
              filePath: row.file_path,
              tags,
            });
          }

          return prompts;
        }),

      mergeTags: (source: string, target: string) =>
        Effect.gen(function* () {
          // Normalize names for case-insensitive matching
          const normalizedSource = source.toLowerCase();
          const normalizedTarget = target.toLowerCase();

          // If names are the same, do nothing
          if (normalizedSource === normalizedTarget) {
            return 0;
          }

          // Get or create target tag
          const targetTagId = yield* getOrCreateTag(target);

          // Find all prompts with the source tag
          const promptRows = yield* sql.query<PromptRow>(
            `SELECT DISTINCT p.*
             FROM prompts p
             JOIN prompt_tags pt ON p.id = pt.prompt_id
             JOIN tags t ON pt.tag_id = t.id
             WHERE LOWER(t.name) = ?`,
            [normalizedSource]
          );

          // Use transaction for atomic merge
          yield* sql.transaction(
            Effect.gen(function* () {
              // For each prompt with source tag
              for (const row of promptRows) {
                // Add target tag to prompt (ignore if already exists)
                yield* sql.run(
                  "INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)",
                  [row.id, targetTagId]
                );

                // Remove source tag from prompt
                yield* sql.run(
                  `DELETE FROM prompt_tags
                   WHERE prompt_id = ?
                   AND tag_id IN (SELECT id FROM tags WHERE LOWER(name) = ?)`,
                  [row.id, normalizedSource]
                );

                // Update prompt file with new tags
                const tags = yield* getPromptTags(row.id);
                yield* updatePromptTags(row.id, tags);
              }

              // Clean up unused tags (removes source tag if no longer used)
              yield* sql.run(
                `DELETE FROM tags
                 WHERE id NOT IN (SELECT DISTINCT tag_id FROM prompt_tags)`
              );
            })
          );

          return promptRows.length;
        }),
    });
  })
);
