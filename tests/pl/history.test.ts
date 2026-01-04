/**
 * Tests for pl history command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { historyCommand } from "../../src/commands/pl/history";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockStatsService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl history command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should show usage history for a prompt", async () => {
    const prompt = createTestPrompt({ id: "history-test", name: "history-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const stats = {
      ...createMockStatsService(),
      getPromptStats: (promptId: string) =>
        Effect.succeed({
          promptId,
          copies: 25,
          tests: 10,
          lastUsed: new Date(),
          totalTokens: 5000,
        }),
    };
    const TestLayer = createTestLayer({ storage, stats });

    const args = createParsedArgs({ positional: ["history-prompt"] });

    await Effect.runPromise(historyCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("25") || l.includes("copies"))).toBe(true);
    expect(logs.some((l) => l.includes("10") || l.includes("tests"))).toBe(true);
  });

  it("should show overall history with --all flag", async () => {
    const stats = {
      ...createMockStatsService(),
      getCollectionStats: () =>
        Effect.succeed({
          totalPrompts: 50,
          totalTemplates: 10,
          totalTags: 25,
          topPrompts: [
            { name: "popular-1", copies: 100 },
            { name: "popular-2", copies: 75 },
          ],
          tagCounts: {},
        }),
    };
    const TestLayer = createTestLayer({ stats });

    const args = createParsedArgs({
      positional: [],
      flags: { all: true },
    });

    await Effect.runPromise(historyCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("50") || l.includes("prompts"))).toBe(true);
  });

  it("should limit history entries with --limit flag", async () => {
    const stats = {
      ...createMockStatsService(),
      getCollectionStats: () =>
        Effect.succeed({
          totalPrompts: 50,
          totalTemplates: 10,
          totalTags: 25,
          topPrompts: Array.from({ length: 20 }, (_, i) => ({
            name: `prompt-${i}`,
            copies: 100 - i,
          })),
          tagCounts: {},
        }),
    };
    const TestLayer = createTestLayer({ stats });

    const args = createParsedArgs({
      positional: [],
      flags: { all: true, limit: "5" },
    });

    await Effect.runPromise(historyCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    // Should only show limited number of entries
    expect(logs.length).toBeLessThanOrEqual(15);
  });

  it("should filter by date with --since flag", async () => {
    const prompt = createTestPrompt({ id: "since-test", name: "since-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["since-prompt"],
      flags: { since: "2025-01-01" },
    });

    await Effect.runPromise(historyCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it("should output JSON with --json flag", async () => {
    const prompt = createTestPrompt({ id: "json-history", name: "json-history-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const stats = {
      ...createMockStatsService(),
      getPromptStats: (_promptId: string) =>
        Effect.succeed({
          promptId: "json-history",
          copies: 10,
          tests: 5,
          lastUsed: new Date(),
          totalTokens: 1000,
        }),
    };
    const TestLayer = createTestLayer({ storage, stats });

    const args = createParsedArgs({
      positional: ["json-history-prompt"],
      flags: { json: true },
    });

    await Effect.runPromise(historyCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    const output = logs.join("\n");
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(historyCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should clear history with --clear flag", async () => {
    const prompt = createTestPrompt({ id: "clear-history", name: "clear-history-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["clear-history-prompt"],
      flags: { clear: true, yes: true },
    });

    await Effect.runPromise(historyCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Cleared") || l.includes("history"))).toBe(true);
  });
});
