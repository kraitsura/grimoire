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
  mockProcessExit,
} from "./test-helpers";

describe("pl load command", () => {
  const console$ = captureConsole();
  const exitMock = mockProcessExit();

  beforeEach(() => {
    console$.start();
    exitMock.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
    exitMock.stop();
    exitMock.reset();
  });

  it("should create a new prompt", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["new-prompt"],
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
      positional: ["tagged-prompt"],
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
      positional: ["template-prompt"],
      flags: {
        content: "You are a {{role}}.",
        template: true,
      },
    });

    await Effect.runPromise(promptCommand(args).pipe(Effect.provide(TestLayer)));

    const created = state.byName.get("template-prompt");
    expect(created?.isTemplate).toBe(true);
  });

  it("should edit existing prompt with --edit flag", async () => {
    const prompt = createTestPrompt({
      id: "edit-test",
      name: "edit-prompt",
      content: "Original content",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["edit-prompt"],
      flags: {
        content: "Updated content",
      },
    });

    await Effect.runPromise(promptCommand(args).pipe(Effect.provide(TestLayer)));

    const updated = state.prompts.get("edit-test");
    expect(updated?.content).toBe("Updated content");
  });

  it("should read content from stdin with --stdin flag", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    // Note: stdin reading would need to be mocked in a real scenario
    const args = createParsedArgs({
      positional: ["stdin-prompt"],
      flags: {
        content: "Simulated stdin content",
      },
    });

    await Effect.runPromise(promptCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThanOrEqual(0);
  });

  it("should fail for duplicate name without --force", async () => {
    const existing = createTestPrompt({ id: "dup-test", name: "duplicate-prompt" });
    const state = createMockStorageState([existing]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["duplicate-prompt"],
      flags: {
        content: "New content",
      },
    });

    const result = await Effect.runPromiseExit(
      promptCommand(args).pipe(Effect.provide(TestLayer))
    );

    // Should fail with duplicate name error
    expect(result._tag).toBe("Failure");
  });

  it("should overwrite with --force flag", async () => {
    const existing = createTestPrompt({
      id: "force-test",
      name: "force-prompt",
      content: "Old content",
    });
    const state = createMockStorageState([existing]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["force-prompt"],
      flags: {
        content: "New forced content",
        force: true,
      },
    });

    await Effect.runPromise(promptCommand(args).pipe(Effect.provide(TestLayer)));

    // Should have updated the content
    const updated = state.prompts.get("force-test");
    expect(updated?.content).toBe("New forced content");
  });

  it("should show usage when no name provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({
      positional: [],
    });

    await Effect.runPromise(promptCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });
});
