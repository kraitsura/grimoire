/**
 * Effect Services - Layer Composition
 *
 * This file demonstrates the Effect service pattern used throughout Grimoire.
 * Services encapsulate effectful operations with proper dependency injection
 * and error handling.
 */

import { Effect, Context, Layer } from "effect";
import { Prompt, PromptId, StorageError, PromptNotFoundError } from "../models";
import { MigrationLive as MigrationLiveImport } from "./migration-service";
import {
  Clipboard as ClipboardTag,
  ClipboardLive as ClipboardLiveImport,
} from "./clipboard-service";

// Re-export SQL service (SqlService is a Context.Tag class)
import { SqlLive as SqlLiveImport } from "./sql-service";
export { SqlService, SqlLive } from "./sql-service";

// Re-export Migration service (MigrationService is a Context.Tag class)
export { MigrationService, MigrationLive } from "./migration-service";
export type { Migration } from "./migration-service";

// Re-export Prompt Storage service (PromptStorageService is a Context.Tag class)
export { PromptStorageService, PromptStorageLive } from "./prompt-storage-service";
export type { ParsedPrompt } from "./prompt-storage-service";

// Re-export Sync service (SyncService is a Context.Tag class)
export { SyncService, SyncLive } from "./sync-service";
export type { SyncResult as FileSyncResult, IntegrityResult } from "./sync-service";

// Re-export File Watcher service (FileWatcherService is a Context.Tag class)
export { FileWatcherService, FileWatcherLive } from "./file-watcher-service";

// Re-export Editor service (EditorService is a Context.Tag class)
export { EditorService, EditorServiceLive } from "./editor-service";

// Re-export Clipboard service (ClipboardService is an interface, Clipboard is the Tag)
export type { ClipboardService } from "./clipboard-service";
export { Clipboard, ClipboardLive } from "./clipboard-service";

// Re-export Storage service (StorageService is a Context.Tag class)
export { StorageService, StorageServiceLive } from "./storage-service";
export type { CreatePromptInput, UpdatePromptInput } from "./storage-service";

// Re-export Tag service (TagService is a Context.Tag class)
export { TagService, TagServiceLive } from "./tag-service";
export type { TagWithCount } from "./tag-service";

// Re-export Export service (ExportService is a Context.Tag class)
export {
  ExportService,
  ExportServiceLive,
  VersionSchema,
  ExportedPromptSchema,
  ExportBundleSchema,
} from "./export-service";
export type { ExportOptions, ExportBundle, ExportedPrompt, Version } from "./export-service";

// Re-export Import service (ImportService is a Context.Tag class)
export { ImportService, ImportServiceLive } from "./import-service";
export type { ConflictStrategy, ImportPreview, ImportResult, ConflictInfo } from "./import-service";

// Re-export Token Counter service (TokenCounterService is a Context.Tag class)
export { TokenCounterService, TokenCounterServiceLive } from "./token-counter-service";

// Re-export LLM service (LLMService is a Context.Tag class)
export {
  LLMService,
  LLMServiceLive,
  LLMError,
  LLMAuthError,
  LLMRateLimitError,
  LLMTimeoutError,
  LLMModelError,
  LLMContentFilterError,
  parseProviderError,
  streamFromAsyncIterator,
} from "./llm-service";
export type {
  LLMProvider,
  StreamChunk,
  Message,
  LLMRequest,
  LLMResponse,
  LLMErrors,
  TokenUsage,
  FinishReason,
  RetryOptions,
} from "./llm-service";

// Re-export API Key service (ApiKeyService is a Context.Tag class)
export {
  ApiKeyService,
  ApiKeyServiceLive,
  ApiKeyNotFoundError,
  EnvFileWriteError,
  getEnvVarName,
} from "./api-key-service";

// Re-export Config service (ConfigService is a Context.Tag class)
export {
  ConfigService,
  ConfigServiceLive,
  ConfigReadError,
  ConfigWriteError,
} from "./config-service";
export type { GrimoireConfig } from "./config-service";

// Re-export Search service (SearchService is a Context.Tag class)
export { SearchService, SearchServiceLive } from "./search-service";
export type { SearchOptions, SearchResult, Range } from "./search-service";

// Re-export Chain service (ChainService is a Context.Tag class)
export {
  ChainService,
  ChainServiceLive,
  ChainNotFoundError,
  ChainValidationError,
} from "./chain-service";
export type { ChainDefinition, ChainStep, VariableSpec, ValidationResult as ChainValidationResult } from "./chain-service";

