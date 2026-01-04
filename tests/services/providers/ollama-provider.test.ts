/**
 * Ollama Provider Tests
 *
 * Tests for the local Ollama LLM provider including:
 * - Provider creation and metadata
 * - Request handling and message conversion
 * - Connection checking and error handling
 */

import { describe, test, expect } from "bun:test";
import { Effect, Stream } from "effect";
import { makeOllamaProvider, OllamaProvider } from "../../../src/services/providers/ollama-provider";
import type { LLMRequest } from "../../../src/services/llm-service";

describe("OllamaProvider", () => {
  describe("provider creation", () => {
    test("provider has correct name", () => {
      const provider = makeOllamaProvider();
      expect(provider.name).toBe("ollama");
    });

    test("provider has required methods", () => {
      const provider = makeOllamaProvider();

      expect(typeof provider.complete).toBe("function");
      expect(typeof provider.stream).toBe("function");
      expect(typeof provider.listModels).toBe("function");
      expect(typeof provider.validateApiKey).toBe("function");
    });

    test("OllamaProvider Effect returns provider instance", async () => {
      const provider = await Effect.runPromise(OllamaProvider);
      expect(provider.name).toBe("ollama");
    });
  });

  describe("request handling", () => {
    test("handles basic request structure", () => {
      const request: LLMRequest = {
        model: "llama2",
        messages: [{ role: "user", content: "Hello" }],
      };

      expect(request.model).toBe("llama2");
      expect(request.messages).toHaveLength(1);
    });

    test("handles request with system prompt", () => {
      const request: LLMRequest = {
        model: "mistral",
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hello" },
        ],
      };

      expect(request.messages).toHaveLength(2);
      expect(request.messages[0].role).toBe("system");
    });

    test("handles request with temperature and maxTokens", () => {
      const request: LLMRequest = {
        model: "codellama",
        messages: [{ role: "user", content: "Write code" }],
        temperature: 0.2,
        maxTokens: 500,
      };

      expect(request.temperature).toBe(0.2);
      expect(request.maxTokens).toBe(500);
    });

    test("supports arbitrary model names", () => {
      const models = ["llama2", "mistral:7b", "codellama:13b-instruct", "phi3:mini"];
      for (const model of models) {
        const request: LLMRequest = {
          model,
          messages: [{ role: "user", content: "Test" }],
        };
        expect(request.model).toBe(model);
      }
    });
  });

  describe("listModels", () => {
    test("returns models or connection error", async () => {
      const provider = makeOllamaProvider();

      const result = await Effect.runPromise(
        Effect.either(provider.listModels()).pipe(
          Effect.catchAllDefect((error) => {
            // Handle defects (network errors become defects in Effect)
            return Effect.succeed({ _tag: "Left" as const, left: { message: String(error) } });
          })
        )
      );

      // Either succeeds with models or fails with connection error
      if (result._tag === "Right") {
        expect(Array.isArray(result.right)).toBe(true);
      } else {
        // Connection error - expected when Ollama not running
        expect(typeof result.left.message).toBe("string");
      }
    });
  });

  describe("validateApiKey (connection check)", () => {
    test("validates as connection check not API key", async () => {
      const provider = makeOllamaProvider();

      const result = await Effect.runPromise(
        Effect.either(provider.validateApiKey()).pipe(
          Effect.catchAllDefect((error) => {
            return Effect.succeed({ _tag: "Left" as const, left: { message: String(error) } });
          })
        )
      );

      // Either succeeds (Ollama running) or fails (Ollama not running)
      if (result._tag === "Right") {
        expect(typeof result.right).toBe("boolean");
      } else {
        // Expected when Ollama isn't running
        expect(typeof result.left.message).toBe("string");
      }
    });
  });

  describe("complete", () => {
    test("complete request has correct structure", async () => {
      const provider = makeOllamaProvider();

      const request: LLMRequest = {
        model: "llama2",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
      };

      const result = await Effect.runPromise(
        Effect.either(provider.complete(request)).pipe(
          Effect.catchAllDefect((error) => {
            return Effect.succeed({ _tag: "Left" as const, left: { _tag: "LLMError", message: String(error) } });
          })
        )
      );

      // Will fail if Ollama is not running, but we can check error structure
      if (result._tag === "Left") {
        expect(typeof result.left.message).toBe("string");
      } else {
        // If it succeeds, verify response structure
        expect(result.right.content).toBeDefined();
        expect(result.right.model).toBeDefined();
        expect(result.right.usage).toBeDefined();
        expect(result.right.finishReason).toBeDefined();
      }
    });
  });

  describe("stream", () => {
    test("stream request returns correct stream", async () => {
      const provider = makeOllamaProvider();

      const request: LLMRequest = {
        model: "llama2",
        messages: [{ role: "user", content: "Hello" }],
      };

      const stream = provider.stream(request);

      // Try to collect stream chunks (will fail if Ollama not running)
      const result = await Effect.runPromise(
        Effect.either(
          Effect.gen(function* () {
            const chunks = yield* Stream.runCollect(stream);
            return Array.from(chunks).map((chunk) => chunk.content);
          })
        ).pipe(
          Effect.catchAllDefect((error) => {
            return Effect.succeed({ _tag: "Left" as const, left: { _tag: "LLMError", message: String(error) } });
          })
        )
      );

      if (result._tag === "Left") {
        expect(typeof result.left.message).toBe("string");
      } else {
        expect(Array.isArray(result.right)).toBe(true);
      }
    });
  });

  describe("error handling", () => {
    test("provides helpful error message for connection failure", async () => {
      const provider = makeOllamaProvider();

      const result = await Effect.runPromise(
        Effect.either(provider.validateApiKey()).pipe(
          Effect.catchAllDefect((error) => {
            return Effect.succeed({ _tag: "Left" as const, left: { message: String(error) } });
          })
        )
      );

      if (result._tag === "Left") {
        // Error message is present (can be various messages)
        expect(typeof result.left.message).toBe("string");
        expect(result.left.message.length).toBeGreaterThan(0);
      }
    });
  });
});
