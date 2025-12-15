import { describe, test, expect } from "bun:test";
import { Effect, Context, Layer, Data } from "effect";

/**
 * Example Test Suite
 * Demonstrates testing patterns for Grimoire:
 * - Basic assertions
 * - Effect testing utilities
 * - Service mocking with test layers
 */

describe("Basic assertions", () => {
  test("should perform simple equality check", () => {
    expect(1 + 1).toBe(2);
  });

  test("should check string equality", () => {
    const greeting = "Hello, Grimoire!";
    expect(greeting).toContain("Grimoire");
  });
});

describe("Effect testing patterns", () => {
  test("should run basic Effect", async () => {
    const program = Effect.succeed(42);
    const result = await Effect.runPromise(program);
    expect(result).toBe(42);
  });

  test("should handle Effect failures", async () => {
    const program = Effect.fail("Something went wrong");

    // Use Effect.runPromiseExit to safely inspect the result
    const exit = await Effect.runPromiseExit(program);
    expect(exit._tag).toBe("Failure");
  });

  test("should chain Effects with gen", async () => {
    const program = Effect.gen(function* () {
      const a = yield* Effect.succeed(10);
      const b = yield* Effect.succeed(20);
      return a + b;
    });

    const result = await Effect.runPromise(program);
    expect(result).toBe(30);
  });
});

describe("Service mocking with test layers", () => {
  // Define a service interface
  interface StorageService {
    readonly save: (data: string) => Effect.Effect<void>;
    readonly load: () => Effect.Effect<string>;
  }

  // Create service tag
  const StorageService = Context.GenericTag<StorageService>("StorageService");

  // Real implementation (for production)
  const RealStorageService = Layer.succeed(
    StorageService,
    StorageService.of({
      save: (data: string) =>
        Effect.sync(() => {
          // Would write to file in real implementation
          console.log(`Saving: ${data}`);
        }),
      load: () =>
        Effect.sync(() => {
          // Would read from file in real implementation
          return "real data";
        }),
    })
  );

  // Test implementation (for testing)
  const TestStorageService = Layer.succeed(
    StorageService,
    StorageService.of({
      save: (data: string) =>
        Effect.sync(() => {
          // Mock implementation - no side effects
        }),
      load: () =>
        Effect.succeed("test data"),
    })
  );

  test("should use mocked service", async () => {
    const program = Effect.gen(function* () {
      const storage = yield* StorageService;
      const data = yield* storage.load();
      return data;
    });

    // Provide test layer
    const testProgram = program.pipe(
      Effect.provide(TestStorageService)
    );

    const result = await Effect.runPromise(testProgram);
    expect(result).toBe("test data");
  });

  test("should save and load data", async () => {
    const program = Effect.gen(function* () {
      const storage = yield* StorageService;
      yield* storage.save("my prompt");
      const loaded = yield* storage.load();
      return loaded;
    });

    const testProgram = program.pipe(
      Effect.provide(TestStorageService)
    );

    const result = await Effect.runPromise(testProgram);
    expect(result).toBe("test data");
  });
});

describe("Error handling patterns", () => {
  // Define custom error types using Effect's Data.TaggedError pattern
  class NotFoundError extends Data.TaggedError("NotFoundError")<{
    readonly id: string;
  }> {}

  class ValidationError extends Data.TaggedError("ValidationError")<{
    readonly message: string;
  }> {}

  test("should handle tagged errors", async () => {
    const program = Effect.fail(new NotFoundError({ id: "prompt-123" }));

    const result = await Effect.runPromise(
      program.pipe(
        Effect.catchTag("NotFoundError", (error) =>
          Effect.succeed(`Not found: ${error.id}`)
        )
      )
    );

    expect(result).toBe("Not found: prompt-123");
  });

  test("should handle multiple error types", async () => {
    // Test validation error handling with catchTag
    const program = Effect.fail(new ValidationError({ message: "Invalid input" }));

    const result = await Effect.runPromise(
      program.pipe(
        Effect.catchTag("ValidationError", (error) =>
          Effect.succeed(`Invalid: ${error.message}`)
        )
      )
    );

    expect(result).toBe("Invalid: Invalid input");
  });
});
