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
    };
    const TestLayer = createTestLayer({ storage, tokenCounter });

    const args = createParsedArgs({ positional: ["cost-prompt"] });

    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("150") || l.includes("tokens"))).toBe(true);
  });

  it("should calculate cost for specific model with --model flag", async () => {
    const prompt = createTestPrompt({ id: "model-cost", name: "model-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const tokenCounter = {
      ...createMockTokenCounterService(),
      count: (_text: string, _model?: string) => Effect.succeed(100),
    };
    const TestLayer = createTestLayer({ storage, tokenCounter });

    // Use a valid model from MODEL_PRICING
    const args = createParsedArgs({
      positional: ["model-prompt"],
      flags: { model: "gpt-4o-mini" },
    });

    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("gpt-4o-mini"))).toBe(true);
  });

  it("should not crash for unknown model", async () => {
    const prompt = createTestPrompt({ id: "unknown-model", name: "unknown-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const tokenCounter = createMockTokenCounterService();
    const TestLayer = createTestLayer({ storage, tokenCounter });

    const args = createParsedArgs({
      positional: ["unknown-prompt"],
      flags: { model: "unknown-model-xyz" },
    });

    // Command logs error to console.error and returns early
    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    // Just verify it doesn't throw
    expect(true).toBe(true);
  });

  it("should show all models with --all-models flag", async () => {
    const prompt = createTestPrompt({ id: "all-models", name: "all-models-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const tokenCounter = {
      ...createMockTokenCounterService(),
      count: (_text: string, _model?: string) => Effect.succeed(100),
    };
    const TestLayer = createTestLayer({ storage, tokenCounter });

    const args = createParsedArgs({
      positional: ["all-models-prompt"],
      flags: { "all-models": true },
    });

    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("gpt-4o"))).toBe(true);
    expect(logs.some((l) => l.includes("claude"))).toBe(true);
  });

  it("should show batch estimate with --batch flag", async () => {
    const prompt = createTestPrompt({ id: "batch-test", name: "batch-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const tokenCounter = {
      ...createMockTokenCounterService(),
      count: (_text: string, _model?: string) => Effect.succeed(100),
    };
    const TestLayer = createTestLayer({ storage, tokenCounter });

    const args = createParsedArgs({
      positional: ["batch-prompt"],
      flags: { batch: "100" },
    });

    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("100") && l.includes("runs"))).toBe(true);
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should handle custom output tokens with --output-tokens flag", async () => {
    const prompt = createTestPrompt({ id: "output-test", name: "output-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const tokenCounter = {
      ...createMockTokenCounterService(),
      count: (_text: string, _model?: string) => Effect.succeed(100),
    };
    const TestLayer = createTestLayer({ storage, tokenCounter });

    const args = createParsedArgs({
      positional: ["output-prompt"],
      flags: { "output-tokens": "1000" },
    });

    await Effect.runPromise(costCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    // Should show cost table
    expect(logs.some((l) => l.includes("$"))).toBe(true);
  });
});
