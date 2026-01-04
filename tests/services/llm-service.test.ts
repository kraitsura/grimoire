/**
 * LLM Service Tests
 *
 * Tests for the unified LLM service interface including:
 * - Provider registration and management
 * - Request completion (streaming and non-streaming)
 * - Retry logic for transient failures
 * - Error handling and type classification
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Effect, Layer, Stream, Chunk, Exit } from "effect";
import {
  LLMService,
  LLMServiceLive,
  LLMError,
  LLMAuthError,
  LLMRateLimitError,
  LLMTimeoutError,
  LLMModelError,
  LLMContentFilterError,
  parseProviderError,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
  type StreamChunk,
  type LLMErrors,
} from "../../src/services/llm-service";

// Create a mock provider for testing
const createMockProvider = (options: {
  name?: string;
  response?: LLMResponse;
  streamChunks?: StreamChunk[];
  models?: string[];
  error?: LLMErrors;
  validateResult?: boolean;
} = {}): LLMProvider => {
  const {
    name = "mock",
    response = {
      content: "Mock response",
      model: "mock-model",
      usage: { inputTokens: 10, outputTokens: 20 },
      finishReason: "stop" as const,
    },
    streamChunks = [
      { type: "content" as const, content: "Hello", done: false },
      { type: "content" as const, content: " World", done: false },
      { type: "content" as const, content: "", done: true, usage: { inputTokens: 5, outputTokens: 2 } },
    ],
    models = ["mock-model-1", "mock-model-2"],
    error,
    validateResult = true,
  } = options;

  return {
    name,
    complete: (request: LLMRequest) =>
      error ? Effect.fail(error) : Effect.succeed(response),
    stream: (request: LLMRequest) =>
      error
        ? Stream.fail(error)
        : Stream.fromIterable(streamChunks),
    listModels: () => Effect.succeed(models),
    validateApiKey: () => Effect.succeed(validateResult),
  };
};

describe("LLMService", () => {
  describe("Provider Registration", () => {
    test("registerProvider adds provider to service", async () => {
      const program = Effect.gen(function* () {
        const service = yield* LLMService;
        const mockProvider = createMockProvider({ name: "test-provider" });
        yield* service.registerProvider(mockProvider);
        return yield* service.hasProvider("test-provider");
      });

      const hasProvider = await Effect.runPromise(
        program.pipe(Effect.provide(LLMServiceLive))
      );
      expect(hasProvider).toBe(true);
    });

    test("hasProvider returns false for unregistered provider", async () => {
      const program = Effect.gen(function* () {
        const service = yield* LLMService;
        return yield* service.hasProvider("nonexistent");
      });

      const hasProvider = await Effect.runPromise(
        program.pipe(Effect.provide(LLMServiceLive))
      );
      expect(hasProvider).toBe(false);
    });

    test("getProvider returns registered provider", async () => {
      const program = Effect.gen(function* () {
        const service = yield* LLMService;
        const mockProvider = createMockProvider({ name: "my-provider" });
        yield* service.registerProvider(mockProvider);
        const provider = yield* service.getProvider("my-provider");
        return provider.name;
      });

      const name = await Effect.runPromise(
        program.pipe(Effect.provide(LLMServiceLive))
      );
      expect(name).toBe("my-provider");
    });

    test("getProvider fails for unregistered provider", async () => {
      const program = Effect.gen(function* () {
        const service = yield* LLMService;
        return yield* service.getProvider("nonexistent");
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(LLMServiceLive), Effect.either)
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("LLMError");
        expect(result.left.message).toContain("not found");
      }
    });

    test("provider registration is case insensitive", async () => {
      const program = Effect.gen(function* () {
        const service = yield* LLMService;
        const mockProvider = createMockProvider({ name: "OpenAI" });
        yield* service.registerProvider(mockProvider);
        return yield* service.hasProvider("openai");
      });

      const hasProvider = await Effect.runPromise(
        program.pipe(Effect.provide(LLMServiceLive))
      );
      expect(hasProvider).toBe(true);
    });
  });

  describe("complete", () => {
    test("completes request using registered provider", async () => {
      const mockResponse: LLMResponse = {
        content: "Test response content",
        model: "gpt-4o",
        usage: { inputTokens: 15, outputTokens: 25 },
        finishReason: "stop",
      };

      const program = Effect.gen(function* () {
        const service = yield* LLMService;
        const mockProvider = createMockProvider({
          name: "openai",
          response: mockResponse,
        });
        yield* service.registerProvider(mockProvider);

        const request: LLMRequest = {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        };

        return yield* service.complete(request);
      });

      const response = await Effect.runPromise(
        program.pipe(Effect.provide(LLMServiceLive))
      );

      expect(response.content).toBe("Test response content");
      expect(response.model).toBe("gpt-4o");
      expect(response.usage.inputTokens).toBe(15);
      expect(response.finishReason).toBe("stop");
    });

    test("complete fails when no provider available", async () => {
      const program = Effect.gen(function* () {
        const service = yield* LLMService;
        const request: LLMRequest = {
          model: "unknown-model",
          messages: [{ role: "user", content: "Hello" }],
        };
        return yield* service.complete(request);
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(LLMServiceLive), Effect.either)
      );

      expect(result._tag).toBe("Left");
    });
  });

  describe("stream", () => {
    test("streams response chunks", async () => {
      const chunks: StreamChunk[] = [
        { type: "content", content: "Hello", done: false },
        { type: "content", content: " ", done: false },
        { type: "content", content: "World", done: false },
        { type: "content", content: "", done: true },
      ];

      const program = Effect.gen(function* () {
        const service = yield* LLMService;
        const mockProvider = createMockProvider({
          name: "openai",
          streamChunks: chunks,
        });
        yield* service.registerProvider(mockProvider);

        const request: LLMRequest = {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Say hello" }],
        };

        const stream = service.stream(request);
        const collectedChunks = yield* Stream.runCollect(stream);
        return Chunk.toReadonlyArray(collectedChunks);
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(LLMServiceLive))
      );

      expect(result).toHaveLength(4);
      expect(result[0].content).toBe("Hello");
      expect(result[3].done).toBe(true);
    });
  });

  describe("listModels", () => {
    test("lists models from specific provider", async () => {
      const program = Effect.gen(function* () {
        const service = yield* LLMService;
        const mockProvider = createMockProvider({
          name: "openai",
          models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
        });
        yield* service.registerProvider(mockProvider);

        return yield* service.listModels("openai");
      });

      const models = await Effect.runPromise(
        program.pipe(Effect.provide(LLMServiceLive))
      );

      expect(models).toContain("gpt-4o");
      expect(models).toContain("gpt-4o-mini");
    });

    test("lists models from all providers", async () => {
      const program = Effect.gen(function* () {
        const service = yield* LLMService;

        const openaiProvider = createMockProvider({
          name: "openai",
          models: ["gpt-4o"],
        });
        const anthropicProvider = createMockProvider({
          name: "anthropic",
          models: ["claude-3-opus"],
        });

        yield* service.registerProvider(openaiProvider);
        yield* service.registerProvider(anthropicProvider);

        return yield* service.listModels();
      });

      const models = await Effect.runPromise(
        program.pipe(Effect.provide(LLMServiceLive))
      );

      expect(models).toContain("gpt-4o");
      expect(models).toContain("claude-3-opus");
    });

    test("returns empty array when no providers registered", async () => {
      const program = Effect.gen(function* () {
        const service = yield* LLMService;
        return yield* service.listModels();
      });

      const models = await Effect.runPromise(
        program.pipe(Effect.provide(LLMServiceLive))
      );

      expect(models).toEqual([]);
    });
  });

  describe("completeWithRetry", () => {
    test("retries on rate limit error", async () => {
      let attempts = 0;

      const retryableProvider: LLMProvider = {
        name: "openai",
        complete: () => {
          attempts++;
          if (attempts < 3) {
            return Effect.fail(
              new LLMRateLimitError({
                message: "Rate limited",
                provider: "openai",
              })
            );
          }
          return Effect.succeed({
            content: "Success after retry",
            model: "gpt-4o",
            usage: { inputTokens: 10, outputTokens: 5 },
            finishReason: "stop" as const,
          });
        },
        stream: () => Stream.empty,
        listModels: () => Effect.succeed([]),
        validateApiKey: () => Effect.succeed(true),
      };

      const program = Effect.gen(function* () {
        const service = yield* LLMService;
        yield* service.registerProvider(retryableProvider);

        const request: LLMRequest = {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        };

        return yield* service.completeWithRetry(request, {
          maxRetries: 5,
          initialDelayMs: 10,
        });
      });

      const response = await Effect.runPromise(
        program.pipe(Effect.provide(LLMServiceLive))
      );

      expect(attempts).toBe(3);
      expect(response.content).toBe("Success after retry");
    });

    test("does not retry on auth error", async () => {
      let attempts = 0;

      const authErrorProvider: LLMProvider = {
        name: "openai",
        complete: () => {
          attempts++;
          return Effect.fail(
            new LLMAuthError({
              message: "Invalid API key",
              provider: "openai",
            })
          );
        },
        stream: () => Stream.empty,
        listModels: () => Effect.succeed([]),
        validateApiKey: () => Effect.succeed(false),
      };

      const program = Effect.gen(function* () {
        const service = yield* LLMService;
        yield* service.registerProvider(authErrorProvider);

        const request: LLMRequest = {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        };

        return yield* service.completeWithRetry(request);
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(LLMServiceLive), Effect.either)
      );

      expect(attempts).toBe(1); // No retries
      expect(result._tag).toBe("Left");
    });
  });
});

describe("LLM Error Types", () => {
  describe("LLMError", () => {
    test("has correct tag", () => {
      const error = new LLMError({ message: "Generic error" });
      expect(error._tag).toBe("LLMError");
    });

    test("includes provider when specified", () => {
      const error = new LLMError({ message: "Error", provider: "openai" });
      expect(error.provider).toBe("openai");
    });
  });

  describe("LLMAuthError", () => {
    test("has correct properties", () => {
      const error = new LLMAuthError({ message: "Unauthorized", provider: "anthropic" });
      expect(error._tag).toBe("LLMAuthError");
      expect(error.provider).toBe("anthropic");
    });
  });

  describe("LLMRateLimitError", () => {
    test("has correct properties", () => {
      const error = new LLMRateLimitError({
        message: "Too many requests",
        provider: "openai",
        retryAfterMs: 60000,
      });
      expect(error._tag).toBe("LLMRateLimitError");
      expect(error.retryAfterMs).toBe(60000);
    });
  });

  describe("LLMTimeoutError", () => {
    test("has correct properties", () => {
      const error = new LLMTimeoutError({
        message: "Request timed out",
        provider: "openai",
        timeoutMs: 30000,
      });
      expect(error._tag).toBe("LLMTimeoutError");
      expect(error.timeoutMs).toBe(30000);
    });
  });

  describe("LLMModelError", () => {
    test("has correct properties", () => {
      const error = new LLMModelError({
        message: "Model not found",
        provider: "openai",
        model: "gpt-5",
        availableModels: ["gpt-4o", "gpt-4o-mini"],
      });
      expect(error._tag).toBe("LLMModelError");
      expect(error.model).toBe("gpt-5");
      expect(error.availableModels).toContain("gpt-4o");
    });
  });

  describe("LLMContentFilterError", () => {
    test("has correct properties", () => {
      const error = new LLMContentFilterError({
        message: "Content blocked",
        provider: "openai",
      });
      expect(error._tag).toBe("LLMContentFilterError");
    });
  });
});

describe("parseProviderError", () => {
  test("parses 401 as auth error", () => {
    const error = parseProviderError(
      new Error("401 Unauthorized"),
      "openai",
      "API error"
    );
    expect(error._tag).toBe("LLMAuthError");
  });

  test("parses 429 as rate limit error", () => {
    const error = parseProviderError(
      new Error("429 Too Many Requests"),
      "openai",
      "API error"
    );
    expect(error._tag).toBe("LLMRateLimitError");
  });

  test("parses content filter errors", () => {
    const error = parseProviderError(
      new Error("Content blocked by safety filters"),
      "anthropic",
      "API error"
    );
    expect(error._tag).toBe("LLMContentFilterError");
  });

  test("parses model not found errors", () => {
    const error = parseProviderError(
      new Error("Model 'gpt-5' not found"),
      "openai",
      "API error"
    );
    expect(error._tag).toBe("LLMModelError");
  });

  test("returns generic error for unknown errors", () => {
    const error = parseProviderError(
      new Error("Something went wrong"),
      "openai",
      "API error"
    );
    expect(error._tag).toBe("LLMError");
  });
});
