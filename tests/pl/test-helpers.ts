/**
 * Prompt Library Command Test Helpers
 *
 * Shared utilities for testing pl commands.
 * Provides mock services, test fixtures, and assertion helpers.
 */

import { Effect, Layer } from "effect";
import type { ParsedArgs } from "../../src/cli/parser";
import type { Prompt } from "../../src/models";
import { StorageService } from "../../src/services/storage-service";
import { SqlService } from "../../src/services/sql-service";
import { Clipboard } from "../../src/services/clipboard-service";
import { TagService } from "../../src/services/tag-service";
import { SearchService, type SearchResult, type SearchOptions } from "../../src/services/search-service";
import { StashService, type StashItem } from "../../src/services/stash-service";
import { VersionService, type PromptVersion, type DiffResult } from "../../src/services/version-service";
import { BranchService, type Branch, type BranchComparison } from "../../src/services/branch-service";
import { ExportService, type ExportBundle, type ExportOptions } from "../../src/services/export-service";
import { ImportService, type ImportPreview, type ImportResult, type ConflictStrategy } from "../../src/services/import-service";
import { ArchiveService, type ArchivedPrompt } from "../../src/services/archive-service";
import { StatsService, type PromptStats, type CollectionStats } from "../../src/services/stats-service";
import { AliasService, type Alias, AliasNotFoundError } from "../../src/services/alias-service";
import { FormatService, type FormatResult, type LintResult } from "../../src/services/format-service";
import { LLMService, type LLMRequest, type LLMResponse, type StreamChunk } from "../../src/services/llm-service";
import { TokenCounterService } from "../../src/services/token-counter-service";
import { ConfigService, type GrimoireConfig } from "../../src/services/config-service";
import { EnhancementService, type EnhancementRequest, type EnhancementResult, type EnhancementEstimate } from "../../src/services/enhancement-service";
import { FavoriteService, PinService } from "../../src/services/favorite-pin-service";
import { RemoteSyncService, type SyncResult, type SyncStatus, type SyncConfig } from "../../src/services/remote-sync-service";
import { PromptNotFoundError, DuplicateNameError } from "../../src/models";
import { Stream } from "effect";

// ============================================================================
// ParsedArgs Factory
// ============================================================================

/**
 * Create a ParsedArgs object for testing
 */
export const createParsedArgs = (overrides?: Partial<ParsedArgs>): ParsedArgs => ({
  command: "pl",
  flags: {},
  positional: [],
  ...overrides,
});

// ============================================================================
// Prompt Fixtures
// ============================================================================

const FIXED_DATE = new Date("2025-01-01T12:00:00.000Z");

/**
 * Create a test prompt
 */
export const createTestPrompt = (overrides?: Partial<Prompt>): Prompt => ({
  id: "test-prompt-id",
  name: "test-prompt",
  content: "This is test content.",
  tags: ["test"],
  created: FIXED_DATE,
  updated: FIXED_DATE,
  version: 1,
  isTemplate: false,
  isFavorite: false,
  isPinned: false,
  filePath: "/test/prompts/test-prompt-id.md",
  ...overrides,
});

/**
 * Sample prompts for testing
 */
export const SAMPLE_PROMPTS: Prompt[] = [
  createTestPrompt({ id: "prompt-1", name: "coding-assistant", tags: ["coding", "assistant"] }),
  createTestPrompt({ id: "prompt-2", name: "writing-helper", tags: ["writing"] }),
  createTestPrompt({ id: "prompt-3", name: "my-template", isTemplate: true }),
  createTestPrompt({ id: "prompt-4", name: "favorite-prompt", isFavorite: true, favoriteOrder: 1 }),
  createTestPrompt({ id: "prompt-5", name: "pinned-prompt", isPinned: true, pinOrder: 1 }),
];

// ============================================================================
// Mock Storage Service
// ============================================================================

export interface MockStorageState {
  prompts: Map<string, Prompt>;
  byName: Map<string, Prompt>;
}

