/**
 * File Watcher Service - Live sync for prompt files
 *
 * Monitors ~/.grimoire/prompts/ directory for changes and automatically
 * syncs modified files to the SQLite database using the SyncService.
 */

import { Context, Effect, Layer, Ref } from "effect";
import { watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { StorageError } from "../models";
import { SyncService } from "./sync-service";

/**
 * File watcher service interface - manages live sync
 */
interface FileWatcherServiceImpl {
  /**
   * Start watching the prompts directory for changes
   * @returns Effect that succeeds when watcher is started or fails with StorageError
   */
  readonly start: () => Effect.Effect<void, StorageError>;

  /**
   * Stop watching the prompts directory
   * @returns Effect that succeeds when watcher is stopped
   */
  readonly stop: () => Effect.Effect<void>;

  /**
   * Check if the watcher is currently running
   * @returns Effect that succeeds with boolean indicating running state
   */
  readonly isRunning: () => Effect.Effect<boolean>;
}

/**
 * File watcher service tag
 */
export class FileWatcherService extends Context.Tag("FileWatcherService")<
  FileWatcherService,
  FileWatcherServiceImpl
>() {}

/**
 * Get the prompts directory path in the user's home directory
 */
const getPromptsDir = (): string => {
  return join(homedir(), ".grimoire", "prompts");
};

/**
 * Debounce delay in milliseconds
 */
const DEBOUNCE_DELAY = 150;

/**
 * File watcher service implementation
 */
export const FileWatcherLive = Layer.effect(
  FileWatcherService,
  Effect.gen(function* () {
    // Get SyncService dependency
    const syncService = yield* SyncService;

    // Refs for mutable state
    const watcherRef = yield* Ref.make<FSWatcher | null>(null);
    const debouncersRef = yield* Ref.make<Map<string, NodeJS.Timeout>>(new Map());

    /**
     * Handle a file change event with debouncing
     */
    const handleFileChange = (
      filePath: string,
      eventType: "add" | "change" | "unlink"
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const debouncers = yield* Ref.get(debouncersRef);

        // Clear existing timeout for this file
        const existingTimeout = debouncers.get(filePath);
        if (existingTimeout !== undefined) {
          clearTimeout(existingTimeout);
        }

        // Set new timeout
        const timeout = setTimeout(() => {
          // Remove the timeout from the map
          Effect.runSync(
            Effect.gen(function* () {
              const currentDebouncers = yield* Ref.get(debouncersRef);
              currentDebouncers.delete(filePath);
              yield* Ref.set(debouncersRef, currentDebouncers);
            })
          );

          // Perform the sync operation
          const syncEffect =
            eventType === "unlink"
              ? // For deletions, do a full sync since syncFile doesn't handle deletions
                Effect.gen(function* () {
                  yield* syncService.fullSync();
                })
              : // For add/change, sync just this file
                syncService.syncFile(filePath);

          // Run the sync effect and handle errors gracefully
          Effect.runPromise(syncEffect).catch((error) => {
            console.error(
              `Failed to sync ${filePath}:`,
              error instanceof Error ? error.message : String(error)
            );
          });
        }, DEBOUNCE_DELAY);

        // Store the timeout
        debouncers.set(filePath, timeout);
        yield* Ref.set(debouncersRef, debouncers);
      });

    return FileWatcherService.of({
      start: () =>
        Effect.gen(function* () {
          // Check if already running
          const existingWatcher = yield* Ref.get(watcherRef);
          if (existingWatcher) {
            return; // Already watching
          }

          const promptsDir = getPromptsDir();

          // Create the watcher
          const watcher = yield* Effect.try({
            try: () =>
              watch(promptsDir, { recursive: true }, (eventType, filename) => {
                if (!filename?.endsWith(".md")) {
                  return; // Only watch .md files
                }

                const fullPath = join(promptsDir, filename);

                // Map fs.watch event types to our event types
                // 'rename' can mean add or delete, 'change' is modification
                // We'll treat 'rename' as both add and potentially unlink
                let changeType: "add" | "change" | "unlink";

                if (eventType === "change") {
                  changeType = "change";
                } else if (eventType === "rename") {
                  // For 'rename' events, we need to check if the file exists
                  // If it doesn't exist, it was deleted
                  // If it exists, it was added or renamed
                  // We'll use a simple heuristic: treat all renames as potential adds
                  // and let the sync service handle it
                  // Deletions will be caught by periodic full syncs or explicit checks
                  changeType = "add";
                } else {
                  return; // Unknown event type
                }

                // Handle the change asynchronously
                void Effect.runPromise(handleFileChange(fullPath, changeType));
              }),
            catch: (error) =>
              new StorageError({
                message: `Failed to start file watcher for ${promptsDir}`,
                cause: error,
              }),
          });

          // Handle watcher errors
          watcher.on("error", (error) => {
            console.error("File watcher error:", error);
          });

          // Store the watcher
          yield* Ref.set(watcherRef, watcher);
        }),

      stop: () =>
        Effect.gen(function* () {
          const watcher = yield* Ref.get(watcherRef);

          if (!watcher) {
            return; // Not running
          }

          // Clear all pending debounce timeouts
          const debouncers = yield* Ref.get(debouncersRef);
          for (const timeout of debouncers.values()) {
            clearTimeout(timeout);
          }
          yield* Ref.set(debouncersRef, new Map());

          // Close the watcher
          yield* Effect.sync(() => watcher.close());

          // Clear the watcher ref
          yield* Ref.set(watcherRef, null);
        }),

      isRunning: () =>
        Effect.gen(function* () {
          const watcher = yield* Ref.get(watcherRef);
          return watcher !== null;
        }),
    });
  })
);
