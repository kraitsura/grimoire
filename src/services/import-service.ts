/**
 * Import Service - Import prompts from external sources
 *
 * Handles importing prompts from JSON/YAML files or URLs with conflict detection
 * and resolution strategies.
 */

import { Context, Effect, Layer } from "effect";
import { Schema } from "@effect/schema";
import * as yaml from "js-yaml";
import { StorageService, type CreatePromptInput } from "./storage-service";
import {
  StorageError,
  ValidationError,
  SqlError,
  DuplicateNameError,
  PromptNotFoundError,
} from "../models";
import type { Prompt } from "../models";

/**
 * Conflict resolution strategies
 */
export type ConflictStrategy = "skip" | "rename" | "overwrite";

/**
 * Information about a conflicting prompt
 */
export interface ConflictInfo {
  name: string;
  existingId: string;
  incomingId: string;
  contentDiffers: boolean;
}

/**
 * Preview of what will be imported
 */
export interface ImportPreview {
  total: number;
  newPrompts: number;
  conflicts: ConflictInfo[];
  errors: string[];
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  imported: number;
  skipped: number;
  renamed: number;
  overwritten: number;
  errors: string[];
}

/**
 * Schema for an exported prompt
 */
const ExportedPromptSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String.pipe(Schema.minLength(1)),
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
  created: Schema.String,
  updated: Schema.String,
  version: Schema.optional(Schema.Number.pipe(Schema.int())),
  isTemplate: Schema.optional(Schema.Boolean),
});

/**
 * Schema for the export bundle format
 */
const ExportBundleSchema = Schema.Struct({
  version: Schema.Literal("1.0"),
  exportedAt: Schema.String,
  prompts: Schema.Array(ExportedPromptSchema),
});

export type ExportBundle = Schema.Schema.Type<typeof ExportBundleSchema>;
type ExportedPrompt = Schema.Schema.Type<typeof ExportedPromptSchema>;

/**
 * Import service interface
 */
interface ImportServiceImpl {
  readonly preview: (
    source: string
  ) => Effect.Effect<
    ImportPreview,
    ValidationError | StorageError | SqlError,
    never
  >;
  readonly import: (
    source: string,
    strategy: ConflictStrategy
  ) => Effect.Effect<
    ImportResult,
    | ValidationError
    | StorageError
    | SqlError
    | DuplicateNameError
    | PromptNotFoundError,
    never
  >;
  readonly validate: (
    data: unknown
  ) => Effect.Effect<ExportBundle, ValidationError, never>;
}

/**
 * Import service tag
 */
export class ImportService extends Context.Tag("ImportService")<
  ImportService,
  ImportServiceImpl
>() {}

/**
 * Load data from a source (file path or URL)
 */
