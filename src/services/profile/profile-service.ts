/**
 * Profile Service
 *
 * Core service for managing harness configuration profiles.
 * Handles creating, listing, switching, and deleting profiles.
 *
 * Profiles are stored in ~/.grimoire/profiles/{harnessId}/{profileName}/
 */

import { Context, Effect, Layer } from "effect";
import { join } from "path";
import { homedir } from "os";
import { mkdir, readdir, rm, cp, access, writeFile, readFile } from "fs/promises";
import type {
  HarnessId,
  ProfileInfo,
  ProfileConfig,
  ResourceSummary,
  McpServerInfo,
} from "../../models/profile";
import {
  HARNESS_CONFIG_PATHS,
  PROFILES_DIR,
  BACKUPS_DIR,
  PROFILE_MARKER_PREFIX,
  DEFAULT_PROFILE_CONFIG,
  EMPTY_RESOURCE_SUMMARY,
  isValidProfileName,
  getProfileMarkerName,
} from "../../models/profile";
import {
  ProfileNotFoundError,
  ProfileAlreadyExistsError,
  InvalidProfileNameError,
  HarnessNotInstalledError,
  UnknownHarnessError,
  ProfileSwitchError,
  ProfileBackupError,
  CannotDeleteActiveProfileError,
  ProfileConfigError,
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
 * Get profiles storage directory
 */
const getProfilesDir = (): string => join(getGrimoireDir(), PROFILES_DIR);

/**
 * Get backups storage directory
 */
const getBackupsDir = (): string => join(getGrimoireDir(), BACKUPS_DIR);

/**
 * Get profile config path
 */
const getProfileConfigPath = (): string => join(getGrimoireDir(), "profile-config.json");

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
 * Read profile config
 */
const readProfileConfig = (): Effect.Effect<ProfileConfig, ProfileConfigError> =>
  Effect.gen(function* () {
    const configPath = getProfileConfigPath();
    const exists = yield* pathExists(configPath);

    if (!exists) {
      return { ...DEFAULT_PROFILE_CONFIG };
    }

    try {
      const content = yield* Effect.promise(() => readFile(configPath, "utf-8"));
      const parsed = JSON.parse(content) as ProfileConfig;
      return { ...DEFAULT_PROFILE_CONFIG, ...parsed };
    } catch (error) {
      return yield* Effect.fail(
        new ProfileConfigError({
          path: configPath,
          reason: error instanceof Error ? error.message : String(error),
        })
      );
    }
  });

/**
 * Write profile config
 */
const writeProfileConfig = (config: ProfileConfig): Effect.Effect<void, ProfileConfigError> =>
  Effect.gen(function* () {
    const configPath = getProfileConfigPath();
    const grimoireDir = getGrimoireDir();

    try {
      yield* Effect.promise(() => mkdir(grimoireDir, { recursive: true }));
      yield* Effect.promise(() => writeFile(configPath, JSON.stringify(config, null, 2) + "\n"));
    } catch (error) {
      return yield* Effect.fail(
        new ProfileConfigError({
          path: configPath,
          reason: error instanceof Error ? error.message : String(error),
        })
      );
    }
  });

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

/**
 * Get profile storage path
 */
const getProfilePath = (harnessId: HarnessId, profileName: string): string =>
  join(getProfilesDir(), harnessId, profileName);

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
 * Extract resource summary from a directory
 */
const extractResourceSummary = (
  basePath: string,
  subdir: string
): Effect.Effect<ResourceSummary, never> =>
  Effect.gen(function* () {
    const dirPath = join(basePath, subdir);
    const exists = yield* pathExists(dirPath);

    if (!exists) {
      return { ...EMPTY_RESOURCE_SUMMARY };
    }

    const items = yield* listDir(dirPath);
    // Filter for markdown files and remove extensions for display
    const names = items
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""));

    return {
      items: names,
      directoryExists: true,
    };
  });

/**
 * Extract basic profile info (without full extraction)
 */
