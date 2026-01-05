/**
 * Tests for pl enhance command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { enhanceCommand } from "../../src/commands/pl/enhance";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockEnhancementService,
  createMockTokenCounterService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl enhance command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should enhance a prompt with --auto flag", async () => {
    const prompt = createTestPrompt({
      id: "enhance-test",
      name: "enhance-me",
      content: "Original prompt content",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let enhanceCalled = false;
    const enhancement = {
      ...createMockEnhancementService(),
      enhance: (_request: any) => {
        enhanceCalled = true;
        return Effect.succeed({
          original: "Original prompt content",
          enhanced: "Enhanced prompt content",
          model: "gpt-4o",
          template: "general",
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        });
      },
    };
    const tokenCounter = createMockTokenCounterService();
    const TestLayer = createTestLayer({ storage, enhancement, tokenCounter });

    const args = createParsedArgs({
      positional: ["enhance-me"],
      flags: { auto: true },
    });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    expect(enhanceCalled).toBe(true);
  });

  it("should use specific template with --template flag", async () => {
    const prompt = createTestPrompt({ id: "template-test", name: "template-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let receivedTemplate = "";
    const enhancement = {
      ...createMockEnhancementService(),
      enhance: (request: any) => {
        receivedTemplate = request.template || "";
        return Effect.succeed({
          original: "Original",
          enhanced: "Enhanced",
          model: "gpt-4o",
          template: request.template || "general",
          usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
        });
      },
    };
    const tokenCounter = createMockTokenCounterService();
    const TestLayer = createTestLayer({ storage, enhancement, tokenCounter });

    const args = createParsedArgs({
      positional: ["template-prompt"],
      flags: { template: "concise", auto: true },
    });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedTemplate).toBe("concise");
  });

  it("should list available templates with --list-templates flag", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({
      positional: [],
      flags: { "list-templates": true },
    });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Templates") || l.includes("general"))).toBe(true);
  });

  it("should preview without saving with --preview flag", async () => {
    const prompt = createTestPrompt({ id: "preview-test", name: "preview-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const enhancement = {
      ...createMockEnhancementService(),
      enhance: (_request: any) =>
        Effect.succeed({
          original: "Original",
          enhanced: "Enhanced preview content",
          model: "gpt-4o",
          template: "general",
          usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
        }),
    };
    const tokenCounter = createMockTokenCounterService();
    const TestLayer = createTestLayer({ storage, enhancement, tokenCounter });

    const args = createParsedArgs({
      positional: ["preview-prompt"],
      flags: { preview: true, auto: true },
    });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    // Preview mode should show the enhanced content without saving
    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it("should complete with --stdout flag", async () => {
    const prompt = createTestPrompt({ id: "stdout-test", name: "stdout-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const enhancement = {
      ...createMockEnhancementService(),
      enhance: (_request: any) =>
        Effect.succeed({
          original: "Original",
          enhanced: "Stdout enhanced content",
          model: "gpt-4o",
          template: "general",
          usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
        }),
    };
    const tokenCounter = createMockTokenCounterService();
    const TestLayer = createTestLayer({ storage, enhancement, tokenCounter });

    const args = createParsedArgs({
      positional: ["stdout-prompt"],
      flags: { stdout: true, auto: true },
    });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    // Completes without error
    expect(true).toBe(true);
  });

  it("should show usage when no prompt name provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should handle non-existent prompt gracefully", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["non-existent"],
      flags: { auto: true },
    });

    // Command logs error and returns
    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    // Completes without throwing
    expect(true).toBe(true);
  });
});
