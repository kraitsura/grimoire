/**
 * Rate Limiter Service - Manages API rate limiting per provider
 *
 * Tracks rate limits for different API providers and blocks requests
 * when limits are exceeded until the retry period expires.
 */

import { Context, Effect, Layer, Ref } from "effect";
import { RateLimitError } from "../models";

/**
 * Rate limit status for a provider
 */
export interface RateLimitStatus {
  isLimited: boolean;
  retryAfter?: Date;
  requestsRemaining?: number;
  requestsLimit?: number;
}

/**
 * Internal state for tracking a provider's rate limit
 */
interface ProviderState {
  semaphore: Effect.Semaphore;
  retryAfter?: Date;
  requestsRemaining?: number;
  requestsLimit: number;
}

/**
 * Default rate limits per provider (requests per minute)
 */
const DEFAULT_LIMITS: Record<string, number> = {
  openai: 60,
  anthropic: 60,
  ollama: Number.MAX_SAFE_INTEGER, // No limit
};

/**
 * Rate limiter service interface
 */
interface RateLimiterServiceImpl {
  /**
   * Acquire a permit to make a request to the provider
   * Blocks until the rate limit is cleared if currently limited
   */
  readonly acquire: (provider: string) => Effect.Effect<void, RateLimitError>;

  /**
   * Set retry-after time for a provider (typically from response headers)
   * @param provider - The API provider name
   * @param ms - Milliseconds to wait before retrying
   */
  readonly setRetryAfter: (provider: string, ms: number) => Effect.Effect<void, never>;

  /**
   * Get current rate limit status for a provider
   */
  readonly getStatus: (provider: string) => Effect.Effect<RateLimitStatus, never>;

  /**
   * Release a permit after request completes
   */
  readonly release: (provider: string) => Effect.Effect<void, never>;
}

/**
 * Rate limiter service tag
 */
export class RateLimiterService extends Context.Tag("RateLimiterService")<
  RateLimiterService,
  RateLimiterServiceImpl
>() {}

/**
 * Rate limiter service implementation
 */
export const RateLimiterServiceLive = Layer.effect(
  RateLimiterService,
  Effect.gen(function* () {
    // Ref to store provider states
    const statesRef = yield* Ref.make(new Map<string, ProviderState>());

    /**
     * Get or create provider state
     */
    const getOrCreateState = (provider: string): Effect.Effect<ProviderState, never> =>
      Effect.gen(function* () {
        const states = yield* Ref.get(statesRef);
        const existing = states.get(provider);

        if (existing) {
          return existing;
        }

        // Create new state for this provider
        const limit = DEFAULT_LIMITS[provider] ?? 60;
        const semaphore = yield* Effect.makeSemaphore(limit);

        const newState: ProviderState = {
          semaphore,
          requestsRemaining: limit,
          requestsLimit: limit,
        };

        // Store the new state
        yield* Ref.update(statesRef, (states) => new Map(states).set(provider, newState));

        return newState;
      });

    /**
     * Update provider state
     */
    const updateState = (
      provider: string,
      update: (state: ProviderState) => ProviderState
    ): Effect.Effect<void, never> =>
      Effect.gen(function* () {
        yield* Ref.update(statesRef, (states) => {
          const newStates = new Map(states);
          const current = newStates.get(provider);
          if (current) {
            newStates.set(provider, update(current));
          }
          return newStates;
        });
      });

    return RateLimiterService.of({
      acquire: (provider: string) =>
        Effect.gen(function* () {
          const state = yield* getOrCreateState(provider);

          // Check if we're currently rate limited
          if (state.retryAfter) {
            const now = new Date();
            const waitMs = state.retryAfter.getTime() - now.getTime();

            if (waitMs > 0) {
              // Still rate limited - wait until retry time
              yield* Effect.sleep(waitMs);

              // Clear the retry-after time
              yield* updateState(provider, (s) => ({
                ...s,
                retryAfter: undefined,
              }));
            } else {
              // Retry time has passed - clear it
              yield* updateState(provider, (s) => ({
                ...s,
                retryAfter: undefined,
              }));
            }
          }

          // Acquire semaphore permit (blocks if at limit)
          const acquired = yield* state.semaphore.take(1);

          if (!acquired) {
            return yield* Effect.fail(
              new RateLimitError({
                provider,
                message: `Failed to acquire rate limit permit for ${provider}`,
              })
            );
          }

          // Update remaining count
          yield* updateState(provider, (s) => ({
            ...s,
            requestsRemaining: Math.max(0, (s.requestsRemaining ?? s.requestsLimit) - 1),
          }));
        }),

      setRetryAfter: (provider: string, ms: number) =>
        Effect.gen(function* () {
          const retryAfter = new Date(Date.now() + ms);

          yield* updateState(provider, (state) => ({
            ...state,
            retryAfter,
            requestsRemaining: 0,
          }));
        }),

      getStatus: (provider: string) =>
        Effect.gen(function* () {
          const states = yield* Ref.get(statesRef);
          const state = states.get(provider);

          if (!state) {
            // No state yet - return default status
            const limit = DEFAULT_LIMITS[provider] ?? 60;
            return {
              isLimited: false,
              requestsRemaining: limit,
              requestsLimit: limit,
            };
          }

          const now = new Date();
          const isLimited =
            state.retryAfter !== undefined && state.retryAfter.getTime() > now.getTime();

          return {
            isLimited,
            retryAfter: state.retryAfter,
            requestsRemaining: state.requestsRemaining,
            requestsLimit: state.requestsLimit,
          };
        }),

      release: (provider: string) =>
        Effect.gen(function* () {
          const states = yield* Ref.get(statesRef);
          const state = states.get(provider);

          if (!state) {
            // No state to release
            return;
          }

          // Release semaphore permit
          yield* state.semaphore.release(1);

          // Update remaining count
          yield* updateState(provider, (s) => ({
            ...s,
            requestsRemaining: Math.min(s.requestsLimit, (s.requestsRemaining ?? 0) + 1),
          }));
        }),
    });
  })
);