// Re-export Alias service (AliasService is a Context.Tag class)
export {
  AliasService,
  AliasServiceLive,
  AliasNotFoundError,
  AliasError,
  CircularAliasError,
} from "./alias-service";
export type { Alias } from "./alias-service";

// Re-export Stats service (StatsService is a Context.Tag class)
export { StatsService, StatsServiceLive } from "./stats-service";
export type { UsageAction, PromptStats, CollectionStats } from "./stats-service";

// Re-export Version service (VersionService is a Context.Tag class)
export { VersionService, VersionServiceLive, VersionNotFoundError } from "./version-service";
export type {
  PromptVersion,
  CreateVersionParams,
  ListVersionsOptions,
  RollbackOptions,
  DiffResult,
} from "./version-service";

// Re-export Branch service (BranchService is a Context.Tag class)
export {
  BranchService,
  BranchServiceLive,
  BranchNotFoundError,
  MergeConflictError,
  BranchError,
} from "./branch-service";
export type { CreateBranchParams, Branch, BranchComparison, MergeParams } from "./branch-service";

// Re-export Response Cache service (ResponseCacheService is a Context.Tag class)
export { ResponseCacheService, ResponseCacheServiceLive } from "./response-cache-service";
export type { CacheStats } from "./response-cache-service";

// Re-export Archive service (ArchiveService is a Context.Tag class)
export { ArchiveService, ArchiveServiceLive } from "./archive-service";
export type { ArchivedPrompt } from "./archive-service";

// Re-export Stash service (StashService is a Context.Tag class)
export { StashService, StashServiceLive } from "./stash-service";
export type { StashItem } from "./stash-service";

// Re-export Rate Limiter service (RateLimiterService is a Context.Tag class)
export { RateLimiterService, RateLimiterServiceLive } from "./rate-limiter-service";
export type { RateLimitStatus } from "./rate-limiter-service";

// Re-export Format service (FormatService is a Context.Tag class)
export { FormatService, FormatServiceLive, FormatError } from "./format-service";
export type {
  FormattingConfig,
  FormatResult,
  LintResult,
  LintIssue,
  FrontmatterResult,
} from "./format-service";

// Re-export Remote Sync service (RemoteSyncService is a Context.Tag class)
export { RemoteSyncService, RemoteSyncServiceLive, SyncConfigSchema } from "./remote-sync-service";
export type {
  SyncConfig,
  SyncResult,
  SyncStatus,
  Resolution,
  PushOptions,
  PullOptions,
} from "./remote-sync-service";

// Re-export Favorite and Pin services (FavoriteService and PinService are Context.Tag classes)
export {
  FavoriteService,
  FavoriteServiceLive,
  PinService,
  PinServiceLive,
} from "./favorite-pin-service";

// Re-export Retention service (RetentionService is a Context.Tag class)
export {
  RetentionService,
  RetentionServiceLive,
  DEFAULT_RETENTION_CONFIG,
  RetentionConfigSchema,
} from "./retention-service";
export type {
  RetentionConfig,
  RetentionStrategy,
  CleanupResult,
  CleanupPreview,
} from "./retention-service";

// Re-export Skill Config service (SkillConfigService is a Context.Tag class)
export { SkillConfigService, SkillConfigServiceLive } from "./skills/skill-config-service";
export type { SkillsConfig } from "./skills/skill-config-service";

// Re-export Skill Cache service (SkillCacheService is a Context.Tag class)
export { SkillCacheService, SkillCacheServiceLive } from "./skills/skill-cache-service";
export type { GitHubSource, CachedSkill } from "./skills/skill-cache-service";

// Re-export Skill types from models
export type {
  SkillManifest,
  AgentType,
  SkillInfo,
  PluginInfo,
  RepoType,
  InferredManifest,
} from "../models/skill";

// Re-export Skill State service (SkillStateService is a Context.Tag class)
export { SkillStateService, SkillStateServiceLive } from "./skills/skill-state-service";

// Re-export Agent Adapter service (AgentAdapterService is a Context.Tag class)
export {
  AgentAdapterService,
  AgentAdapterServiceLive,
  AgentAdapterError,
  getAgentAdapter,
  detectAgent,
} from "./skills/agent-adapter";
export type { AgentAdapter, AgentEnableResult } from "./skills/agent-adapter";

