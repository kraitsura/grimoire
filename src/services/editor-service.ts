/**
 * Editor Service - Opens prompts in user's preferred text editor
 */

import { Context, Effect, Layer } from "effect";
import { mkdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { EditorError } from "../models";

/**
 * Editor service interface - manages external editor operations
 */
interface EditorServiceImpl {
  /**
   * Open content in the user's preferred text editor
   * @param content - Initial content to edit
   * @param filename - Optional filename hint for syntax highlighting
   * @returns Effect that succeeds with edited content or fails with EditorError
   */
  readonly open: (content: string, filename?: string) => Effect.Effect<string, EditorError>;

  /**
   * Get the editor command to use
   * @returns Effect that succeeds with editor command string
   */
  readonly getEditorCommand: Effect.Effect<string>;
}

/**
 * Editor service tag
 */
export class EditorService extends Context.Tag("EditorService")<
  EditorService,
  EditorServiceImpl
>() {}

/**
 * Get the temporary directory path for editor files
 */
const getTmpDir = (): string => {
  return join(homedir(), ".grimoire", "tmp");
};

/**
 * Ensure the temporary directory exists
 */
const ensureTmpDirectory = (): Effect.Effect<void, EditorError> =>
  Effect.tryPromise({
    try: async () => {
      const tmpDir = getTmpDir();
      await mkdir(tmpDir, { recursive: true });
    },
    catch: (error) =>
      new EditorError({
        message: "Failed to create temporary directory",
        cause: error,
      }),
  });

/**
 * Get the editor command based on environment variables and platform
 */
const getEditorCommand = (): string => {
  // Check $VISUAL first
  if (process.env.VISUAL) {
    return process.env.VISUAL;
  }

  // Then check $EDITOR
  if (process.env.EDITOR) {
    return process.env.EDITOR;
  }

  // Fallback by platform
  const currentPlatform = platform();
  if (currentPlatform === "win32") {
    return "notepad";
  }

  // macOS and Linux default to nano
  return "nano";
};

/**
 * Generate a unique temporary file path
 * @param filename - Optional filename hint to preserve extension
 */
const generateTempFilePath = (filename?: string): string => {
  const tmpDir = getTmpDir();
  const uuid = crypto.randomUUID();

  if (filename) {
    // Extract extension from filename
    const lastDot = filename.lastIndexOf(".");
    const extension = lastDot !== -1 ? filename.slice(lastDot) : "";
    return join(tmpDir, `${uuid}${extension}`);
  }

  return join(tmpDir, uuid);
};

/**
 * Editor service implementation
 */
export const EditorServiceLive = Layer.effect(
  EditorService,
  Effect.gen(function* () {
    // Ensure the temporary directory exists on initialization
    yield* ensureTmpDirectory();

    return EditorService.of({
      getEditorCommand: Effect.sync(() => getEditorCommand()),

      open: (content: string, filename?: string) =>
        Effect.gen(function* () {
          // Ensure tmp directory exists
          yield* ensureTmpDirectory();

          // Generate temp file path
          const tempFilePath = generateTempFilePath(filename);

          // Write initial content to temp file
          yield* Effect.tryPromise({
            try: async () => {
              await Bun.write(tempFilePath, content);
            },
            catch: (error) =>
              new EditorError({
                message: "Failed to write content to temporary file",
                cause: error,
              }),
          });

          // Get editor command
          const editorCommand = getEditorCommand();

          // Spawn editor process and wait for it to exit
          yield* Effect.tryPromise({
            try: async () => {
              const proc = Bun.spawn([editorCommand, tempFilePath], {
                stdio: ["inherit", "inherit", "inherit"],
              });
              await proc.exited;

              // Check exit code
              if (proc.exitCode !== 0) {
                throw new Error(`Editor exited with code ${proc.exitCode}`);
              }
            },
            catch: (error) =>
              new EditorError({
                message: `Failed to open editor: ${editorCommand}`,
                cause: error,
              }),
          });

          // Read modified content from temp file
          const modifiedContent = yield* Effect.tryPromise({
            try: async () => {
              const file = Bun.file(tempFilePath);
              return await file.text();
            },
            catch: (error) =>
              new EditorError({
                message: "Failed to read modified content from temporary file",
                cause: error,
              }),
          });

          // Clean up temp file (best effort - don't fail if cleanup fails)
          yield* Effect.tryPromise({
            try: async () => {
              const { unlink } = await import("node:fs/promises");
              await unlink(tempFilePath);
            },
            catch: (error) =>
              new EditorError({
                message: "Failed to clean up temporary file",
                cause: error,
              }),
          }).pipe(
            Effect.catchAll((error) => {
              // Log warning but don't fail - file cleanup is not critical
              console.warn(`Warning: Failed to clean up temporary file ${tempFilePath}:`, error);
              return Effect.succeed(undefined);
            })
          );

          return modifiedContent;
        }),
    });
  })
);