const loadSource = (source: string): Effect.Effect<string, StorageError> =>
  Effect.gen(function* () {
    // Check if source is a URL
    const isUrl = source.startsWith("http://") || source.startsWith("https://");

    if (isUrl) {
      // Fetch from URL
      return yield* Effect.tryPromise({
        try: async () => {
          const response = await fetch(source);
          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status}: ${response.statusText}`
            );
          }
          return await response.text();
        },
        catch: (error) =>
          new StorageError({
            message: `Failed to fetch from URL: ${source}`,
            cause: error,
          }),
      });
    } else {
      // Read from local file
      return yield* Effect.tryPromise({
        try: async () => {
          const file = Bun.file(source);
          if (!(await file.exists())) {
            throw new Error(`File not found: ${source}`);
          }
          return await file.text();
        },
        catch: (error) =>
          new StorageError({
            message: `Failed to read file: ${source}`,
            cause: error,
          }),
      });
    }
  });

/**
 * Parse data from JSON or YAML format
 */
const parseData = (content: string): Effect.Effect<unknown, ValidationError> =>
  Effect.gen(function* () {
    // Try JSON first
    try {
      return JSON.parse(content);
    } catch (jsonError) {
      // If JSON fails, try YAML
      try {
        return yaml.load(content);
      } catch (yamlError) {
        return yield* Effect.fail(
          new ValidationError({
            field: "content",
            message: "Invalid JSON or YAML format",
          })
        );
      }
    }
  });

/**
 * Validate parsed data against ExportBundle schema
 */
const validateBundle = (
  data: unknown
): Effect.Effect<ExportBundle, ValidationError> =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknown(ExportBundleSchema)(data).pipe(
      Effect.mapError(
        (error) =>
          new ValidationError({
            field: "bundle",
            message: `Invalid export bundle format: ${error}`,
          })
      )
    );
    return decoded;
  });

/**
 * Detect conflicts between incoming and existing prompts
 */
const detectConflicts = (
  incomingPrompts: ExportedPrompt[],
  existingPrompts: Prompt[]
): ConflictInfo[] => {
  const conflicts: ConflictInfo[] = [];

  // Create lookup maps for existing prompts
  const byId = new Map(existingPrompts.map((p) => [p.id, p]));
  const byNameLower = new Map(
    existingPrompts.map((p) => [p.name.toLowerCase(), p])
  );

  for (const incoming of incomingPrompts) {
    // Check for ID conflict
    const existingById = byId.get(incoming.id);
    if (existingById) {
      conflicts.push({
        name: incoming.name,
        existingId: existingById.id,
        incomingId: incoming.id,
        contentDiffers: existingById.content !== incoming.content,
      });
      continue;
    }

    // Check for name conflict (case-insensitive)
    const existingByName = byNameLower.get(incoming.name.toLowerCase());
    if (existingByName) {
      conflicts.push({
        name: incoming.name,
        existingId: existingByName.id,
        incomingId: incoming.id,
        contentDiffers: existingByName.content !== incoming.content,
      });
    }
  }

  return conflicts;
};

/**
 * Generate a unique name by appending a number
 */
const generateUniqueName = (
  baseName: string,
  existingNames: Set<string>
): string => {
  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let counter = 1;
  let newName = `${baseName} (${counter})`;

  while (existingNames.has(newName.toLowerCase())) {
    counter++;
    newName = `${baseName} (${counter})`;
  }

  return newName;
};

/**
 * Import service implementation
 */
export const ImportServiceLive = Layer.effect(
  ImportService,
  Effect.gen(function* () {
    const storage = yield* StorageService;

    return ImportService.of({
      validate: validateBundle,

      preview: (source: string) =>
        Effect.gen(function* () {
          // Load and parse the source
          const content = yield* loadSource(source);
          const data = yield* parseData(content);
          const bundle = yield* validateBundle(data);

          // Get existing prompts
          const existingPrompts = yield* storage.getAll;

          // Detect conflicts
          const conflicts = detectConflicts([...bundle.prompts], existingPrompts);

          // Calculate preview stats
          const total = bundle.prompts.length;
          const newPrompts = total - conflicts.length;

          return {
            total,
            newPrompts,
            conflicts,
            errors: [],
          };
        }),

      import: (source: string, strategy: ConflictStrategy) =>
        Effect.gen(function* () {
          // Load and parse the source
          const content = yield* loadSource(source);
          const data = yield* parseData(content);
          const bundle = yield* validateBundle(data);

          // Get existing prompts
          const existingPrompts = yield* storage.getAll;

          // Create lookup maps
          const existingById = new Map(existingPrompts.map((p) => [p.id, p]));
          const existingByNameLower = new Map(
            existingPrompts.map((p) => [p.name.toLowerCase(), p])
          );
          const existingNamesLower = new Set(
            existingPrompts.map((p) => p.name.toLowerCase())
          );

          // Track results
          let imported = 0;
          let skipped = 0;
          let renamed = 0;
          let overwritten = 0;
          const errors: string[] = [];

          // Process each incoming prompt
          for (const incoming of bundle.prompts) {
            try {
              // Check for conflicts
              const hasIdConflict = existingById.has(incoming.id);
              const hasNameConflict = existingByNameLower.has(
                incoming.name.toLowerCase()
              );

              if (hasIdConflict || hasNameConflict) {
                // Handle conflict based on strategy
                if (strategy === "skip") {
                  skipped++;
                  continue;
                } else if (strategy === "rename") {
                  // Generate unique name
                  const uniqueName = generateUniqueName(
                    incoming.name,
                    existingNamesLower
                  );

                  // Create with new name and new ID to avoid ID conflicts
                  const input: CreatePromptInput = {
                    name: uniqueName,
                    content: incoming.content,
                    tags: incoming.tags ? [...incoming.tags] : undefined,
                    isTemplate: incoming.isTemplate ?? false,
                  };

                  yield* storage.create(input);
                  existingNamesLower.add(uniqueName.toLowerCase());
                  renamed++;
                  imported++;
                } else if (strategy === "overwrite") {
                  // Find the existing prompt to update
                  const existing =
                    existingById.get(incoming.id) ||
                    existingByNameLower.get(incoming.name.toLowerCase());

                  if (existing) {
                    yield* storage.update(existing.id, {
                      name: incoming.name,
                      content: incoming.content,
                      tags: incoming.tags ? [...incoming.tags] : undefined,
                      isTemplate: incoming.isTemplate,
                    });
                    overwritten++;
                    imported++;
                  }
                }
              } else {
                // No conflict - create new prompt
                // Generate new ID to avoid potential ID collisions
                const input: CreatePromptInput = {
                  name: incoming.name,
                  content: incoming.content,
                  tags: incoming.tags ? [...incoming.tags] : undefined,
                  isTemplate: incoming.isTemplate ?? false,
                };

                yield* storage.create(input);
                existingNamesLower.add(incoming.name.toLowerCase());
                imported++;
              }
            } catch (error) {
              errors.push(
                `Failed to import "${incoming.name}": ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }

          return {
            imported,
            skipped,
            renamed,
            overwritten,
            errors,
          };
        }),
    });
  })
);
