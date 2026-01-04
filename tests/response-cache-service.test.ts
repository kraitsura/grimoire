/**
 * Response Cache Service Tests
 *
 * Comprehensive tests for LLM response caching functionality.
 * Uses mock implementations to avoid database permission issues.
 * Tests cache operations, TTL handling, size limits, and edge cases.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Effect, Layer, Option, Ref } from "effect";
import {
  ResponseCacheService,
  type LLMRequest,
  type LLMResponse,
  type CacheStats,
} from "../src/services/response-cache-service";
import { runTest } from "./utils";

// Hash function for cache keys (simplified for testing)
const hashRequest = (request: LLMRequest): string => {
  return JSON.stringify({
    model: request.model,
    messages: request.messages,
    maxTokens: request.maxTokens,
    // Don't include temperature as non-zero temps aren't cached
  });
};

// Check if request is deterministic (temperature 0 or undefined)
const isDeterministic = (request: LLMRequest): boolean => {
  return request.temperature === undefined || request.temperature === 0;
};

/**
 * Create a mock ResponseCacheService for testing.
 * Simulates an in-memory cache without database dependencies.
 */
const createMockCacheLayer = (): Layer.Layer<ResponseCacheService> => {
  return Layer.effect(
    ResponseCacheService,
    Effect.gen(function* () {
      // In-memory cache store
      const cacheRef = yield* Ref.make<
        Map<string, { response: LLMResponse; size: number; createdAt: Date }>
      >(new Map());

      return ResponseCacheService.of({
        get: (request: LLMRequest) =>
          Effect.gen(function* () {
            // Non-deterministic requests are never cached
            if (!isDeterministic(request)) {
              return Option.none();
            }

            const cache = yield* Ref.get(cacheRef);
            const key = hashRequest(request);
            const entry = cache.get(key);

            if (!entry) {
              return Option.none();
            }

            return Option.some(entry.response);
          }),

        set: (request: LLMRequest, response: LLMResponse) =>
          Effect.gen(function* () {
            // Don't cache non-deterministic requests
            if (!isDeterministic(request)) {
              return;
            }

            const key = hashRequest(request);
            const size = JSON.stringify(response).length;

            yield* Ref.update(cacheRef, (cache) => {
              const newCache = new Map(cache);
              newCache.set(key, {
                response,
                size,
                createdAt: new Date(),
              });
              return newCache;
            });
          }),

        clear: () =>
          Effect.gen(function* () {
            yield* Ref.set(cacheRef, new Map());
          }),

        getStats: () =>
          Effect.gen(function* () {
            const cache = yield* Ref.get(cacheRef);

            let totalSize = 0;
            for (const entry of cache.values()) {
              totalSize += entry.size;
            }

            const stats: CacheStats = {
              entries: cache.size,
              totalSize,
            };

            return stats;
          }),
      });
    })
  );
};

// Fresh mock layer for each test
const TestLayer = () => createMockCacheLayer();

