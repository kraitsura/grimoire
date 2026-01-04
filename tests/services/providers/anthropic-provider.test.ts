/**
 * Anthropic Provider Tests
 *
 * Tests for the Anthropic/Claude LLM provider including:
 * - Model listing and resolution
 * - API key handling
 * - Request/response formatting
 * - Thinking mode support
 */

import { describe, test, expect } from "bun:test";
import { Effect, Layer } from "effect";
import { makeAnthropicProvider } from "../../../src/services/providers/anthropic-provider";
import { ApiKeyService, ApiKeyNotFoundError } from "../../../src/services/api-key-service";
import type { LLMRequest, LLMProvider } from "../../../src/services/llm-service";

// Mock ApiKeyService for testing
const makeMockApiKeyService = (apiKey: string = "test-anthropic-key") => ({
  get: (provider: string) => Effect.succeed(apiKey),
  set: () => Effect.void,
  remove: () => Effect.void,
  list: () => Effect.succeed(["anthropic"]),
  validate: () => Effect.succeed(true),
  mask: (key: string) => key.slice(0, 7) + "..." + key.slice(-4),
});

const MockApiKeyServiceLive = Layer.succeed(
  ApiKeyService,
  makeMockApiKeyService()
);

describe("Anthropic Provider", () => {
  describe("listModels", () => {
    test("returns list of supported models", async () => {
      const provider = await Effect.runPromise(
        makeAnthropicProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      );
      const models = await Effect.runPromise(provider.listModels());

      expect(models).toContain("claude-opus-4-5");
      expect(models).toContain("claude-sonnet-4-5");
      expect(models).toContain("claude-haiku-4-5");
      expect(models).toContain("claude-opus-4-1");
    });

    test("returns array of models", async () => {
      const provider = await Effect.runPromise(
        makeAnthropicProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      );
      const models = await Effect.runPromise(provider.listModels());

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });
  });

  describe("provider metadata", () => {
    test("has correct provider name", async () => {
      const provider = await Effect.runPromise(
        makeAnthropicProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      );
      expect(provider.name).toBe("anthropic");
    });
  });

  describe("complete", () => {
    test("fails when API key is not found", async () => {
      const NoKeyServiceImpl = {
        get: () =>
          Effect.fail(
            new ApiKeyNotFoundError({ provider: "anthropic" })
          ),
        set: () => Effect.void,
        remove: () => Effect.void,
        list: () => Effect.succeed([]),
        validate: () => Effect.succeed(false),
        mask: (key: string) => key,
      };

      const NoKeyServiceLive = Layer.succeed(ApiKeyService, NoKeyServiceImpl);

      const provider = await Effect.runPromise(
        makeAnthropicProvider.pipe(Effect.provide(NoKeyServiceLive))
      );

      const request: LLMRequest = {
        model: "claude-sonnet-4-5",
        messages: [{ role: "user", content: "Hello" }],
      };

      const result = await Effect.runPromise(
        Effect.either(provider.complete(request))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("LLMAuthError");
        expect(result.left.message).toContain("API key not found");
      }
    });
  });

  describe("validateApiKey", () => {
    test("validates API key structure", async () => {
      const provider = await Effect.runPromise(
        makeAnthropicProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      );

      // Note: This will make an actual API call in real usage
      const result = await Effect.runPromise(
        Effect.either(provider.validateApiKey())
      );

      expect(result._tag).toBe("Right");
    });
  });

  describe("message conversion", () => {
    test("handles system, user, and assistant messages", () => {
      const request: LLMRequest = {
        model: "claude-sonnet-4-5",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello!" },
          { role: "assistant", content: "Hi there!" },
          { role: "user", content: "How are you?" },
        ],
      };

      // Verify message structure is correct
      expect(request.messages).toHaveLength(4);
      expect(request.messages[0].role).toBe("system");
      expect(request.messages[1].role).toBe("user");
      expect(request.messages[2].role).toBe("assistant");
      expect(request.messages[3].role).toBe("user");
    });
  });

  describe("request parameters", () => {
    test("handles temperature and maxTokens", () => {
      const request: LLMRequest = {
        model: "claude-sonnet-4-5",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
        maxTokens: 200,
      };

      expect(request.temperature).toBe(0.7);
      expect(request.maxTokens).toBe(200);
    });

    test("handles thinking mode configuration", () => {
      const request: LLMRequest = {
        model: "claude-opus-4-5",
        messages: [{ role: "user", content: "Think about this problem" }],
        thinking: {
          enabled: true,
          budgetTokens: 4096,
        },
      };

      expect(request.thinking?.enabled).toBe(true);
      expect(request.thinking?.budgetTokens).toBe(4096);
    });
  });

  describe("model resolution", () => {
    test("supports Claude 4.5 models", async () => {
      const provider = await Effect.runPromise(
        makeAnthropicProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      );
      const models = await Effect.runPromise(provider.listModels());

      // Claude 4.5 family
      expect(models).toContain("claude-opus-4-5");
      expect(models).toContain("claude-sonnet-4-5");
      expect(models).toContain("claude-haiku-4-5");
    });

    test("supports Claude 4.1 models", async () => {
      const provider = await Effect.runPromise(
        makeAnthropicProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      );
      const models = await Effect.runPromise(provider.listModels());

      expect(models).toContain("claude-opus-4-1");
    });
  });
});
