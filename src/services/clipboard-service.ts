/**
 * ClipboardService - Platform-specific clipboard operations
 *
 * Supports macOS (pbcopy/pbpaste), Linux (xclip), and Windows (clip/powershell)
 */

import { Effect, Context, Layer } from "effect";
import { ClipboardError } from "../models/errors";

/**
 * Platform-specific clipboard commands
 */
interface ClipboardCommands {
  copy: string[];
  paste: string[];
}

/**
 * Get clipboard commands for the current platform
 */
const getClipboardCommands = (): ClipboardCommands | null => {
  switch (process.platform) {
    case "darwin":
      return {
        copy: ["pbcopy"],
        paste: ["pbpaste"],
      };
    case "linux":
      return {
        copy: ["xclip", "-selection", "clipboard"],
        paste: ["xclip", "-selection", "clipboard", "-o"],
      };
    case "win32":
      return {
        copy: ["clip"],
        paste: ["powershell", "-command", "Get-Clipboard"],
      };
    default:
      return null;
  }
};

/**
 * Clipboard service interface
 */
export interface ClipboardService {
  /**
   * Copy text to system clipboard
   */
  readonly copy: (text: string) => Effect.Effect<void, ClipboardError>;

  /**
   * Read text from system clipboard
   */
  readonly paste: Effect.Effect<string, ClipboardError>;
}

/**
 * Clipboard service tag
 */
export class Clipboard extends Context.Tag("Clipboard")<
  Clipboard,
  ClipboardService
>() {}

/**
 * Clipboard service implementation
 */
export const ClipboardLive = Layer.succeed(
  Clipboard,
  Clipboard.of({
    copy: (text: string) =>
      Effect.gen(function* () {
        const commands = getClipboardCommands();

        if (!commands) {
          return yield* Effect.fail(
            new ClipboardError({
              message: `Unsupported platform: ${process.platform}`,
            })
          );
        }

        yield* Effect.tryPromise({
          try: async () => {
            const proc = Bun.spawn(commands.copy, {
              stdin: "pipe",
              stdout: "pipe",
              stderr: "pipe",
            });

            // Write text to stdin using the writer
            proc.stdin.write(text);
            proc.stdin.end();

            // Wait for process to complete
            const exitCode = await proc.exited;

            if (exitCode !== 0) {
              const stderr = await new Response(proc.stderr).text();
              throw new Error(`Clipboard command failed: ${stderr}`);
            }
          },
          catch: (error) =>
            new ClipboardError({
              message: `Failed to copy to clipboard: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        });
      }),

    paste: Effect.gen(function* () {
      const commands = getClipboardCommands();

      if (!commands) {
        return yield* Effect.fail(
          new ClipboardError({
            message: `Unsupported platform: ${process.platform}`,
          })
        );
      }

      return yield* Effect.tryPromise({
        try: async () => {
          const proc = Bun.spawn(commands.paste, {
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
          });

          // Wait for process to complete
          const exitCode = await proc.exited;

          if (exitCode !== 0) {
            const stderr = await new Response(proc.stderr).text();
            throw new Error(`Clipboard command failed: ${stderr}`);
          }

          // Read stdout
          const output = await new Response(proc.stdout).text();
          return output;
        },
        catch: (error) =>
          new ClipboardError({
            message: `Failed to read from clipboard: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });
    }),
  })
);
