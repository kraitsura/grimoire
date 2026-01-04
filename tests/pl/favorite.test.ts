/**
 * Tests for pl favorite command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { favoriteCommand } from "../../src/commands/pl/favorite";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockSqlService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl favorite command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should toggle favorite status on prompt", async () => {
    const prompt = createTestPrompt({
      id: "fav-test",
      name: "fav-prompt",
      isFavorite: false,
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({ positional: ["fav-prompt"] });

    await Effect.runPromise(favoriteCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Added") && l.includes("favorites"))).toBe(true);
    expect(state.prompts.get("fav-test")?.isFavorite).toBe(true);
  });

  it("should remove from favorites when already favorited", async () => {
    const prompt = createTestPrompt({
      id: "unfav-test",
      name: "unfav-prompt",
      isFavorite: true,
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({ positional: ["unfav-prompt"] });

    await Effect.runPromise(favoriteCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Removed") && l.includes("favorites"))).toBe(true);
    expect(state.prompts.get("unfav-test")?.isFavorite).toBe(false);
  });

  it("should list favorites with --list flag", async () => {
    const sql = {
      ...createMockSqlService(),
      query: <T>(_sql: string, _params?: unknown[]) =>
        Effect.succeed([
          { id: "fav-1", name: "Favorite One", updated_at: new Date().toISOString() },
          { id: "fav-2", name: "Favorite Two", updated_at: new Date().toISOString() },
        ] as T[]),
    };
    const TestLayer = createTestLayer({ sql });

    const args = createParsedArgs({
      positional: [],
      flags: { list: true },
    });

    await Effect.runPromise(favoriteCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("FAVORITE PROMPTS"))).toBe(true);
    expect(logs.some((l) => l.includes("Favorite One"))).toBe(true);
    expect(logs.some((l) => l.includes("Favorite Two"))).toBe(true);
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

    await Effect.runPromise(favoriteCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("No favorite prompts"))).toBe(true);
  });

  it("should add to favorites with --add flag", async () => {
    const prompt = createTestPrompt({
      id: "add-fav-test",
      name: "add-fav-prompt",
      isFavorite: false,
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { add: "add-fav-prompt" },
    });

    await Effect.runPromise(favoriteCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Added") && l.includes("favorites"))).toBe(true);
  });

  it("should handle already favorited with --add flag", async () => {
    const prompt = createTestPrompt({
      id: "already-fav",
      name: "already-fav-prompt",
      isFavorite: true,
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { add: "already-fav-prompt" },
    });

    await Effect.runPromise(favoriteCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("already a favorite"))).toBe(true);
  });

  it("should remove from favorites with --remove flag", async () => {
    const prompt = createTestPrompt({
      id: "remove-fav",
      name: "remove-fav-prompt",
      isFavorite: true,
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { remove: "remove-fav-prompt" },
    });

    await Effect.runPromise(favoriteCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Removed") && l.includes("favorites"))).toBe(true);
  });

  it("should handle not favorited with --remove flag", async () => {
    const prompt = createTestPrompt({
      id: "not-fav",
      name: "not-fav-prompt",
      isFavorite: false,
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { remove: "not-fav-prompt" },
    });

    await Effect.runPromise(favoriteCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("not a favorite"))).toBe(true);
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(favoriteCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage:"))).toBe(true);
  });
});
