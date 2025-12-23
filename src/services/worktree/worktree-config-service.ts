/**
 * Worktree Config Service
 *
 * Manages worktree configuration with layered loading:
 * 1. Project-level: .worktrees/config.json
 * 2. User-level: ~/.config/grimoire/worktrees.json
 * 3. Built-in defaults
 *
 * Project config overrides user config overrides defaults.
 */

import { Context, Effect, Layer } from "effect";
import { join } from "path";
import { homedir } from "os";
import { DEFAULT_WORKTREE_CONFIG } from "../../models/worktree";
import { WorktreeConfigReadError } from "../../models/worktree-errors";

/**
 * Simple worktree config interface (non-readonly for mutation)
 */
export interface WorktreeConfigData {
  basePath: string;
  copyPatterns: string[];
  postCreateHooks: string[];
  copyDependencies: boolean;
  issuePrefix: string;
}

/**
 * Configuration source tracking
 */
export type ConfigSource = "project" | "user" | "default";

/**
 * Config with source information
 */
export interface ResolvedConfig {
  config: WorktreeConfigData;
  source: ConfigSource;
  projectPath?: string;
  userPath?: string;
}

/**
 * Get the user-level config path
 */
const getUserConfigPath = (): string => {
  return join(homedir(), ".config", "grimoire", "worktrees.json");
};

/**
 * Get the project-level config path
 */
const getProjectConfigPath = (repoRoot: string, basePath: string): string => {
  return join(repoRoot, basePath, "config.json");
};

/**
 * Read a config file and parse it
 */
const readConfigFile = (
  path: string
): Effect.Effect<Partial<WorktreeConfigData> | null, never> =>
  Effect.tryPromise({
    try: async () => {
      const file = Bun.file(path);
      const exists = await file.exists();
      if (!exists) {
        return null;
      }
      const content = await file.text();
      return JSON.parse(content) as Partial<WorktreeConfigData>;
    },
    catch: () => null as Partial<WorktreeConfigData> | null,
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));

/**
 * Write a config file
 */
const writeConfigFile = (
  path: string,
  config: Partial<WorktreeConfigData>
): Effect.Effect<void, WorktreeConfigReadError> =>
  Effect.gen(function* () {
    const dir = join(path, "..");

    // Ensure directory exists
    yield* Effect.tryPromise({
      try: () => import("fs/promises").then((fs) => fs.mkdir(dir, { recursive: true })),
      catch: (error) =>
        new WorktreeConfigReadError({
          message: `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`,
          path: dir,
        }),
    });

    // Write config
    const content = JSON.stringify(config, null, 2);
    yield* Effect.tryPromise({
      try: () => Bun.write(path, content),
      catch: (error) =>
        new WorktreeConfigReadError({
          message: `Failed to write config: ${error instanceof Error ? error.message : String(error)}`,
          path,
        }),
    });
  });

/**
 * Merge configs with proper precedence
 */
const mergeConfigs = (
  ...configs: (Partial<WorktreeConfigData> | null)[]
): WorktreeConfigData => {
  const result: WorktreeConfigData = {
    basePath: DEFAULT_WORKTREE_CONFIG.basePath,
    copyPatterns: [...DEFAULT_WORKTREE_CONFIG.copyPatterns],
    postCreateHooks: [...DEFAULT_WORKTREE_CONFIG.postCreateHooks],
    copyDependencies: DEFAULT_WORKTREE_CONFIG.copyDependencies,
    issuePrefix: DEFAULT_WORKTREE_CONFIG.issuePrefix,
  };

  for (const config of configs) {
    if (!config) continue;

    if (config.basePath !== undefined) {
      result.basePath = config.basePath;
    }
    if (config.copyPatterns !== undefined) {
      result.copyPatterns = [...config.copyPatterns];
    }
    if (config.postCreateHooks !== undefined) {
      result.postCreateHooks = [...config.postCreateHooks];
    }
    if (config.copyDependencies !== undefined) {
      result.copyDependencies = config.copyDependencies;
    }
    if (config.issuePrefix !== undefined) {
      result.issuePrefix = config.issuePrefix;
    }
  }

  return result;
};

// Service interface
interface WorktreeConfigServiceImpl {
  /**
   * Get the resolved configuration for a repository
   */
  readonly getConfig: (
    repoRoot: string
  ) => Effect.Effect<ResolvedConfig, never>;

  /**
   * Get just the config values (convenience method)
   */
  readonly getConfigValues: (
    repoRoot: string
  ) => Effect.Effect<WorktreeConfigData, never>;

  /**
   * Get the base path for worktrees
   */
  readonly getBasePath: (
    repoRoot: string
  ) => Effect.Effect<string, never>;

  /**
   * Set a project-level config value
   */
  readonly setProjectConfig: (
    repoRoot: string,
    updates: Partial<WorktreeConfigData>
  ) => Effect.Effect<void, WorktreeConfigReadError>;

  /**
   * Set a user-level config value
   */
  readonly setUserConfig: (
    updates: Partial<WorktreeConfigData>
  ) => Effect.Effect<void, WorktreeConfigReadError>;

  /**
   * Reset project-level config to defaults
   */
  readonly resetProjectConfig: (
    repoRoot: string
  ) => Effect.Effect<void, never>;

  /**
   * Add a pattern to copyPatterns (project level)
   */
  readonly addCopyPattern: (
    repoRoot: string,
    pattern: string
  ) => Effect.Effect<void, WorktreeConfigReadError>;

  /**
   * Remove a pattern from copyPatterns (project level)
   */
  readonly removeCopyPattern: (
    repoRoot: string,
    pattern: string
  ) => Effect.Effect<void, WorktreeConfigReadError>;

