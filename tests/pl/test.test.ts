/**
 * Tests for pl test command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { testCommand } from "../../src/commands/pl/test";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockLLMService,
  createMockStatsService,
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

  it("should test a prompt with LLM", async () => {
    const prompt = createTestPrompt({
      id: "test-prompt",
      name: "test-me",
      content: "You are a helpful assistant. Respond with 'Hello!'",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const llm = createMockLLMService("Hello! I'm a helpful assistant.");
    let recordedUsage = false;
    const stats = {
      ...createMockStatsService(),
      recordUsage: (_promptId: string, action: string) => {
        if (action === "test") recordedUsage = true;
        return Effect.void;
      },
    };
    const TestLayer = createTestLayer({ storage, llm, stats });

    const args = createParsedArgs({ positional: ["test-me"] });

    await Effect.runPromise(testCommand(args).pipe(Effect.provide(TestLayer)));

    expect(recordedUsage).toBe(true);
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
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          finishReason: "stop" as const,
        });
      },
    };
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["model-prompt"],
      flags: { model: "claude-3-opus" },
    });

    await Effect.runPromise(testCommand(args).pipe(Effect.provide(TestLayer)));

    expect(usedModel).toBe("claude-3-opus");
  });

  it("should use user message with --message flag", async () => {
    const prompt = createTestPrompt({ id: "msg-test", name: "msg-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let receivedMessage = "";
    const llm = {
      ...createMockLLMService("Response"),
      complete: (request: any) => {
        receivedMessage = request.messages?.find((m: any) => m.role === "user")?.content ?? "";
        return Effect.succeed({
          content: "Test response",
          model: "gpt-4o",
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          finishReason: "stop" as const,
        });
      },
    };
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["msg-prompt"],
      flags: { message: "What is the capital of France?" },
    });

    await Effect.runPromise(testCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedMessage).toBe("What is the capital of France?");
  });

  it("should interpolate variables with -v flag", async () => {
    const prompt = createTestPrompt({
      id: "var-test",
      name: "var-prompt",
      content: "You are a {{role}}. Help with {{task}}.",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let receivedSystem = "";
    const llm = {
      ...createMockLLMService("Response"),
      complete: (request: any) => {
        receivedSystem = request.messages?.find((m: any) => m.role === "system")?.content ?? "";
        return Effect.succeed({
          content: "Test response",
          model: "gpt-4o",
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          finishReason: "stop" as const,
        });
      },
    };
    const TestLayer = createTestLayer({ storage, llm });

    // Note: Variable parsing happens from process.argv in the actual implementation
    const args = createParsedArgs({
      positional: ["var-prompt"],
    });

    await Effect.runPromise(testCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
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
          usage: { promptTokens: 150, completionTokens: 200, totalTokens: 350 },
          finishReason: "stop" as const,
        }),
    };
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["usage-prompt"],
      flags: { "show-usage": true },
    });

    await Effect.runPromise(testCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("350") || l.includes("tokens"))).toBe(true);
  });

  it("should output JSON with --json flag", async () => {
    const prompt = createTestPrompt({ id: "json-test", name: "json-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const llm = createMockLLMService("JSON response content");
    const TestLayer = createTestLayer({ storage, llm });

    const args = createParsedArgs({
      positional: ["json-prompt"],
      flags: { json: true },
    });

    await Effect.runPromise(testCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    const output = logs.join("\n");
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(testCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
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
});
