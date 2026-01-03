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
  ProfileDiffItem,
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
  ProfileExtractionError,
  ProfileSwitchError,
  ProfileBackupError,
} from "../../models/profile-errors";
import { HarnessExtractor } from "./harness-extractor";
import { HarnessApplicator } from "./harness-applicator";

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
    ProfileAlreadyExistsError | InvalidProfileNameError | HarnessNotInstalledError | UnknownHarnessError | ProfileConfigError | ProfileExtractionError
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
    harnesses: HarnessId[],
    options?: { skipBackup?: boolean }
  ) => Effect.Effect<void, ProfileNotFoundError | HarnessNotInstalledError | UnknownHarnessError | ProfileConfigError | ProfileSwitchError | ProfileBackupError>;

  /**
   * Remove a profile from harnesses
   */
  readonly remove: (
    name: string,
    harnesses: HarnessId[],
    options?: { skipBackup?: boolean }
  ) => Effect.Effect<void, ProfileNotFoundError | ProfileConfigError | ProfileSwitchError | ProfileBackupError | UnknownHarnessError | HarnessNotInstalledError>;

  /**
   * Get harnesses a profile is applied to
   */
  readonly getAppliedHarnesses: (name: string) => Effect.Effect<HarnessId[], ProfileNotFoundError | ProfileConfigError>;

  /**
   * List all available harnesses with their status
   */
  readonly listHarnesses: () => Effect.Effect<Array<{ id: HarnessId; installed: boolean; configPath: string }>, never>;

  /**
   * Compare two profiles or a profile vs current harness config
   */
  readonly diff: (
    profile1: string,
    profile2?: string
  ) => Effect.Effect<
    { differences: ProfileDiffItem[]; identical: boolean },
    ProfileNotFoundError | ProfileConfigError
  >;

  /**
   * Compare a profile to current harness config
   */
  readonly diffWithHarness: (
    profileName: string,
    harnessId: HarnessId
  ) => Effect.Effect<
    { differences: ProfileDiffItem[]; identical: boolean },
    ProfileNotFoundError | ProfileConfigError | UnknownHarnessError | HarnessNotInstalledError | ProfileExtractionError
  >;
}

// Service tag
export class ProfileService extends Context.Tag("ProfileService")<
  ProfileService,
  ProfileServiceImpl
>() {}

