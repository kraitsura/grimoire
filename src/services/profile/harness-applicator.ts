/**
 * Harness Applicator Service
 *
 * Applies profiles to harness configurations with automatic backup and edit preservation.
 * Handles the process of copying skills, commands, MCP servers to harness config directories.
 */

import { Context, Effect, Layer } from "effect";
import { join, dirname } from "path";
import { homedir } from "os";
import { mkdir, readdir, readFile, writeFile, copyFile, cp, rm, access, stat } from "fs/promises";
import type {
  HarnessId,
  Profile,
  McpServerConfig,
  ProfileBackup,
} from "../../models/profile";
import {
  HARNESS_CONFIG_PATHS,
  BACKUPS_DIR,
  PROFILE_MARKER_PREFIX,
} from "../../models/profile";
import {
  ProfileNotFoundError,
  HarnessNotInstalledError,
  UnknownHarnessError,
  ProfileConfigError,
  ProfileSwitchError,
  ProfileBackupError,
} from "../../models/profile-errors";

/**
 * Resolve ~ to home directory
 */
const resolvePath = (path: string): string => {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
};

/**
 * Get grimoire base directory
 */
const getGrimoireDir = (): string => join(homedir(), ".grimoire");

/**
 * Get backups directory for a harness
 */
const getBackupsDir = (harnessId: HarnessId): string =>
  join(getGrimoireDir(), BACKUPS_DIR, harnessId);

/**
 * Get profile directory path
 */
const getProfilesDir = (): string => join(getGrimoireDir(), "profiles");
const getProfilePath = (profileName: string): string =>
  join(getProfilesDir(), profileName);

/**
 * Check if path exists
 */
const pathExists = (path: string): Effect.Effect<boolean, never> =>
  Effect.tryPromise({
    try: async () => {
      await access(path);
      return true;
    },
    catch: () => false,
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));

/**
 * List directory contents, returning empty array if not exists
 */
const listDir = (path: string): Effect.Effect<string[], never> =>
  Effect.tryPromise({
    try: async () => {
      const entries = await readdir(path);
      return entries.filter((e) => !e.startsWith("."));
    },
    catch: () => [] as string[],
  }).pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

/**
 * Read file content, returning undefined if not exists
 */
