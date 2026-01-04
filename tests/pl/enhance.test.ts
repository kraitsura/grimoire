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

  it("should enhance a prompt", async () => {
    const prompt = createTestPrompt({
      id: "enhance-test",
      name: "enhance-prompt",
      content: "Original content to enhance",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const enhancement = {
      ...createMockEnhancementService(),
      enhance: (_request: any) =>
        Effect.succeed({
          original: "Original content to enhance",
          enhanced: "Enhanced and improved content",
          model: "gpt-4o",
          template: "improve",
          usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
        }),
    };
    const TestLayer = createTestLayer({ storage, enhancement });

    const args = createParsedArgs({
      positional: ["enhance-prompt"],
      flags: { yes: true },
    });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Enhanced") || l.includes("improved"))).toBe(true);
  });

  it("should use specific template with --template flag", async () => {
    const prompt = createTestPrompt({ id: "template-test", name: "template-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let usedTemplate = "";
    const enhancement = {
      ...createMockEnhancementService(),
      enhance: (request: any) => {
        usedTemplate = request.template;
        return Effect.succeed({
          original: "original",
          enhanced: "enhanced",
          model: "gpt-4o",
          template: request.template,
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        });
      },
    };
    const TestLayer = createTestLayer({ storage, enhancement });

    const args = createParsedArgs({
      positional: ["template-prompt"],
      flags: { template: "fix-grammar", yes: true },
    });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    expect(usedTemplate).toBe("fix-grammar");
  });

  it("should use specific model with --model flag", async () => {
    const prompt = createTestPrompt({ id: "model-test", name: "model-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let usedModel = "";
    const enhancement = {
      ...createMockEnhancementService(),
      enhance: (request: any) => {
        usedModel = request.model;
        return Effect.succeed({
          original: "original",
          enhanced: "enhanced",
          model: request.model,
          template: "improve",
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        });
      },
    };
    const TestLayer = createTestLayer({ storage, enhancement });

    const args = createParsedArgs({
      positional: ["model-prompt"],
      flags: { model: "gpt-4-turbo", yes: true },
    });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    expect(usedModel).toBe("gpt-4-turbo");
  });

  it("should estimate cost with --estimate flag", async () => {
    const prompt = createTestPrompt({ id: "estimate-test", name: "estimate-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const enhancement = {
      ...createMockEnhancementService(),
      estimate: (_request: any) =>
        Effect.succeed({
          estimatedTokens: 500,
          estimatedCost: 0.05,
          template: "improve",
          model: "gpt-4o",
        }),
    };
    const TestLayer = createTestLayer({ storage, enhancement });

    const args = createParsedArgs({
      positional: ["estimate-prompt"],
      flags: { estimate: true },
    });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("500") || l.includes("tokens"))).toBe(true);
    expect(logs.some((l) => l.includes("0.05") || l.includes("cost"))).toBe(true);
  });

  it("should preview enhancement with --dry-run flag", async () => {
    const prompt = createTestPrompt({ id: "dry-test", name: "dry-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let enhanceCalled = false;
    const enhancement = {
      ...createMockEnhancementService(),
      enhance: (_request: any) => {
        enhanceCalled = true;
        return Effect.succeed({
          original: "original",
          enhanced: "enhanced",
          model: "gpt-4o",
          template: "improve",
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        });
      },
      estimate: (_request: any) =>
        Effect.succeed({
          estimatedTokens: 100,
          estimatedCost: 0.01,
          template: "improve",
          model: "gpt-4o",
        }),
    };
    const TestLayer = createTestLayer({ storage, enhancement });

    const args = createParsedArgs({
      positional: ["dry-prompt"],
      flags: { "dry-run": true },
    });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    expect(enhanceCalled).toBe(false);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Preview") || l.includes("estimate"))).toBe(true);
  });

  it("should list available templates with --list-templates flag", async () => {
    const enhancement = {
      ...createMockEnhancementService(),
      listTemplates: () => Effect.succeed(["improve", "fix-grammar", "make-concise", "add-examples"]),
    };
    const TestLayer = createTestLayer({ enhancement });

    const args = createParsedArgs({
      positional: [],
      flags: { "list-templates": true },
    });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("improve"))).toBe(true);
    expect(logs.some((l) => l.includes("fix-grammar"))).toBe(true);
  });

  it("should output to stdout with --stdout flag", async () => {
    const prompt = createTestPrompt({ id: "stdout-test", name: "stdout-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const enhancement = {
      ...createMockEnhancementService(),
      enhance: (_request: any) =>
        Effect.succeed({
          original: "original",
          enhanced: "The enhanced output content",
          model: "gpt-4o",
          template: "improve",
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        }),
    };
    const TestLayer = createTestLayer({ storage, enhancement });

    const args = createParsedArgs({
      positional: ["stdout-prompt"],
      flags: { stdout: true },
    });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("enhanced output content"))).toBe(true);
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(enhanceCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });
});
