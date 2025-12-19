/**
 * Project Config Service
 *
 * Manages project-level configuration in .grimoire/config.json
 * This is separate from the global skill config (~/.skills/config.yaml)
 */

import { Context, Effect, Layer, Data } from "effect";
import { Schema } from "@effect/schema";
import { join } from "path";

/**
 * Schema for project-level configuration
 */
export const ProjectConfigSchema = Schema.Struct({
  /**
   * Whether to enforce agentskills.io standard validation
   * When true, skills must pass validation to be enabled
   * Default: true
   */
  enforceStandard: Schema.optional(Schema.Boolean),

  /**
   * Treat validation warnings as errors
   * Default: false
   */
  strictValidation: Schema.optional(Schema.Boolean),

  /**
   * Project-specific skill sources
   */
  sources: Schema.optional(Schema.Array(Schema.String)),

  /**
   * Auto-detected agent type override
   */
  agent: Schema.optional(Schema.String),
});

export type ProjectConfig = Schema.Schema.Type<typeof ProjectConfigSchema>;

/**
 * Error when project config cannot be read
 */
export class ProjectConfigReadError extends Data.TaggedError("ProjectConfigReadError")<{
  path: string;
  message: string;
}> {}

/**
 * Error when project config cannot be written
 */
export class ProjectConfigWriteError extends Data.TaggedError("ProjectConfigWriteError")<{
  path: string;
  message: string;
}> {}

/**
 * Get the project config directory path
 */
const getConfigDir = (projectPath: string): string => {
  return join(projectPath, ".grimoire");
};

/**
 * Get the project config file path
 */
const getConfigPath = (projectPath: string): string => {
  return join(getConfigDir(projectPath), "config.json");
};

/**
 * Get default project configuration
 */
const getDefaultConfig = (): ProjectConfig => ({
  enforceStandard: true,
  strictValidation: false,
});

/**
 * Read project configuration
 */
const readProjectConfig = (
  projectPath: string
): Effect.Effect<ProjectConfig, ProjectConfigReadError> =>
  Effect.gen(function* () {
    const configPath = getConfigPath(projectPath);
    const file = Bun.file(configPath);

    const exists = yield* Effect.promise(() => file.exists());
    if (!exists) {
      // Return default config if file doesn't exist
      return getDefaultConfig();
    }

    try {
      const content = yield* Effect.promise(() => file.text());
      const parsed = JSON.parse(content);

      // Validate against schema
      const decoded = Schema.decodeUnknownSync(ProjectConfigSchema);
      const config = decoded(parsed);

      // Merge with defaults
      return {
        ...getDefaultConfig(),
        ...config,
      };
    } catch (error) {
      return yield* Effect.fail(
        new ProjectConfigReadError({
          path: configPath,
          message: `Failed to read config: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
  }).pipe(
    Effect.catchAll(() => Effect.succeed(getDefaultConfig()))
  );

/**
 * Write project configuration
 */
const writeProjectConfig = (
  projectPath: string,
  config: ProjectConfig
): Effect.Effect<void, ProjectConfigWriteError> =>
  Effect.gen(function* () {
    const configDir = getConfigDir(projectPath);
    const configPath = getConfigPath(projectPath);
    const fs = yield* Effect.promise(() => import("fs/promises"));

    try {
      // Ensure directory exists
      yield* Effect.promise(() => fs.mkdir(configDir, { recursive: true }));

      // Write config file
      const content = JSON.stringify(config, null, 2);
      yield* Effect.promise(() => Bun.write(configPath, content));
    } catch (error) {
      return yield* Effect.fail(
        new ProjectConfigWriteError({
          path: configPath,
          message: `Failed to write config: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
  });

/**
 * Check if project has configuration
 */
const hasProjectConfig = (projectPath: string): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const configPath = getConfigPath(projectPath);
    const file = Bun.file(configPath);
    return yield* Effect.promise(() => file.exists());
  });

/**
 * Initialize project configuration with defaults
 */
const initProjectConfig = (
  projectPath: string,
  overrides?: Partial<ProjectConfig>
): Effect.Effect<ProjectConfig, ProjectConfigWriteError> =>
  Effect.gen(function* () {
    const config = {
      ...getDefaultConfig(),
      ...overrides,
    };

    yield* writeProjectConfig(projectPath, config);
    return config;
  });

// Service interface
interface ProjectConfigServiceImpl {
  readonly get: (projectPath: string) => Effect.Effect<ProjectConfig, ProjectConfigReadError>;
  readonly set: (
    projectPath: string,
    config: Partial<ProjectConfig>
  ) => Effect.Effect<void, ProjectConfigReadError | ProjectConfigWriteError>;
  readonly has: (projectPath: string) => Effect.Effect<boolean, never>;
  readonly init: (
    projectPath: string,
    overrides?: Partial<ProjectConfig>
  ) => Effect.Effect<ProjectConfig, ProjectConfigWriteError>;
  readonly isEnforceStandardEnabled: (projectPath: string) => Effect.Effect<boolean, never>;
  readonly isStrictValidationEnabled: (projectPath: string) => Effect.Effect<boolean, never>;
}

// Service tag
export class ProjectConfigService extends Context.Tag("ProjectConfigService")<
  ProjectConfigService,
  ProjectConfigServiceImpl
>() {}

// Service implementation
const makeProjectConfigService = (): ProjectConfigServiceImpl => ({
  get: (projectPath: string) => readProjectConfig(projectPath),

  set: (projectPath: string, config: Partial<ProjectConfig>) =>
    Effect.gen(function* () {
      const currentConfig = yield* readProjectConfig(projectPath);
      const updatedConfig = { ...currentConfig, ...config };
      yield* writeProjectConfig(projectPath, updatedConfig);
    }),

  has: (projectPath: string) => hasProjectConfig(projectPath),

  init: (projectPath: string, overrides?: Partial<ProjectConfig>) =>
    initProjectConfig(projectPath, overrides),

  isEnforceStandardEnabled: (projectPath: string) =>
    Effect.gen(function* () {
      const config = yield* readProjectConfig(projectPath).pipe(
        Effect.catchAll(() => Effect.succeed(getDefaultConfig()))
      );
      return config.enforceStandard ?? true;
    }),

  isStrictValidationEnabled: (projectPath: string) =>
    Effect.gen(function* () {
      const config = yield* readProjectConfig(projectPath).pipe(
        Effect.catchAll(() => Effect.succeed(getDefaultConfig()))
      );
      return config.strictValidation ?? false;
    }),
});

// Live layer
export const ProjectConfigServiceLive = Layer.succeed(
  ProjectConfigService,
  makeProjectConfigService()
);
