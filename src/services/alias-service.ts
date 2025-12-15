/**
 * AliasService - Manages command shortcuts/aliases
 *
 * Allows users to create shortcuts for frequently used commands.
 * Aliases are stored in ~/.grimoire/aliases.json
 */

import { Effect, Context, Layer } from "effect";
import { Schema } from "@effect/schema";
import { Data } from "effect";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

/**
 * Error for alias not found
 */
export class AliasNotFoundError extends Data.TaggedError("AliasNotFoundError")<{
  name: string;
}> {}

/**
 * Error for alias operations (storage, validation, etc.)
 */
export class AliasError extends Data.TaggedError("AliasError")<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Error for circular alias dependencies
 */
export class CircularAliasError extends Data.TaggedError("CircularAliasError")<{
  message: string;
  chain: string[];
}> {}

/**
 * Alias model
 */
export interface Alias {
  name: string;
  command: string;
  args: string[];
  description?: string;
}

/**
 * Alias schema for validation
 */
export const AliasSchema = Schema.Struct({
  name: Schema.String,
  command: Schema.String,
  args: Schema.Array(Schema.String),
  description: Schema.optional(Schema.String),
});

/**
 * Storage format for aliases file
 */
export const AliasStorageSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Struct({
    command: Schema.String,
    args: Schema.Array(Schema.String),
    description: Schema.optional(Schema.String),
  }),
});

/**
 * Alias service interface
 */
export interface AliasServiceImpl {
  /**
   * Create a new alias
   */
  readonly createAlias: (
    name: string,
    command: string,
    args: string[],
    description?: string
  ) => Effect.Effect<Alias, AliasError>;

  /**
   * Remove an alias by name
   */
  readonly removeAlias: (name: string) => Effect.Effect<void, AliasNotFoundError | AliasError>;

  /**
   * List all aliases
   */
  readonly listAliases: () => Effect.Effect<Alias[], AliasError>;

  /**
   * Resolve an alias (expand it to the full command)
   * Handles nested aliases with depth limiting
   */
  readonly resolveAlias: (input: string[]) => Effect.Effect<string[], CircularAliasError | AliasError>;

  /**
   * Get a single alias by name
   */
  readonly getAlias: (name: string) => Effect.Effect<Alias, AliasNotFoundError | AliasError>;
}

/**
 * Alias service tag
 */
export class AliasService extends Context.Tag("AliasService")<
  AliasService,
  AliasServiceImpl
>() {}

/**
 * Get path to aliases.json file
 */
const getAliasesPath = (): string => {
  return join(homedir(), ".grimoire", "aliases.json");
};

/**
 * Built-in aliases that are always available
 */
const BUILTIN_ALIASES: Record<string, { command: string; args: string[]; description?: string }> = {
  ls: { command: "list", args: [], description: "List all prompts" },
  rm: { command: "remove", args: [], description: "Remove a prompt" },
  cp: { command: "copy", args: [], description: "Copy a prompt" },
};

/**
 * Maximum depth for alias resolution to prevent infinite loops
 */
const MAX_RESOLUTION_DEPTH = 5;

/**
 * Alias service implementation
 */