export const createMockStorageState = (prompts: Prompt[] = SAMPLE_PROMPTS): MockStorageState => {
  const state: MockStorageState = {
    prompts: new Map(),
    byName: new Map(),
  };
  for (const prompt of prompts) {
    state.prompts.set(prompt.id, prompt);
    state.byName.set(prompt.name, prompt);
  }
  return state;
};

export const createMockStorageService = (
  state: MockStorageState = createMockStorageState()
): typeof StorageService.Service => ({
  getAll: Effect.succeed(Array.from(state.prompts.values())),
  getById: (id: string) => {
    const prompt = state.prompts.get(id);
    if (!prompt) {
      return Effect.fail(new PromptNotFoundError({ id }));
    }
    return Effect.succeed(prompt);
  },
  getByName: (name: string) => {
    const prompt = state.byName.get(name);
    if (!prompt) {
      return Effect.fail(new PromptNotFoundError({ id: `name:${name}` }));
    }
    return Effect.succeed(prompt);
  },
  create: (input) => {
    if (state.byName.has(input.name)) {
      return Effect.fail(new DuplicateNameError({ name: input.name }));
    }
    const newPrompt = createTestPrompt({
      id: crypto.randomUUID(),
      name: input.name,
      content: input.content,
      tags: input.tags,
      isTemplate: input.isTemplate,
      isFavorite: input.isFavorite,
      isPinned: input.isPinned,
    });
    state.prompts.set(newPrompt.id, newPrompt);
    state.byName.set(newPrompt.name, newPrompt);
    return Effect.succeed(newPrompt);
  },
  update: (id, input) => {
    const prompt = state.prompts.get(id);
    if (!prompt) {
      return Effect.fail(new PromptNotFoundError({ id }));
    }
    const updated = { ...prompt, ...input, updated: new Date() };
    state.prompts.set(id, updated);
    if (input.name) {
      state.byName.delete(prompt.name);
      state.byName.set(input.name, updated);
    }
    return Effect.succeed(updated);
  },
  delete: (id, _hard) => {
    const prompt = state.prompts.get(id);
    if (!prompt) {
      return Effect.fail(new PromptNotFoundError({ id }));
    }
    state.prompts.delete(id);
    state.byName.delete(prompt.name);
    return Effect.void;
  },
  findByTags: (tags) => {
    const prompts = Array.from(state.prompts.values()).filter(
      (p) => p.tags && tags.some((t) => p.tags?.includes(t))
    );
    return Effect.succeed(prompts);
  },
  search: (query) => {
    const prompts = Array.from(state.prompts.values()).filter(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.content.toLowerCase().includes(query.toLowerCase())
    );
    return Effect.succeed(prompts);
  },
});

// ============================================================================
// Mock SQL Service
// ============================================================================

export const createMockSqlService = (): typeof SqlService.Service => ({
  query: <T>(_sql: string, _params?: unknown[]) => Effect.succeed([] as T[]),
  run: (_sql: string, _params?: unknown[]) => Effect.void,
  transaction: <A, E>(effect: Effect.Effect<A, E>) => effect,
});

// ============================================================================
// Mock Clipboard Service
// ============================================================================

export interface MockClipboardState {
  content: string;
}

export const createMockClipboardService = (
  state: MockClipboardState = { content: "" }
): typeof Clipboard.Service => ({
  copy: (text: string) => {
    state.content = text;
    return Effect.void;
  },
  paste: Effect.succeed(state.content),
});

// ============================================================================
// Mock Tag Service
// ============================================================================

export const createMockTagService = (): typeof TagService.Service => ({
  addTag: (_promptId: string, _tag: string) => Effect.void,
  removeTag: (_promptId: string, _tag: string) => Effect.void,
  listTags: () => Effect.succeed([
    { name: "coding", count: 5 },
    { name: "writing", count: 3 },
    { name: "assistant", count: 2 },
  ]),
  renameTag: (_oldName: string, _newName: string) => Effect.succeed(3),
  getTagsForPrompt: (_promptId: string) => Effect.succeed(["test"]),
});

// ============================================================================
// Mock Search Service
// ============================================================================

export const createMockSearchService = (
  results: SearchResult[] = []
): typeof SearchService.Service => ({
  search: (_options: SearchOptions) => Effect.succeed(results),
  reindex: () => Effect.void,
  rebuildIndex: () => Effect.void,
});

