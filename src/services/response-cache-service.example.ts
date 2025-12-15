/**
 * ResponseCacheService Usage Examples
 *
 * This file demonstrates how to use the ResponseCacheService for caching
 * LLM API responses.
 */

import { Effect, Layer } from "effect";
import {
  ResponseCacheService,
  ResponseCacheServiceLive,
  type LLMRequest,
  type LLMResponse,
} from "./response-cache-service";
import { SqlLive } from "./sql-service";

// Setup: Provide the cache service with its dependencies
const AppLayer = Layer.provide(ResponseCacheServiceLive, SqlLive);

/**
 * Example 1: Basic cache usage with cache hit
 */
export const exampleBasicCaching = Effect.gen(function* () {
  const cache = yield* ResponseCacheService;

  const request: LLMRequest = {
    model: "claude-3-opus",
    messages: [{ role: "user", content: "What is the capital of France?" }],
    temperature: 0, // Temperature must be 0 for caching
  };

  // Check cache first
  const cached = yield* cache.get(request);

  if (cached._tag === "Some") {
    console.log("Cache hit! Using cached response:", cached.value.content);
    return cached.value;
  }

  console.log("Cache miss. Making API call...");

  // Simulate API call (replace with actual API call)
  const response: LLMResponse = {
    content: "The capital of France is Paris.",
    usage: {
      inputTokens: 15,
      outputTokens: 8,
    },
  };

  // Store in cache for future requests
  yield* cache.set(request, response);

  return response;
});

/**
 * Example 2: Non-deterministic requests are not cached
 */
export const exampleNonDeterministic = Effect.gen(function* () {
  const cache = yield* ResponseCacheService;

  const request: LLMRequest = {
    model: "claude-3-opus",
    messages: [{ role: "user", content: "Write a creative story" }],
    temperature: 0.7, // temperature > 0 means non-deterministic
  };

  // This will always be None because temperature > 0
  const cached = yield* cache.get(request);

  console.log("Non-deterministic request, cache result:", cached._tag);
  // Output: "Non-deterministic request, cache result: None"

  // Even if we try to store it, it won't be cached
  yield* cache.set(request, {
    content: "Some creative story...",
  });

  // Still None on next get
  const stillNone = yield* cache.get(request);
  console.log("After set, still:", stillNone._tag);
  // Output: "After set, still: None"
});

/**
 * Example 3: Monitoring cache statistics
 */
export const exampleCacheStats = Effect.gen(function* () {
  const cache = yield* ResponseCacheService;

  // Get current cache stats
  const stats = yield* cache.getStats();

  console.log("Cache Statistics:");
  console.log(`- Entries: ${stats.entries}`);
  console.log(`- Total Size: ${stats.totalSize} bytes`);
  console.log(`- Hit Rate: ${stats.hitRate}%`);

  // Example output:
  // Cache Statistics:
  // - Entries: 42
  // - Total Size: 524288 bytes
  // - Hit Rate: 0%  (note: hit rate tracking not implemented yet)
});

/**
 * Example 4: Clearing the cache
 */
export const exampleClearCache = Effect.gen(function* () {
  const cache = yield* ResponseCacheService;

  // Clear all cached responses
  yield* cache.clear();

  console.log("Cache cleared!");

  // Verify it's empty
  const stats = yield* cache.getStats();
  console.log(`Entries after clear: ${stats.entries}`); // 0
});

/**
 * Example 5: Cache key normalization
 *
 * The cache generates identical keys for identical requests,
 * including model, messages, temperature, and maxTokens.
 */
export const exampleCacheKeyNormalization = Effect.gen(function* () {
  const cache = yield* ResponseCacheService;

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
    maxTokens: 100,
  };

  // Store response for request1
  yield* cache.set(request1, { content: "Hi!" });

  // request2 should hit cache because it's identical to request1
  const cached = yield* cache.get(request2);

  console.log("Cache hit for identical request:", cached._tag);
  // Output: "Cache hit for identical request: Some"
});

/**
 * Example 6: Practical integration with LLM API
 */
export const callLLMWithCache = (request: LLMRequest) =>
  Effect.gen(function* () {
    const cache = yield* ResponseCacheService;

    // Try cache first
    const cached = yield* cache.get(request);

    if (cached._tag === "Some") {
      console.log("Using cached response, saved API call!");
      return cached.value;
    }

    // Cache miss - make actual API call
    console.log("Cache miss, calling API...");

    // TODO: Replace with actual API call
    // const response = yield* callAnthropicAPI(request);
    const response: LLMResponse = {
      content: "API response here",
      usage: {
        inputTokens: 100,
        outputTokens: 50,
      },
    };

    // Store in cache
    yield* cache.set(request, response);

    return response;
  });

/**
 * Running the examples
 */
export const runExamples = async () => {
  // Run any example with the AppLayer
  const result = await Effect.runPromise(exampleBasicCaching.pipe(Effect.provide(AppLayer)));

  console.log("Result:", result);
};

/**
 * Key Points:
 *
 * 1. CACHING ONLY FOR DETERMINISTIC REQUESTS
 *    - Only requests with temperature = 0 are cached
 *    - Non-deterministic requests always return cache miss
 *
 * 2. CACHE KEY GENERATION
 *    - Based on SHA256 hash of: model + messages + temperature + maxTokens
 *    - Identical requests produce identical cache keys
 *
 * 3. TTL-BASED EXPIRATION
 *    - Default TTL: 24 hours
 *    - Expired entries are automatically cleaned up on get/getStats
 *
 * 4. SIZE LIMIT
 *    - Default max size: 100MB
 *    - Oldest entries evicted when limit exceeded
 *
 * 5. STORAGE
 *    - Uses SQLite via SqlService
 *    - Data persists across application restarts
 *
 * 6. USAGE PATTERN
 *    - Always check cache first with get()
 *    - On cache miss, call API and store with set()
 *    - Clear cache when needed with clear()
 *    - Monitor usage with getStats()
 */