const readFileOpt = (path: string): Effect.Effect<string | undefined, never> =>
  Effect.tryPromise({
    try: async () => await readFile(path, "utf-8"),
    catch: () => undefined,
  }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

/**
 * Get harness config path, validating it exists
 */
const getHarnessConfigPath = (
  harnessId: HarnessId
): Effect.Effect<string, UnknownHarnessError | HarnessNotInstalledError> =>
  Effect.gen(function* () {
    const configPath = HARNESS_CONFIG_PATHS[harnessId];
    if (!configPath) {
      return yield* Effect.fail(
        new UnknownHarnessError({
          harnessId,
          validHarnesses: Object.keys(HARNESS_CONFIG_PATHS),
        })
      );
    }

    const resolvedPath = resolvePath(configPath);
    const exists = yield* pathExists(resolvedPath);

    if (!exists) {
      return yield* Effect.fail(
        new HarnessNotInstalledError({
          harnessId,
          configPath: resolvedPath,
        })
      );
    }

    return resolvedPath;
  });

// ============================================================================
// Backup Operations
// ============================================================================

/**
 * Create a backup of the harness config directory
 */
const createBackup = (
  harnessId: HarnessId,
  profileName: string,
  reason?: string
): Effect.Effect<ProfileBackup, ProfileBackupError | UnknownHarnessError | HarnessNotInstalledError> =>
  Effect.gen(function* () {
    const configPath = yield* getHarnessConfigPath(harnessId);
    const backupsDir = getBackupsDir(harnessId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = join(backupsDir, timestamp);

    // Create backup directory
    yield* Effect.tryPromise({
      try: () => mkdir(backupPath, { recursive: true }),
      catch: (error) =>
        new ProfileBackupError({
          harnessId,
          reason: `Failed to create backup directory: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });

    // Copy relevant config files (not everything, just config we manage)
    const filesToBackup = yield* getFilesToBackup(harnessId, configPath);

    for (const file of filesToBackup) {
      const srcPath = join(configPath, file);
      const destPath = join(backupPath, file);

      const exists = yield* pathExists(srcPath);
      if (exists) {
        // Ensure destination directory exists
        const destDir = dirname(destPath);
        yield* Effect.tryPromise({
          try: () => mkdir(destDir, { recursive: true }),
          catch: () => undefined,
        }).pipe(Effect.catchAll(() => Effect.void));

        // Check if it's a directory or file
        const srcStat = yield* Effect.tryPromise({
          try: () => stat(srcPath),
          catch: () => undefined,
        }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

        if (srcStat?.isDirectory()) {
          yield* Effect.tryPromise({
            try: () => cp(srcPath, destPath, { recursive: true }),
            catch: () => undefined,
          }).pipe(Effect.catchAll(() => Effect.void));
        } else {
          yield* Effect.tryPromise({
            try: () => copyFile(srcPath, destPath),
            catch: () => undefined,
          }).pipe(Effect.catchAll(() => Effect.void));
        }
      }
    }

    // Write backup metadata
    const backup: ProfileBackup = {
      harnessId,
      profileName,
      timestamp: new Date().toISOString(),
      path: backupPath,
      reason,
    };

    yield* Effect.tryPromise({
      try: () => writeFile(join(backupPath, ".backup-meta.json"), JSON.stringify(backup, null, 2)),
      catch: (error) =>
        new ProfileBackupError({
          harnessId,
          reason: `Failed to write backup metadata: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });

    return backup;
  });

/**
 * Get list of files/directories to backup for a harness
 */
const getFilesToBackup = (
  harnessId: HarnessId,
  configPath: string
): Effect.Effect<string[], never> =>
  Effect.gen(function* () {
    switch (harnessId) {
      case "claude-code":
        return ["settings.json", ".mcp.json", "skills", "commands"];
      case "opencode":
        return ["opencode.jsonc", "skills", "agents"];
      case "cursor":
        return ["settings.json", "rules", ".cursorrules"];
      case "amp":
        return ["settings.json"];
      default:
        return ["skills", "AGENTS.md", "CONVENTIONS.md"];
    }
  });

// ============================================================================
// Apply Operations
// ============================================================================

/**
 * Copy skills from profile to harness
 */
const copySkills = (
  profilePath: string,
  harnessPath: string,
  skills: readonly string[]
): Effect.Effect<void, ProfileSwitchError> =>
  Effect.gen(function* () {
    if (skills.length === 0) return;

    // Create skills directory in harness if needed
    const destSkillsDir = join(harnessPath, "skills");
    yield* Effect.tryPromise({
      try: () => mkdir(destSkillsDir, { recursive: true }),
      catch: () => undefined,
    }).pipe(Effect.catchAll(() => Effect.void));

    // Copy each skill directory
    const srcSkillsDir = join(profilePath, "skills");
    for (const skill of skills) {
      const srcSkillPath = join(srcSkillsDir, skill);
      const destSkillPath = join(destSkillsDir, skill);

      const exists = yield* pathExists(srcSkillPath);
      if (exists) {
        yield* Effect.tryPromise({
          try: () => cp(srcSkillPath, destSkillPath, { recursive: true }),
          catch: (error) =>
            new ProfileSwitchError({
              harnessId: "unknown",
              profileName: "unknown",
              reason: `Failed to copy skill ${skill}: ${error instanceof Error ? error.message : String(error)}`,
            }),
        });
      }
    }
  });

/**
 * Copy commands from profile to harness
 */
const copyCommands = (
  profilePath: string,
  harnessPath: string,
  commands: readonly string[]
): Effect.Effect<void, ProfileSwitchError> =>
  Effect.gen(function* () {
    if (commands.length === 0) return;

    // Create commands directory in harness if needed
    const destCommandsDir = join(harnessPath, "commands");
    yield* Effect.tryPromise({
      try: () => mkdir(destCommandsDir, { recursive: true }),
      catch: () => undefined,
    }).pipe(Effect.catchAll(() => Effect.void));

    // Copy each command file
    const srcCommandsDir = join(profilePath, "commands");
    for (const cmd of commands) {
      const srcCmdPath = join(srcCommandsDir, `${cmd}.md`);
      const destCmdPath = join(destCommandsDir, `${cmd}.md`);

      const exists = yield* pathExists(srcCmdPath);
      if (exists) {
        yield* Effect.tryPromise({
          try: () => copyFile(srcCmdPath, destCmdPath),
          catch: (error) =>
            new ProfileSwitchError({
              harnessId: "unknown",
              profileName: "unknown",
              reason: `Failed to copy command ${cmd}: ${error instanceof Error ? error.message : String(error)}`,
            }),
        });
      }
    }
  });

/**
 * Apply MCP servers to harness config
 * For Claude Code: Writes to .mcp.json
 * For OpenCode: Merges into opencode.jsonc
 */
const applyMcpServers = (
  harnessId: HarnessId,
  harnessPath: string,
  mcpServers: readonly McpServerConfig[]
): Effect.Effect<void, ProfileSwitchError> =>
  Effect.gen(function* () {
    if (mcpServers.length === 0) return;

    switch (harnessId) {
      case "claude-code": {
        // Write to .mcp.json
        const mcpConfig: Record<string, unknown> = {
          mcpServers: {} as Record<string, unknown>,
        };

        for (const server of mcpServers) {
          const serverConfig: Record<string, unknown> = {
            disabled: !server.enabled,
          };

          if (server.command) serverConfig.command = server.command;
          if (server.args) serverConfig.args = server.args;
          if (server.url) serverConfig.url = server.url;
          if (server.serverType) serverConfig.type = server.serverType;
          if (server.env) serverConfig.env = server.env;

          (mcpConfig.mcpServers as Record<string, unknown>)[server.name] = serverConfig;
        }

        const mcpPath = join(harnessPath, ".mcp.json");
        yield* Effect.tryPromise({
          try: () => writeFile(mcpPath, JSON.stringify(mcpConfig, null, 2)),
          catch: (error) =>
            new ProfileSwitchError({
              harnessId,
              profileName: "unknown",
              reason: `Failed to write MCP config: ${error instanceof Error ? error.message : String(error)}`,
            }),
        });
        break;
      }

      case "opencode": {
        // Read existing config, merge MCP servers
        const configPath = join(harnessPath, "opencode.jsonc");
        const existingContent = yield* readFileOpt(configPath);

        let config: Record<string, unknown> = {};
        if (existingContent) {
          // Parse JSONC (strip comments)
          const stripped = existingContent
            .replace(/\/\/.*$/gm, "")
            .replace(/\/\*[\s\S]*?\*\//g, "");
          try {
            config = JSON.parse(stripped);
          } catch {
            config = {};
          }
        }

        // Merge MCP servers
        const mcp: Record<string, unknown> = {};
        for (const server of mcpServers) {
          const serverConfig: Record<string, unknown> = {
            disabled: !server.enabled,
          };

          if (server.command) serverConfig.command = server.command;
          if (server.args) serverConfig.args = server.args;
          if (server.url) serverConfig.url = server.url;
          if (server.serverType) serverConfig.type = server.serverType;
          if (server.env) serverConfig.env = server.env;

          mcp[server.name] = serverConfig;
        }

        config.mcp = mcp;

        yield* Effect.tryPromise({
          try: () => writeFile(configPath, JSON.stringify(config, null, 2)),
          catch: (error) =>
            new ProfileSwitchError({
              harnessId,
              profileName: "unknown",
              reason: `Failed to write OpenCode config: ${error instanceof Error ? error.message : String(error)}`,
            }),
        });
        break;
      }

      case "amp": {
        // Read existing config, merge MCP servers
        const configPath = join(harnessPath, "settings.json");
        const existingContent = yield* readFileOpt(configPath);

        let config: { amp?: Record<string, unknown> } = {};
        if (existingContent) {
          try {
            config = JSON.parse(existingContent);
          } catch {
            config = {};
          }
        }

        if (!config.amp) config.amp = {};

        // Merge MCP servers
        const mcpServersConfig: Record<string, unknown> = {};
        for (const server of mcpServers) {
          const serverConfig: Record<string, unknown> = {
            disabled: !server.enabled,
          };

          if (server.command) serverConfig.command = server.command;
          if (server.args) serverConfig.args = server.args;
          if (server.url) serverConfig.url = server.url;
          if (server.serverType) serverConfig.type = server.serverType;
          if (server.env) serverConfig.env = server.env;

          mcpServersConfig[server.name] = serverConfig;
        }

        config.amp.mcpServers = mcpServersConfig;

        yield* Effect.tryPromise({
          try: () => writeFile(configPath, JSON.stringify(config, null, 2)),
          catch: (error) =>
            new ProfileSwitchError({
              harnessId,
              profileName: "unknown",
              reason: `Failed to write Amp config: ${error instanceof Error ? error.message : String(error)}`,
            }),
        });
        break;
      }
    }
  });

/**
 * Create profile marker file in harness config directory
 */
const createProfileMarker = (
  harnessPath: string,
  profileName: string
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    // Remove any existing markers
    const entries = yield* listDir(harnessPath);
    for (const entry of entries) {
      if (entry.startsWith(PROFILE_MARKER_PREFIX)) {
        yield* Effect.tryPromise({
          try: () => rm(join(harnessPath, entry)),
          catch: () => undefined,
        }).pipe(Effect.catchAll(() => Effect.void));
      }
    }

    // Create new marker
    const markerPath = join(harnessPath, `${PROFILE_MARKER_PREFIX}${profileName}`);
    yield* Effect.tryPromise({
      try: () => writeFile(markerPath, `Applied by grimoire at ${new Date().toISOString()}\n`),
      catch: () => undefined,
    }).pipe(Effect.catchAll(() => Effect.void));
  });

/**
 * Read a profile from disk
 */
const readProfile = (
  profileName: string
): Effect.Effect<Profile, ProfileNotFoundError | ProfileConfigError> =>
  Effect.gen(function* () {
    const profilePath = getProfilePath(profileName);
    const metadataPath = join(profilePath, "profile.json");

    const exists = yield* pathExists(metadataPath);
    if (!exists) {
      return yield* Effect.fail(
        new ProfileNotFoundError({ harnessId: "", profileName })
      );
    }

    const content = yield* readFileOpt(metadataPath);
    if (!content) {
      return yield* Effect.fail(
        new ProfileConfigError({
          path: metadataPath,
          reason: "Failed to read profile metadata",
        })
      );
    }

    try {
      return JSON.parse(content) as Profile;
    } catch (error) {
      return yield* Effect.fail(
        new ProfileConfigError({
          path: metadataPath,
          reason: error instanceof Error ? error.message : String(error),
        })
      );
    }
  });

/**
 * Apply a profile to a harness
 */
const applyProfile = (
  profileName: string,
  harnessId: HarnessId,
  options?: {
    skipBackup?: boolean;
    createMarker?: boolean;
  }
): Effect.Effect<
  { backup?: ProfileBackup },
  | ProfileNotFoundError
  | ProfileConfigError
  | ProfileSwitchError
  | ProfileBackupError
  | UnknownHarnessError
  | HarnessNotInstalledError
> =>
  Effect.gen(function* () {
    // Get paths
    const harnessPath = yield* getHarnessConfigPath(harnessId);
    const profilePath = getProfilePath(profileName);
    const profile = yield* readProfile(profileName);

    // Create backup unless skipped
    let backup: ProfileBackup | undefined;
    if (!options?.skipBackup) {
      backup = yield* createBackup(harnessId, profileName, "apply");
    }

    // Copy skills
    yield* copySkills(profilePath, harnessPath, profile.skills);

    // Copy commands
    yield* copyCommands(profilePath, harnessPath, profile.commands);

    // Apply MCP servers
    yield* applyMcpServers(harnessId, harnessPath, profile.mcpServers);

    // Create marker file if requested
    if (options?.createMarker !== false) {
      yield* createProfileMarker(harnessPath, profileName);
    }

    return { backup };
  });

/**
 * Remove a profile from a harness (clean up applied config)
 */
const removeProfile = (
  profileName: string,
  harnessId: HarnessId,
  options?: {
    skipBackup?: boolean;
  }
): Effect.Effect<
  { backup?: ProfileBackup },
  | ProfileNotFoundError
  | ProfileConfigError
  | ProfileSwitchError
  | ProfileBackupError
  | UnknownHarnessError
  | HarnessNotInstalledError
> =>
  Effect.gen(function* () {
    const harnessPath = yield* getHarnessConfigPath(harnessId);
    const profile = yield* readProfile(profileName);

    // Create backup unless skipped
    let backup: ProfileBackup | undefined;
    if (!options?.skipBackup) {
      backup = yield* createBackup(harnessId, profileName, "remove");
    }

    // Remove profile's skills
    const skillsDir = join(harnessPath, "skills");
    for (const skill of profile.skills) {
      const skillPath = join(skillsDir, skill);
      yield* Effect.tryPromise({
        try: () => rm(skillPath, { recursive: true, force: true }),
        catch: () => undefined,
      }).pipe(Effect.catchAll(() => Effect.void));
    }

    // Remove profile's commands
    const commandsDir = join(harnessPath, "commands");
    for (const cmd of profile.commands) {
      const cmdPath = join(commandsDir, `${cmd}.md`);
      yield* Effect.tryPromise({
        try: () => rm(cmdPath),
        catch: () => undefined,
      }).pipe(Effect.catchAll(() => Effect.void));
    }

    // Remove profile marker
    const entries = yield* listDir(harnessPath);
    for (const entry of entries) {
      if (entry === `${PROFILE_MARKER_PREFIX}${profileName}`) {
        yield* Effect.tryPromise({
          try: () => rm(join(harnessPath, entry)),
          catch: () => undefined,
        }).pipe(Effect.catchAll(() => Effect.void));
      }
    }

    return { backup };
  });

/**
 * List available backups for a harness
 */
const listBackups = (
  harnessId: HarnessId
): Effect.Effect<ProfileBackup[], never> =>
  Effect.gen(function* () {
    const backupsDir = getBackupsDir(harnessId);
    const exists = yield* pathExists(backupsDir);
    if (!exists) return [];

    const entries = yield* listDir(backupsDir);
    const backups: ProfileBackup[] = [];

    for (const entry of entries) {
      const metaPath = join(backupsDir, entry, ".backup-meta.json");
      const content = yield* readFileOpt(metaPath);
      if (content) {
        try {
          const backup = JSON.parse(content) as ProfileBackup;
          backups.push(backup);
        } catch {
          // Skip invalid backups
        }
      }
    }

    // Sort by timestamp (newest first)
    return backups.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  });

/**
 * Restore from a backup
 */
const restoreBackup = (
  harnessId: HarnessId,
  backupPath: string
): Effect.Effect<void, ProfileSwitchError | UnknownHarnessError | HarnessNotInstalledError> =>
  Effect.gen(function* () {
    const harnessPath = yield* getHarnessConfigPath(harnessId);
    const exists = yield* pathExists(backupPath);

    if (!exists) {
      return yield* Effect.fail(
        new ProfileSwitchError({
          harnessId,
          profileName: "backup",
          reason: `Backup not found: ${backupPath}`,
        })
      );
    }

    // Get files to restore based on harness type
    const filesToRestore = yield* getFilesToBackup(harnessId, harnessPath);

    for (const file of filesToRestore) {
      const srcPath = join(backupPath, file);
      const destPath = join(harnessPath, file);

      const srcExists = yield* pathExists(srcPath);
      if (srcExists) {
        // Check if it's a directory or file
        const srcStat = yield* Effect.tryPromise({
          try: () => stat(srcPath),
          catch: () => undefined,
        }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

        if (srcStat?.isDirectory()) {
          // Remove existing directory first
          yield* Effect.tryPromise({
            try: () => rm(destPath, { recursive: true, force: true }),
            catch: () => undefined,
          }).pipe(Effect.catchAll(() => Effect.void));

          yield* Effect.tryPromise({
            try: () => cp(srcPath, destPath, { recursive: true }),
            catch: (error) =>
              new ProfileSwitchError({
                harnessId,
                profileName: "backup",
                reason: `Failed to restore ${file}: ${error instanceof Error ? error.message : String(error)}`,
              }),
          });
        } else {
          yield* Effect.tryPromise({
            try: () => copyFile(srcPath, destPath),
            catch: (error) =>
              new ProfileSwitchError({
                harnessId,
                profileName: "backup",
                reason: `Failed to restore ${file}: ${error instanceof Error ? error.message : String(error)}`,
              }),
          });
        }
      }
    }
  });

// Service interface
interface HarnessApplicatorImpl {
  /**
   * Apply a profile to a harness
   */
  readonly apply: (
    profileName: string,
    harnessId: HarnessId,
    options?: { skipBackup?: boolean; createMarker?: boolean }
  ) => Effect.Effect<
    { backup?: ProfileBackup },
    | ProfileNotFoundError
    | ProfileConfigError
    | ProfileSwitchError
    | ProfileBackupError
    | UnknownHarnessError
    | HarnessNotInstalledError
  >;

  /**
   * Remove a profile from a harness
   */
  readonly remove: (
    profileName: string,
    harnessId: HarnessId,
    options?: { skipBackup?: boolean }
  ) => Effect.Effect<
    { backup?: ProfileBackup },
    | ProfileNotFoundError
    | ProfileConfigError
    | ProfileSwitchError
    | ProfileBackupError
    | UnknownHarnessError
    | HarnessNotInstalledError
  >;

  /**
   * Create a backup of harness config
   */
  readonly backup: (
    harnessId: HarnessId,
    profileName: string,
    reason?: string
  ) => Effect.Effect<ProfileBackup, ProfileBackupError | UnknownHarnessError | HarnessNotInstalledError>;

  /**
   * List backups for a harness
   */
  readonly listBackups: (harnessId: HarnessId) => Effect.Effect<ProfileBackup[], never>;

  /**
   * Restore from a backup
   */
  readonly restore: (
    harnessId: HarnessId,
    backupPath: string
  ) => Effect.Effect<void, ProfileSwitchError | UnknownHarnessError | HarnessNotInstalledError>;
}

// Service tag
export class HarnessApplicator extends Context.Tag("HarnessApplicator")<
  HarnessApplicator,
  HarnessApplicatorImpl
>() {}

// Service implementation
const makeHarnessApplicator = (): HarnessApplicatorImpl => ({
  apply: (profileName, harnessId, options) =>
    applyProfile(profileName, harnessId, options),

  remove: (profileName, harnessId, options) =>
    removeProfile(profileName, harnessId, options),

  backup: (harnessId, profileName, reason) =>
    createBackup(harnessId, profileName, reason),

  listBackups: (harnessId) => listBackups(harnessId),

  restore: (harnessId, backupPath) => restoreBackup(harnessId, backupPath),
});

// Live layer
export const HarnessApplicatorLive = Layer.succeed(
  HarnessApplicator,
  makeHarnessApplicator()
);