// Re-export CLI Installer service (CliInstallerService is a Context.Tag class)
export { CliInstallerService, CliInstallerServiceLive } from "./skills/cli-installer-service";
export type { InstallerType, InstallOptions } from "./skills/cli-installer-service";

// Re-export Skill Engine service (SkillEngineService is a Context.Tag class)
export { SkillEngineService, SkillEngineServiceLive } from "./skills/skill-engine-service";
export type { EnableOptions, DisableOptions, EnableResult, EnableCheck, SkillError } from "./skills/skill-engine-service";

// Re-export Skill Injection utilities
export {
  hasManagedSection,
  addManagedSection,
  hasSkillInjection,
  addSkillInjection,
  removeSkillInjection,
  replaceSkillInjection,
  listInjectedSkills,
} from "./skills/injection-utils";

// Re-export Skill Validation service (SkillValidationService is a Context.Tag class)
export { SkillValidationService, SkillValidationServiceLive } from "./skills/skill-validation-service";
export type { ValidationResult, ValidationIssue } from "../models/skill-errors";

// Re-export Plugin services
export {
  ClaudeCliService,
  ClaudeCliServiceLive,
} from "./plugins/claude-cli-service";

// Re-export Agent services
export {
  AgentService,
  AgentServiceLive,
  AgentStateReadError,
  AgentStateWriteError,
  AgentCacheError,
} from "./agents/agent-service";
export {
  MarketplaceDetectionService,
  MarketplaceDetectionServiceLive,
  parseGitHubSource as parsePluginGitHubSource,
  type GitHubSource as PluginGitHubSource,
  type MarketplaceType,
} from "./plugins/marketplace-detection-service";
export {
  MarketplaceService,
  MarketplaceServiceLive,
} from "./plugins/marketplace-service";

// ============================================================================
// PATTERN PART 1: Service Interface Definition
// ============================================================================
// Define the interface for what the service can do. Use Effect.Effect types
// to specify return types and possible errors.

/**
 * Storage service interface - manages prompt persistence
 */
interface StorageService {
  /**
   * Retrieve all stored prompts
   * Returns an Effect that either:
   * - Succeeds with an array of Prompts
   * - Fails with a StorageError
   */
  readonly getAll: Effect.Effect<Prompt[], StorageError>;

  /**
   * Retrieve a single prompt by ID
   */
  readonly getById: (id: PromptId) => Effect.Effect<Prompt, StorageError | PromptNotFoundError>;

  /**
   * Save a prompt (create or update)
   */
  readonly save: (prompt: Prompt) => Effect.Effect<void, StorageError>;

  /**
   * Delete a prompt by ID
   */
  readonly delete: (id: PromptId) => Effect.Effect<void, StorageError | PromptNotFoundError>;
}

// ============================================================================
// PATTERN PART 2: Service Tag Creation
// ============================================================================
// Use Context.Tag to create a unique identifier for the service.
// This enables Effect's dependency injection system.

/**
 * Storage service tag
 *
 * The tag associates a unique identifier ("Storage") with the service type.
 * Format: Context.Tag(identifier)<Tag, ServiceInterface>()
 */
export class Storage extends Context.Tag("Storage")<Storage, StorageService>() {}

// ============================================================================
// PATTERN PART 3: Layer Implementation
// ============================================================================
// Implement the service using Layer.effect (for effectful construction)
// or Layer.succeed (for pure construction).

/**
 * Storage service implementation
 *
 * Uses Layer.effect because the service construction itself may be effectful
 * (e.g., initializing file system access, validating storage directory).
 *
 * The Effect.gen function creates an effectful computation using generator syntax.
 */
export const StorageLive = Layer.succeed(
  Storage,
  Storage.of({
    getAll: Effect.succeed([] as Prompt[]),

    getById: (id: PromptId) =>
      // In a real implementation, would access storage directly
      // For now, return a placeholder that demonstrates error handling
      Effect.fail(new PromptNotFoundError({ id })),

    save: (_prompt: Prompt) =>
      // Implementation would:
      // 1. Read existing prompts
      // 2. Add/update the prompt
      // 3. Encode with Schema
      // 4. Write to file
      Effect.void,

    delete: (id: PromptId) =>
      // In a real implementation, would read from storage, filter, and write back
      Effect.fail(new PromptNotFoundError({ id })),
  })
);

