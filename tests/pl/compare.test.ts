/**
 * Tests for pl compare command
 *
 * The compare command performs A/B testing by comparing multiple prompts
 * against the same LLM request, showing timing and cost comparisons.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { compareCommand } from "../../src/commands/pl/compare";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockLLMService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl compare command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should show usage when less than 2 prompts provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({
      positional: ["only-one-prompt"],
    });

    await Effect.runPromise(compareCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage:") || l.includes("compare"))).toBe(true);
  });

  it("should compare two prompts", async () => {
    const prompt1 = createTestPrompt({ id: "prompt-1", name: "prompt-a", content: "First prompt content" });
    const prompt2 = createTestPrompt({ id: "prompt-2", name: "prompt-b", content: "Second prompt content" });
    const state = createMockStorageState([prompt1, prompt2]);
    const storage = createMockStorageService(state);
    const llm = createMockLLMService("Mock response for comparison");
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["prompt-a", "prompt-b"],
    });

    await Effect.runPromise(compareCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    // Should have some output about the comparison
    expect(logs.length).toBeGreaterThan(0);
  });

  it("should compare multiple prompts", async () => {
    const prompt1 = createTestPrompt({ id: "prompt-1", name: "v1" });
    const prompt2 = createTestPrompt({ id: "prompt-2", name: "v2" });
    const prompt3 = createTestPrompt({ id: "prompt-3", name: "v3" });
    const state = createMockStorageState([prompt1, prompt2, prompt3]);
    const storage = createMockStorageService(state);
    const llm = createMockLLMService("Response");
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["v1", "v2", "v3"],
    });

    await Effect.runPromise(compareCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it("should use specified model with --model flag", async () => {
    const prompt1 = createTestPrompt({ id: "p1", name: "prompt-1" });
    const prompt2 = createTestPrompt({ id: "p2", name: "prompt-2" });
    const state = createMockStorageState([prompt1, prompt2]);
    const storage = createMockStorageService(state);
    const llm = createMockLLMService("Response");
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["prompt-1", "prompt-2"],
      flags: { model: "claude-sonnet-4-20250514" },
    });

    await Effect.runPromise(compareCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it("should output JSON format with --format json", async () => {
    const prompt1 = createTestPrompt({ id: "p1", name: "a" });
    const prompt2 = createTestPrompt({ id: "p2", name: "b" });
    const state = createMockStorageState([prompt1, prompt2]);
    const storage = createMockStorageService(state);
    const llm = createMockLLMService("JSON output test");
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["a", "b"],
      flags: { format: "json" },
    });

    await Effect.runPromise(compareCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it("should fail gracefully for non-existent prompt", async () => {
    const prompt1 = createTestPrompt({ id: "p1", name: "exists" });
    const state = createMockStorageState([prompt1]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["exists", "does-not-exist"],
    });

    // Should reject because prompt doesn't exist
    await expect(
      Effect.runPromise(compareCommand(args).pipe(Effect.provide(TestLayer)))
    ).rejects.toThrow();
  });
});
