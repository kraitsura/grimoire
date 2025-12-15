/**
 * Rate Limiter Service - Usage Examples
 *
 * This file demonstrates how to use the RateLimiterService in your application.
 */

import { Effect, Layer } from "effect";
import { RateLimiterService, RateLimiterServiceLive } from "./rate-limiter-service";

/**
 * Example 1: Basic usage - Acquire and release permits
 */
export const basicUsageExample = Effect.gen(function* () {
  const rateLimiter = yield* RateLimiterService;

  // Acquire a permit before making an API call
  yield* rateLimiter.acquire("openai");

  try {
    // Make your API call here
    console.log("Making API request to OpenAI...");

    // Simulate API call
    yield* Effect.sleep(100);
  } finally {
    // Always release the permit when done
    yield* rateLimiter.release("openai");
  }
});

/**
 * Example 2: Handling rate limit responses
 *
 * When you receive a 429 (Too Many Requests) response with a Retry-After header,
 * you should update the rate limiter accordingly.
 */
export const handleRateLimitResponse = (provider: string, retryAfterMs: number) =>
  Effect.gen(function* () {
    const rateLimiter = yield* RateLimiterService;

    // Set the retry-after time based on the response header
    yield* rateLimiter.setRetryAfter(provider, retryAfterMs);

    // The next acquire() call will automatically wait until the retry time passes
    yield* rateLimiter.acquire(provider);

    // Now safe to make another request
    console.log(`Request to ${provider} after waiting ${retryAfterMs}ms`);

    yield* rateLimiter.release(provider);
  });

/**
 * Example 3: Check rate limit status
 */
export const checkStatusExample = Effect.gen(function* () {
  const rateLimiter = yield* RateLimiterService;

  // Check status before making a request
  const status = yield* rateLimiter.getStatus("anthropic");

  if (status.isLimited) {
    console.log(`Rate limited until ${status.retryAfter?.toISOString()}`);
  } else {
    console.log(`${status.requestsRemaining}/${status.requestsLimit} requests remaining`);
  }
});

/**
 * Example 4: Multiple concurrent requests with automatic rate limiting
 *
 * The semaphore will automatically queue requests when the limit is reached.
 */
export const concurrentRequestsExample = Effect.gen(function* () {
  const rateLimiter = yield* RateLimiterService;

  // Make multiple concurrent requests
  const requests = Array.from({ length: 100 }, (_, i) =>
    Effect.gen(function* () {
      // Acquire will block if we're at the rate limit
      yield* rateLimiter.acquire("openai");

      console.log(`Request ${i} started`);
      yield* Effect.sleep(50);
      console.log(`Request ${i} completed`);

      yield* rateLimiter.release("openai");
    })
  );

  // Run all requests concurrently - the rate limiter will handle queueing
  yield* Effect.all(requests, { concurrency: "unbounded" });
});

/**
 * Example 5: Wrapping an API client with rate limiting
 */
export const createRateLimitedApiClient = (provider: string) => ({
  request: <T>(fn: () => Promise<T>) =>
    Effect.gen(function* () {
      const rateLimiter = yield* RateLimiterService;

      // Acquire permit
      yield* rateLimiter.acquire(provider);

      try {
        // Make the request
        const result = yield* Effect.tryPromise({
          try: fn,
          catch: (error) => error,
        });

        // Check if we got a rate limit error
        if (
          typeof result === "object" &&
          result !== null &&
          "status" in result &&
          (result as { status: number }).status === 429
        ) {
          // Extract Retry-After header (in seconds or as a date)
          const retryAfter =
            "headers" in result
              ? ((result as { headers: Record<string, string> }).headers)["retry-after"]
              : undefined;

          if (retryAfter) {
            const retryMs = Number.isNaN(Number(retryAfter))
              ? new Date(retryAfter).getTime() - Date.now()
              : Number(retryAfter) * 1000;

            yield* rateLimiter.setRetryAfter(provider, retryMs);
          }
        }

        return result;
      } finally {
        // Always release
        yield* rateLimiter.release(provider);
      }
    }),
});

/**
 * Running the examples
 *
 * To run any of these examples, provide the RateLimiterServiceLive layer:
 */
export const runExamples = () => {
  const program = basicUsageExample;

  const runnable = program.pipe(Effect.provide(RateLimiterServiceLive));

  return Effect.runPromise(runnable);
};

/**
 * Example 6: Integration with existing service layers
 *
 * You can compose the RateLimiterServiceLive with other service layers:
 */
export const AppLive = Layer.mergeAll(
  RateLimiterServiceLive
  // Add other service layers here
);