const extractBasicProfileInfo = (
  harnessId: HarnessId,
  profileName: string,
  profilePath: string,
  isActive: boolean
): Effect.Effect<ProfileInfo, never> =>
  Effect.gen(function* () {
    const skills = yield* extractResourceSummary(profilePath, "skills");
    const commands = yield* extractResourceSummary(profilePath, "commands");
    const agents = yield* extractResourceSummary(profilePath, "agents");

    return {
      name: profileName,
      harnessId,
      isActive,
      path: profilePath,
      mcpServers: [], // Full extraction done separately
      skills,
      commands,
      agents: agents.directoryExists ? agents : undefined,
      extractionErrors: [],
    };
  });

// Service interface
interface ProfileServiceImpl {
  /**
   * List all profiles for a harness
   */
  readonly list: (
    harnessId: HarnessId
  ) => Effect.Effect<ProfileInfo[], UnknownHarnessError | ProfileConfigError>;

  /**
   * Get a specific profile
   */
  readonly get: (
    harnessId: HarnessId,
    profileName: string
  ) => Effect.Effect<ProfileInfo, ProfileNotFoundError | ProfileConfigError>;

  /**
   * Create a new profile
   */
  readonly create: (
    harnessId: HarnessId,
    profileName: string,
    options?: { fromCurrent?: boolean }
  ) => Effect.Effect<
    void,
    | ProfileAlreadyExistsError
    | InvalidProfileNameError
    | UnknownHarnessError
    | HarnessNotInstalledError
    | ProfileConfigError
  >;

  /**
   * Delete a profile
   */
  readonly delete: (
    harnessId: HarnessId,
    profileName: string
  ) => Effect.Effect<
    void,
    ProfileNotFoundError | CannotDeleteActiveProfileError | ProfileConfigError
  >;

  /**
   * Get the active profile for a harness
   */
  readonly getActive: (
    harnessId: HarnessId
  ) => Effect.Effect<string | undefined, ProfileConfigError>;

  /**
   * Set the active profile (internal use - switch does the actual switching)
   */
  readonly setActive: (
    harnessId: HarnessId,
    profileName: string | undefined
  ) => Effect.Effect<void, ProfileConfigError>;

  /**
   * List all harnesses with their profiles
   */
  readonly listAll: () => Effect.Effect<
    Array<{ harnessId: HarnessId; profiles: ProfileInfo[] }>,
    ProfileConfigError
  >;
}

// Service tag
export class ProfileService extends Context.Tag("ProfileService")<
  ProfileService,
  ProfileServiceImpl
>() {}