export const AliasServiceLive = Layer.effect(
  AliasService,
  Effect.gen(function* () {
    /**
     * Load aliases from file
     * Creates the file with built-in aliases if it doesn't exist
     */
    const loadAliases = (): Effect.Effect<
      Record<string, { command: string; args: string[]; description?: string }>,
      AliasError
    > =>
      Effect.gen(function* () {
        const aliasesPath = getAliasesPath();

        // If file doesn't exist, create it with built-in aliases
        if (!existsSync(aliasesPath)) {
          yield* saveAliases(BUILTIN_ALIASES);
          return BUILTIN_ALIASES;
        }

        // Read and parse file
        return yield* Effect.tryPromise({
          try: async () => {
            const file = Bun.file(aliasesPath);
            const text = await file.text();

            if (!text.trim()) {
              return BUILTIN_ALIASES;
            }

            const parsed = JSON.parse(text);
            return { ...BUILTIN_ALIASES, ...parsed };
          },
          catch: (error) =>
            new AliasError({
              message: `Failed to load aliases: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    /**
     * Save aliases to file
     */
    const saveAliases = (
      aliases: Record<string, { command: string; args: string[]; description?: string }>
    ): Effect.Effect<void, AliasError> =>
      Effect.gen(function* () {
        const aliasesPath = getAliasesPath();

        // Filter out built-in aliases before saving (they're always available)
        const customAliases: Record<string, { command: string; args: string[]; description?: string }> = {};
        for (const [name, alias] of Object.entries(aliases)) {
          if (!(name in BUILTIN_ALIASES)) {
            customAliases[name] = alias;
          }
        }

        yield* Effect.tryPromise({
          try: async () => {
            await Bun.write(aliasesPath, JSON.stringify(customAliases, null, 2));
          },
          catch: (error) =>
            new AliasError({
              message: `Failed to save aliases: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      });

    return AliasService.of({
      createAlias: (name: string, command: string, args: string[], description?: string) =>
        Effect.gen(function* () {
          const aliases = yield* loadAliases();

          // Add new alias
          aliases[name] = { command, args, description };

          // Save to file
          yield* saveAliases(aliases);

          return { name, command, args, description };
        }),

      removeAlias: (name: string) =>
        Effect.gen(function* () {
          // Cannot remove built-in aliases
          if (name in BUILTIN_ALIASES) {
            return yield* Effect.fail(
              new AliasError({
                message: `Cannot remove built-in alias: ${name}`,
              })
            );
          }

          const aliases = yield* loadAliases();

          if (!(name in aliases)) {
            return yield* Effect.fail(new AliasNotFoundError({ name }));
          }

          // Remove alias
          delete aliases[name];

          // Save to file
          yield* saveAliases(aliases);
        }),

      listAliases: () =>
        Effect.gen(function* () {
          const aliases = yield* loadAliases();

          // Convert to array of Alias objects
          return Object.entries(aliases).map(([name, { command, args, description }]) => ({
            name,
            command,
            args,
            description,
          }));
        }),

      resolveAlias: (input: string[]) =>
        Effect.gen(function* () {
          if (input.length === 0) {
            return input;
          }

          const aliases = yield* loadAliases();
          const firstArg = input[0];

          // Track resolution chain to detect circular dependencies
          const resolutionChain: string[] = [firstArg];
          let current = input;
          let depth = 0;

          // Resolve nested aliases
          while (depth < MAX_RESOLUTION_DEPTH) {
            const cmd = current[0];
            const alias = aliases[cmd];

            if (!alias) {
              // No more aliases to resolve
              break;
            }

            // Check for circular dependency
            if (resolutionChain.includes(alias.command)) {
              return yield* Effect.fail(
                new CircularAliasError({
                  message: `Circular alias dependency detected: ${resolutionChain.join(" -> ")} -> ${alias.command}`,
                  chain: [...resolutionChain, alias.command],
                })
              );
            }

            resolutionChain.push(alias.command);

            // Expand alias: replace first arg with command + args, then append remaining args
            current = [...alias.command.split(" "), ...alias.args, ...current.slice(1)];
            depth++;
          }

          if (depth >= MAX_RESOLUTION_DEPTH) {
            return yield* Effect.fail(
              new CircularAliasError({
                message: `Maximum alias resolution depth (${MAX_RESOLUTION_DEPTH}) exceeded. Possible circular dependency: ${resolutionChain.join(" -> ")}`,
                chain: resolutionChain,
              })
            );
          }

          return current;
        }),

      getAlias: (name: string) =>
        Effect.gen(function* () {
          const aliases = yield* loadAliases();
          const alias = aliases[name];

          if (!alias) {
            return yield* Effect.fail(new AliasNotFoundError({ name }));
          }

          return {
            name,
            command: alias.command,
            args: alias.args,
            description: alias.description,
          };
        }),
    });
  })
);
