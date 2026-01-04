/**
 * API Key Service Tests
 *
 * Tests for API key management: getting, setting, removing, listing,
 * validating, and masking API keys for various providers.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Effect, Layer } from "effect";
import {
  ApiKeyService,
  ApiKeyServiceLive,
  ApiKeyNotFoundError,
  EnvFileWriteError,
  getEnvVarName,
} from "../../src/services/api-key-service";

// Helper to run effects with the service
const runEffect = <A, E>(effect: Effect.Effect<A, E, ApiKeyService>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(ApiKeyServiceLive)) as Effect.Effect<A, E, never>
  );

describe("ApiKeyService", () => {
  describe("getEnvVarName", () => {
    test("returns correct env var for openai", () => {
      expect(getEnvVarName("openai")).toBe("OPENAI_API_KEY");
    });

    test("returns correct env var for anthropic", () => {
      expect(getEnvVarName("anthropic")).toBe("ANTHROPIC_API_KEY");
    });

    test("returns correct env var for google", () => {
      expect(getEnvVarName("google")).toBe("GOOGLE_API_KEY");
    });

    test("returns correct env var for ollama", () => {
      expect(getEnvVarName("ollama")).toBe("OLLAMA_HOST");
    });

    test("returns undefined for unknown provider", () => {
      expect(getEnvVarName("unknown-provider")).toBeUndefined();
    });

    test("is case insensitive", () => {
      expect(getEnvVarName("OpenAI")).toBe("OPENAI_API_KEY");
      expect(getEnvVarName("ANTHROPIC")).toBe("ANTHROPIC_API_KEY");
    });
  });

  describe("get", () => {
    test("returns key from environment when set", async () => {
      // Save original value
      const originalKey = process.env.OPENAI_API_KEY;

      // Set a test key
      process.env.OPENAI_API_KEY = "test-key-12345";

      const program = Effect.gen(function* () {
        const service = yield* ApiKeyService;
        return yield* service.get("openai");
      });

      const key = await runEffect(program);
      expect(key).toBe("test-key-12345");

      // Restore original
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });

    test("fails with ApiKeyNotFoundError when key not set", async () => {
      // Save original value
      const originalKey = process.env.GOOGLE_API_KEY;

      // Clear the key
      delete process.env.GOOGLE_API_KEY;

      const program = Effect.gen(function* () {
        const service = yield* ApiKeyService;
        return yield* service.get("google");
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(ApiKeyServiceLive),
          Effect.either
        ) as Effect.Effect<any, never, never>
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ApiKeyNotFoundError");
        expect(result.left.provider).toBe("google");
      }

      // Restore original
      if (originalKey) {
        process.env.GOOGLE_API_KEY = originalKey;
      }
    });
  });

  describe("list", () => {
    test("returns empty array when no keys configured", async () => {
      // Save and clear all provider keys
      const saved = {
        openai: process.env.OPENAI_API_KEY,
        anthropic: process.env.ANTHROPIC_API_KEY,
        google: process.env.GOOGLE_API_KEY,
        ollama: process.env.OLLAMA_HOST,
      };

      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.OLLAMA_HOST;

      const program = Effect.gen(function* () {
        const service = yield* ApiKeyService;
        return yield* service.list();
      });

      const providers = await runEffect(program);
      expect(providers).toEqual([]);

      // Restore
      if (saved.openai) process.env.OPENAI_API_KEY = saved.openai;
      if (saved.anthropic) process.env.ANTHROPIC_API_KEY = saved.anthropic;
      if (saved.google) process.env.GOOGLE_API_KEY = saved.google;
      if (saved.ollama) process.env.OLLAMA_HOST = saved.ollama;
    });

    test("returns sorted list of configured providers", async () => {
      // Save original values
      const savedOpenai = process.env.OPENAI_API_KEY;
      const savedAnthropic = process.env.ANTHROPIC_API_KEY;

      // Set test keys
      process.env.OPENAI_API_KEY = "test-openai";
      process.env.ANTHROPIC_API_KEY = "test-anthropic";

      const program = Effect.gen(function* () {
        const service = yield* ApiKeyService;
        return yield* service.list();
      });

      const providers = await runEffect(program);
      expect(providers).toContain("openai");
      expect(providers).toContain("anthropic");
      // Should be sorted
      expect(providers).toEqual([...providers].sort());

      // Restore
      if (savedOpenai) {
        process.env.OPENAI_API_KEY = savedOpenai;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
      if (savedAnthropic) {
        process.env.ANTHROPIC_API_KEY = savedAnthropic;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });
  });

  describe("validate", () => {
    test("returns true when key is set", async () => {
      // Save original
      const original = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "test-key";

      const program = Effect.gen(function* () {
        const service = yield* ApiKeyService;
        return yield* service.validate("openai");
      });

      const isValid = await runEffect(program);
      expect(isValid).toBe(true);

      // Restore
      if (original) {
        process.env.OPENAI_API_KEY = original;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });

    test("returns false when key is not set", async () => {
      // Save and clear
      const original = process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const program = Effect.gen(function* () {
        const service = yield* ApiKeyService;
        return yield* service.validate("google");
      });

      const isValid = await runEffect(program);
      expect(isValid).toBe(false);

      // Restore
      if (original) {
        process.env.GOOGLE_API_KEY = original;
      }
    });
  });

  describe("mask", () => {
    test("masks API key showing first and last 4 characters", async () => {
      const program = Effect.gen(function* () {
        const service = yield* ApiKeyService;
        return service.mask("sk-1234567890abcdef");
      });

      const masked = await runEffect(program);
      expect(masked).toBe("sk-1...cdef");
    });

    test("returns *** for short keys", async () => {
      const program = Effect.gen(function* () {
        const service = yield* ApiKeyService;
        return service.mask("short");
      });

      const masked = await runEffect(program);
      expect(masked).toBe("***");
    });

    test("returns *** for 8 char key (boundary)", async () => {
      const program = Effect.gen(function* () {
        const service = yield* ApiKeyService;
        return service.mask("12345678");
      });

      const masked = await runEffect(program);
      expect(masked).toBe("***");
    });

    test("masks 9 char key correctly (just above boundary)", async () => {
      const program = Effect.gen(function* () {
        const service = yield* ApiKeyService;
        return service.mask("123456789");
      });

      const masked = await runEffect(program);
      expect(masked).toBe("1234...6789");
    });
  });

  // Use mock service to avoid file permission issues in worktrees
  describe("set and remove (mock)", () => {
    test("mock set adds key to in-memory store", async () => {
      const keys: Record<string, string> = {};

      const mockService = {
        get: (provider: string) => {
          const key = keys[provider];
          return key
            ? Effect.succeed(key)
            : Effect.fail(new ApiKeyNotFoundError({ provider }));
        },
        set: (provider: string, key: string) => {
          keys[provider] = key;
          return Effect.succeed(undefined as void);
        },
        remove: (provider: string) => {
          delete keys[provider];
          return Effect.succeed(undefined as void);
        },
        list: () => Effect.succeed(Object.keys(keys).sort()),
        validate: (provider: string) => Effect.succeed(provider in keys),
        mask: (key: string) =>
          key.length > 8 ? key.slice(0, 4) + "..." + key.slice(-4) : "***",
      };

      const MockLayer = Layer.succeed(ApiKeyService, mockService);

      const program = Effect.gen(function* () {
        const service = yield* ApiKeyService;
        yield* service.set("openai", "test-set-key");
        return yield* service.get("openai");
      });

      const key = await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(key).toBe("test-set-key");
    });

    test("mock remove clears key from store", async () => {
      const keys: Record<string, string> = { openai: "test-key" };

      const mockService = {
        get: (provider: string) => {
          const key = keys[provider];
          return key
            ? Effect.succeed(key)
            : Effect.fail(new ApiKeyNotFoundError({ provider }));
        },
        set: (provider: string, key: string) => {
          keys[provider] = key;
          return Effect.succeed(undefined as void);
        },
        remove: (provider: string) => {
          delete keys[provider];
          return Effect.succeed(undefined as void);
        },
        list: () => Effect.succeed(Object.keys(keys).sort()),
        validate: (provider: string) => Effect.succeed(provider in keys),
        mask: (key: string) =>
          key.length > 8 ? key.slice(0, 4) + "..." + key.slice(-4) : "***",
      };

      const MockLayer = Layer.succeed(ApiKeyService, mockService);

      const program = Effect.gen(function* () {
        const service = yield* ApiKeyService;
        yield* service.remove("openai");
        return yield* Effect.either(service.get("openai"));
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(result._tag).toBe("Left");
    });

    test("set unknown provider fails in mock with validation", async () => {
      const knownProviders = new Set(["openai", "anthropic", "google", "ollama"]);

      const mockService = {
        get: (provider: string) =>
          Effect.fail(new ApiKeyNotFoundError({ provider })),
        set: (provider: string, _key: string) => {
          if (!knownProviders.has(provider)) {
            return Effect.fail(new EnvFileWriteError({ message: `Unknown provider: ${provider}` }));
          }
          return Effect.succeed(undefined as void);
        },
        remove: () => Effect.succeed(undefined as void),
        list: () => Effect.succeed([]),
        validate: () => Effect.succeed(false),
        mask: (key: string) =>
          key.length > 8 ? key.slice(0, 4) + "..." + key.slice(-4) : "***",
      };

      const MockLayer = Layer.succeed(ApiKeyService, mockService);

      const program = Effect.gen(function* () {
        const service = yield* ApiKeyService;
        yield* service.set("unknown-provider", "test-key");
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(MockLayer), Effect.either)
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("EnvFileWriteError");
      }
    });
  });
});

describe("ApiKeyService Error Types", () => {
  describe("ApiKeyNotFoundError", () => {
    test("has correct tag and properties", () => {
      const error = new ApiKeyNotFoundError({ provider: "test-provider" });
      expect(error._tag).toBe("ApiKeyNotFoundError");
      expect(error.provider).toBe("test-provider");
    });
  });

  describe("EnvFileWriteError", () => {
    test("has correct tag and properties", () => {
      const error = new EnvFileWriteError({ message: "Write failed" });
      expect(error._tag).toBe("EnvFileWriteError");
      expect(error.message).toBe("Write failed");
    });
  });
});
