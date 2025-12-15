/**
 * Retention Service Example
 *
 * Demonstrates how to use the RetentionService for managing version cleanup
 */

import { Effect, Layer } from "effect";
import {
  RetentionService,
  RetentionServiceLive,
  StorageService,
  StorageServiceLive,
  VersionService,
  VersionServiceLive,
  SqlService,
  SqlLive,
  PromptStorageService,
  PromptStorageLive,
  SyncService,
  SyncLive,
  type RetentionConfig,
} from "../src/services";

/**
 * Example: Get current retention configuration
 */
const getConfigExample = Effect.gen(function* () {
  const retention = yield* RetentionService;
  const config = yield* retention.getConfig();

  console.log("Current retention configuration:");
  console.log(`  Strategy: ${config.strategy}`);
  console.log(`  Max versions per prompt: ${config.maxVersionsPerPrompt}`);
  console.log(`  Retention days: ${config.retentionDays}`);
  console.log(
    `  Preserve tagged versions: ${config.preserveTaggedVersions}`
  );

  return config;
});

/**
 * Example: Update retention configuration
 */
const updateConfigExample = Effect.gen(function* () {
  const retention = yield* RetentionService;

  const newConfig: RetentionConfig = {
    maxVersionsPerPrompt: 100,
    retentionDays: 180,
    strategy: "both",
    preserveTaggedVersions: true,
  };

  yield* retention.setConfig(newConfig);
  console.log("Retention configuration updated!");

  return newConfig;
});

/**
 * Example: Preview cleanup
 */
const previewCleanupExample = Effect.gen(function* () {
  const retention = yield* RetentionService;
  const preview = yield* retention.previewCleanup();

  console.log("\nCleanup Preview:");
  console.log(`  Versions to delete: ${preview.totalVersionsToDelete}`);
  console.log(`  Prompts affected: ${preview.promptsAffected}`);

  if (preview.versionsToDelete.length > 0) {
    console.log("\nVersions that would be deleted:");
    preview.versionsToDelete.forEach((v) => {
      console.log(`  - ${v.promptId} v${v.version}: ${v.reason}`);
    });
  }

  return preview;
});

/**
 * Example: Tag a version to preserve it
 */
const tagVersionExample = (
  promptId: string,
  version: number,
  tag: string
) =>
  Effect.gen(function* () {
    const retention = yield* RetentionService;

    yield* retention.tagVersion(promptId, version, tag);
    console.log(`Tagged version ${version} as "${tag}"`);

    // List all tagged versions
    const taggedVersions = yield* retention.getTaggedVersions(promptId);
    console.log(`\nAll tagged versions for ${promptId}:`);
    taggedVersions.forEach((tv) => {
      console.log(`  v${tv.version}: ${tv.tag} (${tv.createdAt})`);
    });
  });

/**
 * Example: Run cleanup for a specific prompt
 */
const cleanupPromptExample = (promptId: string) =>
  Effect.gen(function* () {
    const retention = yield* RetentionService;

    const deletedCount = yield* retention.cleanupVersions(promptId);
    console.log(`Deleted ${deletedCount} version(s) from prompt ${promptId}`);

    return deletedCount;
  });

/**
 * Example: Run cleanup for all prompts
 */
const cleanupAllExample = Effect.gen(function* () {
  const retention = yield* RetentionService;

  const result = yield* retention.cleanupAll();
  console.log("\nCleanup completed:");
  console.log(`  Total versions deleted: ${result.totalVersionsDeleted}`);
  console.log(`  Prompts affected: ${result.promptsAffected}`);

  if (result.deletedVersions.length > 0) {
    console.log("\nDeleted versions:");
    result.deletedVersions.forEach((v) => {
      console.log(`  - ${v.promptId} v${v.version}`);
    });
  }

  return result;
});

/**
 * Complete workflow example
 */
const completeWorkflowExample = Effect.gen(function* () {
  console.log("=== Retention Service Workflow Example ===\n");

  // 1. Check current config
  console.log("Step 1: Check current configuration");
  yield* getConfigExample;

  // 2. Preview what would be cleaned up
  console.log("\n\nStep 2: Preview cleanup");
  const preview = yield* previewCleanupExample;

  // 3. If there are versions to clean, tag one to preserve it
  if (preview.versionsToDelete.length > 0) {
    const firstVersion = preview.versionsToDelete[0];
    console.log(
      `\n\nStep 3: Tag version ${firstVersion.version} to preserve it`
    );
    yield* tagVersionExample(
      firstVersion.promptId,
      firstVersion.version,
      "important"
    );

    // 4. Preview again to see the difference
    console.log("\n\nStep 4: Preview cleanup again (after tagging)");
    yield* previewCleanupExample;
  }

  // 5. Update retention policy
  console.log("\n\nStep 5: Update retention policy");
  yield* updateConfigExample;

  // 6. Run cleanup
  console.log("\n\nStep 6: Run cleanup");
  yield* cleanupAllExample;

  console.log("\n=== Workflow Complete ===");
});

/**
 * Application layer with all dependencies
 */
const AppLive = Layer.mergeAll(
  SqlLive,
  PromptStorageLive.pipe(Layer.provide(SqlLive)),
  SyncLive.pipe(Layer.provide(Layer.mergeAll(SqlLive, PromptStorageLive))),
  StorageServiceLive.pipe(
    Layer.provide(Layer.mergeAll(SqlLive, PromptStorageLive, SyncLive))
  ),
  VersionServiceLive.pipe(Layer.provide(SqlLive)),
  RetentionServiceLive.pipe(Layer.provide(SqlLive))
);

/**
 * Run the example
 */
const runExample = async () => {
  const program = completeWorkflowExample;
  const runnable = program.pipe(Effect.provide(AppLive));

  try {
    await Effect.runPromise(runnable);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

// Uncomment to run:
// runExample();

export {
  getConfigExample,
  updateConfigExample,
  previewCleanupExample,
  tagVersionExample,
  cleanupPromptExample,
  cleanupAllExample,
  completeWorkflowExample,
  AppLive,
  runExample,
};
