/**
 * Export Service - Handles exporting prompts to JSON/YAML formats
 *
 * Provides functionality to export prompts individually or in bulk to
 * standardized export bundle formats for backup, sharing, or migration.
 */

import { Context, Effect, Layer } from "effect";
import { Schema } from "@effect/schema";
import * as yaml from "js-yaml";
import { writeFile } from "node:fs/promises";
import { StorageService } from "./storage-service";
import { StorageError, PromptNotFoundError, SqlError } from "../models";
import type { Prompt } from "../models";

/**
 * Version history entry schema
 */
export const VersionSchema = Schema.Struct({
  version: Schema.Number,
  content: Schema.String,
  timestamp: Schema.String,
  changes: Schema.optional(Schema.String),
});

/**
 * Version history entry type
 */
export type Version = Schema.Schema.Type<typeof VersionSchema>;

/**
 * Exported prompt schema with full metadata
 */
export const ExportedPromptSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  content: Schema.String,
  tags: Schema.Array(Schema.String),
  created: Schema.String,
  updated: Schema.String,
  version: Schema.optional(Schema.Number),
  isTemplate: Schema.optional(Schema.Boolean),
  history: Schema.optional(Schema.Array(VersionSchema)),
});

/**
 * Exported prompt type
 */
export type ExportedPrompt = Schema.Schema.Type<typeof ExportedPromptSchema>;

/**
 * Export bundle schema - container for exported prompts
 */
export const ExportBundleSchema = Schema.Struct({
  version: Schema.Literal("1.0"),
  exportedAt: Schema.String,
  source: Schema.String,
  prompts: Schema.Array(ExportedPromptSchema),
});

/**
 * Export bundle type
 */
export type ExportBundle = Schema.Schema.Type<typeof ExportBundleSchema>;

/**
 * Export format options
 */
export interface ExportOptions {
  format: "json" | "yaml";
  includeHistory?: boolean;
  prettyPrint?: boolean;
}

/**
 * Export service interface
 */
interface ExportServiceImpl {
  readonly exportAll: (options: ExportOptions) => Effect.Effect<string, StorageError | SqlError>;
  readonly exportByTags: (
    tags: string[],
    options: ExportOptions
  ) => Effect.Effect<string, StorageError | SqlError>;
  readonly exportByIds: (
    ids: string[],
    options: ExportOptions
  ) => Effect.Effect<string, StorageError | PromptNotFoundError | SqlError>;
  readonly writeToFile: (content: string, path: string) => Effect.Effect<void, StorageError>;
}

/**
 * Export service tag
 */
export class ExportService extends Context.Tag("ExportService")<
  ExportService,
  ExportServiceImpl
>() {}

/**
 * Convert a Prompt to ExportedPrompt format
 */
const promptToExported = (prompt: Prompt, includeHistory = false): ExportedPrompt => {
  // Include history if requested and available
  // Note: Currently we don't track history in the storage layer,
  // so this will be empty for now. Future versions can populate this.
  return {
    id: prompt.id,
    name: prompt.name,
    content: prompt.content,
    tags: prompt.tags ?? [],
    created: prompt.created.toISOString(),
    updated: prompt.updated.toISOString(),
    version: prompt.version,
    isTemplate: prompt.isTemplate,
    ...(includeHistory && { history: [] }),
  };
};

/**
 * Create an export bundle from prompts
 */
const createExportBundle = (prompts: Prompt[], includeHistory = false): ExportBundle => {
  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    source: "grimoire@0.1.0",
    prompts: prompts.map((p) => promptToExported(p, includeHistory)),
  };
};

/**
 * Serialize an export bundle to string format
 */
const serializeBundle = (
  bundle: ExportBundle,
  format: "json" | "yaml",
  prettyPrint = true
): Effect.Effect<string, StorageError> => {
  return Effect.try({
    try: () => {
      if (format === "json") {
        return prettyPrint ? JSON.stringify(bundle, null, 2) : JSON.stringify(bundle);
      } else {
        // YAML format
        return yaml.dump(bundle, {
          indent: prettyPrint ? 2 : 0,
          lineWidth: -1,
          noRefs: true,
          sortKeys: false,
        });
      }
    },
    catch: (error) =>
      new StorageError({
        message: `Failed to serialize export bundle to ${format}`,
        cause: error,
      }),
  });
};

/**
 * Export service implementation
 */
export const ExportServiceLive = Layer.effect(
  ExportService,
  Effect.gen(function* () {
    const storage = yield* StorageService;

    return ExportService.of({
      exportAll: (options: ExportOptions) =>
        Effect.gen(function* () {
          // Get all prompts from storage
          const prompts = yield* storage.getAll;

          // Create export bundle
          const bundle = createExportBundle(prompts, options.includeHistory ?? false);

          // Serialize to requested format
          const prettyPrint = options.prettyPrint ?? true;
          return yield* serializeBundle(bundle, options.format, prettyPrint);
        }),

      exportByTags: (tags: string[], options: ExportOptions) =>
        Effect.gen(function* () {
          // Find prompts matching tags
          const prompts = yield* storage.findByTags(tags);

          // Create export bundle
          const bundle = createExportBundle(prompts, options.includeHistory ?? false);

          // Serialize to requested format
          const prettyPrint = options.prettyPrint ?? true;
          return yield* serializeBundle(bundle, options.format, prettyPrint);
        }),

      exportByIds: (ids: string[], options: ExportOptions) =>
        Effect.gen(function* () {
          // Fetch each prompt by ID
          const prompts: Prompt[] = [];
          for (const id of ids) {
            const prompt = yield* storage.getById(id);
            prompts.push(prompt);
          }

          // Create export bundle
          const bundle = createExportBundle(prompts, options.includeHistory ?? false);

          // Serialize to requested format
          const prettyPrint = options.prettyPrint ?? true;
          return yield* serializeBundle(bundle, options.format, prettyPrint);
        }),

      writeToFile: (content: string, path: string) =>
        Effect.tryPromise({
          try: async () => {
            await writeFile(path, content, "utf-8");
          },
          catch: (error) =>
            new StorageError({
              message: `Failed to write export to file: ${path}`,
              cause: error,
            }),
        }),
    });
  })
);
