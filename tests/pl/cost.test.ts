/**
 * Tests for pl cost command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { costCommand } from "../../src/commands/pl/cost";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockTokenCounterService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl cost command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should calculate cost for a prompt", async () => {
    const prompt = createTestPrompt({
      id: "cost-test",
      name: "cost-prompt",
      content: "This is content to calculate cost for.",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const tokenCounter = {
      ...createMockTokenCounterService(),
      count: (_text: string, _model?: string) => Effect.succeed(150),
      estimateCost: (_tokens: number, _model?: string) => Effect.succeed(0.003),
    };
    const TestLayer = createTestLayer({ storage, tokenCounter });

    const args = createParsedArgs({ positional: ["cost-prompt"] });

    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("150") || l.includes("tokens"))).toBe(true);
    expect(logs.some((l) => l.includes("0.003") || l.includes("$"))).toBe(true);
  });

  it("should calculate cost for specific model with --model flag", async () => {
    const prompt = createTestPrompt({ id: "model-cost", name: "model-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let usedModel = "";
    const tokenCounter = {
      ...createMockTokenCounterService(),
      count: (_text: string, model?: string) => {
        usedModel = model ?? "";
        return Effect.succeed(100);
      },
      estimateCost: (_tokens: number, _model?: string) => Effect.succeed(0.01),
    };
    const TestLayer = createTestLayer({ storage, tokenCounter });

    const args = createParsedArgs({
      positional: ["model-prompt"],
      flags: { model: "gpt-4-turbo" },
    });

    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    expect(usedModel).toBe("gpt-4-turbo");
  });

  it("should show cost for multiple prompts", async () => {
    const prompts = [
      createTestPrompt({ id: "multi-1", name: "multi-prompt-1", content: "Content 1" }),
      createTestPrompt({ id: "multi-2", name: "multi-prompt-2", content: "Content 2" }),
    ];
    const state = createMockStorageState(prompts);
    const storage = createMockStorageService(state);
    const tokenCounter = {
      ...createMockTokenCounterService(),
      count: (_text: string, _model?: string) => Effect.succeed(100),
      estimateCost: (_tokens: number, _model?: string) => Effect.succeed(0.002),
    };
    const TestLayer = createTestLayer({ storage, tokenCounter });

    const args = createParsedArgs({
      positional: ["multi-prompt-1", "multi-prompt-2"],
    });

    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("multi-prompt-1"))).toBe(true);
    expect(logs.some((l) => l.includes("multi-prompt-2"))).toBe(true);
  });

  it("should show total cost with --total flag", async () => {
    const prompts = [
      createTestPrompt({ id: "total-1", name: "total-prompt-1" }),
      createTestPrompt({ id: "total-2", name: "total-prompt-2" }),
    ];
    const state = createMockStorageState(prompts);
    const storage = createMockStorageService(state);
    const tokenCounter = {
      ...createMockTokenCounterService(),
      count: (_text: string, _model?: string) => Effect.succeed(100),
      estimateCost: (_tokens: number, _model?: string) => Effect.succeed(0.005),
    };
    const TestLayer = createTestLayer({ storage, tokenCounter });

    const args = createParsedArgs({
      positional: ["total-prompt-1", "total-prompt-2"],
      flags: { total: true },
    });

    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Total") || l.includes("0.01"))).toBe(true);
  });

  it("should output JSON with --json flag", async () => {
    const prompt = createTestPrompt({ id: "json-cost", name: "json-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const tokenCounter = {
      ...createMockTokenCounterService(),
      count: (_text: string, _model?: string) => Effect.succeed(200),
      estimateCost: (_tokens: number, _model?: string) => Effect.succeed(0.004),
    };
    const TestLayer = createTestLayer({ storage, tokenCounter });

    const args = createParsedArgs({
      positional: ["json-prompt"],
      flags: { json: true },
    });

    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.tokens).toBe(200);
    expect(parsed.cost).toBe(0.004);
  });

  it("should calculate cost for all prompts with --all flag", async () => {
    const prompts = [
      createTestPrompt({ id: "all-1", name: "all-prompt-1" }),
      createTestPrompt({ id: "all-2", name: "all-prompt-2" }),
      createTestPrompt({ id: "all-3", name: "all-prompt-3" }),
    ];
    const state = createMockStorageState(prompts);
    const storage = createMockStorageService(state);
    const tokenCounter = {
      ...createMockTokenCounterService(),
      count: (_text: string, _model?: string) => Effect.succeed(100),
      estimateCost: (_tokens: number, _model?: string) => Effect.succeed(0.002),
    };
    const TestLayer = createTestLayer({ storage, tokenCounter });

    const args = createParsedArgs({
      positional: [],
      flags: { all: true },
    });

    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("all-prompt-1"))).toBe(true);
    expect(logs.some((l) => l.includes("all-prompt-2"))).toBe(true);
    expect(logs.some((l) => l.includes("all-prompt-3"))).toBe(true);
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });
});
