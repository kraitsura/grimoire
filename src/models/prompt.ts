/**
 * Prompt Domain Types
 */

import { Schema } from "@effect/schema";

/**
 * Schema for YAML frontmatter in markdown files
 *
 * Validates the metadata stored at the top of prompt markdown files.
 * All prompts must have an id, name, and timestamps.
 */
export const FrontmatterSchema = Schema.Struct({
  id: Schema.String, // UUID format
  name: Schema.String.pipe(Schema.minLength(1)),
  tags: Schema.optional(Schema.Array(Schema.String)),
  created: Schema.DateFromString,
  updated: Schema.DateFromString,
  version: Schema.optional(Schema.Number.pipe(Schema.int())),
  isTemplate: Schema.optional(Schema.Boolean),
  isFavorite: Schema.optional(Schema.Boolean),
  favoriteOrder: Schema.optional(Schema.Number),
  isPinned: Schema.optional(Schema.Boolean),
  pinOrder: Schema.optional(Schema.Number),
});

/**
 * Full prompt entity with content and file path
 *
 * Represents a complete prompt including its frontmatter metadata,
 * markdown content, and optional file system location.
 */
export const PromptSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String.pipe(Schema.minLength(1)),
  tags: Schema.optional(Schema.Array(Schema.String)),
  created: Schema.DateFromString,
  updated: Schema.DateFromString,
  version: Schema.optional(Schema.Number.pipe(Schema.int())),
  isTemplate: Schema.optional(Schema.Boolean),
  isFavorite: Schema.optional(Schema.Boolean),
  favoriteOrder: Schema.optional(Schema.Number),
  isPinned: Schema.optional(Schema.Boolean),
  pinOrder: Schema.optional(Schema.Number),
  content: Schema.String,
  filePath: Schema.optional(Schema.String),
});

/**
 * Frontmatter type derived from schema
 */
export type Frontmatter = Schema.Schema.Type<typeof FrontmatterSchema>;

/**
 * Prompt type derived from schema
 */
export type Prompt = Schema.Schema.Type<typeof PromptSchema>;

/**
 * Prompt identifier type
 */
export type PromptId = string;
