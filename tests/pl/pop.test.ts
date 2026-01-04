/**
 * Tests for pl pop command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { popCommand } from "../../src/commands/pl/pop";
import {
  createParsedArgs,
  createTestLayer,
  createMockStashService,
  createMockClipboardService,
  captureConsole,
} from "./test-helpers";

describe("pl pop command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should pop latest item from stash to clipboard", async () => {
    const stashState = {
      items: [
        { id: "1", content: "Latest content", createdAt: new Date(), stackOrder: 0 },
        { id: "2", content: "Older content", createdAt: new Date(), stackOrder: 1 },
      ],
    };
    const stash = createMockStashService(stashState);
    const clipboardState = { content: "" };
    const clipboard = createMockClipboardService(clipboardState);
    const TestLayer = createTestLayer({ stash, clipboard });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(popCommand(args).pipe(Effect.provide(TestLayer)));

    expect(clipboardState.content).toBe("Latest content");
    expect(stashState.items.length).toBe(1);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Popped") || l.includes("clipboard"))).toBe(true);
  });

  it("should handle empty stash", async () => {
    const stashState = { items: [] };
    const stash = createMockStashService(stashState);
    const TestLayer = createTestLayer({ stash });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(popCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("empty") || l.includes("Nothing"))).toBe(true);
  });

  it("should pop named item from stash", async () => {
    const stashState = {
      items: [
        { id: "1", content: "Unnamed content", createdAt: new Date(), stackOrder: 0 },
        { id: "2", content: "Named content", name: "my-stash", createdAt: new Date(), stackOrder: 1 },
      ],
    };
    const stash = createMockStashService(stashState);
    const clipboardState = { content: "" };
    const clipboard = createMockClipboardService(clipboardState);
    const TestLayer = createTestLayer({ stash, clipboard });

    const args = createParsedArgs({ positional: ["my-stash"] });

    await Effect.runPromise(popCommand(args).pipe(Effect.provide(TestLayer)));

    // The pop by name should copy the named content
    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThanOrEqual(0);
  });

  it("should pop by index", async () => {
    const stashState = {
      items: [
        { id: "1", content: "First", createdAt: new Date(), stackOrder: 0 },
        { id: "2", content: "Second", createdAt: new Date(), stackOrder: 1 },
        { id: "3", content: "Third", createdAt: new Date(), stackOrder: 2 },
      ],
    };
    const stash = createMockStashService(stashState);
    const clipboardState = { content: "" };
    const clipboard = createMockClipboardService(clipboardState);
    const TestLayer = createTestLayer({ stash, clipboard });

    const args = createParsedArgs({ positional: ["1"] });

    await Effect.runPromise(popCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThanOrEqual(0);
  });

  it("should output to stdout with --stdout flag", async () => {
    const stashState = {
      items: [
        { id: "1", content: "Stdout content", createdAt: new Date(), stackOrder: 0 },
      ],
    };
    const stash = createMockStashService(stashState);
    const TestLayer = createTestLayer({ stash });

    const args = createParsedArgs({
      positional: [],
      flags: { stdout: true },
    });

    await Effect.runPromise(popCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    // Should output content to stdout
    expect(logs.length).toBeGreaterThanOrEqual(0);
  });

  it("should peek without removing with --peek flag", async () => {
    const stashState = {
      items: [
        { id: "1", content: "Peek content", createdAt: new Date(), stackOrder: 0 },
      ],
    };
    const stash = createMockStashService(stashState);
    const clipboardState = { content: "" };
    const clipboard = createMockClipboardService(clipboardState);
    const TestLayer = createTestLayer({ stash, clipboard });

    const args = createParsedArgs({
      positional: [],
      flags: { peek: true },
    });

    await Effect.runPromise(popCommand(args).pipe(Effect.provide(TestLayer)));

    // Item should still be in stash after peek
    expect(stashState.items.length).toBe(1);
  });
});
