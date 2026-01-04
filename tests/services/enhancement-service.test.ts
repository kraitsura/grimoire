/**
 * Enhancement Service Tests
 *
 * Comprehensive tests for the AI-powered prompt enhancement service.
 * Tests template resolution, cost estimation, streaming, and complete enhancement.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Effect, Layer, Stream } from "effect";
import {
  EnhancementService,
  EnhancementServiceLive,
  EnhancementError,
  TemplateNotFoundError,
  NoDefaultModelError,
  type EnhancementRequest,
  type EnhancementResult,
  type EnhancementEstimate,
} from "../../src/services/enhancement-service";
import {
  LLMService,
  type LLMServiceImpl,
  type LLMRequest,
  type LLMResponse,
  type StreamChunk,
  type LLMProvider,
  LLMError,
} from "../../src/services/llm-service";
import {
  TokenCounterService,
  type TokenCounterError,
} from "../../src/services/token-counter-service";
import {
  ConfigService,
  type ConfigReadError,
  type GrimoireConfig,
} from "../../src/services/config-service";
import {
  BUILTIN_TEMPLATES,
  BUILTIN_TEMPLATE_IDS,
  getDefaultTemplate,
  type EnhancementTemplate,
} from "../../src/models/enhancement-template";
import { runTest, runTestExpectError, runTestExpectFailure } from "../utils";

// ============================================================================
// Mock Services
// ============================================================================

/**
 * Create a mock LLM service that returns predetermined responses
 */
const createMockLLMService = (options?: {
  completeResponse?: Partial<LLMResponse>;
  streamChunks?: StreamChunk[];
  failWith?: Error;
}): LLMServiceImpl => ({
  complete: (request: LLMRequest) => {
    if (options?.failWith) {
      return Effect.fail(new LLMError({ message: options.failWith.message }));
    }
    return Effect.succeed({
      content: options?.completeResponse?.content ?? "Enhanced prompt content",
      model: options?.completeResponse?.model ?? request.model,
      usage: options?.completeResponse?.usage ?? { inputTokens: 100, outputTokens: 50 },
      finishReason: options?.completeResponse?.finishReason ?? "stop",
    });
  },
  stream: (request: LLMRequest) => {
    if (options?.failWith) {
      return Stream.fail(new LLMError({ message: options.failWith.message }));
    }
    const chunks = options?.streamChunks ?? [
      { type: "content" as const, content: "Enhanced ", done: false },
      { type: "content" as const, content: "prompt ", done: false },
      { type: "content" as const, content: "content", done: false },
      { type: "done" as const, content: "", done: true, usage: { inputTokens: 100, outputTokens: 50 } },
    ];
    return Stream.fromIterable(chunks);
  },
  completeWithRetry: (request: LLMRequest) => {
    return Effect.succeed({
      content: "Enhanced prompt content",
      model: request.model,
      usage: { inputTokens: 100, outputTokens: 50 },
      finishReason: "stop" as const,
    });
  },
  listModels: () => Effect.succeed(["gpt-4o", "gpt-4o-mini", "claude-3-opus"]),
  registerProvider: () => Effect.void,
  getProvider: () => Effect.fail(new LLMError({ message: "Not implemented" })),
  hasProvider: () => Effect.succeed(false),
});

/**
 * Create a mock Token Counter service
 */
const createMockTokenCounterService = (options?: {
  tokenCount?: number;
  cost?: number;
}) => ({
  count: () => Effect.succeed(options?.tokenCount ?? 50),
  countMessages: () => Effect.succeed(options?.tokenCount ?? 100),
  estimateCost: () => Effect.succeed(options?.cost ?? 0.001),
});

/**
 * Create a mock Config service
 */
const createMockConfigService = (options?: {
  defaultProvider?: string;
  defaultModel?: string;
  noDefault?: boolean;
}) => ({
  get: () =>
    Effect.succeed({
      providers: ["openai"],
      defaultProvider: options?.noDefault ? undefined : (options?.defaultProvider ?? "openai"),
      defaultModel: options?.noDefault ? undefined : (options?.defaultModel ?? "gpt-4o"),
    } as GrimoireConfig),
  set: () => Effect.void,
  getDefaultModel: () => {
    if (options?.noDefault) {
      return Effect.succeed(null);
    }
    return Effect.succeed({
      provider: options?.defaultProvider ?? "openai",
      model: options?.defaultModel ?? "gpt-4o",
    });
  },
  setDefaultModel: () => Effect.void,
  addProvider: () => Effect.void,
  removeProvider: () => Effect.void,
  isConfigured: () => Effect.succeed(!options?.noDefault),
  getEditor: () => Effect.succeed({ name: "vim" }),
  setEditor: () => Effect.void,
});

