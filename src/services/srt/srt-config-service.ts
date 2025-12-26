/**
 * SRT Config Service
 *
 * Manages SRT configuration with support for:
 * - User-level defaults (~/.config/grimoire/srt.json)
 * - Project-level overrides (.grimoire/srt.json)
 * - Effect Schema validation
 * - Config merging with mandatory protections
 */

import { Context, Effect, Layer, Schema } from "effect";
import { join } from "path";
import { homedir } from "os";
import {
  DEFAULT_ALLOWED_DOMAINS,
  DEFAULT_DENY_READ,
  DEFAULT_DENY_WRITE,
  DEFAULT_ALLOW_WRITE_EXTRA,
  type SrtConfig,
} from "./srt-service";

// =============================================================================
// Schema Definitions
// =============================================================================

/**
 * Network configuration schema
 */
export const SrtNetworkConfigSchema = Schema.Struct({
  allowedDomains: Schema.optional(Schema.Array(Schema.String)),
  deniedDomains: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Filesystem configuration schema
 */
export const SrtFilesystemConfigSchema = Schema.Struct({
  additionalWritePaths: Schema.optional(Schema.Array(Schema.String)),
  denyRead: Schema.optional(Schema.Array(Schema.String)),
  denyWrite: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Complete SRT user/project config schema
 * All fields optional - merged with defaults
 */
export const SrtUserConfigSchema = Schema.Struct({
  network: Schema.optional(SrtNetworkConfigSchema),
  filesystem: Schema.optional(SrtFilesystemConfigSchema),
});

export type SrtUserConfig = Schema.Schema.Type<typeof SrtUserConfigSchema>;

// =============================================================================
// Config Paths
// =============================================================================

/** User-level config path */
export const USER_CONFIG_PATH = join(homedir(), ".config", "grimoire", "srt.json");

/** Project-level config filename */
export const PROJECT_CONFIG_FILENAME = ".grimoire/srt.json";

// =============================================================================
// Mandatory Protections (cannot be overridden)
// =============================================================================

/** Paths that must always be denied for reading */
export const MANDATORY_DENY_READ = ["~/.ssh", "~/.aws", "~/.gnupg"];

/** Paths that must always be denied for writing */
export const MANDATORY_DENY_WRITE = [
  ".env",
  ".bashrc",
  ".zshrc",
  ".profile",
  ".gitconfig",
  "~/.ssh",
  "~/.aws",
];

// =============================================================================
// Types
// =============================================================================

export interface LoadedConfig {
  /** The merged configuration */
  config: SrtUserConfig;
  /** Where the config was loaded from */
  sources: {
    user: boolean;
    project: boolean;
  };
}

export interface ResolvedSrtConfig {
  /** Final SRT config ready for use */
  config: SrtConfig;
  /** Config sources that were loaded */
  sources: {
    user: boolean;
    project: boolean;
  };
}

// =============================================================================
// Errors
// =============================================================================

export class SrtConfigParseError {
  readonly _tag = "SrtConfigParseError";
  constructor(
    readonly path: string,
    readonly cause: string
  ) {}
}

// =============================================================================
// Service Interface
// =============================================================================

interface SrtConfigServiceImpl {
  /**
   * Load user-level config from ~/.config/grimoire/srt.json
   */
  readonly loadUserConfig: () => Effect.Effect<SrtUserConfig | null, SrtConfigParseError>;

  /**
   * Load project-level config from .grimoire/srt.json
   */
  readonly loadProjectConfig: (
    projectPath: string
  ) => Effect.Effect<SrtUserConfig | null, SrtConfigParseError>;

  /**
   * Load and merge all config sources
   */
  readonly loadConfig: (
    projectPath?: string
  ) => Effect.Effect<LoadedConfig, SrtConfigParseError>;

  /**
   * Resolve final SRT config for a worktree
   * Merges user + project config with defaults and mandatory protections
   */
  readonly resolveConfig: (
    worktreePath: string,
    projectPath?: string
  ) => Effect.Effect<ResolvedSrtConfig, SrtConfigParseError>;

  /**
   * Save user-level config
   */
  readonly saveUserConfig: (
    config: SrtUserConfig
  ) => Effect.Effect<void, never>;

  /**
   * Save project-level config
   */
  readonly saveProjectConfig: (
    projectPath: string,
    config: SrtUserConfig
  ) => Effect.Effect<void, never>;
}

// =============================================================================
// Service Tag
// =============================================================================

export class SrtConfigService extends Context.Tag("SrtConfigService")<
  SrtConfigService,
  SrtConfigServiceImpl
>() {}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Read and parse a JSON config file
 */
const readConfigFile = (
  path: string
): Effect.Effect<SrtUserConfig | null, SrtConfigParseError> =>
  Effect.gen(function* () {
    const file = Bun.file(path);
    const exists = yield* Effect.promise(() => file.exists());

    if (!exists) {
      return null;
    }

    const content = yield* Effect.tryPromise({
      try: () => file.text(),
      catch: () => new SrtConfigParseError(path, "Failed to read file"),
    });

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      return yield* Effect.fail(
        new SrtConfigParseError(
          path,
          `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`
        )
      );
    }

    // Validate with schema
    const decoded = Schema.decodeUnknownEither(SrtUserConfigSchema)(parsed);
    if (decoded._tag === "Left") {
      return yield* Effect.fail(
        new SrtConfigParseError(path, "Schema validation failed")
      );
    }

    return decoded.right;
  });

/**
 * Merge two configs, with second taking precedence
 */
const mergeConfigs = (
  base: SrtUserConfig,
  override: SrtUserConfig
): SrtUserConfig => ({
  network: {
    allowedDomains: [
      ...(base.network?.allowedDomains ?? []),
      ...(override.network?.allowedDomains ?? []),
    ],
    deniedDomains: [
      ...(base.network?.deniedDomains ?? []),
      ...(override.network?.deniedDomains ?? []),
    ],
  },
  filesystem: {
    additionalWritePaths: [
      ...(base.filesystem?.additionalWritePaths ?? []),
      ...(override.filesystem?.additionalWritePaths ?? []),
    ],
    denyRead: [
      ...(base.filesystem?.denyRead ?? []),
      ...(override.filesystem?.denyRead ?? []),
    ],
    denyWrite: [
      ...(base.filesystem?.denyWrite ?? []),
      ...(override.filesystem?.denyWrite ?? []),
    ],
  },
});

/**
 * Deduplicate an array
 */
const dedupe = <T>(arr: T[]): T[] => [...new Set(arr)];

/**
 * Create the SRT config service implementation
 */
const makeSrtConfigService = (): SrtConfigServiceImpl => ({
  loadUserConfig: () => readConfigFile(USER_CONFIG_PATH),

  loadProjectConfig: (projectPath: string) =>
    readConfigFile(join(projectPath, PROJECT_CONFIG_FILENAME)),

  loadConfig: (projectPath?: string) =>
    Effect.gen(function* () {
      const userConfig = yield* readConfigFile(USER_CONFIG_PATH);
      const projectConfig = projectPath
        ? yield* readConfigFile(join(projectPath, PROJECT_CONFIG_FILENAME))
        : null;

      // Start with empty config
      let merged: SrtUserConfig = {};

      // Apply user config
      if (userConfig) {
        merged = mergeConfigs(merged, userConfig);
      }

      // Apply project config (takes precedence)
      if (projectConfig) {
        merged = mergeConfigs(merged, projectConfig);
      }

      return {
        config: merged,
        sources: {
          user: userConfig !== null,
          project: projectConfig !== null,
        },
      };
    }),

  resolveConfig: (worktreePath: string, projectPath?: string) =>
    Effect.gen(function* () {
      const loaded = yield* makeSrtConfigService().loadConfig(projectPath);

      // Build final config with defaults and mandatory protections
      const config: SrtConfig = {
        network: {
          allowedDomains: dedupe([
            ...DEFAULT_ALLOWED_DOMAINS,
            ...(loaded.config.network?.allowedDomains ?? []),
          ]),
          deniedDomains: dedupe([
            ...(loaded.config.network?.deniedDomains ?? []),
          ]),
        },
        filesystem: {
          denyRead: dedupe([
            ...MANDATORY_DENY_READ,
            ...DEFAULT_DENY_READ,
            ...(loaded.config.filesystem?.denyRead ?? []),
          ]),
          allowWrite: dedupe([
            worktreePath,
            ...DEFAULT_ALLOW_WRITE_EXTRA,
            ...(loaded.config.filesystem?.additionalWritePaths ?? []),
          ]),
          denyWrite: dedupe([
            ...MANDATORY_DENY_WRITE,
            ...DEFAULT_DENY_WRITE,
            ...(loaded.config.filesystem?.denyWrite ?? []),
          ]),
        },
      };

      return {
        config,
        sources: loaded.sources,
      };
    }),

  saveUserConfig: (config: SrtUserConfig) =>
    Effect.gen(function* () {
      const dir = join(homedir(), ".config", "grimoire");

      // Ensure directory exists
      yield* Effect.tryPromise({
        try: () =>
          import("fs/promises").then((fs) =>
            fs.mkdir(dir, { recursive: true })
          ),
        catch: () => undefined,
      }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

      // Write config
      yield* Effect.tryPromise({
        try: () => Bun.write(USER_CONFIG_PATH, JSON.stringify(config, null, 2)),
        catch: () => undefined,
      }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
    }),

  saveProjectConfig: (projectPath: string, config: SrtUserConfig) =>
    Effect.gen(function* () {
      const dir = join(projectPath, ".grimoire");

      // Ensure directory exists
      yield* Effect.tryPromise({
        try: () =>
          import("fs/promises").then((fs) =>
            fs.mkdir(dir, { recursive: true })
          ),
        catch: () => undefined,
      }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

      // Write config
      const configPath = join(projectPath, PROJECT_CONFIG_FILENAME);
      yield* Effect.tryPromise({
        try: () => Bun.write(configPath, JSON.stringify(config, null, 2)),
        catch: () => undefined,
      }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
    }),
});

// =============================================================================
// Layer
// =============================================================================

export const SrtConfigServiceLive = Layer.succeed(
  SrtConfigService,
  makeSrtConfigService()
);
