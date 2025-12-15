/**
 * Response Cache Service Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Effect, Layer } from "effect";
import {
  ResponseCacheService,
  ResponseCacheServiceLive,
  type LLMRequest,
  type LLMResponse,
} from "../src/services/response-cache-service";
import { SqlService, SqlLive } from "../src/services/sql-service";

// Test layer with dependencies
const TestLayer = Layer.provide(ResponseCacheServiceLive, SqlLive);

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

  beforeEach(async () => {
    // Clear cache before each test
    const program = Effect.gen(function* () {
      const cache = yield* ResponseCacheService;
      yield* cache.clear();
    });

    await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
  });

  it("should return None for cache miss", async () => {
    const program = Effect.gen(function* () {
      const cache = yield* ResponseCacheService;
      const result = yield* cache.get(testRequest);
      return result;
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("None");
  });

  it("should cache and retrieve response", async () => {
    const program = Effect.gen(function* () {
      const cache = yield* ResponseCacheService;

      // Store response
      yield* cache.set(testRequest, testResponse);

      // Retrieve response
      const result = yield* cache.get(testRequest);

      return result;
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(TestLayer))
    );

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

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("None");
  });

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

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("None");
  });

  it("should return cache statistics", async () => {
    const program = Effect.gen(function* () {
      const cache = yield* ResponseCacheService;

      // Store a response
      yield* cache.set(testRequest, testResponse);

      // Get stats
      const stats = yield* cache.getStats();

      return stats;
    });

    const stats = await Effect.runPromise(
      program.pipe(Effect.provide(TestLayer))
    );

    expect(stats.entries).toBe(1);
    expect(stats.totalSize).toBeGreaterThan(0);
  });

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

    const { result1, result2 } = await Effect.runPromise(
      program.pipe(Effect.provide(TestLayer))
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
});
