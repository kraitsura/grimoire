/**
 * Tests for pl reindex command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { reindexCommand } from "../../src/commands/pl/reindex";
import {
  createParsedArgs,
  createTestLayer,
  createMockSearchService,
  captureConsole,
} from "./test-helpers";

describe("pl reindex command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should reindex the search index", async () => {
    let reindexCalled = false;
    const search = {
      ...createMockSearchService([]),
      reindex: () => {
        reindexCalled = true;
        return Effect.void;
      },
    };
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(reindexCommand(args).pipe(Effect.provide(TestLayer)));

    expect(reindexCalled).toBe(true);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Reindex") || l.includes("complete"))).toBe(true);
  });

  it("should rebuild entire index with --full flag", async () => {
    let rebuildCalled = false;
    const search = {
      ...createMockSearchService([]),
      rebuildIndex: () => {
        rebuildCalled = true;
        return Effect.void;
      },
      reindex: () => Effect.void,
    };
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({
      positional: [],
      flags: { full: true },
    });

    await Effect.runPromise(reindexCommand(args).pipe(Effect.provide(TestLayer)));

    expect(rebuildCalled).toBe(true);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Rebuild") || l.includes("full"))).toBe(true);
  });

  it("should show progress during reindex", async () => {
    const search = {
      ...createMockSearchService([]),
      reindex: () => Effect.void,
    };
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({
      positional: [],
      flags: { verbose: true },
    });

    await Effect.runPromise(reindexCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });
});