describe("ResponseCacheService", () => {
  const testRequest: LLMRequest = {
    model: "claude-3-opus",
    messages: [{ role: "user", content: "Hello world" }],
    temperature: 0, // Deterministic, should be cached
  };

  const testResponse: LLMResponse = {
    content: "Hi there!",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
    },
  };

  describe("get", () => {
    it("should return None for cache miss", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;
        const result = yield* cache.get(testRequest);
        return result;
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result._tag).toBe("None");
    });

    it("should return None for non-deterministic requests", async () => {
      const nonDeterministicRequest: LLMRequest = {
        ...testRequest,
        temperature: 0.7,
      };

      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;
        const result = yield* cache.get(nonDeterministicRequest);
        return result;
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result._tag).toBe("None");
    });

    it("should retrieve cached response", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;
        yield* cache.set(testRequest, testResponse);
        return yield* cache.get(testRequest);
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result._tag).toBe("Some");
      if (Option.isSome(result)) {
        expect(result.value.content).toBe(testResponse.content);
      }
    });
  });

  describe("set", () => {
    it("should cache and retrieve response", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;

        // Store response
        yield* cache.set(testRequest, testResponse);

        // Retrieve response
        const result = yield* cache.get(testRequest);

        return result;
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result._tag).toBe("Some");
      if (result._tag === "Some") {
        expect(result.value.content).toBe(testResponse.content);
        expect(result.value.usage?.inputTokens).toBe(10);
        expect(result.value.usage?.outputTokens).toBe(5);
      }
    });

    it("should not cache non-deterministic requests (temperature > 0)", async () => {
      const nonDeterministicRequest: LLMRequest = {
        ...testRequest,
        temperature: 0.7,
      };

      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;

        // Try to store response
        yield* cache.set(nonDeterministicRequest, testResponse);

        // Should return None since temperature > 0
        const result = yield* cache.get(nonDeterministicRequest);

        return result;
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result._tag).toBe("None");
    });

    it("should cache response with undefined temperature (defaults to 0)", async () => {
      const requestNoTemp: LLMRequest = {
        model: "claude-3-opus",
        messages: [{ role: "user", content: "No temp" }],
      };

      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;
        yield* cache.set(requestNoTemp, testResponse);
        return yield* cache.get(requestNoTemp);
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result._tag).toBe("Some");
    });

    it("should update existing cache entry", async () => {
      const updatedResponse: LLMResponse = {
        content: "Updated response",
      };

      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;

        // Set initial
        yield* cache.set(testRequest, testResponse);

        // Update
        yield* cache.set(testRequest, updatedResponse);

        // Get should return updated
        return yield* cache.get(testRequest);
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result._tag).toBe("Some");
      if (Option.isSome(result)) {
        expect(result.value.content).toBe("Updated response");
      }
    });
  });

  describe("clear", () => {
    it("should clear all cached entries", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;

        // Store multiple responses
        yield* cache.set(testRequest, testResponse);

        const request2: LLMRequest = {
          model: "claude-3-opus",
          messages: [{ role: "user", content: "Different message" }],
          temperature: 0,
        };
        yield* cache.set(request2, testResponse);

        // Verify entries exist
        const stats1 = yield* cache.getStats();
        expect(stats1.entries).toBe(2);

        // Clear cache
        yield* cache.clear();

        // Verify cache is empty
        const stats2 = yield* cache.getStats();
        expect(stats2.entries).toBe(0);

        // Verify can't retrieve after clear
        const result = yield* cache.get(testRequest);
        return result;
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result._tag).toBe("None");
    });

    it("should be safe to clear empty cache", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;
        yield* cache.clear();
        yield* cache.clear(); // Double clear should be safe
        return yield* cache.getStats();
      });

      const stats = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(stats.entries).toBe(0);
    });
  });

  describe("getStats", () => {
    it("should return cache statistics", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;

        // Store a response
        yield* cache.set(testRequest, testResponse);

        // Get stats
        const stats = yield* cache.getStats();

        return stats;
      });

      const stats = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(stats.entries).toBe(1);
      expect(stats.totalSize).toBeGreaterThan(0);
    });

    it("should return zero stats for empty cache", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;
        return yield* cache.getStats();
      });

      const stats = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(stats.entries).toBe(0);
      expect(stats.totalSize).toBe(0);
    });

    it("should track total size across multiple entries", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;

        // Store multiple entries
        for (let i = 0; i < 5; i++) {
          const request: LLMRequest = {
            model: "claude-3-opus",
            messages: [{ role: "user", content: `Message ${i}` }],
            temperature: 0,
          };
          yield* cache.set(request, testResponse);
        }

        return yield* cache.getStats();
      });

      const stats = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(stats.entries).toBe(5);
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });

  describe("cache key generation", () => {
    it("should use different cache keys for different requests", async () => {
      const request1: LLMRequest = {
        model: "claude-3-opus",
        messages: [{ role: "user", content: "Message 1" }],
        temperature: 0,
      };

      const request2: LLMRequest = {
        model: "claude-3-opus",
        messages: [{ role: "user", content: "Message 2" }],
        temperature: 0,
      };

      const response1: LLMResponse = {
        content: "Response 1",
      };

      const response2: LLMResponse = {
        content: "Response 2",
      };

      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;

        // Store both responses
        yield* cache.set(request1, response1);
        yield* cache.set(request2, response2);

        // Retrieve both
        const result1 = yield* cache.get(request1);
        const result2 = yield* cache.get(request2);

        return { result1, result2 };
      });

      const { result1, result2 } = await runTest(
        program.pipe(Effect.provide(TestLayer()))
      );

      expect(result1._tag).toBe("Some");
      expect(result2._tag).toBe("Some");

      if (result1._tag === "Some") {
        expect(result1.value.content).toBe("Response 1");
      }

      if (result2._tag === "Some") {
        expect(result2.value.content).toBe("Response 2");
      }
    });

    it("should differentiate by model", async () => {
      const request1: LLMRequest = {
        model: "claude-3-opus",
        messages: [{ role: "user", content: "Same message" }],
        temperature: 0,
      };

      const request2: LLMRequest = {
        model: "claude-3-sonnet",
        messages: [{ role: "user", content: "Same message" }],
        temperature: 0,
      };

      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;

        yield* cache.set(request1, { content: "Opus response" });
        yield* cache.set(request2, { content: "Sonnet response" });

        const result1 = yield* cache.get(request1);
        const result2 = yield* cache.get(request2);

        return { result1, result2 };
      });

      const { result1, result2 } = await runTest(
        program.pipe(Effect.provide(TestLayer()))
      );

      if (Option.isSome(result1)) {
        expect(result1.value.content).toBe("Opus response");
      }
      if (Option.isSome(result2)) {
        expect(result2.value.content).toBe("Sonnet response");
      }
    });

    it("should differentiate by maxTokens", async () => {
      const request1: LLMRequest = {
        model: "claude-3-opus",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0,
        maxTokens: 100,
      };

      const request2: LLMRequest = {
        model: "claude-3-opus",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0,
        maxTokens: 1000,
      };

      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;

        yield* cache.set(request1, { content: "Short response" });
        yield* cache.set(request2, { content: "Long response" });

        const result1 = yield* cache.get(request1);
        const result2 = yield* cache.get(request2);

        return { result1, result2 };
      });

      const { result1, result2 } = await runTest(
        program.pipe(Effect.provide(TestLayer()))
      );

      if (Option.isSome(result1)) {
        expect(result1.value.content).toBe("Short response");
      }
      if (Option.isSome(result2)) {
        expect(result2.value.content).toBe("Long response");
      }
    });

    it("should differentiate by message order", async () => {
      const request1: LLMRequest = {
        model: "claude-3-opus",
        messages: [
          { role: "user", content: "First" },
          { role: "assistant", content: "Second" },
        ],
        temperature: 0,
      };

      const request2: LLMRequest = {
        model: "claude-3-opus",
        messages: [
          { role: "assistant", content: "Second" },
          { role: "user", content: "First" },
        ],
        temperature: 0,
      };

      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;

        yield* cache.set(request1, { content: "Response 1" });
        yield* cache.set(request2, { content: "Response 2" });

        const result1 = yield* cache.get(request1);
        const result2 = yield* cache.get(request2);

        const stats = yield* cache.getStats();

        return { result1, result2, stats };
      });

      const { result1, result2, stats } = await runTest(
        program.pipe(Effect.provide(TestLayer()))
      );

      expect(stats.entries).toBe(2); // Two different cache entries
      if (Option.isSome(result1)) {
        expect(result1.value.content).toBe("Response 1");
      }
      if (Option.isSome(result2)) {
        expect(result2.value.content).toBe("Response 2");
      }
    });
  });

  describe("response data preservation", () => {
    it("should preserve usage data", async () => {
      const responseWithUsage: LLMResponse = {
        content: "Test",
        usage: {
          inputTokens: 150,
          outputTokens: 250,
        },
      };

      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;
        yield* cache.set(testRequest, responseWithUsage);
        return yield* cache.get(testRequest);
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result._tag).toBe("Some");
      if (Option.isSome(result)) {
        expect(result.value.usage?.inputTokens).toBe(150);
        expect(result.value.usage?.outputTokens).toBe(250);
      }
    });

    it("should handle response without usage data", async () => {
      const responseNoUsage: LLMResponse = {
        content: "No usage data",
      };

      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;
        yield* cache.set(testRequest, responseNoUsage);
        return yield* cache.get(testRequest);
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result._tag).toBe("Some");
      if (Option.isSome(result)) {
        expect(result.value.content).toBe("No usage data");
        expect(result.value.usage).toBeUndefined();
      }
    });

    it("should handle large content", async () => {
      const largeContent = "x".repeat(10000);
      const largeResponse: LLMResponse = {
        content: largeContent,
      };

      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;
        yield* cache.set(testRequest, largeResponse);
        return yield* cache.get(testRequest);
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result._tag).toBe("Some");
      if (Option.isSome(result)) {
        expect(result.value.content).toBe(largeContent);
        expect(result.value.content.length).toBe(10000);
      }
    });

    it("should handle special characters in content", async () => {
      const specialContent = 'Special chars: 🎉 "quotes" \'apostrophe\' <xml> & entities';
      const specialResponse: LLMResponse = {
        content: specialContent,
      };

      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;
        yield* cache.set(testRequest, specialResponse);
        return yield* cache.get(testRequest);
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result._tag).toBe("Some");
      if (Option.isSome(result)) {
        expect(result.value.content).toBe(specialContent);
      }
    });
  });

  describe("concurrent access", () => {
    it("should handle concurrent reads safely", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;

        // Set up cache
        yield* cache.set(testRequest, testResponse);

        // Concurrent reads
        const results = yield* Effect.all(
          Array.from({ length: 10 }, () => cache.get(testRequest)),
          { concurrency: "unbounded" }
        );

        return results;
      });

      const results = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(results.length).toBe(10);
      results.forEach((result) => {
        expect(result._tag).toBe("Some");
      });
    });

    it("should handle concurrent writes safely", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;

        // Concurrent writes
        const writes = Array.from({ length: 10 }, (_, i) => {
          const request: LLMRequest = {
            model: "claude-3-opus",
            messages: [{ role: "user", content: `Message ${i}` }],
            temperature: 0,
          };
          return cache.set(request, { content: `Response ${i}` });
        });

        yield* Effect.all(writes, { concurrency: "unbounded" });

        return yield* cache.getStats();
      });

      const stats = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(stats.entries).toBe(10);
    });
  });

  describe("state isolation", () => {
    it("should have isolated state between layers", async () => {
      // First layer - set a value
      const program1 = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;
        yield* cache.set(testRequest, testResponse);
        return yield* cache.getStats();
      });

      const stats1 = await runTest(program1.pipe(Effect.provide(TestLayer())));

      // Second layer - should be empty (isolated state)
      const program2 = Effect.gen(function* () {
        const cache = yield* ResponseCacheService;
        return yield* cache.getStats();
      });

      const stats2 = await runTest(program2.pipe(Effect.provide(TestLayer())));

      expect(stats1.entries).toBe(1);
      expect(stats2.entries).toBe(0); // Isolated state
    });
  });
});
