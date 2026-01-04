/**
 * Effect Test Utilities and Layers
 *
 * Provides reusable utilities for testing Effect-based services in Grimoire.
 * Establishes patterns for:
 * - Running Effect tests with proper error handling
 * - Creating test layers with mock services
 * - Composing layers for integration tests
 */

import { Effect, Layer, Exit, Cause, Option, Context } from "effect";
import type { Scope } from "effect";

/**
 * Run an Effect test program, extracting the result or throwing on failure.
 * Provides better error messages than raw Effect.runPromise.
 *
 * @example
 * ```ts
 * it("should work", async () => {
 *   const result = await runTest(
 *     Effect.gen(function* () {
 *       const service = yield* MyService;
 *       return yield* service.doSomething();
 *     }).pipe(Effect.provide(TestLayer))
 *   );
 *   expect(result).toBe(expected);
 * });
 * ```
 */
export const runTest = async <A, E>(
  effect: Effect.Effect<A, E, never>
): Promise<A> => {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  // Format the error for better test output
  const cause = exit.cause;
  const failure = Cause.failureOption(cause);

  if (Option.isSome(failure)) {
    const err = failure.value;
    if (err instanceof Error) {
      throw err;
    }
    // For typed errors, throw with useful message
    throw new Error(
      `Effect failed with: ${JSON.stringify(err, null, 2)}`
    );
  }

  // Handle defects (unexpected errors) - use squash to get the first error
  const squashed = Cause.squash(cause);
  if (squashed instanceof Error) {
    throw squashed;
  }

  // Handle interruption
  if (Cause.isInterrupted(cause)) {
    throw new Error("Effect was interrupted");
  }

  throw new Error(`Effect failed with unknown cause: ${Cause.pretty(cause)}`);
};

/**
 * Run an Effect test and expect it to fail with a specific error type.
 * Returns the error for further assertions.
 *
 * @example
 * ```ts
 * it("should fail with NotFoundError", async () => {
 *   const error = await runTestExpectError(
 *     Effect.gen(function* () {
 *       const service = yield* MyService;
 *       return yield* service.getNothing();
 *     }).pipe(Effect.provide(TestLayer)),
 *     (e): e is NotFoundError => e._tag === "NotFoundError"
 *   );
 *   expect(error.id).toBe("missing");
 * });
 * ```
 */
export const runTestExpectError = async <A, E, E2 extends E>(
  effect: Effect.Effect<A, E, never>,
  isExpectedError: (e: E) => e is E2
): Promise<E2> => {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    throw new Error(
      `Expected effect to fail, but it succeeded with: ${JSON.stringify(exit.value)}`
    );
  }

  const cause = exit.cause;
  const failure = Cause.failureOption(cause);

  if (Option.isSome(failure)) {
    const err = failure.value;
    if (isExpectedError(err)) {
      return err;
    }
    throw new Error(
      `Expected specific error type, but got: ${JSON.stringify(err)}`
    );
  }

  throw new Error(`Expected failure but got: ${Cause.pretty(cause)}`);
};

/**
 * Run an Effect test expecting any failure, returning the error.
 */
export const runTestExpectFailure = async <A, E>(
  effect: Effect.Effect<A, E, never>
): Promise<E> => {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    throw new Error(
      `Expected effect to fail, but it succeeded with: ${JSON.stringify(exit.value)}`
    );
  }

  const cause = exit.cause;
  const failure = Cause.failureOption(cause);

  if (Option.isSome(failure)) {
    return failure.value;
  }

  throw new Error(`Expected failure but got: ${Cause.pretty(cause)}`);
};

/**
 * Create a mock service layer from a partial implementation.
 * Useful for creating test doubles that only implement needed methods.
 *
 * @example
 * ```ts
 * const MockStorage = Layer.succeed(StorageService, {
 *   read: (id) => Effect.succeed({ id, content: "test" }),
 *   write: () => Effect.void,
 * });
 * ```
 */
export const createMockLayer = <Id, Service>(
  tag: Context.Tag<Id, Service>,
  implementation: Service
): Layer.Layer<Id> => {
  return Layer.succeed(tag, implementation);
};

/**
 * Compose two test layers into a single layer.
 * Convenience wrapper around Layer.merge.
 *
 * For more than two layers, use Layer.mergeAll directly.
 */
export function composeTestLayers<A, E1, R1, B, E2, R2>(
  layer1: Layer.Layer<A, E1, R1>,
  layer2: Layer.Layer<B, E2, R2>
): Layer.Layer<A | B, E1 | E2, R1 | R2> {
  return Layer.merge(layer1, layer2);
}

/**
 * Helper to create a scoped test - automatically handles resource cleanup.
 *
 * @example
 * ```ts
 * it("should work with scoped resources", async () => {
 *   await runScopedTest(
 *     Effect.gen(function* () {
 *       const resource = yield* acquireResource;
 *       // resource will be released after test
 *       return yield* useResource(resource);
 *     })
 *   );
 * });
 * ```
 */
export const runScopedTest = async <A, E>(
  effect: Effect.Effect<A, E, Scope.Scope>
): Promise<A> => {
  return runTest(Effect.scoped(effect));
};

/**
 * Error thrown when a test times out.
 */
export class TestTimeoutError extends Error {
  readonly _tag = "TestTimeoutError";
  constructor(readonly timeoutMs: number) {
    super(`Test timed out after ${timeoutMs}ms`);
    this.name = "TestTimeoutError";
  }
}

/**
 * Create a test that times out after the specified duration.
 *
 * @example
 * ```ts
 * it("should complete quickly", async () => {
 *   const result = await runTestWithTimeout(
 *     slowEffect,
 *     5000 // 5 second timeout
 *   );
 * });
 * ```
 */
export const runTestWithTimeout = async <A, E>(
  effect: Effect.Effect<A, E, never>,
  timeoutMs: number
): Promise<A> => {
  return runTest(
    effect.pipe(
      Effect.timeoutFail({
        duration: `${timeoutMs} millis`,
        onTimeout: () => new TestTimeoutError(timeoutMs),
      })
    )
  );
};

/**
 * Helper to run multiple independent effects in parallel and collect results.
 * Useful for setup/teardown that can happen concurrently.
 */
export const runParallel = <Effects extends Effect.Effect<unknown, unknown, never>[]>(
  ...effects: Effects
): Effect.Effect<
  { [K in keyof Effects]: Effect.Effect.Success<Effects[K]> },
  Effect.Effect.Error<Effects[number]>,
  never
> => {
  return Effect.all(effects, { concurrency: "unbounded" }) as never;
};

/**
 * Assert that an Effect succeeds (for use in test setup).
 * Throws with helpful message on failure.
 */
export const assertSuccess = <A, E>(
  effect: Effect.Effect<A, E, never>,
  message?: string
): Effect.Effect<A, never, never> => {
  return effect.pipe(
    Effect.catchAll((error) =>
      Effect.die(
        new Error(
          `${message ?? "Assertion failed"}: ${JSON.stringify(error)}`
        )
      )
    )
  );
};

/**
 * Type helper for extracting service type from a Context.Tag
 */
export type ServiceOf<T> = T extends { Service: infer S } ? S : never;

/**
 * Type helper for extracting error type from an Effect
 */
export type ErrorOf<T> = T extends Effect.Effect<unknown, infer E, unknown> ? E : never;

/**
 * Type helper for extracting success type from an Effect
 */
export type SuccessOf<T> = T extends Effect.Effect<infer A, unknown, unknown> ? A : never;
