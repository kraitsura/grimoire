/**
 * Prompt Storage Service - Manages reading/writing prompts with gray-matter
 */

import { Context, Effect, Layer } from "effect";
import { Schema } from "@effect/schema";
import matter from "gray-matter";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import type { Frontmatter } from "../models";
import { FrontmatterSchema, StorageError } from "../models";

/**
 * Parsed prompt with separated frontmatter and content
 */
export interface ParsedPrompt {
  frontmatter: Frontmatter;
  content: string;
}

/**
 * Prompt storage service interface - manages prompt file operations
 */
interface PromptStorageServiceImpl {
  /**
   * Read and parse a prompt file
   * @param path - Path to the prompt file
   * @returns Effect that succeeds with ParsedPrompt or fails with StorageError
   */
  readonly readPrompt: (path: string) => Effect.Effect<ParsedPrompt, StorageError>;

  /**
   * Write a prompt file with frontmatter and content
   * @param path - Path to the prompt file
   * @param frontmatter - Frontmatter metadata
   * @param content - Prompt content
   * @returns Effect that succeeds with void or fails with StorageError
   */
  readonly writePrompt: (
    path: string,
    frontmatter: Frontmatter,
    content: string
  ) => Effect.Effect<void, StorageError>;

  /**
   * List all prompt files in the prompts directory
   * @returns Effect that succeeds with array of file paths or fails with StorageError
   */
  readonly listPrompts: () => Effect.Effect<string[], StorageError>;

  /**
   * Compute SHA256 hash of content
   * @param content - Content to hash
   * @returns Effect that succeeds with hash string
   */
  readonly computeHash: (content: string) => Effect.Effect<string>;
}

/**
 * Prompt storage service tag
 */
export class PromptStorageService extends Context.Tag("PromptStorageService")<
  PromptStorageService,
  PromptStorageServiceImpl
>() {}

/**
 * Get the prompts directory path in the user's home directory
 */
const getPromptsDir = (): string => {
  return join(homedir(), ".grimoire", "prompts");
};

/**
 * Ensure the prompts directory exists
 */
const ensurePromptsDirectory = (): Effect.Effect<void, StorageError> =>
  Effect.tryPromise({
    try: async () => {
      const promptsDir = getPromptsDir();
      await mkdir(promptsDir, { recursive: true });
    },
    catch: (error) =>
      new StorageError({
        message: "Failed to create prompts directory",
        cause: error,
      }),
  });

/**
 * Prompt storage service implementation
 */
export const PromptStorageLive = Layer.effect(
  PromptStorageService,
  Effect.gen(function* () {
    // Ensure the prompts directory exists
    yield* ensurePromptsDirectory();

    return PromptStorageService.of({
      readPrompt: (path: string) =>
        Effect.gen(function* () {
          // Read the file
          const file = Bun.file(path);
          const fileContent = yield* Effect.tryPromise({
            try: () => file.text(),
            catch: (error) =>
              new StorageError({
                message: `Failed to read prompt file: ${path}`,
                cause: error,
              }),
          });

          // Parse frontmatter
          const parsed = matter(fileContent);

          // Validate frontmatter against schema
          const frontmatter = yield* Schema.decodeUnknown(FrontmatterSchema)(parsed.data).pipe(
            Effect.mapError(
              (error) =>
                new StorageError({
                  message: `Invalid frontmatter in ${path}`,
                  cause: error,
                })
            )
          );

          return {
            frontmatter,
            content: parsed.content.trim(),
          };
        }),

      writePrompt: (path: string, frontmatter: Frontmatter, content: string) =>
        Effect.gen(function* () {
          // Ensure directory exists
          yield* ensurePromptsDirectory();

          // Convert frontmatter dates to ISO strings for YAML
          const yamlFrontmatter = {
            ...frontmatter,
            created: frontmatter.created.toISOString(),
            updated: frontmatter.updated.toISOString(),
          };

          // Create markdown with frontmatter
          const markdown = matter.stringify(content, yamlFrontmatter);

          // Write to file
          yield* Effect.tryPromise({
            try: async () => {
              await Bun.write(path, markdown);
            },
            catch: (error) =>
              new StorageError({
                message: `Failed to write prompt file: ${path}`,
                cause: error,
              }),
          });
        }),

      listPrompts: () =>
        Effect.gen(function* () {
          const promptsDir = getPromptsDir();

          // Read directory
          const files = yield* Effect.tryPromise({
            try: () => readdir(promptsDir),
            catch: (error) =>
              new StorageError({
                message: "Failed to list prompts directory",
                cause: error,
              }),
          });

          // Filter for markdown files and return full paths
          const promptFiles = files
            .filter((file) => file.endsWith(".md"))
            .map((file) => join(promptsDir, file));

          return promptFiles;
        }),

      computeHash: (content: string) =>
        Effect.sync(() => {
          const hasher = new Bun.CryptoHasher("sha256");
          hasher.update(content);
          return hasher.digest("hex");
        }),
    });
  })
);
