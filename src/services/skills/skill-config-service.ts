import { Context, Effect, Layer, Data } from "effect";
import { join } from "path";
import { homedir } from "os";
import * as yaml from "js-yaml";

// SkillsConfig type definition
export interface SkillsConfig {
  defaults: {
    agent: string;
  };
  recommended: string[];
  sources: string[];
  detect: Record<string, string>;
  features: {
    auto_detect: boolean;
    inject_agent_md: boolean;
    color_output: boolean;
  };
}

// Error types
export class ConfigFileReadError extends Data.TaggedError("ConfigFileReadError")<{
  message: string;
}> {}

export class ConfigFileWriteError extends Data.TaggedError("ConfigFileWriteError")<{
  message: string;
}> {}

export class InvalidConfigKeyError extends Data.TaggedError("InvalidConfigKeyError")<{
  key: string;
}> {}

/**
 * Get the skills config file path
 */
const getConfigFilePath = (): string => {
  return join(homedir(), ".skills", "config.yaml");
};

/**
 * Get the default configuration
 */
const getDefaultConfig = (): SkillsConfig => ({
  defaults: {
    agent: "auto",
  },
  recommended: ["core/coding-standards", "core/git-conventions"],
  sources: [],
  detect: {
    "supabase/config.toml": "supabase",
    ".cursorrules": "cursor-compat",
  },
  features: {
    auto_detect: true,
    inject_agent_md: true,
    color_output: true,
  },
});

/**
 * Parse YAML config file content
 */
const parseConfigFile = (
  content: string
): Effect.Effect<SkillsConfig, ConfigFileReadError> =>
  Effect.try({
    try: () => {
      const parsed = yaml.load(content) as SkillsConfig;
      // Merge with defaults to handle partial configs
      const defaultConfig = getDefaultConfig();
      return {
        defaults: { ...defaultConfig.defaults, ...parsed.defaults },
        recommended: parsed.recommended || defaultConfig.recommended,
        sources: parsed.sources || defaultConfig.sources,
        detect: { ...defaultConfig.detect, ...parsed.detect },
        features: { ...defaultConfig.features, ...parsed.features },
      };
    },
    catch: (error) =>
      new ConfigFileReadError({
        message: `Failed to parse config file: ${error instanceof Error ? error.message : String(error)}`,
      }),
  });

/**
 * Serialize config to YAML format
 */
const serializeConfig = (config: SkillsConfig): string => {
  return yaml.dump(config, {
    indent: 2,
    lineWidth: 80,
    noRefs: true,
  });
};

/**
 * Read the config file
 */
const readConfigFile = (): Effect.Effect<SkillsConfig, ConfigFileReadError> =>
  Effect.gen(function* () {
    const configPath = getConfigFilePath();
    const file = Bun.file(configPath);

    const exists = yield* Effect.promise(() => file.exists());
    if (!exists) {
      // Return default config if file doesn't exist
      return getDefaultConfig();
    }

    const content = yield* Effect.promise(() => file.text());
    return yield* parseConfigFile(content);
  }).pipe(
    Effect.catchAll(() => {
      // On any error, return default config
      return Effect.succeed(getDefaultConfig());
    })
  );

/**
 * Write the config file
 */
const writeConfigFile = (
  config: SkillsConfig
): Effect.Effect<void, ConfigFileWriteError> =>
  Effect.gen(function* () {
    const configPath = getConfigFilePath();
    const configDir = join(homedir(), ".skills");

    try {
      // Ensure directory exists
      yield* Effect.promise(() =>
        import("fs/promises").then((fs) => fs.mkdir(configDir, { recursive: true }))
      );

      // Serialize and write config file
      const content = serializeConfig(config);
      yield* Effect.promise(() => Bun.write(configPath, content));
    } catch (error) {
      return yield* Effect.fail(
        new ConfigFileWriteError({
          message: `Failed to write config file: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
  });

// Service interface
interface SkillConfigServiceImpl {
  readonly get: () => Effect.Effect<SkillsConfig, ConfigFileReadError>;
  readonly set: (
    config: Partial<SkillsConfig>
  ) => Effect.Effect<void, ConfigFileReadError | ConfigFileWriteError>;
  readonly getDefault: (
    key: keyof SkillsConfig["defaults"]
  ) => Effect.Effect<string, ConfigFileReadError | InvalidConfigKeyError>;
  readonly setDefault: (
    key: string,
    value: string
  ) => Effect.Effect<void, ConfigFileReadError | ConfigFileWriteError>;
  readonly addSource: (
    source: string
  ) => Effect.Effect<void, ConfigFileReadError | ConfigFileWriteError>;
  readonly removeSource: (
    source: string
  ) => Effect.Effect<void, ConfigFileReadError | ConfigFileWriteError>;
  readonly getSources: () => Effect.Effect<string[], ConfigFileReadError>;
}

// Service tag
export class SkillConfigService extends Context.Tag("SkillConfigService")<
  SkillConfigService,
  SkillConfigServiceImpl
>() {}

// Service implementation
const makeSkillConfigService = (): SkillConfigServiceImpl => ({
  get: () => readConfigFile(),

  set: (config: Partial<SkillsConfig>) =>
    Effect.gen(function* () {
      // Read current config
      const currentConfig = yield* readConfigFile();

      // Merge with provided partial config
      const updatedConfig: SkillsConfig = {
        defaults: { ...currentConfig.defaults, ...(config.defaults || {}) },
        recommended:
          config.recommended !== undefined
            ? config.recommended
            : currentConfig.recommended,
        sources:
          config.sources !== undefined ? config.sources : currentConfig.sources,
        detect: { ...currentConfig.detect, ...(config.detect || {}) },
        features: { ...currentConfig.features, ...(config.features || {}) },
      };

      // Write updated config
      yield* writeConfigFile(updatedConfig);
    }),

  getDefault: (key: keyof SkillsConfig["defaults"]) =>
    Effect.gen(function* () {
      const config = yield* readConfigFile();

      if (!(key in config.defaults)) {
        return yield* Effect.fail(new InvalidConfigKeyError({ key: String(key) }));
      }

      return config.defaults[key];
    }),

  setDefault: (key: string, value: string) =>
    Effect.gen(function* () {
      const config = yield* readConfigFile();

      // Update the default value
      config.defaults = {
        ...config.defaults,
        [key]: value,
      };

      yield* writeConfigFile(config);
    }),

  addSource: (source: string) =>
    Effect.gen(function* () {
      const config = yield* readConfigFile();

      // Add source if not already present
      if (!config.sources.includes(source)) {
        config.sources = [...config.sources, source];
        yield* writeConfigFile(config);
      }
    }),

  removeSource: (source: string) =>
    Effect.gen(function* () {
      const config = yield* readConfigFile();

      // Remove source if present
      const newSources = config.sources.filter((s) => s !== source);
      if (newSources.length !== config.sources.length) {
        config.sources = newSources;
        yield* writeConfigFile(config);
      }
    }),

  getSources: () =>
    Effect.gen(function* () {
      const config = yield* readConfigFile();
      return config.sources;
    }),
});

// Live layer
export const SkillConfigServiceLive = Layer.succeed(
  SkillConfigService,
  makeSkillConfigService()
);
