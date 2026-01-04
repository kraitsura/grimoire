/**
 * Test Utilities Index
 *
 * Central export for all test utilities.
 * Import from "tests/utils" to access all testing helpers.
 *
 * @example
 * ```ts
 * import {
 *   runTest,
 *   createPrompt,
 *   TestSqlLive,
 *   MockFsLive,
 *   SAMPLE_PROMPTS
 * } from "../utils";
 * ```
 */

// Effect test utilities
export {
  runTest,
  runTestExpectError,
  runTestExpectFailure,
  runScopedTest,
  runTestWithTimeout,
  TestTimeoutError,
  createMockLayer,
  composeTestLayers,
  runParallel,
  assertSuccess,
  type ServiceOf,
  type ErrorOf,
  type SuccessOf,
} from "./test-layer";

// Mock filesystem
export {
  MockFs,
  MockFsLive,
  mockFsWithFiles,
  createMockFs,
  MockFsError,
  type MockFsService,
  type MockFsState,
  type MockFile,
} from "./mock-fs";

// Mock SQLite
export {
  TestSqlLive,
  TestSqlWithMigrationsLive,
  createTestSqlLayer,
  createTestDatabase,
  seedDatabase,
  execSql,
  queryOne,
  countRows,
  tableExists,
  clearTable,
  clearAllTables,
} from "./mock-sql";

// Snapshots
export {
  normalizeForSnapshot,
  normalizeJsonForSnapshot,
  toSnapshotString,
  effectToSnapshot,
  effectErrorToSnapshot,
  stripAnsi,
  redactSensitive,
  prepareForSnapshot,
} from "./snapshots";

// Mock prompt storage
export {
  MockPromptStorageLive,
  mockPromptStorageWithFiles,
  createMockPromptStorage,
  createMockFile,
} from "./mock-prompt-storage";

// Fixtures
export {
  // UUID
  testUuid,
  resetUuidCounter,
  // Dates
  daysAgo,
  hoursAgo,
  FIXED_DATE,
  // Prompts
  createPrompt,
  createFrontmatter,
  createPrompts,
  SAMPLE_PROMPTS,
  // Versions
  createVersion,
  // Branches
  createBranch,
  // Skills
  createSkillManifest,
  SAMPLE_SKILLS,
  // Markdown
  createMarkdownWithFrontmatter,
  SAMPLE_MARKDOWN,
  // Tags
  SAMPLE_TAGS,
  // Effects
  effectPrompt,
  effectPrompts,
  // Types
  type PromptFixtureOptions,
  type VersionFixtureOptions,
  type BranchFixtureOptions,
  type SkillFixtureOptions,
} from "./fixtures";
