/**
 * Command Argument Schemas
 *
 * Effect Schema definitions for validating CLI command arguments.
 * These schemas provide runtime validation at the CLI boundary,
 * ensuring commands receive properly typed and validated inputs.
 */

import { Schema } from "@effect/schema";

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/**
 * Prompt name - alphanumeric with dashes/underscores, 1-255 chars
 */
export const PromptNameSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(255),
  Schema.pattern(/^[\w\-. ]+$/, {
    message: () => "Name can only contain letters, numbers, spaces, dashes, underscores, and dots",
  })
);

/**
 * Prompt ID - UUID format
 */
export const PromptIdSchema = Schema.String.pipe(
  Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: () => "Invalid prompt ID format (expected UUID)",
  })
);

/**
 * Name or ID - accepts either format
 */
export const NameOrIdSchema = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255));

/**
 * Tag name - lowercase alphanumeric with dashes, 1-50 chars
 */
export const TagNameSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(50),
  Schema.pattern(/^[\w-]+$/, {
    message: () => "Tag can only contain letters, numbers, dashes, and underscores",
  })
);

/**
 * Array of tags
 */
export const TagsArraySchema = Schema.Array(TagNameSchema);

/**
 * Comma-separated tags string transformed to array
 */
export const TagsStringSchema = Schema.transform(Schema.String, TagsArraySchema, {
  decode: (s) =>
    s
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
  encode: (arr) => arr.join(","),
});

// ============================================================================
// LLM PARAMETER SCHEMAS
// ============================================================================

/**
 * Supported LLM providers
 */
export const LLMProviderSchema = Schema.Literal("openai", "anthropic", "google", "ollama");
export type LLMProvider = Schema.Schema.Type<typeof LLMProviderSchema>;

/**
 * Temperature - 0 to 2
 */
export const TemperatureSchema = Schema.Number.pipe(
  Schema.greaterThanOrEqualTo(0),
  Schema.lessThanOrEqualTo(2)
);

/**
 * Max tokens - 1 to 128000
 */
export const MaxTokensSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(1),
  Schema.lessThanOrEqualTo(128000)
);

/**
 * Model name - non-empty string
 */
export const ModelNameSchema = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100));

/**
 * Variables for prompt interpolation
 */
export const VariablesSchema = Schema.Record({
  key: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(50),
    Schema.pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
      message: () =>
        "Variable name must start with letter/underscore and contain only alphanumeric/underscore",
    })
  ),
  value: Schema.String,
});

// ============================================================================
// COMMAND-SPECIFIC SCHEMAS
// ============================================================================

/**
 * Unified prompt command arguments (replaces add/edit)
 */
export const PromptCommandArgsSchema = Schema.Struct({
  name: PromptNameSchema,
  content: Schema.optional(Schema.String),
  paste: Schema.optional(Schema.Boolean),
  tags: Schema.optional(TagsArraySchema),
  newName: Schema.optional(PromptNameSchema),
  addTags: Schema.optional(TagsArraySchema),
  removeTags: Schema.optional(TagsArraySchema),
  template: Schema.optional(Schema.Boolean),
});
export type PromptCommandArgs = Schema.Schema.Type<typeof PromptCommandArgsSchema>;

/**
 * Show command arguments
 */
export const ShowCommandArgsSchema = Schema.Struct({
  nameOrId: NameOrIdSchema,
  raw: Schema.optional(Schema.Boolean),
  json: Schema.optional(Schema.Boolean),
});
export type ShowCommandArgs = Schema.Schema.Type<typeof ShowCommandArgsSchema>;

/**
 * Copy command arguments
 */
export const CopyCommandArgsSchema = Schema.Struct({
  nameOrId: NameOrIdSchema,
  raw: Schema.optional(Schema.Boolean),
  variables: Schema.optional(VariablesSchema),
});
export type CopyCommandArgs = Schema.Schema.Type<typeof CopyCommandArgsSchema>;


/**
 * Test command arguments (LLM testing)
 */
export const TestCommandArgsSchema = Schema.Struct({
  promptName: NameOrIdSchema,
  model: Schema.optional(ModelNameSchema),
  temperature: Schema.optional(TemperatureSchema),
  maxTokens: Schema.optional(MaxTokensSchema),
  variables: Schema.optional(VariablesSchema),
  stream: Schema.optional(Schema.Boolean),
});
export type TestCommandArgs = Schema.Schema.Type<typeof TestCommandArgsSchema>;

/**
 * Search command arguments
 */
