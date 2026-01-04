#!/usr/bin/env bun

/**
 * Grimoire CLI - Entry Point
 * A CLI tool for storing, editing, and managing prompts with clipboard support.
 *
 * Uses @effect/cli for declarative, type-safe command definitions.
 */

// Fix UTF-8 encoding for Unicode symbols (must be first!)
if (process.stdout.setEncoding) {
  process.stdout.setEncoding("utf8");
}

import { Effect } from "effect";
import { join } from "path";
import { homedir } from "os";
import * as fs from "node:fs";

/**
 * Load environment variables from ~/.grimoire/.env
 * This runs synchronously at startup before any services initialize
 */
const loadGrimoireEnv = () => {
  try {
    const envPath = join(homedir(), ".grimoire", ".env");

    // Use sync fs to load before any async code runs
    if (!fs.existsSync(envPath)) return;

    const content = fs.readFileSync(envPath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        // Remove surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        // Only set if not already in environment (env vars take precedence)
        process.env[key] ??= value;
      }
    }
  } catch {
    // Silently ignore - .env file may not exist yet
  }
};

// Load .env file before anything else
loadGrimoireEnv();

// Import completion helpers (these bypass main CLI for speed)
import {
  listPromptNamesForCompletion,
  listWorktreeNamesForCompletion,
} from "./commands";

// Import Effect CLI
import { runCli } from "./cli/effect";

/**
 * Handle completion helper flags (hidden, for shell tab completion)
 * These must be fast and fail silently - bypass main CLI
 */
const handleCompletionHelpers = async (args: string[]): Promise<boolean> => {
  if (args.includes("--cmplt-prompts")) {
    await Effect.runPromise(listPromptNamesForCompletion).catch(() => {});
    return true;
  }

  if (args.includes("--cmplt-worktrees")) {
    await Effect.runPromise(listWorktreeNamesForCompletion).catch(() => {});
    return true;
  }

  return false;
};

/**
 * Main entry point
 */
const main = async () => {
  const args = process.argv.slice(2);

  // Fast path for completion helpers
  if (await handleCompletionHelpers(args)) {
    return;
  }

  // Run the Effect CLI
  await Effect.runPromise(
    runCli().pipe(
      Effect.catchAll((error: unknown) =>
        Effect.sync(() => {
          // Check if it's a validation error from @effect/cli (user error)
          if (error && typeof error === "object" && "_tag" in error) {
            const tag = (error as { _tag: string })._tag;
            // These are user errors, not system errors - already printed by @effect/cli
            if (tag === "ValidationError" || tag === "HelpDoc") {
              process.exit(1);
            }
          }
          console.error("Error:", error);
          process.exit(1);
        })
      )
    ) as Effect.Effect<void>
  ).catch((error: unknown) => {
    // Handle unhandled errors gracefully
    if (error && typeof error === "object") {
      const errorObj = error as Record<string, unknown>;
      // @effect/cli prints help/validation errors itself
      if (errorObj._tag === "ValidationError" || errorObj._tag === "HelpDoc") {
        process.exit(1);
      }
    }
    console.error("Fatal error:", error);
    process.exit(1);
  });
};

main();
