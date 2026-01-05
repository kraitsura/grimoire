/**
 * Tests for pl stash command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { stashCommand } from "../../src/commands/pl/stash";
import {
  createParsedArgs,
  createTestLayer,
  createMockStashService,
  createMockClipboardService,
  captureConsole,
} from "./test-helpers";

describe("pl stash command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should stash clipboard content", async () => {
    const clipboardState = { content: "Content to stash" };
    const clipboard = createMockClipboardService(clipboardState);
    const stashState = { items: [] };
    const stash = createMockStashService(stashState);
    const TestLayer = createTestLayer({ clipboard, stash });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(stashCommand(args).pipe(Effect.provide(TestLayer)));

    expect(stashState.items.length).toBe(1);
    expect(stashState.items[0].content).toBe("Content to stash");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Stashed"))).toBe(true);
  });

  it("should stash with a name", async () => {
    const clipboardState = { content: "Named content" };
    const clipboard = createMockClipboardService(clipboardState);
    const stashState = { items: [] };
    const stash = createMockStashService(stashState);
    const TestLayer = createTestLayer({ clipboard, stash });

    const args = createParsedArgs({ positional: ["my-stash-name"] });

    await Effect.runPromise(stashCommand(args).pipe(Effect.provide(TestLayer)));

    expect(stashState.items[0].name).toBe("my-stash-name");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("my-stash-name"))).toBe(true);
  });

  it("should handle empty clipboard", async () => {
    const clipboardState = { content: "" };
    const clipboard = createMockClipboardService(clipboardState);
    const TestLayer = createTestLayer({ clipboard });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(stashCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Clipboard is empty"))).toBe(true);
  });

  it("should handle whitespace-only clipboard", async () => {
    const clipboardState = { content: "   \n\t  " };
    const clipboard = createMockClipboardService(clipboardState);
    const TestLayer = createTestLayer({ clipboard });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(stashCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Clipboard is empty"))).toBe(true);
  });

  it("should list stashed items with --list flag", async () => {
    const stashState = {
      items: [
        { id: "1", content: "First item content here", createdAt: new Date(), stackOrder: 0 },
        { id: "2", content: "Second item", name: "named-item", createdAt: new Date(), stackOrder: 1 },
      ],
    };
    const stash = createMockStashService(stashState);
    const TestLayer = createTestLayer({ stash });

    const args = createParsedArgs({
      positional: [],
      flags: { list: true },
    });

    await Effect.runPromise(stashCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Stash (2 items)"))).toBe(true);
    expect(logs.some((l) => l.includes("First item"))).toBe(true);
    expect(logs.some((l) => l.includes("[named-item]"))).toBe(true);
  });

  it("should handle -l shorthand for --list", async () => {
    const stashState = { items: [] };
    const stash = createMockStashService(stashState);
    const TestLayer = createTestLayer({ stash });

    const args = createParsedArgs({
      positional: [],
      flags: { l: true },
    });

    await Effect.runPromise(stashCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Stash is empty"))).toBe(true);
  });

  it("should clear all stashed items with --clear flag", async () => {
    const stashState = {
      items: [
        { id: "1", content: "Item 1", createdAt: new Date(), stackOrder: 0 },
        { id: "2", content: "Item 2", createdAt: new Date(), stackOrder: 1 },
        { id: "3", content: "Item 3", createdAt: new Date(), stackOrder: 2 },
      ],
    };
    const stash = createMockStashService(stashState);
    const TestLayer = createTestLayer({ stash });

    const args = createParsedArgs({
      positional: [],
      flags: { clear: true },
    });

    await Effect.runPromise(stashCommand(args).pipe(Effect.provide(TestLayer)));

    expect(stashState.items.length).toBe(0);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Cleared 3 items"))).toBe(true);
  });

  it("should display character count in stash output", async () => {
    const clipboardState = { content: "This is a 30 character string." };
    const clipboard = createMockClipboardService(clipboardState);
    const stashState = { items: [] };
    const stash = createMockStashService(stashState);
    const TestLayer = createTestLayer({ clipboard, stash });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(stashCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    // "This is a 30 character string." is exactly 30 characters
    expect(logs.some((l) => l.includes("30 chars"))).toBe(true);
  });

  it("should truncate long content in list preview", async () => {
    const longContent = "A".repeat(100);
    const stashState = {
      items: [
        { id: "1", content: longContent, createdAt: new Date(), stackOrder: 0 },
      ],
    };
    const stash = createMockStashService(stashState);
    const TestLayer = createTestLayer({ stash });

    const args = createParsedArgs({
      positional: [],
      flags: { list: true },
    });

    await Effect.runPromise(stashCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("..."))).toBe(true);
  });
});