// ============================================================================
// Mock Stash Service
// ============================================================================

export interface MockStashState {
  items: StashItem[];
}

export const createMockStashService = (
  state: MockStashState = { items: [] }
): typeof StashService.Service => ({
  push: (content: string, name?: string) => {
    const item: StashItem = {
      id: crypto.randomUUID(),
      content,
      name,
      createdAt: new Date(),
      stackOrder: state.items.length,
    };
    state.items.unshift(item);
    return Effect.succeed(item);
  },
  pop: () => {
    const item = state.items.shift();
    return Effect.succeed(item);
  },
  peek: () => Effect.succeed(state.items[0]),
  list: () => Effect.succeed([...state.items]),
  get: (nameOrIndex: string | number) => {
    if (typeof nameOrIndex === "number") {
      return Effect.succeed(state.items[nameOrIndex]);
    }
    return Effect.succeed(state.items.find((i) => i.name === nameOrIndex));
  },
  remove: (nameOrIndex: string | number) => {
    if (typeof nameOrIndex === "number") {
      const [item] = state.items.splice(nameOrIndex, 1);
      return Effect.succeed(item !== undefined);
    }
    const idx = state.items.findIndex((i) => i.name === nameOrIndex);
    if (idx >= 0) {
      state.items.splice(idx, 1);
      return Effect.succeed(true);
    }
    return Effect.succeed(false);
  },
  clear: () => {
    const count = state.items.length;
    state.items = [];
    return Effect.succeed(count);
  },
});

// ============================================================================
// Mock Version Service
// ============================================================================

export const createMockVersionService = (
  versions: PromptVersion[] = []
): typeof VersionService.Service => ({
  createVersion: (_params) => Effect.succeed({
    id: 1,
    promptId: "test",
    version: 1,
    content: "test",
    frontmatter: {},
    createdAt: new Date(),
    branch: "main",
  }),
  listVersions: (_promptId, _options) => Effect.succeed(versions),
  getVersion: (_promptId, _version) => Effect.succeed(versions[0] ?? null),
  getLatestVersion: (_promptId) => Effect.succeed(versions[0] ?? null),
  diff: (_promptId, _fromVersion, _toVersion): Effect.Effect<DiffResult, any> =>
    Effect.succeed({
      from: { version: 1, content: "old" },
      to: { version: 2, content: "new" },
      hunks: [],
      stats: { added: 1, removed: 1, unchanged: 0 },
    }),
  rollback: (_promptId, _targetVersion, _options) => Effect.succeed({
    id: 1,
    promptId: "test",
    version: 1,
    content: "test",
    frontmatter: {},
    createdAt: new Date(),
    branch: "main",
  }),
});

// ============================================================================
// Mock Branch Service
// ============================================================================

export const createMockBranchService = (
  branches: Branch[] = []
): typeof BranchService.Service => ({
  createBranch: (_params) => Effect.succeed({
    id: "branch-1",
    name: "test-branch",
    promptId: "test",
    createdAt: new Date(),
    isActive: true,
  }),
  listBranches: (_promptId) => Effect.succeed(branches),
  getBranch: (_promptId, _name) => Effect.succeed(branches[0] ?? null),
  getActiveBranch: (_promptId) => Effect.succeed(branches.find((b) => b.isActive) ?? null),
  switchBranch: (_promptId, _name) => Effect.void,
  deleteBranch: (_promptId, _name) => Effect.void,
  compareBranches: (_promptId, _from, _to): Effect.Effect<BranchComparison, any> =>
    Effect.succeed({
      from: { name: "main", headVersion: 1 },
      to: { name: "test", headVersion: 2 },
      ahead: 1,
      behind: 0,
      canFastForward: true,
    }),
  mergeBranch: (_params) => Effect.succeed({
    id: 1,
    promptId: "test",
    version: 1,
    content: "merged",
    frontmatter: {},
    createdAt: new Date(),
    branch: "main",
  }),
});

// ============================================================================
// Mock Export Service
// ============================================================================

