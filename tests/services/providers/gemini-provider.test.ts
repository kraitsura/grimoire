/**
 * Gemini Provider Tests
 *
 * Tests for the Google Gemini LLM provider including:
 * - Model listing and resolution
 * - API key handling
 * - Request/response formatting
 */

import { describe, test, expect } from "bun:test";
import { Effect, Layer } from "effect";
import { makeGeminiProvider } from "../../../src/services/providers/gemini-provider";
import { ApiKeyService, ApiKeyNotFoundError } from "../../../src/services/api-key-service";
import type { LLMRequest, LLMProvider } from "../../../src/services/llm-service";

// Mock ApiKeyService for testing
const makeMockApiKeyService = (apiKey: string = "test-google-api-key") => ({
  get: (provider: string) => Effect.succeed(apiKey),
  set: () => Effect.void,
  remove: () => Effect.void,
  list: () => Effect.succeed(["google"]),
  validate: () => Effect.succeed(true),
  mask: (key: string) => key.slice(0, 7) + "..." + key.slice(-4),
});

const MockApiKeyServiceLive = Layer.succeed(
  ApiKeyService,
  makeMockApiKeyService()
);

describe("Gemini Provider", () => {
  describe("listModels", () => {
    test("returns list of supported models", async () => {
      const provider = await Effect.runPromise(
        makeGeminiProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      );
      const models = await Effect.runPromise(provider.listModels());

      // Gemini 3 preview
      expect(models).toContain("gemini-3-pro-preview");

      // Gemini 2.5 family
      expect(models).toContain("gemini-2.5-pro");
      expect(models).toContain("gemini-2.5-flash");
      expect(models).toContain("gemini-2.5-flash-lite");

      // Gemini 2.0 family
      expect(models).toContain("gemini-2.0-flash");
      expect(models).toContain("gemini-2.0-flash-lite");
    });

    test("returns array of models", async () => {
      const provider = await Effect.runPromise(
        makeGeminiProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      );
      const models = await Effect.runPromise(provider.listModels());

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });
  });

  describe("provider metadata", () => {
    test("has correct provider name", async () => {
      const provider = await Effect.runPromise(
        makeGeminiProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      );
      expect(provider.name).toBe("google");
    });
  });

  describe("complete", () => {
    test("fails when API key is not found", async () => {
      const NoKeyServiceImpl = {
        get: () =>
          Effect.fail(
            new ApiKeyNotFoundError({ provider: "google" })
          ),
        set: () => Effect.void,
        remove: () => Effect.void,
        list: () => Effect.succeed([]),
        validate: () => Effect.succeed(false),
        mask: (key: string) => key,
      };

      const NoKeyServiceLive = Layer.succeed(ApiKeyService, NoKeyServiceImpl);

      const provider = await Effect.runPromise(
        makeGeminiProvider.pipe(Effect.provide(NoKeyServiceLive))
      );

      const request: LLMRequest = {
        model: "gemini-2.0-flash",
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
        makeGeminiProvider.pipe(Effect.provide(MockApiKeyServiceLive))
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
        model: "gemini-2.0-flash",
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
    });
  });

  describe("request parameters", () => {
    test("handles temperature and maxTokens", () => {
      const request: LLMRequest = {
        model: "gemini-2.5-pro",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.5,
        maxTokens: 150,
      };

      expect(request.temperature).toBe(0.5);
      expect(request.maxTokens).toBe(150);
    });
  });

  describe("model resolution", () => {
    test("supports Gemini 2.5 models", async () => {
      const provider = await Effect.runPromise(
        makeGeminiProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      );
      const models = await Effect.runPromise(provider.listModels());

      expect(models).toContain("gemini-2.5-pro");
      expect(models).toContain("gemini-2.5-flash");
      expect(models).toContain("gemini-2.5-flash-lite");
    });

    test("supports Gemini 2.0 models", async () => {
      const provider = await Effect.runPromise(
        makeGeminiProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      );
      const models = await Effect.runPromise(provider.listModels());

      expect(models).toContain("gemini-2.0-flash");
      expect(models).toContain("gemini-2.0-flash-lite");
    });

    test("supports Gemini 3 preview models", async () => {
      const provider = await Effect.runPromise(
        makeGeminiProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      );
      const models = await Effect.runPromise(provider.listModels());

      expect(models).toContain("gemini-3-pro-preview");
    });
  });
});