// ============================================================================
// PATTERN PART 4: MainLive - Composed Layer
// ============================================================================
// Combine all service layers into a single MainLive layer that provides
// all dependencies needed by the application.
//
// Use:
// - Layer.merge: Combine two or more independent layers
// - Layer.provide: Provide dependencies to a layer that needs them
// - Layer.provideMerge: Merge and provide in one step

/**
 * Main application layer
 *
 * Composes all service layers into a single layer that can be provided
 * to the application runtime. This is the top-level dependency layer.
 *
 * Usage:
 *   const program = Effect.gen(function* () {
 *     const storage = yield* Storage
 *     const prompts = yield* storage.getAll
 *     return prompts
 *   })
 *
 *   const runnable = program.pipe(Effect.provide(MainLive))
 *   await Effect.runPromise(runnable)
 */
// Import LLM-related services
import { LLMService, LLMServiceLive } from "./llm-service";
import { ApiKeyService, ApiKeyServiceLive } from "./api-key-service";
import { TokenCounterServiceLive } from "./token-counter-service";
import { OpenAIProvider } from "./providers/openai-provider";
import { makeAnthropicProvider } from "./providers/anthropic-provider";
import { makeGeminiProvider } from "./providers/gemini-provider";

// Import all the Live implementations needed for MainLive
import { EditorServiceLive as EditorServiceLiveImport } from "./editor-service";
import { PromptStorageLive as PromptStorageLiveImport } from "./prompt-storage-service";
import { StatsServiceLive as StatsServiceLiveImport } from "./stats-service";
import { TagServiceLive as TagServiceLiveImport } from "./tag-service";
import { SearchServiceLive as SearchServiceLiveImport } from "./search-service";
import { ArchiveServiceLive as ArchiveServiceLiveImport } from "./archive-service";
import { StashServiceLive as StashServiceLiveImport } from "./stash-service";
import { ExportServiceLive as ExportServiceLiveImport } from "./export-service";
import { ImportServiceLive as ImportServiceLiveImport } from "./import-service";
import { VersionServiceLive as VersionServiceLiveImport } from "./version-service";
import { BranchServiceLive as BranchServiceLiveImport } from "./branch-service";
import { AliasServiceLive as AliasServiceLiveImport } from "./alias-service";
import { ResponseCacheServiceLive as ResponseCacheServiceLiveImport } from "./response-cache-service";
import { RateLimiterServiceLive as RateLimiterServiceLiveImport } from "./rate-limiter-service";
import { FormatServiceLive as FormatServiceLiveImport } from "./format-service";
import { RemoteSyncServiceLive as RemoteSyncServiceLiveImport } from "./remote-sync-service";
import {
  FavoriteServiceLive as FavoriteServiceLiveImport,
  PinServiceLive as PinServiceLiveImport,
} from "./favorite-pin-service";
import { RetentionServiceLive as RetentionServiceLiveImport } from "./retention-service";
import { SyncLive as SyncLiveImport } from "./sync-service";
import { StorageServiceLive as StorageServiceLiveImport } from "./storage-service";
import { ChainServiceLive as ChainServiceLiveImport } from "./chain-service";
import { SkillCacheServiceLive as SkillCacheServiceLiveImport } from "./skills/skill-cache-service";
import { SkillStateServiceLive as SkillStateServiceLiveImport } from "./skills/skill-state-service";
import { SkillConfigServiceLive as SkillConfigServiceLiveImport } from "./skills/skill-config-service";
import { AgentAdapterServiceLive as AgentAdapterServiceLiveImport } from "./skills/agent-adapter";
import { CliInstallerServiceLive as CliInstallerServiceLiveImport } from "./skills/cli-installer-service";
import { SkillEngineServiceLive as SkillEngineServiceLiveImport } from "./skills/skill-engine-service";
import { SkillValidationServiceLive as SkillValidationServiceLiveImport } from "./skills/skill-validation-service";
import { ClaudeCliServiceLive as ClaudeCliServiceLiveImport } from "./plugins/claude-cli-service";
import { MarketplaceDetectionServiceLive as MarketplaceDetectionServiceLiveImport } from "./plugins/marketplace-detection-service";
import { MarketplaceServiceLive as MarketplaceServiceLiveImport } from "./plugins/marketplace-service";
import { AgentServiceLive as AgentServiceLiveImport } from "./agents/agent-service";

/**
 * LLM Layer - Provides LLM services with all providers
 */