export const createMockExportService = (): typeof ExportService.Service => ({
  exportPrompts: (_promptIds, _options: ExportOptions): Effect.Effect<ExportBundle, any> =>
    Effect.succeed({
      version: "1.0",
      exportedAt: new Date().toISOString(),
      prompts: [],
    }),
  exportAll: (_options: ExportOptions): Effect.Effect<ExportBundle, any> =>
    Effect.succeed({
      version: "1.0",
      exportedAt: new Date().toISOString(),
      prompts: [],
    }),
  exportToFile: (_filePath, _bundle) => Effect.void,
});

// ============================================================================
// Mock Import Service
// ============================================================================

export const createMockImportService = (): typeof ImportService.Service => ({
  preview: (_bundle): Effect.Effect<ImportPreview, any> =>
    Effect.succeed({
      prompts: [],
      conflicts: [],
      newCount: 0,
      conflictCount: 0,
    }),
  import: (_bundle, _strategy: ConflictStrategy): Effect.Effect<ImportResult, any> =>
    Effect.succeed({
      imported: 0,
      skipped: 0,
      merged: 0,
      errors: [],
    }),
  importFromFile: (_filePath, _strategy: ConflictStrategy): Effect.Effect<ImportResult, any> =>
    Effect.succeed({
      imported: 0,
      skipped: 0,
      merged: 0,
      errors: [],
    }),
});

// ============================================================================
// Mock Archive Service
// ============================================================================

export const createMockArchiveService = (
  archived: ArchivedPrompt[] = []
): typeof ArchiveService.Service => ({
  list: () => Effect.succeed(archived),
  restore: (id: string) => {
    const idx = archived.findIndex((a) => a.id === id);
    if (idx >= 0) {
      const [item] = archived.splice(idx, 1);
      return Effect.succeed(createTestPrompt({ id: item.id, name: item.name }));
    }
    return Effect.fail(new PromptNotFoundError({ id }));
  },
  delete: (id: string) => {
    const idx = archived.findIndex((a) => a.id === id);
    if (idx >= 0) {
      archived.splice(idx, 1);
      return Effect.void;
    }
    return Effect.fail(new PromptNotFoundError({ id }));
  },
  clear: () => {
    const count = archived.length;
    archived.length = 0;
    return Effect.succeed(count);
  },
});

// ============================================================================
// Mock Stats Service
// ============================================================================

export const createMockStatsService = (): typeof StatsService.Service => ({
  recordUsage: (_promptId, _action) => Effect.void,
  getPromptStats: (_promptId): Effect.Effect<PromptStats, any> =>
    Effect.succeed({
      promptId: "test",
      copies: 10,
      tests: 5,
      lastUsed: new Date(),
      totalTokens: 1000,
    }),
  getCollectionStats: (): Effect.Effect<CollectionStats, any> =>
    Effect.succeed({
      totalPrompts: 10,
      totalTemplates: 2,
      totalTags: 5,
      topPrompts: [],
      tagCounts: {},
    }),
});

// ============================================================================
// Mock Alias Service
// ============================================================================

export const createMockAliasService = (
  aliases: Map<string, Alias> = new Map()
): typeof AliasService.Service => ({
  create: (name, command) => {
    const alias: Alias = { name, command, createdAt: new Date() };
    aliases.set(name, alias);
    return Effect.succeed(alias);
  },
  get: (name) => {
    const alias = aliases.get(name);
    if (!alias) {
      return Effect.fail(new AliasNotFoundError({ name }));
    }
    return Effect.succeed(alias);
  },
  list: () => Effect.succeed(Array.from(aliases.values())),
  delete: (name) => {
    if (!aliases.has(name)) {
      return Effect.fail(new AliasNotFoundError({ name }));
    }
    aliases.delete(name);
    return Effect.void;
  },
  expand: (name) => {
    const alias = aliases.get(name);
    if (!alias) {
      return Effect.fail(new AliasNotFoundError({ name }));
    }
    return Effect.succeed(alias.command);
  },
});

// ============================================================================
// Mock Format Service
// ============================================================================