  /**
   * Add a post-create hook (project level)
   */
  readonly addPostCreateHook: (
    repoRoot: string,
    hook: string
  ) => Effect.Effect<void, WorktreeConfigReadError>;

  /**
   * Remove a post-create hook (project level)
   */
  readonly removePostCreateHook: (
    repoRoot: string,
    hook: string
  ) => Effect.Effect<void, WorktreeConfigReadError>;
}

// Service tag
export class WorktreeConfigService extends Context.Tag("WorktreeConfigService")<
  WorktreeConfigService,
  WorktreeConfigServiceImpl
>() {}

// Service implementation
const makeWorktreeConfigService = (): WorktreeConfigServiceImpl => {
  const getConfig = (repoRoot: string): Effect.Effect<ResolvedConfig, never> =>
    Effect.gen(function* () {
      const userPath = getUserConfigPath();
      const defaultBasePath = DEFAULT_WORKTREE_CONFIG.basePath;
      const projectPath = getProjectConfigPath(repoRoot, defaultBasePath);

      // Load configs in order: user, then project
      const userConfig = yield* readConfigFile(userPath);
      const projectConfig = yield* readConfigFile(projectPath);

      // Determine source
      let source: ConfigSource = "default";
      if (projectConfig) {
        source = "project";
      } else if (userConfig) {
        source = "user";
      }

      // Merge: defaults < user < project
      const config = mergeConfigs(userConfig, projectConfig);

      return {
        config,
        source,
        projectPath: projectConfig ? projectPath : undefined,
        userPath: userConfig ? userPath : undefined,
      };
    });

  const getConfigValues = (repoRoot: string): Effect.Effect<WorktreeConfigData, never> =>
    Effect.gen(function* () {
      const resolved = yield* getConfig(repoRoot);
      return resolved.config;
    });

  const getBasePath = (repoRoot: string): Effect.Effect<string, never> =>
    Effect.gen(function* () {
      const config = yield* getConfigValues(repoRoot);
      return config.basePath;
    });

  return {
    getConfig,
    getConfigValues,
    getBasePath,

    setProjectConfig: (repoRoot: string, updates: Partial<WorktreeConfigData>) =>
      Effect.gen(function* () {
        const basePath = yield* getBasePath(repoRoot);
        const projectPath = getProjectConfigPath(repoRoot, basePath);

        // Read existing config
        const existing = (yield* readConfigFile(projectPath)) || {};

        // Merge updates
        const newConfig = { ...existing, ...updates };

        yield* writeConfigFile(projectPath, newConfig);
      }),

    setUserConfig: (updates: Partial<WorktreeConfigData>) =>
      Effect.gen(function* () {
        const userPath = getUserConfigPath();

        // Read existing config
        const existing = (yield* readConfigFile(userPath)) || {};

        // Merge updates
        const newConfig = { ...existing, ...updates };

        yield* writeConfigFile(userPath, newConfig);
      }),

    resetProjectConfig: (repoRoot: string) =>
      Effect.gen(function* () {
        const basePath = DEFAULT_WORKTREE_CONFIG.basePath;
        const projectPath = getProjectConfigPath(repoRoot, basePath);

        // Delete the config file if it exists
        yield* Effect.promise(() =>
          import("fs/promises").then((fs) =>
            fs.unlink(projectPath).catch(() => {
              // Ignore if file doesn't exist
            })
          )
        );
      }),

    addCopyPattern: (repoRoot: string, pattern: string) =>
      Effect.gen(function* () {
        const config = yield* getConfigValues(repoRoot);
        const patterns = [...config.copyPatterns];

        if (!patterns.includes(pattern)) {
          patterns.push(pattern);
          const basePath = yield* getBasePath(repoRoot);
          const projectPath = getProjectConfigPath(repoRoot, basePath);
          const existing = (yield* readConfigFile(projectPath)) || {};
          yield* writeConfigFile(projectPath, { ...existing, copyPatterns: patterns });
        }
      }),

    removeCopyPattern: (repoRoot: string, pattern: string) =>
      Effect.gen(function* () {
        const config = yield* getConfigValues(repoRoot);
        const patterns = config.copyPatterns.filter((p) => p !== pattern);

        if (patterns.length !== config.copyPatterns.length) {
          const basePath = yield* getBasePath(repoRoot);
          const projectPath = getProjectConfigPath(repoRoot, basePath);
          const existing = (yield* readConfigFile(projectPath)) || {};
          yield* writeConfigFile(projectPath, { ...existing, copyPatterns: patterns });
        }
      }),

    addPostCreateHook: (repoRoot: string, hook: string) =>
      Effect.gen(function* () {
        const config = yield* getConfigValues(repoRoot);
        const hooks = [...config.postCreateHooks];

        if (!hooks.includes(hook)) {
          hooks.push(hook);
          const basePath = yield* getBasePath(repoRoot);
          const projectPath = getProjectConfigPath(repoRoot, basePath);
          const existing = (yield* readConfigFile(projectPath)) || {};
          yield* writeConfigFile(projectPath, { ...existing, postCreateHooks: hooks });
        }
      }),

    removePostCreateHook: (repoRoot: string, hook: string) =>
      Effect.gen(function* () {
        const config = yield* getConfigValues(repoRoot);
        const hooks = config.postCreateHooks.filter((h) => h !== hook);

        if (hooks.length !== config.postCreateHooks.length) {
          const basePath = yield* getBasePath(repoRoot);
          const projectPath = getProjectConfigPath(repoRoot, basePath);
          const existing = (yield* readConfigFile(projectPath)) || {};
          yield* writeConfigFile(projectPath, { ...existing, postCreateHooks: hooks });
        }
      }),
  };
};

// Live layer
export const WorktreeConfigServiceLive = Layer.succeed(
  WorktreeConfigService,
  makeWorktreeConfigService()
);
