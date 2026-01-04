/**
 * Rate Limiter Service Tests
 *
 * Comprehensive tests for API rate limiting functionality.
 * Tests concurrency control, retry-after handling, and provider-specific limits.
 */

import { describe, it, expect } from "bun:test";
import { Effect, Layer, Fiber, TestClock, Duration } from "effect";
import {
  RateLimiterService,
  RateLimiterServiceLive,
} from "../src/services/rate-limiter-service";
import { runTest, runTestExpectFailure } from "./utils";
import { RateLimitError } from "../src/models";

// Test layer
const TestLayer = RateLimiterServiceLive;

describe("RateLimiterService", () => {
  describe("getStatus", () => {
    it("should return default status for unknown provider", async () => {
      const program = Effect.gen(function* () {
        const limiter = yield* RateLimiterService;
        const status = yield* limiter.getStatus("unknown-provider");

        return status;
      });

      const status = await runTest(program.pipe(Effect.provide(TestLayer)));

      expect(status.isLimited).toBe(false);
      expect(status.requestsRemaining).toBe(60); // Default limit
      expect(status.requestsLimit).toBe(60);
      expect(status.retryAfter).toBeUndefined();
    });

    it("should return correct default limits for known providers", async () => {
      const program = Effect.gen(function* () {
        const limiter = yield* RateLimiterService;

        const openaiStatus = yield* limiter.getStatus("openai");
        const anthropicStatus = yield* limiter.getStatus("anthropic");
        const ollamaStatus = yield* limiter.getStatus("ollama");

        return { openaiStatus, anthropicStatus, ollamaStatus };
      });

      const { openaiStatus, anthropicStatus, ollamaStatus } = await runTest(
        program.pipe(Effect.provide(TestLayer))
      );

      expect(openaiStatus.requestsLimit).toBe(60);
      expect(anthropicStatus.requestsLimit).toBe(60);
      expect(ollamaStatus.requestsLimit).toBe(Number.MAX_SAFE_INTEGER); // No limit
    });
  });

  describe("acquire and release", () => {
    it("should acquire and release permits", async () => {
      const program = Effect.gen(function* () {
        const limiter = yield* RateLimiterService;

        // Acquire a permit
        yield* limiter.acquire("test-provider");

        // Check status - should have one less remaining
        const statusAfterAcquire = yield* limiter.getStatus("test-provider");

        // Release the permit
        yield* limiter.release("test-provider");

        // Check status - should be back to full
        const statusAfterRelease = yield* limiter.getStatus("test-provider");

        return { statusAfterAcquire, statusAfterRelease };
      });

      const { statusAfterAcquire, statusAfterRelease } = await runTest(
        program.pipe(Effect.provide(TestLayer))
      );

      expect(statusAfterAcquire.requestsRemaining).toBe(59); // 60 - 1
      expect(statusAfterRelease.requestsRemaining).toBe(60); // Back to full
    });

    it("should track multiple acquisitions", async () => {
      const program = Effect.gen(function* () {
        const limiter = yield* RateLimiterService;

        // Acquire 5 permits
        for (let i = 0; i < 5; i++) {
          yield* limiter.acquire("multi-test");
        }

        const statusAfter5 = yield* limiter.getStatus("multi-test");

        // Release 3
        for (let i = 0; i < 3; i++) {
          yield* limiter.release("multi-test");
        }

        const statusAfterRelease = yield* limiter.getStatus("multi-test");

        return { statusAfter5, statusAfterRelease };
      });

      const { statusAfter5, statusAfterRelease } = await runTest(
        program.pipe(Effect.provide(TestLayer))
      );

      expect(statusAfter5.requestsRemaining).toBe(55); // 60 - 5
      expect(statusAfterRelease.requestsRemaining).toBe(58); // 55 + 3
    });

    it("should release safely when no state exists", async () => {
      const program = Effect.gen(function* () {
        const limiter = yield* RateLimiterService;

        // Release without acquiring - should not throw
        yield* limiter.release("nonexistent-provider");

        return "success";
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer)));
      expect(result).toBe("success");
    });
  });

  describe("setRetryAfter", () => {
    it("should set retry-after time and mark as limited", async () => {
      const program = Effect.gen(function* () {
        const limiter = yield* RateLimiterService;

        // First acquire to create state
        yield* limiter.acquire("retry-test");

        // Set retry-after for 5 seconds
        yield* limiter.setRetryAfter("retry-test", 5000);

        const status = yield* limiter.getStatus("retry-test");

        return status;
      });

      const status = await runTest(program.pipe(Effect.provide(TestLayer)));

      expect(status.isLimited).toBe(true);
      expect(status.retryAfter).toBeDefined();
      expect(status.requestsRemaining).toBe(0);

      // Retry time should be approximately 5 seconds from now
      const now = Date.now();
      const retryTime = status.retryAfter!.getTime();
      expect(retryTime).toBeGreaterThan(now);
      expect(retryTime).toBeLessThanOrEqual(now + 6000); // Allow 1s margin
    });

    it("should clear rate limit after retry time passes", async () => {
      // This test verifies the acquire waits for retry-after to pass
      // We use a very short retry time for testing
      const program = Effect.gen(function* () {
        const limiter = yield* RateLimiterService;

        // Create state
        yield* limiter.acquire("clear-test");
        yield* limiter.release("clear-test");

        // Set a very short retry-after (1ms)
        yield* limiter.setRetryAfter("clear-test", 1);

        // Wait a bit for the time to pass
        yield* Effect.sleep("10 millis");

        // Acquire should work now
        yield* limiter.acquire("clear-test");

        const status = yield* limiter.getStatus("clear-test");

        return status;
      });

      const status = await runTest(program.pipe(Effect.provide(TestLayer)));

      // After successful acquire, should no longer be limited
      expect(status.retryAfter).toBeUndefined();
    });
  });

  describe("provider isolation", () => {
    it("should maintain separate state for each provider", async () => {
      const program = Effect.gen(function* () {
        const limiter = yield* RateLimiterService;

        // Acquire from provider A
        yield* limiter.acquire("provider-a");
        yield* limiter.acquire("provider-a");

        // Acquire from provider B
        yield* limiter.acquire("provider-b");

        // Set retry-after on provider A
        yield* limiter.setRetryAfter("provider-a", 10000);

        const statusA = yield* limiter.getStatus("provider-a");
        const statusB = yield* limiter.getStatus("provider-b");

        return { statusA, statusB };
      });

      const { statusA, statusB } = await runTest(
        program.pipe(Effect.provide(TestLayer))
      );

      // Provider A should be limited
      expect(statusA.isLimited).toBe(true);
      expect(statusA.requestsRemaining).toBe(0);

      // Provider B should not be affected
      expect(statusB.isLimited).toBe(false);
      expect(statusB.requestsRemaining).toBe(59); // 60 - 1
    });
  });

  describe("edge cases", () => {
    it("should handle requests remaining not going below 0", async () => {
      const program = Effect.gen(function* () {
        const limiter = yield* RateLimiterService;

        // Create state and set remaining to 0 via retry-after
        yield* limiter.acquire("edge-test");
        yield* limiter.setRetryAfter("edge-test", 1); // Short timeout

        // Wait for timeout
        yield* Effect.sleep("10 millis");

        // Multiple releases shouldn't go above limit
        for (let i = 0; i < 100; i++) {
          yield* limiter.release("edge-test");
        }

        const status = yield* limiter.getStatus("edge-test");

        return status;
      });

      const status = await runTest(program.pipe(Effect.provide(TestLayer)));

      // Should not exceed the limit
      expect(status.requestsRemaining).toBeLessThanOrEqual(
        status.requestsLimit!
      );
    });

    it("should handle concurrent acquires gracefully", async () => {
      const program = Effect.gen(function* () {
        const limiter = yield* RateLimiterService;

        // Run multiple acquires concurrently
        const acquirePromises = Array.from({ length: 10 }, () =>
          limiter.acquire("concurrent-test")
        );

        yield* Effect.all(acquirePromises, { concurrency: "unbounded" });

        const status = yield* limiter.getStatus("concurrent-test");

        return status;
      });

      const status = await runTest(program.pipe(Effect.provide(TestLayer)));

      // All 10 acquires should have succeeded
      expect(status.requestsRemaining).toBe(50); // 60 - 10
    });
  });

  describe("integration scenarios", () => {
    it("should simulate API request flow", async () => {
      const program = Effect.gen(function* () {
        const limiter = yield* RateLimiterService;

        // Simulate 3 API requests
        const makeRequest = (id: number) =>
          Effect.gen(function* () {
            yield* limiter.acquire("api-test");

            // Simulate API call
            yield* Effect.sleep("1 millis");

            yield* limiter.release("api-test");

            return `request-${id}-complete`;
          });

        const results = yield* Effect.all(
          [makeRequest(1), makeRequest(2), makeRequest(3)],
          { concurrency: "unbounded" }
        );

        return results;
      });

      const results = await runTest(program.pipe(Effect.provide(TestLayer)));

      expect(results).toHaveLength(3);
      expect(results).toContain("request-1-complete");
      expect(results).toContain("request-2-complete");
      expect(results).toContain("request-3-complete");
    });

    it("should handle rate limit response from API", async () => {
      const program = Effect.gen(function* () {
        const limiter = yield* RateLimiterService;

        // Simulate receiving a 429 response with retry-after header
        yield* limiter.acquire("api-429-test");

        // API returned 429 with 100ms retry-after
        yield* limiter.setRetryAfter("api-429-test", 100);

        const statusBeforeRetry = yield* limiter.getStatus("api-429-test");

        // Wait and retry
        yield* Effect.sleep("150 millis");

        yield* limiter.acquire("api-429-test");

        const statusAfterRetry = yield* limiter.getStatus("api-429-test");

        return { statusBeforeRetry, statusAfterRetry };
      });

      const { statusBeforeRetry, statusAfterRetry } = await runTest(
        program.pipe(Effect.provide(TestLayer))
      );

      expect(statusBeforeRetry.isLimited).toBe(true);
      expect(statusAfterRetry.isLimited).toBe(false);
    });
  });
});