export const createMockFormatService = (): typeof FormatService.Service => ({
  format: (content, _config): Effect.Effect<FormatResult, any> =>
    Effect.succeed({
      content,
      changes: [],
      stats: { added: 0, removed: 0, modified: 0 },
    }),
  lint: (_content): Effect.Effect<LintResult, any> =>
    Effect.succeed({
      valid: true,
      issues: [],
    }),
  extractFrontmatter: (content) =>
    Effect.succeed({
      frontmatter: {},
      content,
      raw: "",
    }),
  normalizeFrontmatter: (frontmatter) => Effect.succeed(frontmatter),
});

// ============================================================================
// Mock LLM Service
// ============================================================================

export const createMockLLMService = (
  response: string = "Mock LLM response"
): typeof LLMService.Service => ({
  complete: (_request: LLMRequest): Effect.Effect<LLMResponse, any> =>
    Effect.succeed({
      content: response,
      model: "mock-model",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: "stop" as const,
    }),
  stream: (_request: LLMRequest): Stream.Stream<StreamChunk, any> =>
    Stream.make({ type: "text" as const, content: response }),
  registerProvider: () => Effect.void,
  getAvailableModels: () => Effect.succeed([]),
  getDefaultModel: () => Effect.succeed("mock-model"),
});

// ============================================================================
// Mock Token Counter Service
// ============================================================================

export const createMockTokenCounterService = (): typeof TokenCounterService.Service => ({
  count: (_text, _model) => Effect.succeed(100),
  countMessages: (_messages, _model) => Effect.succeed(200),
  estimateCost: (_tokens, _model) => Effect.succeed(0.001),
});

// ============================================================================
// Mock Config Service
// ============================================================================

export const createMockConfigService = (): typeof ConfigService.Service => ({
  get: (): Effect.Effect<GrimoireConfig, any> =>
    Effect.succeed({
      defaultModel: "gpt-4o",
      defaultProvider: "openai",
    }),
  set: (_key, _value) => Effect.void,
  getPath: () => Effect.succeed("/mock/.grimoire/config.json"),
});

// ============================================================================
// Mock Enhancement Service
// ============================================================================

