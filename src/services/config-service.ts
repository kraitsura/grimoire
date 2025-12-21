/**
 * Config Service - Manage grimoire configuration
 *
 * Handles persistent configuration stored in ~/.grimoire/config.json
 * including default provider/model settings.
 */

import { Context, Effect, Layer, Data } from "effect";
import { join } from "path";
import { homedir } from "os";

// Error types
export class ConfigReadError extends Data.TaggedError("ConfigReadError")<{
  message: string;
}> {}

export class ConfigWriteError extends Data.TaggedError("ConfigWriteError")<{
  message: string;
}> {}

// Config schema
export interface GrimoireConfig {
  defaultProvider?: string;
  defaultModel?: string;
  providers: string[];
}

const DEFAULT_CONFIG: GrimoireConfig = {
  providers: [],
};

// Service interface
interface ConfigServiceImpl {
  readonly get: () => Effect.Effect<GrimoireConfig, ConfigReadError>;
  readonly set: (config: Partial<GrimoireConfig>) => Effect.Effect<void, ConfigWriteError>;
  readonly getDefaultModel: () => Effect.Effect<{ provider: string; model: string } | null, ConfigReadError>;
  readonly setDefaultModel: (provider: string, model: string) => Effect.Effect<void, ConfigWriteError>;
  readonly addProvider: (provider: string) => Effect.Effect<void, ConfigWriteError | ConfigReadError>;
  readonly removeProvider: (provider: string) => Effect.Effect<void, ConfigWriteError | ConfigReadError>;
  readonly isConfigured: () => Effect.Effect<boolean, ConfigReadError>;
}

// Service tag
export class ConfigService extends Context.Tag("ConfigService")<ConfigService, ConfigServiceImpl>() {}

/**
 * Get the config file path
 */
const getConfigPath = (): string => {
  return join(homedir(), ".grimoire", "config.json");
};

/**
 * Read config from file
 */
const readConfig = (): Effect.Effect<GrimoireConfig, ConfigReadError> =>
  Effect.gen(function* () {
    const configPath = getConfigPath();
    const file = Bun.file(configPath);

    const exists = yield* Effect.promise(() => file.exists());
    if (!exists) {
      return { ...DEFAULT_CONFIG };
    }

    try {
      const content = yield* Effect.promise(() => file.text());
      const parsed = JSON.parse(content) as GrimoireConfig;
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
      };
    } catch (error) {
      return yield* Effect.fail(
        new ConfigReadError({
          message: `Failed to parse config: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
  });

/**
 * Write config to file
 */
const writeConfig = (config: GrimoireConfig): Effect.Effect<void, ConfigWriteError> =>
  Effect.gen(function* () {
    const configPath = getConfigPath();
    const configDir = join(homedir(), ".grimoire");

    try {
      // Ensure directory exists
      yield* Effect.promise(() =>
        import("fs/promises").then((fs) => fs.mkdir(configDir, { recursive: true }))
      );

      // Write config file
      const content = JSON.stringify(config, null, 2) + "\n";
      yield* Effect.promise(() => Bun.write(configPath, content));
    } catch (error) {
      return yield* Effect.fail(
        new ConfigWriteError({
          message: `Failed to write config: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
  });

// Service implementation
const makeConfigService = (): ConfigServiceImpl => ({
  get: () => readConfig(),

  set: (partialConfig: Partial<GrimoireConfig>) =>
    Effect.gen(function* () {
      const current = yield* readConfig().pipe(
        Effect.catchTag("ConfigReadError", () => Effect.succeed({ ...DEFAULT_CONFIG }))
      );

      const updated: GrimoireConfig = {
        ...current,
        ...partialConfig,
      };

      yield* writeConfig(updated);
    }),

  getDefaultModel: () =>
    Effect.gen(function* () {
      const config = yield* readConfig();

      if (config.defaultProvider && config.defaultModel) {
        return {
          provider: config.defaultProvider,
          model: config.defaultModel,
        };
      }

      return null;
    }),

  setDefaultModel: (provider: string, model: string) =>
    Effect.gen(function* () {
      const current = yield* readConfig().pipe(
        Effect.catchTag("ConfigReadError", () => Effect.succeed({ ...DEFAULT_CONFIG }))
      );

      const updated: GrimoireConfig = {
        ...current,
        defaultProvider: provider,
        defaultModel: model,
      };

      // Add provider to list if not already present
      if (!updated.providers.includes(provider)) {
        updated.providers = [...updated.providers, provider];
      }

      yield* writeConfig(updated);
    }),

  addProvider: (provider: string) =>
    Effect.gen(function* () {
      const current = yield* readConfig().pipe(
        Effect.catchTag("ConfigReadError", () => Effect.succeed({ ...DEFAULT_CONFIG }))
      );

      // Skip if already present
      if (current.providers.includes(provider)) {
        return;
      }

      const isFirstProvider = current.providers.length === 0;

      const updated: GrimoireConfig = {
        ...current,
        providers: [...current.providers, provider],
        // Set as default provider if it's the first one
        ...(isFirstProvider ? { defaultProvider: provider } : {}),
      };

      yield* writeConfig(updated);
    }),

  removeProvider: (provider: string) =>
    Effect.gen(function* () {
      const current = yield* readConfig().pipe(
        Effect.catchTag("ConfigReadError", () => Effect.succeed({ ...DEFAULT_CONFIG }))
      );

      const updated: GrimoireConfig = {
        ...current,
        providers: current.providers.filter((p) => p !== provider),
      };

      // Clear default if removing the default provider
      if (current.defaultProvider === provider) {
        updated.defaultProvider = updated.providers[0];
        updated.defaultModel = undefined;
      }

      yield* writeConfig(updated);
    }),

  isConfigured: () =>
    Effect.gen(function* () {
      const config = yield* readConfig();
      return config.providers.length > 0 && !!config.defaultModel;
    }),
});

// Live layer
export const ConfigServiceLive = Layer.succeed(ConfigService, makeConfigService());