// Service implementation
const makeProfileService = (): ProfileServiceImpl => ({
  list: (harnessId: HarnessId) =>
    Effect.gen(function* () {
      // Validate harness ID
      if (!HARNESS_CONFIG_PATHS[harnessId]) {
        return yield* Effect.fail(
          new UnknownHarnessError({
            harnessId,
            validHarnesses: Object.keys(HARNESS_CONFIG_PATHS),
          })
        );
      }

      const config = yield* readProfileConfig();
      const activeProfile = config.active[harnessId];
      const harnessProfilesDir = join(getProfilesDir(), harnessId);
      const profileNames = yield* listDir(harnessProfilesDir);

      const profiles: ProfileInfo[] = [];
      for (const name of profileNames) {
        const profilePath = join(harnessProfilesDir, name);
        const isActive = name === activeProfile;
        const info = yield* extractBasicProfileInfo(harnessId, name, profilePath, isActive);
        profiles.push(info);
      }

      return profiles;
    }),

  get: (harnessId: HarnessId, profileName: string) =>
    Effect.gen(function* () {
      const profilePath = getProfilePath(harnessId, profileName);
      const exists = yield* pathExists(profilePath);

      if (!exists) {
        return yield* Effect.fail(
          new ProfileNotFoundError({ harnessId, profileName })
        );
      }

      const config = yield* readProfileConfig();
      const isActive = config.active[harnessId] === profileName;
      return yield* extractBasicProfileInfo(harnessId, profileName, profilePath, isActive);
    }),

  create: (harnessId: HarnessId, profileName: string, options?: { fromCurrent?: boolean }) =>
    Effect.gen(function* () {
      // Validate profile name
      if (!isValidProfileName(profileName)) {
        return yield* Effect.fail(
          new InvalidProfileNameError({
            name: profileName,
            reason: "Must be kebab-case: lowercase letters, numbers, and hyphens only",
          })
        );
      }

      // Check if profile already exists
      const profilePath = getProfilePath(harnessId, profileName);
      const exists = yield* pathExists(profilePath);

      if (exists) {
        return yield* Effect.fail(
          new ProfileAlreadyExistsError({ harnessId, profileName })
        );
      }

      // Create profile directory
      yield* Effect.promise(() => mkdir(profilePath, { recursive: true }));

      if (options?.fromCurrent) {
        // Copy from current harness config
        const harnessPath = yield* getHarnessConfigPath(harnessId);

        try {
          // Copy entire config directory to profile
          yield* Effect.promise(() =>
            cp(harnessPath, profilePath, { recursive: true })
          );
        } catch (error) {
          // Clean up on failure
          yield* Effect.promise(() => rm(profilePath, { recursive: true, force: true }));
          throw error;
        }
      } else {
        // Create empty profile with basic structure
        yield* Effect.promise(() => mkdir(join(profilePath, "skills"), { recursive: true }));
        yield* Effect.promise(() => mkdir(join(profilePath, "commands"), { recursive: true }));
      }
    }),

  delete: (harnessId: HarnessId, profileName: string) =>
    Effect.gen(function* () {
      const profilePath = getProfilePath(harnessId, profileName);
      const exists = yield* pathExists(profilePath);

      if (!exists) {
        return yield* Effect.fail(
          new ProfileNotFoundError({ harnessId, profileName })
        );
      }

      // Check if this is the active profile
      const config = yield* readProfileConfig();
      if (config.active[harnessId] === profileName) {
        return yield* Effect.fail(
          new CannotDeleteActiveProfileError({ harnessId, profileName })
        );
      }

      // Delete the profile directory
      yield* Effect.promise(() => rm(profilePath, { recursive: true, force: true }));
    }),

  getActive: (harnessId: HarnessId) =>
    Effect.gen(function* () {
      const config = yield* readProfileConfig();
      return config.active[harnessId];
    }),

  setActive: (harnessId: HarnessId, profileName: string | undefined) =>
    Effect.gen(function* () {
      const config = yield* readProfileConfig();

      // Create new active map (config.active is readonly from schema)
      const newActive = { ...config.active };
      if (profileName === undefined) {
        delete newActive[harnessId];
      } else {
        newActive[harnessId] = profileName;
      }

      yield* writeProfileConfig({ ...config, active: newActive });
    }),

  listAll: () =>
    Effect.gen(function* () {
      const config = yield* readProfileConfig();
      const results: Array<{ harnessId: HarnessId; profiles: ProfileInfo[] }> = [];

      for (const harnessId of Object.keys(HARNESS_CONFIG_PATHS) as HarnessId[]) {
        const harnessProfilesDir = join(getProfilesDir(), harnessId);
        const profileNames = yield* listDir(harnessProfilesDir);
        const activeProfile = config.active[harnessId];

        const profiles: ProfileInfo[] = [];
        for (const name of profileNames) {
          const profilePath = join(harnessProfilesDir, name);
          const isActive = name === activeProfile;
          const info = yield* extractBasicProfileInfo(harnessId, name, profilePath, isActive);
          profiles.push(info);
        }

        if (profiles.length > 0) {
          results.push({ harnessId, profiles });
        }
      }

      return results;
    }),
});

// Live layer
export const ProfileServiceLive = Layer.succeed(ProfileService, makeProfileService());
