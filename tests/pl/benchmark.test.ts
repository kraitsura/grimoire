/**
 * Tests for pl benchmark command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { benchmarkCommand } from "../../src/commands/pl/benchmark";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockLLMService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl benchmark command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should benchmark a prompt with multiple runs", async () => {
    const prompt = createTestPrompt({
      id: "bench-test",
      name: "bench-prompt",
      content: "Benchmark me",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let callCount = 0;
    const llm = {
      ...createMockLLMService("Response"),
      complete: (_request: any) => {
        callCount++;
        return Effect.succeed({
          content: `Response ${callCount}`,
          model: "gpt-4o",
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          finishReason: "stop" as const,
        });
      },
    };
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["bench-prompt"],
      flags: { runs: "3" },
    });

    await Effect.runPromise(benchmarkCommand(args).pipe(Effect.provide(TestLayer)));

    expect(callCount).toBe(3);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Benchmark") || l.includes("runs"))).toBe(true);
  });

  it("should compare multiple models with --models flag", async () => {
    const prompt = createTestPrompt({ id: "models-test", name: "models-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const usedModels: string[] = [];
    const llm = {
      ...createMockLLMService("Response"),
      complete: (request: any) => {
        usedModels.push(request.model);
        return Effect.succeed({
          content: "Response",
          model: request.model,
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          finishReason: "stop" as const,
        });
      },
    };
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["models-prompt"],
      flags: { models: "gpt-4o,claude-3-opus" },
    });

    await Effect.runPromise(benchmarkCommand(args).pipe(Effect.provide(TestLayer)));

    expect(usedModels).toContain("gpt-4o");
    expect(usedModels).toContain("claude-3-opus");
  });

  it("should show timing statistics", async () => {
    const prompt = createTestPrompt({ id: "timing-test", name: "timing-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const llm = createMockLLMService("Response");
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["timing-prompt"],
      flags: { runs: "5" },
    });

    await Effect.runPromise(benchmarkCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("ms") || l.includes("time") || l.includes("avg"))).toBe(true);
  });

  it("should output JSON with --json flag", async () => {
    const prompt = createTestPrompt({ id: "json-bench", name: "json-bench-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const llm = createMockLLMService("Response");
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["json-bench-prompt"],
      flags: { json: true, runs: "2" },
    });

    await Effect.runPromise(benchmarkCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    const output = logs.join("\n");
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("should include token statistics", async () => {
    const prompt = createTestPrompt({ id: "token-bench", name: "token-bench-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const llm = {
      ...createMockLLMService("Response"),
      complete: (_request: any) =>
        Effect.succeed({
          content: "Response",
          model: "gpt-4o",
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
          finishReason: "stop" as const,
        }),
    };
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["token-bench-prompt"],
      flags: { runs: "3" },
    });

    await Effect.runPromise(benchmarkCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("tokens") || l.includes("300"))).toBe(true);
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(benchmarkCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should use default run count when not specified", async () => {
    const prompt = createTestPrompt({ id: "default-runs", name: "default-runs-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let callCount = 0;
    const llm = {
      ...createMockLLMService("Response"),
      complete: (_request: any) => {
        callCount++;
        return Effect.succeed({
          content: "Response",
          model: "gpt-4o",
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          finishReason: "stop" as const,
        });
      },
    };
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["default-runs-prompt"],
    });

    await Effect.runPromise(benchmarkCommand(args).pipe(Effect.provide(TestLayer)));

    // Default should be 1 or some small number
    expect(callCount).toBeGreaterThan(0);
  });
});
