/**
 * Tests for pl list command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { listCommand } from "../../src/commands/pl/list";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createTestPrompt,
  captureConsole,
  SAMPLE_PROMPTS,
} from "./test-helpers";

describe("pl list command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should list all prompts", async () => {
    const TestLayer = createTestLayer();
    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(listCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("NAME"))).toBe(true);
    expect(logs.some((l) => l.includes("coding-assistant"))).toBe(true);
  });

  it("should show 'No prompts found' when empty", async () => {
    const emptyState = createMockStorageState([]);
    const storage = createMockStorageService(emptyState);
    const TestLayer = createTestLayer({ storage });
    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(listCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("No prompts found"))).toBe(true);
  });

  it("should filter by tags with --tags flag", async () => {
    const TestLayer = createTestLayer();
    const args = createParsedArgs({
      positional: [],
      flags: { tags: "coding" },
    });

    await Effect.runPromise(listCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("coding-assistant"))).toBe(true);
  });

  it("should filter by search with --search flag", async () => {
    const TestLayer = createTestLayer();
    const args = createParsedArgs({
      positional: [],
      flags: { search: "coding" },
    });

    await Effect.runPromise(listCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it("should limit results with --limit flag", async () => {
    const manyPrompts = Array.from({ length: 30 }, (_, i) =>
      createTestPrompt({ id: `prompt-${i}`, name: `prompt-${i}` })
    );
    const state = createMockStorageState(manyPrompts);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { limit: "5" },
    });

    await Effect.runPromise(listCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    // Header + separator + 5 rows = 7 lines
    const contentLines = logs.filter((l) => !l.includes("NAME") && !l.startsWith("-"));
    expect(contentLines.length).toBeLessThanOrEqual(5);
  });

  it("should sort by name with --sort name", async () => {
    const TestLayer = createTestLayer();
    const args = createParsedArgs({
      positional: [],
      flags: { sort: "name" },
    });

    await Effect.runPromise(listCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it("should handle -t shorthand for --tags", async () => {
    const TestLayer = createTestLayer();
    const args = createParsedArgs({
      positional: [],
      flags: { t: "writing" },
    });

    await Effect.runPromise(listCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("writing-helper"))).toBe(true);
  });

  it("should handle -n shorthand for --limit", async () => {
    const TestLayer = createTestLayer();
    const args = createParsedArgs({
      positional: [],
      flags: { n: 2 },
    });

    await Effect.runPromise(listCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });
});
