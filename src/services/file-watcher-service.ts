/**
 * File Watcher Service - Live sync for prompt files
 *
 * Monitors ~/.grimoire/prompts/ directory for changes and automatically
 * syncs modified files to the SQLite database using the SyncService.
 */

import { Context, Effect, Layer, Ref, Fiber, Queue, Duration } from "effect";
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
 * File change event for the processing queue
 */
interface FileChangeEvent {
  filePath: string;
  eventType: "add" | "change" | "unlink";
  timestamp: number;
}

/**
 * File watcher service implementation
 */
export const FileWatcherLive = Layer.effect(
  FileWatcherService,
  Effect.gen(function* () {
    // Get SyncService dependency
    const syncService = yield* SyncService;

    // Refs for mutable state managed by Effect
    const watcherRef = yield* Ref.make<FSWatcher | null>(null);
    const processorFiberRef = yield* Ref.make<Fiber.RuntimeFiber<void, never> | null>(null);

    // Queue for file change events
    const eventQueue = yield* Queue.unbounded<FileChangeEvent>();

    // Plain mutable map for last event timestamps (used from sync callbacks)
    // This is safe because it's only used for debouncing logic
    const lastEventTimestamps = new Map<string, number>();

    /**
     * Process a single file change event
     */
    const processSingleEvent = (event: FileChangeEvent): Effect.Effect<void, never> =>
      Effect.gen(function* () {
        // Check if this event is still the latest for this file (debounce check)
        const lastTimestamp = lastEventTimestamps.get(event.filePath);

        // Skip if a newer event exists for this file
        if (lastTimestamp !== undefined && lastTimestamp > event.timestamp) {
          return;
        }

        // Perform the sync operation
        const syncEffect =
          event.eventType === "unlink"
            ? // For deletions, do a full sync since syncFile doesn't handle deletions
              syncService.fullSync()
            : // For add/change, sync just this file
              syncService.syncFile(event.filePath);

        // Run the sync and handle errors
        yield* Effect.catchAll(syncEffect, (error) =>
          Effect.sync(() => {
            console.error(
              `Failed to sync ${event.filePath}:`,
              error instanceof Error ? error.message : String(error)
            );
          })
        );
      });

    /**
     * Event processor that runs in the background, processing events from the queue
     */
    const eventProcessor: Effect.Effect<void, never> = Effect.gen(function* () {
      while (true) {
        // Take an event from the queue
        const event = yield* Queue.take(eventQueue);

        // Wait for the debounce delay
        yield* Effect.sleep(Duration.millis(DEBOUNCE_DELAY));

        // Process the event
        yield* processSingleEvent(event);
      }
    });

    /**
     * Create a callback adapter that queues events synchronously.
     * The Queue.unsafeOffer is safe here because:
     * 1. Queue is unbounded, so it never blocks
     * 2. We're just adding to a queue, not running complex effects
     */
    const createWatcherCallback = (promptsDir: string) => {
      return (eventType: string, filename: string | null) => {
        if (!filename?.endsWith(".md")) {
          return; // Only watch .md files
        }

        const fullPath = join(promptsDir, filename);

        // Map fs.watch event types to our event types
        let changeType: "add" | "change" | "unlink";

        if (eventType === "change") {
          changeType = "change";
        } else if (eventType === "rename") {
          // For 'rename' events, treat as potential adds
          // Deletions will be caught by periodic full syncs
          changeType = "add";
        } else {
          return; // Unknown event type
        }

        const timestamp = Date.now();

        // Synchronously update the last event timestamp (plain mutable map)
        lastEventTimestamps.set(fullPath, timestamp);

        // Synchronously offer to the queue (safe for unbounded queues)
        Queue.unsafeOffer(eventQueue, { filePath: fullPath, eventType: changeType, timestamp });
      };
    };

    return FileWatcherService.of({
      start: () =>
        Effect.gen(function* () {
          // Check if already running
          const existingWatcher = yield* Ref.get(watcherRef);
          if (existingWatcher) {
            return; // Already watching
          }

          const promptsDir = getPromptsDir();

          // Fork the event processor before starting the watcher
          const processorFiber = yield* Effect.fork(eventProcessor);
          yield* Ref.set(processorFiberRef, processorFiber);

          // Create the watcher with the callback adapter
          const watcher = yield* Effect.try({
            try: () => watch(promptsDir, { recursive: true }, createWatcherCallback(promptsDir)),
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

          // Interrupt the event processor fiber
          const processorFiber = yield* Ref.get(processorFiberRef);
          if (processorFiber) {
            yield* Fiber.interrupt(processorFiber);
            yield* Ref.set(processorFiberRef, null);
          }

          // Shutdown the queue to clean up any remaining events
          yield* Queue.shutdown(eventQueue);

          // Clear the last event tracking (plain mutable map)
          lastEventTimestamps.clear();

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
