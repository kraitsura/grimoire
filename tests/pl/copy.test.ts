/**
 * Tests for pl copy command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { copyCommand } from "../../src/commands/pl/copy";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockClipboardService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl copy command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should copy prompt content to clipboard", async () => {
    const prompt = createTestPrompt({
      id: "copy-test",
      name: "copy-prompt",
      content: "Content to copy",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const clipboardState = { content: "" };
    const clipboard = createMockClipboardService(clipboardState);
    const TestLayer = createTestLayer({ storage, clipboard });

    const args = createParsedArgs({ positional: ["copy-prompt"] });

    await Effect.runPromise(copyCommand(args).pipe(Effect.provide(TestLayer)));

    expect(clipboardState.content).toBe("Content to copy");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Copied to clipboard"))).toBe(true);
  });

  it("should copy by ID", async () => {
    const prompt = createTestPrompt({
      id: "id-copy-test",
      name: "id-copy-prompt",
      content: "ID content",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const clipboardState = { content: "" };
    const clipboard = createMockClipboardService(clipboardState);
    const TestLayer = createTestLayer({ storage, clipboard });

    const args = createParsedArgs({ positional: ["id-copy-test"] });

    await Effect.runPromise(copyCommand(args).pipe(Effect.provide(TestLayer)));

    expect(clipboardState.content).toBe("ID content");
  });

  it("should output to stdout with --stdout flag", async () => {
    const prompt = createTestPrompt({
      id: "stdout-test",
      name: "stdout-prompt",
      content: "Stdout content",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["stdout-prompt"],
      flags: { stdout: true },
    });

    await Effect.runPromise(copyCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Stdout content"))).toBe(true);
    // Should not include "Copied to clipboard"
    expect(logs.some((l) => l.includes("Copied to clipboard"))).toBe(false);
  });

  it("should preserve raw content with --raw flag", async () => {
    const prompt = createTestPrompt({
      id: "raw-test",
      name: "raw-prompt",
      content: "Hello {{name}}, welcome to {{place}}!",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const clipboardState = { content: "" };
    const clipboard = createMockClipboardService(clipboardState);
    const TestLayer = createTestLayer({ storage, clipboard });

    const args = createParsedArgs({
      positional: ["raw-prompt"],
      flags: { raw: true },
    });

    await Effect.runPromise(copyCommand(args).pipe(Effect.provide(TestLayer)));

    // With --raw, template variables should not be interpolated
    expect(clipboardState.content).toBe("Hello {{name}}, welcome to {{place}}!");
  });

  it("should handle -r shorthand for --raw", async () => {
    const prompt = createTestPrompt({
      id: "raw-short",
      name: "raw-short-prompt",
      content: "{{variable}}",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const clipboardState = { content: "" };
    const clipboard = createMockClipboardService(clipboardState);
    const TestLayer = createTestLayer({ storage, clipboard });

    const args = createParsedArgs({
      positional: ["raw-short-prompt"],
      flags: { r: true },
    });

    await Effect.runPromise(copyCommand(args).pipe(Effect.provide(TestLayer)));

    expect(clipboardState.content).toBe("{{variable}}");
  });

  it("should fail for non-existent prompt", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({ positional: ["non-existent"] });

    const result = await Effect.runPromiseExit(
      copyCommand(args).pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("Failure");
  });
});
