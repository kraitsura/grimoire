/**
 * Tests for pl test command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect, Stream } from "effect";
import { testCommand } from "../../src/commands/pl/test";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockLLMService,
  createMockTokenCounterService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl test command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should test a prompt with LLM in non-streaming mode", async () => {
    const prompt = createTestPrompt({
      id: "test-prompt",
      name: "test-me",
      content: "You are a helpful assistant.",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const llm = {
      ...createMockLLMService("Hello!"),
      complete: (_request: any) =>
        Effect.succeed({
          content: "Hello! I'm a helpful assistant.",
          model: "gpt-4o",
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          finishReason: "stop" as const,
        }),
    };
    const tokenCounter = {
      ...createMockTokenCounterService(),
      estimateCost: (_input: number, _output: number, _model?: string) => Effect.succeed(0.001),
    };
    const TestLayer = createTestLayer({ storage, llm, tokenCounter });

    const args = createParsedArgs({
      positional: ["test-me"],
      flags: { "no-stream": true },
    });

    await Effect.runPromise(testCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Hello") || l.includes("assistant"))).toBe(true);
  });

  it("should use specific model with --model flag", async () => {
    const prompt = createTestPrompt({ id: "model-test", name: "model-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let usedModel = "";
    const llm = {
      ...createMockLLMService("Response"),
      complete: (request: any) => {
        usedModel = request.model;
        return Effect.succeed({
          content: "Test response",
          model: request.model,
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          finishReason: "stop" as const,
        });
      },
    };
    const tokenCounter = {
      ...createMockTokenCounterService(),
      estimateCost: (_input: number, _output: number, _model?: string) => Effect.succeed(0.001),
    };
    const TestLayer = createTestLayer({ storage, llm, tokenCounter });

    const args = createParsedArgs({
      positional: ["model-prompt"],
      flags: { model: "claude-sonnet-4", "no-stream": true },
    });

    await Effect.runPromise(testCommand(args).pipe(Effect.provide(TestLayer)));

    expect(usedModel).toBe("claude-sonnet-4");
  });

  it("should interpolate variables with --vars flag", async () => {
    const prompt = createTestPrompt({
      id: "var-test",
      name: "var-prompt",
      content: "You are a {{role}}. Help with {{task}}.",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let receivedContent = "";
    const llm = {
      ...createMockLLMService("Response"),
      complete: (request: any) => {
        receivedContent = request.messages?.[0]?.content ?? "";
        return Effect.succeed({
          content: "Test response",
          model: "gpt-4o",
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          finishReason: "stop" as const,
        });
      },
    };
    const tokenCounter = {
      ...createMockTokenCounterService(),
      estimateCost: (_input: number, _output: number, _model?: string) => Effect.succeed(0.001),
    };
    const TestLayer = createTestLayer({ storage, llm, tokenCounter });

    const args = createParsedArgs({
      positional: ["var-prompt"],
      flags: {
        vars: '{"role": "teacher", "task": "math"}',
        "no-stream": true,
      },
    });

    await Effect.runPromise(testCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedContent).toContain("teacher");
    expect(receivedContent).toContain("math");
  });

  it("should show token usage after test", async () => {
    const prompt = createTestPrompt({ id: "usage-test", name: "usage-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const llm = {
      ...createMockLLMService("Response"),
      complete: (_request: any) =>
        Effect.succeed({
          content: "Test response",
          model: "gpt-4o",
          usage: { inputTokens: 150, outputTokens: 200, totalTokens: 350 },
          finishReason: "stop" as const,
        }),
    };
    const tokenCounter = {
      ...createMockTokenCounterService(),
      estimateCost: (_input: number, _output: number, _model?: string) => Effect.succeed(0.005),
    };
    const TestLayer = createTestLayer({ storage, llm, tokenCounter });

    const args = createParsedArgs({
      positional: ["usage-prompt"],
      flags: { "no-stream": true },
    });

    await Effect.runPromise(testCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Tokens") || l.includes("150"))).toBe(true);
  });

  it("should fail when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    const result = await Effect.runPromiseExit(
      testCommand(args).pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("Failure");
  });

  it("should fail for non-existent prompt", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({ positional: ["non-existent"] });

    const result = await Effect.runPromiseExit(
      testCommand(args).pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("Failure");
  });

  it("should show header with prompt name and model", async () => {
    const prompt = createTestPrompt({ id: "header-test", name: "header-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const llm = {
      ...createMockLLMService("Response"),
      complete: (_request: any) =>
        Effect.succeed({
          content: "Response",
          model: "gpt-4o",
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          finishReason: "stop" as const,
        }),
    };
    const tokenCounter = {
      ...createMockTokenCounterService(),
      estimateCost: (_input: number, _output: number, _model?: string) => Effect.succeed(0.001),
    };
    const TestLayer = createTestLayer({ storage, llm, tokenCounter });

    const args = createParsedArgs({
      positional: ["header-prompt"],
      flags: { "no-stream": true },
    });

    await Effect.runPromise(testCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Testing") || l.includes("header-prompt"))).toBe(true);
    expect(logs.some((l) => l.includes("Model"))).toBe(true);
  });
});