export const LLMLive = Layer.effectDiscard(
  Effect.gen(function* () {
    // Get dependencies
    const _apiKeyService = yield* ApiKeyService;

    // Create providers
    const openAIProvider = yield* OpenAIProvider;
    const anthropicProvider = yield* makeAnthropicProvider;
    const geminiProvider = yield* makeGeminiProvider;

    // Get LLM service and register providers
    const llmService = yield* LLMService;
    yield* llmService.registerProvider(openAIProvider);
    yield* llmService.registerProvider(anthropicProvider);
    yield* llmService.registerProvider(geminiProvider);
  })
).pipe(Layer.provide(Layer.mergeAll(LLMServiceLive, ApiKeyServiceLive, TokenCounterServiceLive)));

// Layer 1: Base - SqlService (no dependencies)
const SqlLayer = SqlLiveImport;

// Layer 2: PromptStorage needs SqlService
const PromptStorageLayer = PromptStorageLiveImport.pipe(Layer.provide(SqlLayer));

// Layer 3: Sync needs SqlService + PromptStorageService
const SyncLayer = SyncLiveImport.pipe(Layer.provide(Layer.mergeAll(SqlLayer, PromptStorageLayer)));

// Layer 4: Storage needs SqlService + PromptStorageService + SyncService
const StorageLayer = StorageServiceLiveImport.pipe(
  Layer.provide(Layer.mergeAll(SqlLayer, PromptStorageLayer, SyncLayer))
);

// Layer 5: Version needs SqlService
const VersionLayer = VersionServiceLiveImport.pipe(Layer.provide(SqlLayer));

// Layer 6: Branch needs SqlService + VersionService
const BranchLayer = BranchServiceLiveImport.pipe(
  Layer.provide(Layer.mergeAll(SqlLayer, VersionLayer))
);

// Layer 7: Migration needs SqlService
const MigrationLayer = MigrationLiveImport.pipe(Layer.provide(SqlLayer));

// Services that need SqlService + PromptStorageService (and depend on Migration being run first)
const SqlAndStorageDependentServices = Layer.mergeAll(
  StatsServiceLiveImport,
  TagServiceLiveImport,
  SearchServiceLiveImport,
  ArchiveServiceLiveImport,
  FavoriteServiceLiveImport,
  PinServiceLiveImport
).pipe(Layer.provide(Layer.mergeAll(SqlLayer, PromptStorageLayer, MigrationLayer)));

// Services that need only SqlService
const SqlOnlyDependentServices = Layer.mergeAll(
  ResponseCacheServiceLiveImport,
  RetentionServiceLiveImport,
  StashServiceLiveImport
).pipe(Layer.provide(SqlLayer));

// Chain needs StorageService (which includes Sql, PromptStorage, Sync)
const ChainLayer = ChainServiceLiveImport.pipe(
  Layer.provide(Layer.mergeAll(SqlLayer, StorageLayer))
);

// Export and Import need StorageService
const StorageDependentServices = Layer.mergeAll(
  ExportServiceLiveImport,
  ImportServiceLiveImport
).pipe(Layer.provide(StorageLayer));

// Services that don't need SqlService or StorageService
const IndependentServices = Layer.mergeAll(
  ClipboardLiveImport,
  EditorServiceLiveImport,
  AliasServiceLiveImport,
  RateLimiterServiceLiveImport,
  FormatServiceLiveImport,
  RemoteSyncServiceLiveImport,
  SkillCacheServiceLiveImport,
  SkillStateServiceLiveImport,
  SkillConfigServiceLiveImport,
  AgentAdapterServiceLiveImport,
  CliInstallerServiceLiveImport,
  SkillValidationServiceLiveImport,
  AgentServiceLiveImport
);

// SkillEngineService needs SkillCache, SkillState, AgentAdapter, CliInstaller
const SkillEngineLayer = SkillEngineServiceLiveImport.pipe(
  Layer.provide(
    Layer.mergeAll(
      SkillCacheServiceLiveImport,
      SkillStateServiceLiveImport,
      AgentAdapterServiceLiveImport,
      CliInstallerServiceLiveImport
    )
  )
);

// Plugin Services Layer (no dependencies)
const PluginServicesLayer = Layer.mergeAll(
  ClaudeCliServiceLiveImport,
  MarketplaceDetectionServiceLiveImport,
  MarketplaceServiceLiveImport
);

// Import ConfigServiceLive
import { ConfigServiceLive as ConfigServiceLiveImport } from "./config-service";

