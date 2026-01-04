/**
 * Tests for pl show command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { showCommand } from "../../src/commands/pl/show";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";
import { PromptNotFoundError } from "../../src/models";

describe("pl show command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should show prompt by name", async () => {
    const TestLayer = createTestLayer();
    const args = createParsedArgs({ positional: ["coding-assistant"] });

    await Effect.runPromise(showCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("coding-assistant"))).toBe(true);
  });

  it("should show prompt by ID", async () => {
    const TestLayer = createTestLayer();
    const args = createParsedArgs({ positional: ["prompt-1"] });

    await Effect.runPromise(showCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("coding-assistant"))).toBe(true);
  });

  it("should output raw content with --raw flag", async () => {
    const prompt = createTestPrompt({
      id: "test-id",
      name: "test-prompt",
      content: "This is the raw content.",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["test-prompt"],
      flags: { raw: true },
    });

    await Effect.runPromise(showCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("This is the raw content."))).toBe(true);
    // Should not include metadata box
    expect(logs.some((l) => l.includes("ID:"))).toBe(false);
  });

  it("should output JSON with --json flag", async () => {
    const prompt = createTestPrompt({
      id: "json-test-id",
      name: "json-prompt",
      content: "JSON content",
      tags: ["test"],
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["json-prompt"],
      flags: { json: true },
    });

    await Effect.runPromise(showCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    const jsonOutput = logs.join("\n");
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.id).toBe("json-test-id");
    expect(parsed.name).toBe("json-prompt");
    expect(parsed.content).toBe("JSON content");
    expect(parsed.tags).toEqual(["test"]);
  });

  it("should handle -r shorthand for --raw", async () => {
    const prompt = createTestPrompt({
      id: "raw-id",
      name: "raw-prompt",
      content: "Shorthand raw content",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["raw-prompt"],
      flags: { r: true },
    });

    await Effect.runPromise(showCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Shorthand raw content"))).toBe(true);
  });

  it("should fail for non-existent prompt", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({ positional: ["non-existent"] });

    const result = await Effect.runPromiseExit(
      showCommand(args).pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("Failure");
  });

  it("should display formatted output with metadata box", async () => {
    const prompt = createTestPrompt({
      id: "formatted-id",
      name: "formatted-prompt",
      content: "Test content",
      tags: ["tag1", "tag2"],
      version: 3,
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({ positional: ["formatted-prompt"] });

    await Effect.runPromise(showCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("formatted-prompt"))).toBe(true);
    expect(logs.some((l) => l.includes("ID:"))).toBe(true);
    expect(logs.some((l) => l.includes("Tags:"))).toBe(true);
    expect(logs.some((l) => l.includes("Version:"))).toBe(true);
  });
});
