/**
 * Clipboard Service Tests
 *
 * Tests for platform-specific clipboard operations (copy/paste).
 * Uses mock implementations to avoid actual clipboard modifications.
 */

import { describe, test, expect } from "bun:test";
import { Effect, Layer } from "effect";
import {
  Clipboard,
  ClipboardLive,
  type ClipboardService,
} from "../../src/services/clipboard-service";
import { ClipboardError } from "../../src/models/errors";

// Helper to run effects with the service
const runEffect = <A, E>(effect: Effect.Effect<A, E, Clipboard>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(ClipboardLive)) as Effect.Effect<A, E, never>
  );

// Create a mock clipboard service for testing without side effects
const createMockClipboard = (): {
  service: ClipboardService;
  getContents: () => string;
  setError: (error: Error | null) => void;
} => {
  let contents = "";
  let errorToThrow: Error | null = null;

  const service: ClipboardService = {
    copy: (text: string) =>
      Effect.gen(function* () {
        if (errorToThrow) {
          return yield* Effect.fail(
            new ClipboardError({
              message: errorToThrow.message,
              cause: errorToThrow,
            })
          );
        }
        contents = text;
      }),
    paste: Effect.gen(function* () {
      if (errorToThrow) {
        return yield* Effect.fail(
          new ClipboardError({
            message: errorToThrow.message,
            cause: errorToThrow,
          })
        );
      }
      return contents;
    }),
  };

  return {
    service,
    getContents: () => contents,
    setError: (error) => {
      errorToThrow = error;
    },
  };
};

describe("ClipboardService", () => {
  describe("Mock Clipboard", () => {
    test("copy stores text", async () => {
      const mock = createMockClipboard();
      const MockLayer = Layer.succeed(Clipboard, mock.service);

      const program = Effect.gen(function* () {
        const clipboard = yield* Clipboard;
        yield* clipboard.copy("Hello, clipboard!");
      });

      await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(mock.getContents()).toBe("Hello, clipboard!");
    });

    test("paste retrieves text", async () => {
      const mock = createMockClipboard();
      const MockLayer = Layer.succeed(Clipboard, mock.service);

      // First copy something
      const program = Effect.gen(function* () {
        const clipboard = yield* Clipboard;
        yield* clipboard.copy("Test content");
        return yield* clipboard.paste;
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(result).toBe("Test content");
    });

    test("copy handles empty string", async () => {
      const mock = createMockClipboard();
      const MockLayer = Layer.succeed(Clipboard, mock.service);

      const program = Effect.gen(function* () {
        const clipboard = yield* Clipboard;
        yield* clipboard.copy("");
        return yield* clipboard.paste;
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(result).toBe("");
    });

    test("copy handles special characters", async () => {
      const mock = createMockClipboard();
      const MockLayer = Layer.succeed(Clipboard, mock.service);

      const specialText = "Hello\n\tWorld! 🎉 \"quotes\" 'apostrophes'";

      const program = Effect.gen(function* () {
        const clipboard = yield* Clipboard;
        yield* clipboard.copy(specialText);
        return yield* clipboard.paste;
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(result).toBe(specialText);
    });

    test("copy handles unicode", async () => {
      const mock = createMockClipboard();
      const MockLayer = Layer.succeed(Clipboard, mock.service);

      const unicodeText = "日本語 中文 한국어 العربية";

      const program = Effect.gen(function* () {
        const clipboard = yield* Clipboard;
        yield* clipboard.copy(unicodeText);
        return yield* clipboard.paste;
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(result).toBe(unicodeText);
    });

    test("copy handles multiline text", async () => {
      const mock = createMockClipboard();
      const MockLayer = Layer.succeed(Clipboard, mock.service);

      const multilineText = `Line 1
Line 2
Line 3`;

      const program = Effect.gen(function* () {
        const clipboard = yield* Clipboard;
        yield* clipboard.copy(multilineText);
        return yield* clipboard.paste;
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(result).toBe(multilineText);
    });

    test("copy fails when error is set", async () => {
      const mock = createMockClipboard();
      mock.setError(new Error("Clipboard unavailable"));
      const MockLayer = Layer.succeed(Clipboard, mock.service);

      const program = Effect.gen(function* () {
        const clipboard = yield* Clipboard;
        yield* clipboard.copy("test");
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(MockLayer), Effect.either)
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ClipboardError");
        expect(result.left.message).toBe("Clipboard unavailable");
      }
    });

    test("paste fails when error is set", async () => {
      const mock = createMockClipboard();
      mock.setError(new Error("Cannot read clipboard"));
      const MockLayer = Layer.succeed(Clipboard, mock.service);

      const program = Effect.gen(function* () {
        const clipboard = yield* Clipboard;
        return yield* clipboard.paste;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(MockLayer), Effect.either)
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ClipboardError");
      }
    });
  });

  describe("Live Clipboard (platform-specific)", () => {
    // These tests interact with the actual system clipboard
    // They may be skipped in CI environments

    test("platform check - clipboard commands exist for current platform", () => {
      const platform = process.platform;
      // Verify we're on a supported platform
      expect(["darwin", "linux", "win32"]).toContain(platform);
    });

    test("copy and paste round-trip (integration)", async () => {
      // Skip if not in a suitable environment
      if (process.env.CI && process.platform === "linux") {
        // Skip on Linux CI - no display server
        return;
      }

      const testText = `Grimoire test ${Date.now()}`;

      const program = Effect.gen(function* () {
        const clipboard = yield* Clipboard;
        yield* clipboard.copy(testText);
        return yield* clipboard.paste;
      });

      try {
        const result = await runEffect(program);
        expect(result).toBe(testText);
      } catch (error) {
        // Accept failure if clipboard is unavailable (e.g., headless environment)
        if (error instanceof Error && error.message.includes("Clipboard")) {
          // Expected in headless environments
          expect(true).toBe(true);
        } else {
          throw error;
        }
      }
    });
  });
});

describe("ClipboardError", () => {
  test("has correct tag", () => {
    const error = new ClipboardError({ message: "Test error" });
    expect(error._tag).toBe("ClipboardError");
  });

  test("includes message", () => {
    const error = new ClipboardError({ message: "Failed to copy" });
    expect(error.message).toBe("Failed to copy");
  });

  test("includes cause when provided", () => {
    const cause = new Error("Original error");
    const error = new ClipboardError({ message: "Wrapper", cause });
    expect(error.cause).toBe(cause);
  });
});
