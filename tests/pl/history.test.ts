/**
 * Tests for pl history command
 *
 * The history command displays version history for a prompt.
 * Uses VersionService to list and diff versions.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { historyCommand } from "../../src/commands/pl/history";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockVersionService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";
import type { PromptVersion } from "../../src/services/version-service";

describe("pl history command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should show version history for a prompt", async () => {
    const prompt = createTestPrompt({ id: "history-test", name: "history-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const versions: PromptVersion[] = [
      { id: 1, promptId: "history-test", version: 3, content: "v3 content", frontmatter: {}, createdAt: new Date(), branch: "main" },
      { id: 2, promptId: "history-test", version: 2, content: "v2 content", frontmatter: {}, createdAt: new Date(), branch: "main" },
      { id: 3, promptId: "history-test", version: 1, content: "v1 content", frontmatter: {}, createdAt: new Date(), branch: "main" },
    ];
    const versionService = createMockVersionService(versions);
    const TestLayer = createTestLayer({ storage, versions: versionService });

    const args = createParsedArgs({ positional: ["history-prompt"] });

    await Effect.runPromise(historyCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("3") || l.includes("version") || l.includes("HEAD"))).toBe(true);
  });

  it("should limit history entries with -n flag", async () => {
    const prompt = createTestPrompt({ id: "limit-test", name: "limit-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let receivedOptions: any;
    const versionService = {
      ...createMockVersionService([]),
      listVersions: (promptId: string, options?: any) => {
        receivedOptions = options;
        return Effect.succeed([]);
      },
    };
    const TestLayer = createTestLayer({ storage, versions: versionService });

    const args = createParsedArgs({
      positional: ["limit-prompt"],
      flags: { n: 5 },
    });

    await Effect.runPromise(historyCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.limit).toBe(5);
  });

  it("should show all versions with --all flag", async () => {
    const prompt = createTestPrompt({ id: "all-test", name: "all-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let receivedOptions: any;
    const versionService = {
      ...createMockVersionService([]),
      listVersions: (promptId: string, options?: any) => {
        receivedOptions = options;
        return Effect.succeed([]);
      },
    };
    const TestLayer = createTestLayer({ storage, versions: versionService });

    const args = createParsedArgs({
      positional: ["all-prompt"],
      flags: { all: true },
    });

    await Effect.runPromise(historyCommand(args).pipe(Effect.provide(TestLayer)));

    // --all should not set a limit
    expect(receivedOptions?.limit).toBeUndefined();
  });

  it("should show no versions message when empty", async () => {
    const prompt = createTestPrompt({ id: "empty-test", name: "empty-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const versionService = createMockVersionService([]);
    const TestLayer = createTestLayer({ storage, versions: versionService });

    const args = createParsedArgs({ positional: ["empty-prompt"] });

    await Effect.runPromise(historyCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("No") || l.includes("empty") || l.includes("history"))).toBe(true);
  });

  it("should fail with validation error when no prompt name provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    const result = await Effect.runPromiseExit(
      historyCommand(args).pipe(Effect.provide(TestLayer))
    );

    // Should fail with validation error including usage message
    expect(result._tag).toBe("Failure");
  });
});