export const createMockEnhancementService = (): typeof EnhancementService.Service => ({
  enhance: (_request: EnhancementRequest): Effect.Effect<EnhancementResult, any> =>
    Effect.succeed({
      original: "original",
      enhanced: "enhanced",
      model: "gpt-4o",
      template: "improve",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
  estimate: (_request: EnhancementRequest): Effect.Effect<EnhancementEstimate, any> =>
    Effect.succeed({
      estimatedTokens: 100,
      estimatedCost: 0.01,
      template: "improve",
      model: "gpt-4o",
    }),
  listTemplates: () => Effect.succeed(["improve", "fix-grammar", "make-concise"]),
});

// ============================================================================
// Mock Favorite/Pin Services
// ============================================================================

export const createMockFavoriteService = (): typeof FavoriteService.Service => ({
  add: (_promptId) => Effect.void,
  remove: (_promptId) => Effect.void,
  list: () => Effect.succeed([]),
  reorder: (_promptIds) => Effect.void,
  isFavorite: (_promptId) => Effect.succeed(false),
});

export const createMockPinService = (): typeof PinService.Service => ({
  add: (_promptId) => Effect.void,
  remove: (_promptId) => Effect.void,
  list: () => Effect.succeed([]),
  reorder: (_promptIds) => Effect.void,
  isPinned: (_promptId) => Effect.succeed(false),
});

// ============================================================================
// Mock Remote Sync Service
// ============================================================================

export const createMockRemoteSyncService = (): typeof RemoteSyncService.Service => ({
  configure: (_config: SyncConfig) => Effect.void,
  getConfig: (): Effect.Effect<SyncConfig | null, any> => Effect.succeed(null),
  push: (_options): Effect.Effect<SyncResult, any> =>
    Effect.succeed({
      pushed: 0,
      pulled: 0,
      conflicts: [],
    }),
  pull: (_options): Effect.Effect<SyncResult, any> =>
    Effect.succeed({
      pushed: 0,
      pulled: 0,
      conflicts: [],
    }),
  status: (): Effect.Effect<SyncStatus, any> =>
    Effect.succeed({
      configured: false,
      lastSync: null,
      localChanges: 0,
      remoteChanges: 0,
    }),
});

// ============================================================================
// Layer Factories
// ============================================================================

/**
 * Create a test layer with all mock services
 */
export const createTestLayer = (options?: {
  storage?: typeof StorageService.Service;
  sql?: typeof SqlService.Service;
  clipboard?: typeof Clipboard.Service;
  tags?: typeof TagService.Service;
  search?: typeof SearchService.Service;
  stash?: typeof StashService.Service;
  versions?: typeof VersionService.Service;
  branches?: typeof BranchService.Service;
  export?: typeof ExportService.Service;
  import?: typeof ImportService.Service;
  archive?: typeof ArchiveService.Service;
  stats?: typeof StatsService.Service;
  alias?: typeof AliasService.Service;
  format?: typeof FormatService.Service;
  llm?: typeof LLMService.Service;
  tokenCounter?: typeof TokenCounterService.Service;
  config?: typeof ConfigService.Service;
  enhancement?: typeof EnhancementService.Service;
  favorites?: typeof FavoriteService.Service;
  pins?: typeof PinService.Service;
  remoteSync?: typeof RemoteSyncService.Service;
}) => {
  return Layer.mergeAll(
    Layer.succeed(StorageService, options?.storage ?? createMockStorageService()),
    Layer.succeed(SqlService, options?.sql ?? createMockSqlService()),
    Layer.succeed(Clipboard, options?.clipboard ?? createMockClipboardService()),
    Layer.succeed(TagService, options?.tags ?? createMockTagService()),
    Layer.succeed(SearchService, options?.search ?? createMockSearchService()),
    Layer.succeed(StashService, options?.stash ?? createMockStashService()),
    Layer.succeed(VersionService, options?.versions ?? createMockVersionService()),
    Layer.succeed(BranchService, options?.branches ?? createMockBranchService()),
    Layer.succeed(ExportService, options?.export ?? createMockExportService()),
    Layer.succeed(ImportService, options?.import ?? createMockImportService()),
    Layer.succeed(ArchiveService, options?.archive ?? createMockArchiveService()),
    Layer.succeed(StatsService, options?.stats ?? createMockStatsService()),
    Layer.succeed(AliasService, options?.alias ?? createMockAliasService()),
    Layer.succeed(FormatService, options?.format ?? createMockFormatService()),
    Layer.succeed(LLMService, options?.llm ?? createMockLLMService()),
    Layer.succeed(TokenCounterService, options?.tokenCounter ?? createMockTokenCounterService()),
    Layer.succeed(ConfigService, options?.config ?? createMockConfigService()),
    Layer.succeed(EnhancementService, options?.enhancement ?? createMockEnhancementService()),
    Layer.succeed(FavoriteService, options?.favorites ?? createMockFavoriteService()),
    Layer.succeed(PinService, options?.pins ?? createMockPinService()),
    Layer.succeed(RemoteSyncService, options?.remoteSync ?? createMockRemoteSyncService())
  );
};

// ============================================================================
// Console Capture Helper
// ============================================================================

/**
 * Capture console.log output during test execution
 */
export const captureConsole = () => {
  const logs: string[] = [];
  const originalLog = console.log;

  return {
    start: () => {
      console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      };
    },
    stop: () => {
      console.log = originalLog;
    },
    getLogs: () => [...logs],
    clear: () => {
      logs.length = 0;
    },
  };
};

// ============================================================================
// Process Exit Mock Helper
// ============================================================================

/**
 * Mock process.exit for testing commands that call it
 */
export const mockProcessExit = () => {
  const originalExit = process.exit;
  let exitCalled = false;
  let exitCode: number | undefined;

  return {
    start: () => {
      process.exit = ((code?: number) => {
        exitCalled = true;
        exitCode = code;
      }) as typeof process.exit;
    },
    stop: () => {
      process.exit = originalExit;
    },
    wasExitCalled: () => exitCalled,
    getExitCode: () => exitCode,
    reset: () => {
      exitCalled = false;
      exitCode = undefined;
    },
  };
};
