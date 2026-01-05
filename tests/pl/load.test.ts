/**
 * Tests for pl load command (promptCommand)
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { promptCommand } from "../../src/commands/pl/load";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createTestPrompt,
  captureConsole,
  createMockClipboardService,
  createMockEditorService,
} from "./test-helpers";

describe("pl load command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should create a new prompt with content flag", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    // The command uses args.command as the prompt name
    const args = createParsedArgs({
      command: "new-prompt",
      positional: [],
      flags: {
        content: "This is the new prompt content.",
      },
    });

    await Effect.runPromise(promptCommand(args).pipe(Effect.provide(TestLayer)));

    expect(state.byName.has("new-prompt")).toBe(true);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Created") || l.includes("new-prompt"))).toBe(true);
  });

  it("should create prompt with tags", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      command: "tagged-prompt",
      positional: [],
      flags: {
        content: "Tagged content",
        tags: "coding,testing",
      },
    });

    await Effect.runPromise(promptCommand(args).pipe(Effect.provide(TestLayer)));

    const created = state.byName.get("tagged-prompt");
    expect(created?.tags).toContain("coding");
    expect(created?.tags).toContain("testing");
  });

  it("should create template prompt with --template flag", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      command: "my-template",
      positional: [],
      flags: {
        content: "Hello {{name}}!",
        template: true,
      },
    });

    await Effect.runPromise(promptCommand(args).pipe(Effect.provide(TestLayer)));

    const created = state.byName.get("my-template");
    expect(created?.isTemplate).toBe(true);
  });

  it("should paste from clipboard with -p flag", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const clipboardState = { content: "Clipboard content here" };
    const clipboard = createMockClipboardService(clipboardState);
    const TestLayer = createTestLayer({ storage, clipboard });

    const args = createParsedArgs({
      command: "paste-prompt",
      positional: [],
      flags: {
        paste: true,
      },
    });

    await Effect.runPromise(promptCommand(args).pipe(Effect.provide(TestLayer)));

    const created = state.byName.get("paste-prompt");
    expect(created?.content).toBe("Clipboard content here");
  });

  it("should edit existing prompt", async () => {
    const existingPrompt = createTestPrompt({ id: "p1", name: "existing", content: "Old content" });
    const state = createMockStorageState([existingPrompt]);
    const storage = createMockStorageService(state);
    const editor = createMockEditorService("New edited content");
    const TestLayer = createTestLayer({ storage, editor });

    const args = createParsedArgs({
      command: "existing",
      positional: [],
      flags: {},
    });

    await Effect.runPromise(promptCommand(args).pipe(Effect.provide(TestLayer)));

    const updated = state.byName.get("existing");
    expect(updated?.content).toBe("New edited content");
  });

  it("should fail for invalid arguments", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    // Can't use both -c and -p
    const args = createParsedArgs({
      command: "test-prompt",
      positional: [],
      flags: {
        content: "Some content",
        paste: true,
      },
    });

    const result = await Effect.runPromiseExit(
      promptCommand(args).pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("Failure");
  });

  it("should rename prompt with --name flag", async () => {
    const existingPrompt = createTestPrompt({ id: "p1", name: "old-name", content: "Content" });
    const state = createMockStorageState([existingPrompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      command: "old-name",
      positional: [],
      flags: {
        name: "new-name",
      },
    });

    await Effect.runPromise(promptCommand(args).pipe(Effect.provide(TestLayer)));

    expect(state.byName.has("new-name")).toBe(true);
  });
});
