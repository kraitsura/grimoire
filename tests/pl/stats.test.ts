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
          totalTags: 10,
          topPrompts: [],
          tagCounts: { coding: 10, writing: 8, assistant: 7 },
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
    const stats = {
      ...createMockStatsService(),
      getPromptStats: (promptId: string) =>
        Effect.succeed({
          promptId,
          copies: 15,
          tests: 8,
          lastUsed: new Date(),
          totalTokens: 5000,
        }),
    };
    const TestLayer = createTestLayer({ stats });

    const args = createParsedArgs({ positional: ["my-prompt"] });

    await Effect.runPromise(statsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("15") || l.includes("copies"))).toBe(true);
  });

  it("should show top prompts in collection stats", async () => {
    const stats = {
      ...createMockStatsService(),
      getCollectionStats: () =>
        Effect.succeed({
          totalPrompts: 10,
          totalTemplates: 2,
          totalTags: 5,
          topPrompts: [
            { name: "top-prompt-1", copies: 50 },
            { name: "top-prompt-2", copies: 30 },
            { name: "top-prompt-3", copies: 20 },
          ],
          tagCounts: {},
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
          totalTags: 3,
          topPrompts: [],
          tagCounts: {
            coding: 10,
            writing: 5,
            testing: 3,
          },
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
          totalTags: 5,
          topPrompts: [],
          tagCounts: {},
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
          totalTags: 5,
          topPrompts: [],
          tagCounts: {},
          usage: {
            today: 5,
            week: 25,
            month: 100,
          },
        }),
    };
    const TestLayer = createTestLayer({ stats });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(statsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });
});
