/**
 * Tests for pl search command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { searchCommand } from "../../src/commands/pl/search";
import {
  createParsedArgs,
  createTestLayer,
  createMockSearchService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";
import type { SearchResult } from "../../src/services/search-service";

describe("pl search command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should search and display results", async () => {
    const results: SearchResult[] = [
      {
        prompt: createTestPrompt({ name: "coding-assistant", tags: ["coding"] }),
        snippet: "This is a coding assistant prompt",
        highlights: [{ start: 10, end: 16 }],
        score: 1.0,
      },
    ];
    const search = createMockSearchService(results);
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({ positional: ["coding"] });

    await Effect.runPromise(searchCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Found 1 result"))).toBe(true);
    expect(logs.some((l) => l.includes("coding-assistant"))).toBe(true);
  });

  it("should show no results message when empty", async () => {
    const search = createMockSearchService([]);
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({ positional: ["nonexistent"] });

    await Effect.runPromise(searchCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("No results found"))).toBe(true);
  });

  it("should display multiple results", async () => {
    const results: SearchResult[] = [
      {
        prompt: createTestPrompt({ name: "result-1" }),
        snippet: "First result",
        highlights: [],
        score: 1.0,
      },
      {
        prompt: createTestPrompt({ name: "result-2" }),
        snippet: "Second result",
        highlights: [],
        score: 0.9,
      },
      {
        prompt: createTestPrompt({ name: "result-3" }),
        snippet: "Third result",
        highlights: [],
        score: 0.8,
      },
    ];
    const search = createMockSearchService(results);
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({ positional: ["test"] });

    await Effect.runPromise(searchCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Found 3 results"))).toBe(true);
    expect(logs.some((l) => l.includes("result-1"))).toBe(true);
    expect(logs.some((l) => l.includes("result-2"))).toBe(true);
    expect(logs.some((l) => l.includes("result-3"))).toBe(true);
  });

  it("should filter by tags with --tags flag", async () => {
    let receivedOptions: any;
    const search = {
      ...createMockSearchService([]),
      search: (options: any) => {
        receivedOptions = options;
        return Effect.succeed([]);
      },
    };
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({
      positional: ["query"],
      flags: { tags: "tag1,tag2" },
    });

    await Effect.runPromise(searchCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.tags).toEqual(["tag1", "tag2"]);
  });

  it("should handle -t shorthand for --tags", async () => {
    let receivedOptions: any;
    const search = {
      ...createMockSearchService([]),
      search: (options: any) => {
        receivedOptions = options;
        return Effect.succeed([]);
      },
    };
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({
      positional: ["query"],
      flags: { t: "coding" },
    });

    await Effect.runPromise(searchCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.tags).toEqual(["coding"]);
  });

  it("should filter by date range with --from and --to", async () => {
    let receivedOptions: any;
    const search = {
      ...createMockSearchService([]),
      search: (options: any) => {
        receivedOptions = options;
        return Effect.succeed([]);
      },
    };
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({
      positional: ["query"],
      flags: {
        from: "2025-01-01",
        to: "2025-12-31",
      },
    });

    await Effect.runPromise(searchCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.fromDate).toBe("2025-01-01");
    expect(receivedOptions?.toDate).toBe("2025-12-31");
  });

  it("should limit results with --limit flag", async () => {
    let receivedOptions: any;
    const search = {
      ...createMockSearchService([]),
      search: (options: any) => {
        receivedOptions = options;
        return Effect.succeed([]);
      },
    };
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({
      positional: ["query"],
      flags: { limit: "5" },
    });

    await Effect.runPromise(searchCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.limit).toBe(5);
  });

  it("should default limit to 20", async () => {
    let receivedOptions: any;
    const search = {
      ...createMockSearchService([]),
      search: (options: any) => {
        receivedOptions = options;
        return Effect.succeed([]);
      },
    };
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({ positional: ["query"] });

    await Effect.runPromise(searchCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.limit).toBe(20);
  });

  it("should show stub message for --interactive flag", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({
      positional: ["query"],
      flags: { interactive: true },
    });

    await Effect.runPromise(searchCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Interactive mode is not yet implemented"))).toBe(true);
  });

  it("should handle -i shorthand for --interactive", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({
      positional: ["query"],
      flags: { i: true },
    });

    await Effect.runPromise(searchCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Interactive mode is not yet implemented"))).toBe(true);
  });

  it("should display tags in results", async () => {
    const results: SearchResult[] = [
      {
        prompt: createTestPrompt({ name: "tagged-result", tags: ["tag1", "tag2"] }),
        snippet: "Tagged result",
        highlights: [],
        score: 1.0,
      },
    ];
    const search = createMockSearchService(results);
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({ positional: ["test"] });

    await Effect.runPromise(searchCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("tag1") && l.includes("tag2"))).toBe(true);
  });

  it("should enable fuzzy search with --fuzzy flag", async () => {
    let receivedOptions: any;
    const search = {
      ...createMockSearchService([]),
      search: (options: any) => {
        receivedOptions = options;
        return Effect.succeed([]);
      },
    };
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({
      positional: ["query"],
      flags: { fuzzy: true },
    });

    await Effect.runPromise(searchCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.fuzzy).toBe(true);
  });
});
