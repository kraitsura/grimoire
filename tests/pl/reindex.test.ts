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

  it("should rebuild the search index", async () => {
    let rebuildCalled = false;
    const search = {
      ...createMockSearchService([]),
      rebuildIndex: () => {
        rebuildCalled = true;
        return Effect.void;
      },
    };
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(reindexCommand(args).pipe(Effect.provide(TestLayer)));

    expect(rebuildCalled).toBe(true);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("rebuilt") || l.includes("Rebuilding"))).toBe(true);
  });

  it("should show progress messages", async () => {
    const search = {
      ...createMockSearchService([]),
      rebuildIndex: () => Effect.void,
    };
    const TestLayer = createTestLayer({ search });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(reindexCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.includes("search index"))).toBe(true);
  });
});
