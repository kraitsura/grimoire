/**
 * Profile Service
 *
 * Manages harness-agnostic configuration profiles.
 * Profiles can be applied to any supported AI coding assistant.
 */

import { Context, Effect, Layer } from "effect";
import { join } from "path";
import { homedir } from "os";
import { mkdir, readdir, rm, writeFile, readFile, access } from "fs/promises";
import type {
  HarnessId,
  Profile,
  ProfileListItem,
  ProfileGlobalConfig,
} from "../../models/profile";
import {
  HARNESS_CONFIG_PATHS,
  PROFILES_DIR,
  PROFILE_METADATA_FILE,
  DEFAULT_PROFILE_CONFIG,
  isValidProfileName,
  createEmptyProfile,
} from "../../models/profile";
import {
  ProfileNotFoundError,
  ProfileAlreadyExistsError,
  InvalidProfileNameError,
  HarnessNotInstalledError,
  UnknownHarnessError,
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
 * Get profile directory path
 */
const getProfilePath = (profileName: string): string =>
  join(getProfilesDir(), profileName);

/**
 * Get profile metadata file path
 */
const getProfileMetadataPath = (profileName: string): string =>
  join(getProfilePath(profileName), PROFILE_METADATA_FILE);

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
 * Read profile from disk
 */
const readProfile = (profileName: string): Effect.Effect<Profile, ProfileNotFoundError | ProfileConfigError> =>
  Effect.gen(function* () {
    const metadataPath = getProfileMetadataPath(profileName);
    const exists = yield* pathExists(metadataPath);

    if (!exists) {
      return yield* Effect.fail(new ProfileNotFoundError({ harnessId: "", profileName }));
    }

    try {
      const content = yield* Effect.promise(() => readFile(metadataPath, "utf-8"));
      const profile = JSON.parse(content) as Profile;
      return profile;
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
 * Write profile to disk
 */
const writeProfile = (profile: Profile): Effect.Effect<void, ProfileConfigError> =>
  Effect.gen(function* () {
    const profilePath = getProfilePath(profile.metadata.name);
    const metadataPath = getProfileMetadataPath(profile.metadata.name);

    try {
      yield* Effect.promise(() => mkdir(profilePath, { recursive: true }));
      yield* Effect.promise(() => mkdir(join(profilePath, "skills"), { recursive: true }));
      yield* Effect.promise(() => mkdir(join(profilePath, "commands"), { recursive: true }));
      yield* Effect.promise(() => writeFile(metadataPath, JSON.stringify(profile, null, 2) + "\n"));
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

// Service interface
interface ProfileServiceImpl {
  /**
   * List all profiles
   */
  readonly list: () => Effect.Effect<ProfileListItem[], ProfileConfigError>;

  /**
   * Get a profile by name
   */
  readonly get: (name: string) => Effect.Effect<Profile, ProfileNotFoundError | ProfileConfigError>;

  /**
   * Create a new profile
   */
  readonly create: (
    name: string,
    options?: { description?: string; fromHarness?: HarnessId }
  ) => Effect.Effect<
    Profile,
    ProfileAlreadyExistsError | InvalidProfileNameError | HarnessNotInstalledError | UnknownHarnessError | ProfileConfigError
  >;

  /**
   * Delete a profile
   */
  readonly delete: (name: string) => Effect.Effect<void, ProfileNotFoundError | ProfileConfigError>;

  /**
   * Update profile metadata
   */
  readonly update: (
    name: string,
    updates: { description?: string; tags?: string[] }
  ) => Effect.Effect<Profile, ProfileNotFoundError | ProfileConfigError>;

  /**
   * Apply a profile to harnesses
   */
  readonly apply: (
    name: string,
    harnesses: HarnessId[]
  ) => Effect.Effect<void, ProfileNotFoundError | HarnessNotInstalledError | UnknownHarnessError | ProfileConfigError>;

  /**
   * Remove a profile from harnesses
   */
  readonly remove: (
    name: string,
    harnesses: HarnessId[]
  ) => Effect.Effect<void, ProfileNotFoundError | ProfileConfigError>;

  /**
   * Get harnesses a profile is applied to
   */
  readonly getAppliedHarnesses: (name: string) => Effect.Effect<HarnessId[], ProfileNotFoundError | ProfileConfigError>;

  /**
   * List all available harnesses with their status
   */
  readonly listHarnesses: () => Effect.Effect<Array<{ id: HarnessId; installed: boolean; configPath: string }>, never>;
}

// Service tag
export class ProfileService extends Context.Tag("ProfileService")<
  ProfileService,
  ProfileServiceImpl
>() {}

// Service implementation
const makeProfileService = (): ProfileServiceImpl => ({
  list: () =>
    Effect.gen(function* () {
      const profilesDir = getProfilesDir();
      const profileNames = yield* listDir(profilesDir);

      const items: ProfileListItem[] = [];
      for (const name of profileNames) {
        const profileResult = yield* readProfile(name).pipe(
          Effect.map((profile) => ({
            name: profile.metadata.name,
            description: profile.metadata.description,
            skillCount: profile.skills.length,
            commandCount: profile.commands.length,
            mcpServerCount: profile.mcpServers.length,
            appliedTo: profile.metadata.appliedTo,
            updated: profile.metadata.updated,
          })),
          Effect.catchAll(() => Effect.succeed(null))
        );

        if (profileResult) {
          items.push(profileResult);
        }
      }

      return items;
    }),

  get: (name: string) => readProfile(name),

  create: (name: string, options?: { description?: string; fromHarness?: HarnessId }) =>
    Effect.gen(function* () {
      // Validate profile name
      if (!isValidProfileName(name)) {
        return yield* Effect.fail(
          new InvalidProfileNameError({
            name,
            reason: "Must be kebab-case: lowercase letters, numbers, and hyphens only",
          })
        );
      }

      // Check if profile already exists
      const profilePath = getProfilePath(name);
      const exists = yield* pathExists(profilePath);

      if (exists) {
        return yield* Effect.fail(
          new ProfileAlreadyExistsError({ harnessId: "", profileName: name })
        );
      }

      // Create profile
      const profile = createEmptyProfile(name, options?.description);

      // If creating from a harness, we would extract config here
      // For now, just create empty profile
      if (options?.fromHarness) {
        // Validate harness exists
        yield* getHarnessConfigPath(options.fromHarness);
        // TODO: Extract skills, commands, MCP servers from harness
        // This will be implemented in grimoire-21f8
      }

      yield* writeProfile(profile);
      return profile;
    }),

  delete: (name: string) =>
    Effect.gen(function* () {
      const profilePath = getProfilePath(name);
      const exists = yield* pathExists(profilePath);

      if (!exists) {
        return yield* Effect.fail(
          new ProfileNotFoundError({ harnessId: "", profileName: name })
        );
      }

      yield* Effect.promise(() => rm(profilePath, { recursive: true, force: true }));
    }),

  update: (name: string, updates: { description?: string; tags?: string[] }) =>
    Effect.gen(function* () {
      const profile = yield* readProfile(name);

      const updatedProfile: Profile = {
        ...profile,
        metadata: {
          ...profile.metadata,
          description: updates.description ?? profile.metadata.description,
          tags: updates.tags ?? profile.metadata.tags,
          updated: new Date().toISOString(),
        },
      };

      yield* writeProfile(updatedProfile);
      return updatedProfile;
    }),

  apply: (name: string, harnesses: HarnessId[]) =>
    Effect.gen(function* () {
      const profile = yield* readProfile(name);

      // Validate all harnesses exist
      for (const harnessId of harnesses) {
        yield* getHarnessConfigPath(harnessId);
      }

      // Update profile metadata with applied harnesses
      const newAppliedTo = [...new Set([...profile.metadata.appliedTo, ...harnesses])];

      const updatedProfile: Profile = {
        ...profile,
        metadata: {
          ...profile.metadata,
          appliedTo: newAppliedTo as HarnessId[],
          updated: new Date().toISOString(),
        },
      };

      yield* writeProfile(updatedProfile);

      // TODO: Actually copy skills/commands/MCP to harness configs
      // This will be implemented in grimoire-1k32
    }),

  remove: (name: string, harnesses: HarnessId[]) =>
    Effect.gen(function* () {
      const profile = yield* readProfile(name);

      // Remove harnesses from applied list
      const newAppliedTo = profile.metadata.appliedTo.filter(
        (h) => !harnesses.includes(h)
      );

      const updatedProfile: Profile = {
        ...profile,
        metadata: {
          ...profile.metadata,
          appliedTo: newAppliedTo,
          updated: new Date().toISOString(),
        },
      };

      yield* writeProfile(updatedProfile);

      // TODO: Remove profile's skills/commands/MCP from harness configs
      // This will be implemented in grimoire-1k32
    }),

  getAppliedHarnesses: (name: string) =>
    Effect.gen(function* () {
      const profile = yield* readProfile(name);
      return [...profile.metadata.appliedTo];
    }),

  listHarnesses: () =>
    Effect.gen(function* () {
      const harnesses: Array<{ id: HarnessId; installed: boolean; configPath: string }> = [];

      for (const [id, configPath] of Object.entries(HARNESS_CONFIG_PATHS)) {
        const resolvedPath = resolvePath(configPath);
        const installed = yield* pathExists(resolvedPath);
        harnesses.push({
          id: id as HarnessId,
          installed,
          configPath: resolvedPath,
        });
      }

      return harnesses;
    }),
});

// Live layer
export const ProfileServiceLive = Layer.succeed(ProfileService, makeProfileService());
