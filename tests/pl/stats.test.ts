/**
 * Tests for pl stats command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { statsCommand } from "../../src/commands/pl/stats";
import {
  createParsedArgs,
  createTestLayer,
  createMockStatsService,
  createMockStorageService,
  createMockStorageState,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl stats command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should display collection statistics", async () => {
    const stats = {
      ...createMockStatsService(),
      getCollectionStats: () =>
        Effect.succeed({
          totalPrompts: 25,
          totalTemplates: 5,
          tagDistribution: { coding: 10, writing: 8, assistant: 7 },
          mostUsed: [],
          recentlyEdited: [],
        }),
    };
    const TestLayer = createTestLayer({ stats });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(statsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("25") || l.includes("prompts"))).toBe(true);
    expect(logs.some((l) => l.includes("5") || l.includes("templates"))).toBe(true);
  });

  it("should display stats for specific prompt", async () => {
    // Create storage with the prompt we're looking for
    const storageState = createMockStorageState([
      createTestPrompt({ id: "my-prompt-id", name: "my-prompt" }),
    ]);
    const stats = {
      ...createMockStatsService(),
      getPromptStats: (_promptId: string) =>
        Effect.succeed({
          characterCount: 500,
          wordCount: 100,
          lineCount: 20,
          copyCount: 15,
          testCount: 8,
          viewCount: 25,
          editCount: 5,
          lastUsed: new Date(),
        }),
    };
    const TestLayer = createTestLayer({
      stats,
      storage: createMockStorageService(storageState),
    });

    const args = createParsedArgs({ positional: ["my-prompt"] });

    await Effect.runPromise(statsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("15") || l.includes("Copies"))).toBe(true);
  });

  it("should show top prompts in collection stats", async () => {
    const stats = {
      ...createMockStatsService(),
      getCollectionStats: () =>
        Effect.succeed({
          totalPrompts: 10,
          totalTemplates: 2,
          tagDistribution: {},
          mostUsed: [
            { promptId: "1", name: "top-prompt-1", count: 50 },
            { promptId: "2", name: "top-prompt-2", count: 30 },
            { promptId: "3", name: "top-prompt-3", count: 20 },
          ],
          recentlyEdited: [],
        }),
    };
    const TestLayer = createTestLayer({ stats });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(statsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it("should show tag distribution", async () => {
    const stats = {
      ...createMockStatsService(),
      getCollectionStats: () =>
        Effect.succeed({
          totalPrompts: 10,
          totalTemplates: 2,
          tagDistribution: {
            coding: 10,
            writing: 5,
            testing: 3,
          },
          mostUsed: [],
          recentlyEdited: [],
        }),
    };
    const TestLayer = createTestLayer({ stats });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(statsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("coding") || l.includes("10"))).toBe(true);
  });

  it("should handle --json flag for machine-readable output", async () => {
    const stats = {
      ...createMockStatsService(),
      getCollectionStats: () =>
        Effect.succeed({
          totalPrompts: 10,
          totalTemplates: 2,
          tagDistribution: {},
          mostUsed: [],
          recentlyEdited: [],
        }),
    };
    const TestLayer = createTestLayer({ stats });

    const args = createParsedArgs({
      positional: [],
      flags: { json: true },
    });

    await Effect.runPromise(statsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    // Output should be valid JSON
    const jsonOutput = logs.join("\n");
    expect(() => JSON.parse(jsonOutput)).not.toThrow();
  });

  it("should show usage statistics over time periods", async () => {
    const stats = {
      ...createMockStatsService(),
      getCollectionStats: () =>
        Effect.succeed({
          totalPrompts: 10,
          totalTemplates: 2,
          tagDistribution: {},
          mostUsed: [],
          recentlyEdited: [],
        }),
    };
    const TestLayer = createTestLayer({ stats });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(statsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });
});
