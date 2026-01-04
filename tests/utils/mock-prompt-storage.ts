/**
 * Mock PromptStorageService
 *
 * In-memory implementation of PromptStorageService for testing.
 * Uses the MockFs service to simulate file operations.
 */

import { Effect, Layer, Ref } from "effect";
import { PromptStorageService, type ParsedPrompt } from "../../src/services/prompt-storage-service";
import type { Frontmatter } from "../../src/models/prompt";
import { StorageError } from "../../src/models/errors";

/**
 * Internal state for the mock prompt storage
 */
interface MockPromptStorageState {
  files: Map<string, { frontmatter: Frontmatter; content: string }>;
  promptsDir: string;
  errors: Map<string, Error>; // Path -> Error to throw
}

/**
 * Create a mock PromptStorageService implementation
 */
export const createMockPromptStorage = (
  options: {
    promptsDir?: string;
    initialFiles?: Record<string, { frontmatter: Frontmatter; content: string }>;
  } = {}
): Effect.Effect<PromptStorageService["Type"], never, never> => {
  return Effect.gen(function* () {
    const stateRef = yield* Ref.make<MockPromptStorageState>({
      files: new Map(Object.entries(options.initialFiles ?? {})),
      promptsDir: options.promptsDir ?? "/mock/.grimoire/prompts",
      errors: new Map(),
    });

    const checkError = (path: string): Effect.Effect<void, StorageError> =>
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef);
        const error = state.errors.get(path);
        if (error) {
          return yield* Effect.fail(
            new StorageError({ message: error.message, cause: error })
          );
        }
      });

    return {
      readPrompt: (path: string): Effect.Effect<ParsedPrompt, StorageError> =>
        Effect.gen(function* () {
          yield* checkError(path);
          const state = yield* Ref.get(stateRef);
          const file = state.files.get(path);

          if (!file) {
            return yield* Effect.fail(
              new StorageError({ message: `Failed to read prompt file: ${path}` })
            );
          }

          return {
            frontmatter: file.frontmatter,
            content: file.content,
          };
        }),

      writePrompt: (
        path: string,
        frontmatter: Frontmatter,
        content: string
      ): Effect.Effect<void, StorageError> =>
        Effect.gen(function* () {
          yield* checkError(path);
          yield* Ref.update(stateRef, (state) => {
            state.files.set(path, { frontmatter, content });
            return state;
          });
        }),

      listPrompts: (): Effect.Effect<string[], StorageError> =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef);
          return Array.from(state.files.keys()).filter((path) =>
            path.endsWith(".md")
          );
        }),

      computeHash: (content: string): Effect.Effect<string> =>
        Effect.sync(() => {
          const hasher = new Bun.CryptoHasher("sha256");
          hasher.update(content);
          return hasher.digest("hex");
        }),
    };
  });
};

/**
 * Create a Layer for MockPromptStorageService
 */
export const MockPromptStorageLive: Layer.Layer<PromptStorageService> = Layer.effect(
  PromptStorageService,
  createMockPromptStorage()
);

/**
 * Create a mock prompt storage layer with pre-populated files
 */
export const mockPromptStorageWithFiles = (
  files: Record<string, { frontmatter: Frontmatter; content: string }>
): Layer.Layer<PromptStorageService> => {
  return Layer.effect(
    PromptStorageService,
    createMockPromptStorage({ initialFiles: files })
  );
};

/**
 * Helper to create a properly structured mock file entry
 */
export const createMockFile = (
  id: string,
  name: string,
  content: string,
  options: Partial<Frontmatter> = {}
): { frontmatter: Frontmatter; content: string } => {
  const now = new Date();
  return {
    frontmatter: {
      id,
      name,
      created: options.created ?? now,
      updated: options.updated ?? now,
      tags: options.tags,
      version: options.version ?? 1,
      isTemplate: options.isTemplate,
      isFavorite: options.isFavorite,
      favoriteOrder: options.favoriteOrder,
      isPinned: options.isPinned,
      pinOrder: options.pinOrder,
    },
    content,
  };
};