export const MainLive = Layer.mergeAll(
  SqlLayer,
  PromptStorageLayer,
  SyncLayer,
  StorageLayer,
  VersionLayer,
  BranchLayer,
  MigrationLayer,
  ChainLayer,
  SqlAndStorageDependentServices,
  SqlOnlyDependentServices,
  StorageDependentServices,
  IndependentServices,
  SkillEngineLayer,
  PluginServicesLayer,
  LLMLive,
  LLMServiceLive,
  TokenCounterServiceLive,
  ApiKeyServiceLive,
  ConfigServiceLiveImport
);

export const MainLiveWithEditor = Layer.mergeAll(MainLive, EditorServiceLiveImport);

/**
 * Union type of all services provided by MainLive
 *
 * Inferred directly from MainLive to ensure type safety and prevent drift.
 * Use this type when defining Effects that require application services,
 * particularly in React hooks and components.
 */
export type AppServices = Layer.Layer.Success<typeof MainLive>;

// Note: PromptStorageLive is exported separately and not included in MainLive
// to allow for flexible composition based on specific use cases

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example 1: Using a single service
 */
export const exampleUseStorage = Effect.gen(function* () {
  // Access the Storage service from context
  const storage = yield* Storage;

  // Use service methods
  const prompts = yield* storage.getAll;

  return prompts;
});

/**
 * Example 2: Using multiple services together
 */
export const exampleCopyPromptToClipboard = (id: PromptId) =>
  Effect.gen(function* () {
    // Access multiple services
    const storage = yield* Storage;
    const clipboard = yield* ClipboardTag;

    // Compose operations
    const prompt = yield* storage.getById(id);
    yield* clipboard.copy(prompt.content);

    return prompt;
  });

/**
 * Example 3: Running an Effect with MainLive
 *
 * This is how you would execute the program in your CLI:
 */
export const runExample = () => {
  const program = exampleUseStorage;

  // Provide dependencies via StorageLive (example service)
  // Note: This example uses the demo Storage service, not the full MainLive
  const runnable = program.pipe(Effect.provide(StorageLive));

  // Run the effect (returns a Promise)
  return Effect.runPromise(runnable);
};

// ============================================================================
// ADVANCED PATTERNS
// ============================================================================

/**
 * Pattern: Service that depends on another service
 *
 * Example: A PromptManager service that uses Storage internally
 */
interface PromptManagerService {
  readonly createPrompt: (name: string, content: string) => Effect.Effect<Prompt, StorageError>;
}

export class PromptManager extends Context.Tag("PromptManager")<
  PromptManager,
  PromptManagerService
>() {}

export const PromptManagerLive = Layer.effect(
  PromptManager,
  Effect.gen(function* () {
    // Access Storage service as a dependency
    const storage = yield* Storage;

    return PromptManager.of({
      createPrompt: (name: string, content: string) =>
        Effect.gen(function* () {
          const now = new Date();
          const prompt: Prompt = {
            id: crypto.randomUUID(),
            name,
            content,
            tags: [],
            created: now,
            updated: now,
          };

          yield* storage.save(prompt);
          return prompt;
        }),
    });
  })
);

/**
 * Composed layer with dependencies
 *
 * PromptManagerLive needs Storage, so we provide it:
 */
export const MainLiveWithManager = Layer.mergeAll(
  StorageLive,
  ClipboardLiveImport,
  PromptManagerLive.pipe(Layer.provide(StorageLive))
);

// ============================================================================
// KEY TAKEAWAYS
// ============================================================================
/*

1. SERVICE INTERFACE
   - Define what the service does
   - Use Effect.Effect<Success, Error> for all operations
   - Keep interfaces focused and cohesive

2. SERVICE TAG
   - Use Context.Tag to create unique service identifier
   - Enables type-safe dependency injection
   - Format: class Name extends Context.Tag(id)<Name, Interface>() {}

3. LAYER IMPLEMENTATION
   - Use Layer.effect for effectful construction
   - Use Layer.succeed for pure construction
   - Return Tag.of({ ...implementation })
   - Handle errors in the error channel (yield* Effect.fail(...))

4. MAIN LIVE
   - Use Layer.mergeAll to combine independent layers
   - Use Layer.provide to satisfy dependencies
   - Single MainLive provides all app dependencies

5. RUNNING EFFECTS
   - Use Effect.provide(MainLive) to inject dependencies
   - Use Effect.runPromise to execute
   - Errors propagate through the error channel

*/
