/**
 * Tests for pl pin command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { pinCommand } from "../../src/commands/pl/pin";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockSqlService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl pin command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should toggle pin status on prompt", async () => {
    const prompt = createTestPrompt({
      id: "pin-test",
      name: "pin-prompt",
      isPinned: false,
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({ positional: ["pin-prompt"] });

    await Effect.runPromise(pinCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Pinned") || l.includes("pin"))).toBe(true);
    expect(state.prompts.get("pin-test")?.isPinned).toBe(true);
  });

  it("should unpin when already pinned", async () => {
    const prompt = createTestPrompt({
      id: "unpin-test",
      name: "unpin-prompt",
      isPinned: true,
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({ positional: ["unpin-prompt"] });

    await Effect.runPromise(pinCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Unpinned") || l.includes("removed"))).toBe(true);
    expect(state.prompts.get("unpin-test")?.isPinned).toBe(false);
  });

  it("should list pinned prompts with --list flag", async () => {
    const sql = {
      ...createMockSqlService(),
      query: <T>(_sql: string, _params?: unknown[]) =>
        Effect.succeed([
          { id: "pin-1", name: "Pinned One", updated_at: new Date().toISOString() },
          { id: "pin-2", name: "Pinned Two", updated_at: new Date().toISOString() },
        ] as T[]),
    };
    const TestLayer = createTestLayer({ sql });

    const args = createParsedArgs({
      positional: [],
      flags: { list: true },
    });

    await Effect.runPromise(pinCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("PINNED") || l.includes("Pinned"))).toBe(true);
    expect(logs.some((l) => l.includes("Pinned One"))).toBe(true);
    expect(logs.some((l) => l.includes("Pinned Two"))).toBe(true);
  });

  it("should handle -l shorthand for --list", async () => {
    const sql = {
      ...createMockSqlService(),
      query: <T>() => Effect.succeed([] as T[]),
    };
    const TestLayer = createTestLayer({ sql });

    const args = createParsedArgs({
      positional: [],
      flags: { l: true },
    });

    await Effect.runPromise(pinCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("No pinned") || l.includes("empty"))).toBe(true);
  });

  it("should add to pins with --add flag", async () => {
    const prompt = createTestPrompt({
      id: "add-pin-test",
      name: "add-pin-prompt",
      isPinned: false,
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { add: "add-pin-prompt" },
    });

    await Effect.runPromise(pinCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Pinned") || l.includes("added"))).toBe(true);
  });

  it("should handle already pinned with --add flag", async () => {
    const prompt = createTestPrompt({
      id: "already-pin",
      name: "already-pin-prompt",
      isPinned: true,
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { add: "already-pin-prompt" },
    });

    await Effect.runPromise(pinCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("already pinned"))).toBe(true);
  });

  it("should remove from pins with --remove flag", async () => {
    const prompt = createTestPrompt({
      id: "remove-pin",
      name: "remove-pin-prompt",
      isPinned: true,
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { remove: "remove-pin-prompt" },
    });

    await Effect.runPromise(pinCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Unpinned") || l.includes("removed"))).toBe(true);
  });

  it("should handle not pinned with --remove flag", async () => {
    const prompt = createTestPrompt({
      id: "not-pin",
      name: "not-pin-prompt",
      isPinned: false,
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { remove: "not-pin-prompt" },
    });

    await Effect.runPromise(pinCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("not pinned"))).toBe(true);
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(pinCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage:"))).toBe(true);
  });
});