// Service implementation factory (uses Effect.gen for service dependencies)
const makeProfileService = Effect.gen(function* () {
  // Yield dependencies at service creation time
  const extractor = yield* HarnessExtractor;
  const applicator = yield* HarnessApplicator;

  return {
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

        // Create profile - either from harness or empty
        let profile: Profile;

        if (options?.fromHarness) {
          // Extract configuration from the harness using captured extractor
          profile = yield* extractor.createProfile(
            name,
            options.fromHarness,
            options.description
          );
        } else {
          profile = createEmptyProfile(name, options?.description);
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

    apply: (name: string, harnesses: HarnessId[], options?: { skipBackup?: boolean }) =>
      Effect.gen(function* () {
        const profile = yield* readProfile(name);

        // Apply to each harness
        for (const harnessId of harnesses) {
          yield* applicator.apply(name, harnessId, {
            skipBackup: options?.skipBackup,
            createMarker: true,
          });
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
      }),

    remove: (name: string, harnesses: HarnessId[], options?: { skipBackup?: boolean }) =>
      Effect.gen(function* () {
        const profile = yield* readProfile(name);

        // Remove from each harness
        for (const harnessId of harnesses) {
          yield* applicator.remove(name, harnessId, {
            skipBackup: options?.skipBackup,
          });
        }

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

    diff: (profile1Name: string, profile2Name?: string) =>
      Effect.gen(function* () {
        const p1 = yield* readProfile(profile1Name);

        // If no second profile, return empty diff (profile vs itself)
        if (!profile2Name) {
          return { differences: [], identical: true };
        }

        const p2 = yield* readProfile(profile2Name);
        const differences: ProfileDiffItem[] = [];

        // Compare skills
        const p1Skills = new Set(p1.skills);
        const p2Skills = new Set(p2.skills);

        for (const skill of p1Skills) {
          if (!p2Skills.has(skill)) {
            differences.push({
              category: "skill",
              item: skill,
              changeType: "removed",
              details: `Only in ${profile1Name}`,
            });
          }
        }

        for (const skill of p2Skills) {
          if (!p1Skills.has(skill)) {
            differences.push({
              category: "skill",
              item: skill,
              changeType: "added",
              details: `Only in ${profile2Name}`,
            });
          }
        }

        // Compare commands
        const p1Commands = new Set(p1.commands);
        const p2Commands = new Set(p2.commands);

        for (const cmd of p1Commands) {
          if (!p2Commands.has(cmd)) {
            differences.push({
              category: "command",
              item: cmd,
              changeType: "removed",
              details: `Only in ${profile1Name}`,
            });
          }
        }

        for (const cmd of p2Commands) {
          if (!p1Commands.has(cmd)) {
            differences.push({
              category: "command",
              item: cmd,
              changeType: "added",
              details: `Only in ${profile2Name}`,
            });
          }
        }

        // Compare MCP servers
        const p1McpNames = new Set(p1.mcpServers.map((s) => s.name));
        const p2McpNames = new Set(p2.mcpServers.map((s) => s.name));

        for (const mcp of p1.mcpServers) {
          if (!p2McpNames.has(mcp.name)) {
            differences.push({
              category: "mcp",
              item: mcp.name,
              changeType: "removed",
              details: `Only in ${profile1Name}`,
            });
          } else {
            // Check if enabled status differs
            const p2Mcp = p2.mcpServers.find((s) => s.name === mcp.name);
            if (p2Mcp && p2Mcp.enabled !== mcp.enabled) {
              differences.push({
                category: "mcp",
                item: mcp.name,
                changeType: "modified",
                details: `${profile1Name}: ${mcp.enabled ? "enabled" : "disabled"}, ${profile2Name}: ${p2Mcp.enabled ? "enabled" : "disabled"}`,
              });
            }
          }
        }

        for (const mcp of p2.mcpServers) {
          if (!p1McpNames.has(mcp.name)) {
            differences.push({
              category: "mcp",
              item: mcp.name,
              changeType: "added",
              details: `Only in ${profile2Name}`,
            });
          }
        }

        // Compare model preferences
        const p1Model = p1.metadata.modelPreferences?.default;
        const p2Model = p2.metadata.modelPreferences?.default;

        if (p1Model !== p2Model) {
          differences.push({
            category: "model",
            item: "default",
            changeType: "modified",
            details: `${profile1Name}: ${p1Model || "(none)"}, ${profile2Name}: ${p2Model || "(none)"}`,
          });
        }

        // Compare theme
        if (p1.metadata.theme !== p2.metadata.theme) {
          differences.push({
            category: "theme",
            item: "theme",
            changeType: "modified",
            details: `${profile1Name}: ${p1.metadata.theme || "(none)"}, ${profile2Name}: ${p2.metadata.theme || "(none)"}`,
          });
        }

        return { differences, identical: differences.length === 0 };
      }),

    diffWithHarness: (profileName: string, harnessId: HarnessId) =>
      Effect.gen(function* () {
        const profile = yield* readProfile(profileName);

        // Extract current harness config
        const harnessConfig = yield* extractor.extract(harnessId);
        const differences: ProfileDiffItem[] = [];

        // Compare skills
        const profileSkills = new Set(profile.skills);
        const harnessSkills = new Set(harnessConfig.skills);

        for (const skill of profileSkills) {
          if (!harnessSkills.has(skill)) {
            differences.push({
              category: "skill",
              item: skill,
              changeType: "added",
              details: `Would add from profile`,
            });
          }
        }

        for (const skill of harnessSkills) {
          if (!profileSkills.has(skill)) {
            differences.push({
              category: "skill",
              item: skill,
              changeType: "removed",
              details: `In harness but not in profile`,
            });
          }
        }

        // Compare commands
        const profileCommands = new Set(profile.commands);
        const harnessCommands = new Set(harnessConfig.commands);

        for (const cmd of profileCommands) {
          if (!harnessCommands.has(cmd)) {
            differences.push({
              category: "command",
              item: cmd,
              changeType: "added",
              details: `Would add from profile`,
            });
          }
        }

        for (const cmd of harnessCommands) {
          if (!profileCommands.has(cmd)) {
            differences.push({
              category: "command",
              item: cmd,
              changeType: "removed",
              details: `In harness but not in profile`,
            });
          }
        }

        // Compare MCP servers
        const profileMcpNames = new Set(profile.mcpServers.map((s) => s.name));
        const harnessMcpNames = new Set(harnessConfig.mcpServers.map((s) => s.name));

        for (const mcp of profile.mcpServers) {
          if (!harnessMcpNames.has(mcp.name)) {
            differences.push({
              category: "mcp",
              item: mcp.name,
              changeType: "added",
              details: `Would add from profile`,
            });
          }
        }

        for (const mcp of harnessConfig.mcpServers) {
          if (!profileMcpNames.has(mcp.name)) {
            differences.push({
              category: "mcp",
              item: mcp.name,
              changeType: "removed",
              details: `In harness but not in profile`,
            });
          }
        }

        // Compare model
        const profileModel = profile.metadata.modelPreferences?.default;
        const harnessModel = harnessConfig.model;

        if (profileModel && harnessModel && profileModel !== harnessModel) {
          differences.push({
            category: "model",
            item: "default",
            changeType: "modified",
            details: `Profile: ${profileModel}, Harness: ${harnessModel}`,
          });
        } else if (profileModel && !harnessModel) {
          differences.push({
            category: "model",
            item: "default",
            changeType: "added",
            details: `Would set to ${profileModel}`,
          });
        } else if (!profileModel && harnessModel) {
          differences.push({
            category: "model",
            item: "default",
            changeType: "removed",
            details: `Harness has ${harnessModel}`,
          });
        }

        // Compare theme
        const profileTheme = profile.metadata.theme;
        const harnessTheme = harnessConfig.theme;

        if (profileTheme !== harnessTheme) {
          if (profileTheme && harnessTheme) {
            differences.push({
              category: "theme",
              item: "theme",
              changeType: "modified",
              details: `Profile: ${profileTheme}, Harness: ${harnessTheme}`,
            });
          } else if (profileTheme) {
            differences.push({
              category: "theme",
              item: "theme",
              changeType: "added",
              details: `Would set to ${profileTheme}`,
            });
          } else if (harnessTheme) {
            differences.push({
              category: "theme",
              item: "theme",
              changeType: "removed",
              details: `Harness has ${harnessTheme}`,
            });
          }
        }

        return { differences, identical: differences.length === 0 };
      }),
  } satisfies ProfileServiceImpl;
});

// Live layer - uses Layer.effect since service creation is effectful
export const ProfileServiceLive = Layer.effect(ProfileService, makeProfileService);