/**
 * Create a test layer with configurable mocks
 */
const createTestLayer = (options?: {
  llm?: Partial<LLMServiceImpl>;
  tokenCounter?: Partial<ReturnType<typeof createMockTokenCounterService>>;
  config?: Parameters<typeof createMockConfigService>[0];
}) => {
  const MockLLM = Layer.succeed(LLMService, {
    ...createMockLLMService(),
    ...options?.llm,
  } as LLMServiceImpl);

  const MockTokenCounter = Layer.succeed(TokenCounterService, {
    ...createMockTokenCounterService(),
    ...options?.tokenCounter,
  } as any);

  const MockConfig = Layer.succeed(ConfigService, {
    ...createMockConfigService(options?.config),
  } as any);

  return EnhancementServiceLive.pipe(
    Layer.provide(Layer.mergeAll(MockLLM, MockTokenCounter, MockConfig))
  );
};

// ============================================================================
// Tests
// ============================================================================

describe("EnhancementService", () => {
  describe("getDefaultTemplate", () => {
    test("returns the general template", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return service.getDefaultTemplate();
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.id).toBe(BUILTIN_TEMPLATE_IDS.GENERAL);
      expect(result.name).toBe("General Enhancement");
      expect(result.type).toBe("general");
      expect(result.isBuiltIn).toBe(true);
    });
  });

  describe("getTemplate", () => {
    test("returns built-in template by ID", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.getTemplate(BUILTIN_TEMPLATE_IDS.TECHNICAL);
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.id).toBe(BUILTIN_TEMPLATE_IDS.TECHNICAL);
      expect(result.name).toBe("Technical Precision");
      expect(result.type).toBe("technical");
    });

    test("returns template by name (case-insensitive)", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.getTemplate("Conciseness");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.id).toBe(BUILTIN_TEMPLATE_IDS.CONCISE);
    });

    test("returns template by type", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.getTemplate("role");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.id).toBe(BUILTIN_TEMPLATE_IDS.ROLE);
      expect(result.type).toBe("role");
    });

    test("fails for unknown template", async () => {
      const TestLayer = createTestLayer();

      const error = await runTestExpectError(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.getTemplate("nonexistent-template");
        }).pipe(Effect.provide(TestLayer)),
        (e): e is TemplateNotFoundError => (e as any)._tag === "TemplateNotFoundError"
      );

      expect(error.templateId).toBe("nonexistent-template");
    });
  });

  describe("listTemplates", () => {
    test("returns all built-in templates", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.listTemplates();
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.length).toBeGreaterThanOrEqual(BUILTIN_TEMPLATES.length);

      // Verify all built-in templates are present
      const builtinIds = Object.values(BUILTIN_TEMPLATE_IDS);
      for (const id of builtinIds) {
        expect(result.some((t) => t.id === id)).toBe(true);
      }
    });

    test("includes all template types", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.listTemplates();
        }).pipe(Effect.provide(TestLayer))
      );

      const types = new Set(result.map((t) => t.type));
      expect(types.has("general")).toBe(true);
      expect(types.has("technical")).toBe(true);
      expect(types.has("concise")).toBe(true);
      expect(types.has("role")).toBe(true);
      expect(types.has("format")).toBe(true);
    });
  });

  describe("getDefaultModel", () => {
    test("returns configured default model", async () => {
      const TestLayer = createTestLayer({
        config: { defaultProvider: "anthropic", defaultModel: "claude-3-opus" },
      });

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.getDefaultModel();
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.provider).toBe("anthropic");
      expect(result.model).toBe("claude-3-opus");
    });

    test("fails when no default model is configured", async () => {
      const TestLayer = createTestLayer({
        config: { noDefault: true },
      });

      const error = await runTestExpectError(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.getDefaultModel();
        }).pipe(Effect.provide(TestLayer)),
        (e): e is NoDefaultModelError => (e as any)._tag === "NoDefaultModelError"
      );

      expect(error.message).toContain("No default model configured");
    });
  });

  describe("buildEnhancementPrompt", () => {
    test("replaces {prompt} placeholder with content", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          const template = service.getDefaultTemplate();
          return service.buildEnhancementPrompt(template, "Write a poem about coding");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result).toContain("Write a poem about coding");
      expect(result).not.toContain("{prompt}");
    });

    test("works with different templates", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          const template = yield* service.getTemplate(BUILTIN_TEMPLATE_IDS.TECHNICAL);
          return service.buildEnhancementPrompt(template, "Create an API endpoint");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result).toContain("Create an API endpoint");
      expect(result).toContain("edge case");
      expect(result).toContain("technical");
    });
  });

  describe("estimate", () => {
    test("returns token and cost estimates", async () => {
      const TestLayer = createTestLayer({
        tokenCounter: {
          countMessages: () => Effect.succeed(150),
          estimateCost: () => Effect.succeed(0.0025),
        },
      });

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.estimate({
            promptContent: "Write a function to sort an array",
          });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.inputTokens).toBe(150);
      expect(result.estimatedOutputTokens).toBeGreaterThan(0);
      expect(result.estimatedCost).toBe(0.0025);
      expect(result.model).toBe("gpt-4o");
      expect(result.template.id).toBe(BUILTIN_TEMPLATE_IDS.GENERAL);
    });

    test("uses specified template in estimate", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.estimate({
            promptContent: "Test content",
            template: BUILTIN_TEMPLATE_IDS.CONCISE,
          });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.template.id).toBe(BUILTIN_TEMPLATE_IDS.CONCISE);
    });

    test("uses specified model in estimate", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.estimate({
            promptContent: "Test content",
            model: "claude-3-opus",
          });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.model).toBe("claude-3-opus");
    });

    test("handles custom instruction in estimate", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.estimate({
            promptContent: "Test content",
            customInstruction: "Make it more formal",
          });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.template.id).toBe("custom-adhoc");
      expect(result.template.type).toBe("custom");
    });

    test("formats cost correctly", async () => {
      // Test very small cost
      const TestLayer = createTestLayer({
        tokenCounter: { estimateCost: () => Effect.succeed(0.001) },
      });

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.estimate({ promptContent: "Test" });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.formattedCost).toBe("<$0.01");
    });

    test("formats larger costs with decimal places", async () => {
      const TestLayer = createTestLayer({
        tokenCounter: { estimateCost: () => Effect.succeed(0.0523) },
      });

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.estimate({ promptContent: "Test" });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.formattedCost).toBe("$0.0523");
    });
  });

  describe("enhanceComplete", () => {
    test("returns enhanced content from LLM", async () => {
      const TestLayer = createTestLayer({
        llm: createMockLLMService({
          completeResponse: {
            content: "  Enhanced and improved prompt  ",
            usage: { inputTokens: 120, outputTokens: 80 },
          },
        }),
      });

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.enhanceComplete({
            promptContent: "Original prompt content",
          });
        }).pipe(Effect.provide(TestLayer))
      );

      // Content should be trimmed
      expect(result.content).toBe("Enhanced and improved prompt");
      expect(result.original).toBe("Original prompt content");
      expect(result.usage.inputTokens).toBe(120);
      expect(result.usage.outputTokens).toBe(80);
    });

    test("uses specified template", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.enhanceComplete({
            promptContent: "Test",
            template: BUILTIN_TEMPLATE_IDS.TECHNICAL,
          });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.template.id).toBe(BUILTIN_TEMPLATE_IDS.TECHNICAL);
    });

    test("uses custom template object", async () => {
      const customTemplate: EnhancementTemplate = {
        id: "my-custom",
        name: "My Custom Template",
        description: "A custom template for testing",
        type: "custom",
        isBuiltIn: false,
        created: new Date(),
        updated: new Date(),
        prompt: "Custom instruction: {prompt}",
      };

      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.enhanceComplete({
            promptContent: "Test",
            template: customTemplate,
          });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.template.id).toBe("my-custom");
    });

    test("uses custom instruction when provided", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.enhanceComplete({
            promptContent: "Test",
            customInstruction: "Make it more concise and professional",
          });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.template.id).toBe("custom-adhoc");
      expect(result.template.description).toContain("User-provided");
    });

    test("calculates cost from usage", async () => {
      const TestLayer = createTestLayer({
        tokenCounter: { estimateCost: () => Effect.succeed(0.0123) },
      });

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.enhanceComplete({
            promptContent: "Test",
          });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.cost).toBe(0.0123);
    });

    test("handles LLM failure gracefully", async () => {
      const TestLayer = createTestLayer({
        llm: createMockLLMService({ failWith: new Error("API Error") }),
      });

      const error = await runTestExpectFailure(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.enhanceComplete({
            promptContent: "Test",
          });
        }).pipe(Effect.provide(TestLayer))
      );

      expect((error as LLMError).message).toContain("API Error");
    });

    test("fails when no model available and none specified", async () => {
      const TestLayer = createTestLayer({
        config: { noDefault: true },
      });

      const error = await runTestExpectError(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.enhanceComplete({
            promptContent: "Test",
          });
        }).pipe(Effect.provide(TestLayer)),
        (e): e is NoDefaultModelError => (e as any)._tag === "NoDefaultModelError"
      );

      expect(error._tag).toBe("NoDefaultModelError");
    });
  });

  describe("enhance (streaming)", () => {
    test("returns stream of chunks", async () => {
      const chunks: StreamChunk[] = [
        { type: "content", content: "Hello ", done: false },
        { type: "content", content: "world!", done: false },
        { type: "done", content: "", done: true, usage: { inputTokens: 10, outputTokens: 5 } },
      ];

      const TestLayer = createTestLayer({
        llm: createMockLLMService({ streamChunks: chunks }),
      });

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          const stream = service.enhance({ promptContent: "Test prompt" });
          return yield* Stream.runCollect(stream);
        }).pipe(Effect.provide(TestLayer))
      );

      const collectedChunks = Array.from(result);
      expect(collectedChunks.length).toBe(3);
      expect(collectedChunks[0].content).toBe("Hello ");
      expect(collectedChunks[1].content).toBe("world!");
      expect(collectedChunks[2].done).toBe(true);
    });

    test("uses correct template in stream", async () => {
      let capturedRequest: LLMRequest | null = null;

      const mockLLM = {
        ...createMockLLMService(),
        stream: (request: LLMRequest) => {
          capturedRequest = request;
          return Stream.fromIterable([
            { type: "done" as const, content: "", done: true },
          ]);
        },
      };

      const TestLayer = createTestLayer({ llm: mockLLM });

      await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          const stream = service.enhance({
            promptContent: "Test",
            template: BUILTIN_TEMPLATE_IDS.FORMAT,
          });
          return yield* Stream.runDrain(stream);
        }).pipe(Effect.provide(TestLayer))
      );

      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest!.messages[0].content).toContain("output format");
    });

    test("handles stream failure", async () => {
      const TestLayer = createTestLayer({
        llm: createMockLLMService({ failWith: new Error("Stream Error") }),
      });

      const error = await runTestExpectFailure(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          const stream = service.enhance({ promptContent: "Test" });
          return yield* Stream.runCollect(stream);
        }).pipe(Effect.provide(TestLayer))
      );

      expect((error as LLMError).message).toContain("Stream Error");
    });
  });

  describe("template resolution priority", () => {
    test("customInstruction takes precedence over template", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.enhanceComplete({
            promptContent: "Test",
            template: BUILTIN_TEMPLATE_IDS.TECHNICAL, // This should be ignored
            customInstruction: "Custom instruction here",
          });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.template.id).toBe("custom-adhoc");
    });

    test("template object takes precedence over template ID", async () => {
      const customTemplate: EnhancementTemplate = {
        id: "priority-test",
        name: "Priority Test",
        description: "Tests priority",
        type: "custom",
        isBuiltIn: false,
        created: new Date(),
        updated: new Date(),
        prompt: "Priority test: {prompt}",
      };

      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.enhanceComplete({
            promptContent: "Test",
            template: customTemplate,
          });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.template.id).toBe("priority-test");
    });
  });

  describe("edge cases", () => {
    test("handles empty prompt content", async () => {
      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.enhanceComplete({
            promptContent: "",
          });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.original).toBe("");
    });

    test("handles very long prompt content", async () => {
      const longContent = "x".repeat(10000);

      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.estimate({ promptContent: longContent });
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.estimatedOutputTokens).toBeGreaterThan(0);
    });

    test("handles special characters in prompt", async () => {
      const specialContent = "Test with <xml> tags & special chars: 日本語 🎉";

      const TestLayer = createTestLayer();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          const template = service.getDefaultTemplate();
          return service.buildEnhancementPrompt(template, specialContent);
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result).toContain("<xml>");
      expect(result).toContain("日本語");
    });

    test("handles token counter fallback on error", async () => {
      const TestLayer = createTestLayer({
        tokenCounter: {
          countMessages: () => Effect.fail({ _tag: "TokenCounterError", message: "Error" }),
          estimateCost: () => Effect.fail({ _tag: "TokenCounterError", message: "Error" }),
        },
      });

      // Should still succeed with fallback values
      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* EnhancementService;
          return yield* service.estimate({ promptContent: "Test content" });
        }).pipe(Effect.provide(TestLayer))
      );

      // Falls back to character-based estimation
      expect(result.inputTokens).toBeGreaterThan(0);
    });
  });
});
