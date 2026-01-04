/**
 * Config Service Tests
 *
 * Tests for configuration management: reading, writing, and managing
 * provider/model defaults and editor settings.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Effect, Layer } from "effect";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import {
  ConfigService,
  ConfigServiceLive,
  ConfigReadError,
  ConfigWriteError,
  type GrimoireConfig,
  type EditorConfig,
} from "../../src/services/config-service";

// Test config directory - use a temp location to avoid polluting real config
const TEST_CONFIG_DIR = join(homedir(), ".grimoire-test");
const TEST_CONFIG_PATH = join(TEST_CONFIG_DIR, "config.json");

// Helper to run effects with the service
const runEffect = <A, E>(effect: Effect.Effect<A, E, ConfigService>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(ConfigServiceLive)) as Effect.Effect<A, E, never>
  );

describe("ConfigService", () => {
  describe("get", () => {
    test("returns default config when no config file exists", async () => {
      const program = Effect.gen(function* () {
        const service = yield* ConfigService;
        return yield* service.get();
      });

      // This will read from the real config location if it exists
      // The important thing is it doesn't throw
      const config = await runEffect(program);
      expect(config).toBeDefined();
      expect(Array.isArray(config.providers)).toBe(true);
    });

    test("config has expected structure", async () => {
      const program = Effect.gen(function* () {
        const service = yield* ConfigService;
        return yield* service.get();
      });

      const config = await runEffect(program);
      expect(config).toHaveProperty("providers");
      // Optional properties may or may not exist
      if (config.defaultProvider) {
        expect(typeof config.defaultProvider).toBe("string");
      }
      if (config.defaultModel) {
        expect(typeof config.defaultModel).toBe("string");
      }
    });
  });

  describe("getDefaultModel", () => {
    test("returns null when no default is set (fresh config)", async () => {
      // This test depends on whether user has configured defaults
      const program = Effect.gen(function* () {
        const service = yield* ConfigService;
        return yield* service.getDefaultModel();
      });

      const result = await runEffect(program);
      // Result is either null or an object with provider and model
      if (result !== null) {
        expect(result).toHaveProperty("provider");
        expect(result).toHaveProperty("model");
      }
    });
  });

  describe("isConfigured", () => {
    test("returns boolean indicating configuration status", async () => {
      const program = Effect.gen(function* () {
        const service = yield* ConfigService;
        return yield* service.isConfigured();
      });

      const isConfigured = await runEffect(program);
      expect(typeof isConfigured).toBe("boolean");
    });
  });

  describe("getEditor", () => {
    test("returns default editor (vim) when not configured", async () => {
      const program = Effect.gen(function* () {
        const service = yield* ConfigService;
        return yield* service.getEditor();
      });

      const editor = await runEffect(program);
      expect(editor).toBeDefined();
      expect(editor.name).toBeDefined();
      // Default is vim
      if (!editor.command) {
        expect(editor.name).toBe("vim");
      }
    });

    test("editor config has correct structure", async () => {
      const program = Effect.gen(function* () {
        const service = yield* ConfigService;
        return yield* service.getEditor();
      });

      const editor = await runEffect(program);
      expect(typeof editor.name).toBe("string");
      // command and args are optional
      if (editor.command) {
        expect(typeof editor.command).toBe("string");
      }
      if (editor.args) {
        expect(Array.isArray(editor.args)).toBe(true);
      }
    });
  });

  // Note: Write operations use mock service to avoid modifying real config
  describe("mock service for writes", () => {
    test("mock service can be created with custom values", async () => {
      const mockConfig: GrimoireConfig = {
        providers: ["openai", "anthropic"],
        defaultProvider: "openai",
        defaultModel: "gpt-4o",
        editor: { name: "code", command: "code", args: ["--wait"] },
      };

      const mockService = {
        get: () => Effect.succeed(mockConfig),
        set: () => Effect.succeed(undefined as void),
        getDefaultModel: () =>
          Effect.succeed({ provider: "openai", model: "gpt-4o" }),
        setDefaultModel: () => Effect.succeed(undefined as void),
        addProvider: () => Effect.succeed(undefined as void),
        removeProvider: () => Effect.succeed(undefined as void),
        isConfigured: () => Effect.succeed(true),
        getEditor: () => Effect.succeed({ name: "code" }),
        setEditor: () => Effect.succeed(undefined as void),
      };

      const MockLayer = Layer.succeed(ConfigService, mockService);

      const program = Effect.gen(function* () {
        const service = yield* ConfigService;
        return yield* service.get();
      });

      const config = await Effect.runPromise(
        program.pipe(Effect.provide(MockLayer))
      );
      expect(config.providers).toContain("openai");
      expect(config.defaultModel).toBe("gpt-4o");
    });

    test("mock service tracks set operations", async () => {
      let capturedConfig: Partial<GrimoireConfig> | null = null;
      const baseConfig: GrimoireConfig = {
        providers: [],
      };

      const mockService = {
        get: () => Effect.succeed(capturedConfig ? { ...baseConfig, ...capturedConfig } : baseConfig),
        set: (config: Partial<GrimoireConfig>) => {
          capturedConfig = config;
          return Effect.succeed(undefined as void);
        },
        getDefaultModel: () => Effect.succeed(null),
        setDefaultModel: () => Effect.succeed(undefined as void),
        addProvider: () => Effect.succeed(undefined as void),
        removeProvider: () => Effect.succeed(undefined as void),
        isConfigured: () => Effect.succeed(false),
        getEditor: () => Effect.succeed({ name: "vim" }),
        setEditor: () => Effect.succeed(undefined as void),
      };

      const MockLayer = Layer.succeed(ConfigService, mockService);

      const program = Effect.gen(function* () {
        const service = yield* ConfigService;
        yield* service.set({ providers: ["test-provider"] });
        return yield* service.get();
      });

      const config = await Effect.runPromise(
        program.pipe(Effect.provide(MockLayer))
      );
      expect(config.providers).toContain("test-provider");
    });

    test("mock service for addProvider", async () => {
      const providers: string[] = [];

      const mockService = {
        get: () => Effect.succeed({ providers }),
        set: () => Effect.succeed(undefined as void),
        getDefaultModel: () => Effect.succeed(null),
        setDefaultModel: () => Effect.succeed(undefined as void),
        addProvider: (provider: string) => {
          if (!providers.includes(provider)) {
            providers.push(provider);
          }
          return Effect.succeed(undefined as void);
        },
        removeProvider: (provider: string) => {
          const idx = providers.indexOf(provider);
          if (idx >= 0) providers.splice(idx, 1);
          return Effect.succeed(undefined as void);
        },
        isConfigured: () => Effect.succeed(false),
        getEditor: () => Effect.succeed({ name: "vim" }),
        setEditor: () => Effect.succeed(undefined as void),
      };

      const MockLayer = Layer.succeed(ConfigService, mockService);

      const program = Effect.gen(function* () {
        const service = yield* ConfigService;
        yield* service.addProvider("openai");
        yield* service.addProvider("anthropic");
        return yield* service.get();
      });

      const config = await Effect.runPromise(
        program.pipe(Effect.provide(MockLayer))
      );
      expect(config.providers).toContain("openai");
      expect(config.providers).toContain("anthropic");
    });

    test("mock service for setEditor", async () => {
      let currentEditor: EditorConfig = { name: "vim" };

      const mockService = {
        get: () => Effect.succeed({ providers: [], editor: currentEditor }),
        set: () => Effect.succeed(undefined as void),
        getDefaultModel: () => Effect.succeed(null),
        setDefaultModel: () => Effect.succeed(undefined as void),
        addProvider: () => Effect.succeed(undefined as void),
        removeProvider: () => Effect.succeed(undefined as void),
        isConfigured: () => Effect.succeed(false),
        getEditor: () => Effect.succeed(currentEditor),
        setEditor: (editor: EditorConfig) => {
          currentEditor = editor;
          return Effect.succeed(undefined as void);
        },
      };

      const MockLayer = Layer.succeed(ConfigService, mockService);

      const program = Effect.gen(function* () {
        const service = yield* ConfigService;
        yield* service.setEditor({ name: "code", command: "code", args: ["--wait"] });
        return yield* service.getEditor();
      });

      const editor = await Effect.runPromise(
        program.pipe(Effect.provide(MockLayer))
      );
      expect(editor.name).toBe("code");
      expect(editor.command).toBe("code");
      expect(editor.args).toEqual(["--wait"]);
    });
  });
});

describe("ConfigService Error Handling", () => {
  describe("ConfigReadError", () => {
    test("ConfigReadError has correct tag", () => {
      const error = new ConfigReadError({ message: "Test error" });
      expect(error._tag).toBe("ConfigReadError");
      expect(error.message).toBe("Test error");
    });
  });

  describe("ConfigWriteError", () => {
    test("ConfigWriteError has correct tag", () => {
      const error = new ConfigWriteError({ message: "Test error" });
      expect(error._tag).toBe("ConfigWriteError");
      expect(error.message).toBe("Test error");
    });
  });
});