export const SearchCommandArgsSchema = Schema.Struct({
  query: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(500)),
  tags: Schema.optional(TagsArraySchema),
  from: Schema.optional(Schema.DateFromString),
  to: Schema.optional(Schema.DateFromString),
  limit: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(1000))
  ),
});
export type SearchCommandArgs = Schema.Schema.Type<typeof SearchCommandArgsSchema>;

/**
 * List command arguments
 */
export const ListCommandArgsSchema = Schema.Struct({
  tags: Schema.optional(TagsArraySchema),
  search: Schema.optional(Schema.String),
  sort: Schema.optional(Schema.Literal("name", "created", "updated")),
  limit: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(1000))
  ),
  favorites: Schema.optional(Schema.Boolean),
  pinned: Schema.optional(Schema.Boolean),
  templates: Schema.optional(Schema.Boolean),
});
export type ListCommandArgs = Schema.Schema.Type<typeof ListCommandArgsSchema>;

/**
 * Config command arguments
 */
export const ConfigCommandArgsSchema = Schema.Struct({
  subcommand: Schema.Literal("llm"),
  action: Schema.Literal("list", "add", "test", "remove"),
  provider: Schema.optional(LLMProviderSchema),
  model: Schema.optional(ModelNameSchema),
});
export type ConfigCommandArgs = Schema.Schema.Type<typeof ConfigCommandArgsSchema>;

/**
 * Import command arguments
 */
export const ImportCommandArgsSchema = Schema.Struct({
  source: Schema.String.pipe(Schema.minLength(1)),
  onConflict: Schema.optional(Schema.Literal("skip", "overwrite", "rename")),
  dryRun: Schema.optional(Schema.Boolean),
});
export type ImportCommandArgs = Schema.Schema.Type<typeof ImportCommandArgsSchema>;

/**
 * Export command arguments
 */
export const ExportCommandArgsSchema = Schema.Struct({
  format: Schema.optional(Schema.Literal("json", "yaml")),
  tags: Schema.optional(TagsArraySchema),
  output: Schema.optional(Schema.String),
  all: Schema.optional(Schema.Boolean),
});
export type ExportCommandArgs = Schema.Schema.Type<typeof ExportCommandArgsSchema>;

/**
 * Rm (delete) command arguments
 */
export const RmCommandArgsSchema = Schema.Struct({
  targets: Schema.Array(NameOrIdSchema).pipe(Schema.minItems(1)),
  force: Schema.optional(Schema.Boolean),
  yes: Schema.optional(Schema.Boolean),
});
export type RmCommandArgs = Schema.Schema.Type<typeof RmCommandArgsSchema>;

/**
 * History command arguments
 */
export const HistoryCommandArgsSchema = Schema.Struct({
  promptName: NameOrIdSchema,
  limit: Schema.optional(
    Schema.Number.pipe(
      Schema.int(),
      Schema.greaterThanOrEqualTo(1),
      Schema.lessThanOrEqualTo(10000)
    )
  ),
  all: Schema.optional(Schema.Boolean),
  diff: Schema.optional(Schema.Boolean),
  oneline: Schema.optional(Schema.Boolean),
});
export type HistoryCommandArgs = Schema.Schema.Type<typeof HistoryCommandArgsSchema>;

/**
 * Rollback command arguments
 */
export const RollbackCommandArgsSchema = Schema.Struct({
  promptName: NameOrIdSchema,
  version: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  reason: Schema.optional(Schema.String),
  preview: Schema.optional(Schema.Boolean),
  backup: Schema.optional(Schema.Boolean),
  force: Schema.optional(Schema.Boolean),
});
export type RollbackCommandArgs = Schema.Schema.Type<typeof RollbackCommandArgsSchema>;

// ============================================================================
// STASH COMMAND SCHEMAS
// ============================================================================

/**
 * Stash name - alphanumeric with dashes/underscores, 1-100 chars
 */
export const StashNameSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(100),
  Schema.pattern(/^[\w\-. ]+$/, {
    message: () => "Stash name can only contain letters, numbers, spaces, dashes, underscores, and dots",
  })
);

/**
 * Stash command arguments
 */
export const StashCommandArgsSchema = Schema.Struct({
  name: Schema.optional(StashNameSchema),
  list: Schema.optional(Schema.Boolean),
  clear: Schema.optional(Schema.Boolean),
});
export type StashCommandArgs = Schema.Schema.Type<typeof StashCommandArgsSchema>;

/**
 * Pop command arguments
 */
export const PopCommandArgsSchema = Schema.Struct({
  name: Schema.optional(StashNameSchema),
  peek: Schema.optional(Schema.Boolean),
  stdout: Schema.optional(Schema.Boolean),
});
export type PopCommandArgs = Schema.Schema.Type<typeof PopCommandArgsSchema>;
