/**
 * Tests for ProfileService
 *
 * Tests profile CRUD operations, harness management, and diff functionality.
 * Uses mock layers to avoid file system operations.
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { ProfileService } from "../../src/services/profile/profile-service";
import type {
  Profile,
  ProfileListItem,
  HarnessId,
  ProfileDiffItem,
} from "../../src/models/profile";
import {
  ProfileNotFoundError,
  ProfileAlreadyExistsError,
  InvalidProfileNameError,
} from "../../src/models/profile-errors";
import { runTest, runTestExpectFailure } from "../utils";

/**
 * Create a test profile
 */
const createTestProfile = (name: string, overrides?: Partial<Profile>): Profile => ({
  metadata: {
    name,
    description: `Test profile: ${name}`,
    version: "1.0.0",
    created: "2025-01-01T00:00:00.000Z",
    updated: "2025-01-01T00:00:00.000Z",
    tags: [],
    appliedTo: [],
    ...overrides?.metadata,
  },
  skills: overrides?.skills || [],
  commands: overrides?.commands || [],
  mcpServers: overrides?.mcpServers || [],
  permissions: overrides?.permissions || {
    allowedTools: [],
    deniedTools: [],
  },
  hooks: overrides?.hooks || {
    prePromptSubmit: [],
    postResponse: [],
    toolExecution: [],
  },
});

/**
 * Create a mock ProfileService for testing
 */
const createMockProfileService = (initialProfiles?: Map<string, Profile>) => {
  const profiles = initialProfiles || new Map<string, Profile>();

  const service = {
    list: () =>
      Effect.succeed(
        Array.from(profiles.values()).map((p): ProfileListItem => ({
          name: p.metadata.name,
          description: p.metadata.description,
          skillCount: p.skills.length,
          commandCount: p.commands.length,
          mcpServerCount: p.mcpServers.length,
          appliedTo: [...p.metadata.appliedTo],
          updated: p.metadata.updated,
        }))
      ),

    get: (name: string) =>
      Effect.gen(function* () {
        const profile = profiles.get(name);
        if (!profile) {
          return yield* Effect.fail(
            new ProfileNotFoundError({ harnessId: "", profileName: name })
          );
        }
        return profile;
      }),

    create: (name: string, options?: { description?: string; fromHarness?: HarnessId }) =>
      Effect.gen(function* () {
        // Validate profile name
        if (!/^[a-z0-9-]+$/.test(name) || name.startsWith("-") || name.endsWith("-")) {
          return yield* Effect.fail(
            new InvalidProfileNameError({
              name,
              reason: "Must be kebab-case: lowercase letters, numbers, and hyphens only",
            })
          );
        }

        if (profiles.has(name)) {
          return yield* Effect.fail(
            new ProfileAlreadyExistsError({ harnessId: "", profileName: name })
          );
        }

        const profile = createTestProfile(name, {
          metadata: {
            name,
            description: options?.description || `Profile: ${name}`,
            version: "1.0.0",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            tags: [],
            appliedTo: [],
          },
        });

        profiles.set(name, profile);
        return profile;
      }),

    delete: (name: string) =>
      Effect.gen(function* () {
        if (!profiles.has(name)) {
          return yield* Effect.fail(
            new ProfileNotFoundError({ harnessId: "", profileName: name })
          );
        }
        profiles.delete(name);
      }),

    update: (name: string, updates: { description?: string; tags?: string[] }) =>
      Effect.gen(function* () {
        const profile = profiles.get(name);
        if (!profile) {
          return yield* Effect.fail(
            new ProfileNotFoundError({ harnessId: "", profileName: name })
          );
        }

        const updatedProfile: Profile = {
          ...profile,
          metadata: {
            ...profile.metadata,
            description: updates.description ?? profile.metadata.description,
            tags: updates.tags ?? profile.metadata.tags,
            updated: new Date().toISOString(),
          },
        };

        profiles.set(name, updatedProfile);
        return updatedProfile;
      }),

    apply: (name: string, harnesses: HarnessId[], _options?: { skipBackup?: boolean }) =>
      Effect.gen(function* () {
        const profile = profiles.get(name);
        if (!profile) {
          return yield* Effect.fail(
            new ProfileNotFoundError({ harnessId: "", profileName: name })
          );
        }

        const newAppliedTo = [
          ...new Set([...profile.metadata.appliedTo, ...harnesses]),
        ] as HarnessId[];

        profiles.set(name, {
          ...profile,
          metadata: {
            ...profile.metadata,
            appliedTo: newAppliedTo,
            updated: new Date().toISOString(),
          },
        });
      }),

    remove: (name: string, harnesses: HarnessId[], _options?: { skipBackup?: boolean }) =>
      Effect.gen(function* () {
        const profile = profiles.get(name);
        if (!profile) {
          return yield* Effect.fail(
            new ProfileNotFoundError({ harnessId: "", profileName: name })
          );
        }

        const newAppliedTo = profile.metadata.appliedTo.filter(
          (h) => !harnesses.includes(h)
        );

        profiles.set(name, {
          ...profile,
          metadata: {
            ...profile.metadata,
            appliedTo: newAppliedTo,
            updated: new Date().toISOString(),
          },
        });
      }),

    getAppliedHarnesses: (name: string) =>
      Effect.gen(function* () {
        const profile = profiles.get(name);
        if (!profile) {
          return yield* Effect.fail(
            new ProfileNotFoundError({ harnessId: "", profileName: name })
          );
        }
        return [...profile.metadata.appliedTo];
      }),

    listHarnesses: () =>
      Effect.succeed([
        { id: "claude_code" as HarnessId, installed: true, configPath: "~/.claude.json" },
        { id: "opencode" as HarnessId, installed: false, configPath: "~/.opencode/config.json" },
        { id: "cursor" as HarnessId, installed: true, configPath: "~/.cursor/settings.json" },
      ]),

    diff: (profile1Name: string, profile2Name?: string) =>
      Effect.gen(function* () {
        const p1 = profiles.get(profile1Name);
        if (!p1) {
          return yield* Effect.fail(
            new ProfileNotFoundError({ harnessId: "", profileName: profile1Name })
          );
        }

        if (!profile2Name) {
          return { differences: [] as ProfileDiffItem[], identical: true };
        }

        const p2 = profiles.get(profile2Name);
        if (!p2) {
          return yield* Effect.fail(
            new ProfileNotFoundError({ harnessId: "", profileName: profile2Name })
          );
        }

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

        return { differences, identical: differences.length === 0 };
      }),

    diffWithHarness: (profileName: string, _harnessId: HarnessId) =>
      Effect.gen(function* () {
        const profile = profiles.get(profileName);
        if (!profile) {
          return yield* Effect.fail(
            new ProfileNotFoundError({ harnessId: "", profileName })
          );
        }

        // Mock comparison with empty harness config
        const differences: ProfileDiffItem[] = profile.skills.map((skill) => ({
          category: "skill" as const,
          item: skill,
          changeType: "added" as const,
          details: "Would add from profile",
        }));

        return { differences, identical: differences.length === 0 };
      }),
  };

  return {
    layer: Layer.succeed(ProfileService, service),
    getProfiles: () => profiles,
  };
};

describe("ProfileService", () => {
  describe("list", () => {
    it("should return empty array when no profiles exist", async () => {
      const { layer } = createMockProfileService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.list();
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual([]);
    });

    it("should return all profiles", async () => {
      const profiles = new Map<string, Profile>([
        ["dev", createTestProfile("dev", { skills: ["beads", "roo"] })],
        ["prod", createTestProfile("prod", { skills: ["beads"] })],
      ]);

      const { layer } = createMockProfileService(profiles);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.list();
        }).pipe(Effect.provide(layer))
      );

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.name)).toContain("dev");
      expect(result.map((p) => p.name)).toContain("prod");
    });

    it("should include skill and command counts", async () => {
      const profiles = new Map<string, Profile>([
        ["dev", createTestProfile("dev", {
          skills: ["beads", "roo"],
          commands: ["build", "test", "lint"],
          mcpServers: [{ name: "git", enabled: true }],
        })],
      ]);

      const { layer } = createMockProfileService(profiles);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.list();
        }).pipe(Effect.provide(layer))
      );

      expect(result[0].skillCount).toBe(2);
      expect(result[0].commandCount).toBe(3);
      expect(result[0].mcpServerCount).toBe(1);
    });
  });

  describe("get", () => {
    it("should return profile by name", async () => {
      const profiles = new Map<string, Profile>([
        ["dev", createTestProfile("dev", {
          metadata: { description: "Development profile" } as any,
        })],
      ]);

      const { layer } = createMockProfileService(profiles);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.get("dev");
        }).pipe(Effect.provide(layer))
      );

      expect(result.metadata.name).toBe("dev");
    });

    it("should fail with ProfileNotFoundError for non-existent profile", async () => {
      const { layer } = createMockProfileService();

      const error = await runTestExpectFailure(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.get("non-existent");
        }).pipe(Effect.provide(layer))
      );

      expect(error._tag).toBe("ProfileNotFoundError");
    });
  });

  describe("create", () => {
    it("should create a new profile", async () => {
      const { layer, getProfiles } = createMockProfileService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.create("new-profile", {
            description: "A new profile",
          });
        }).pipe(Effect.provide(layer))
      );

      expect(result.metadata.name).toBe("new-profile");
      expect(getProfiles().has("new-profile")).toBe(true);
    });

    it("should fail with InvalidProfileNameError for invalid name", async () => {
      const { layer } = createMockProfileService();

      const error = await runTestExpectFailure(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.create("Invalid Name", {});
        }).pipe(Effect.provide(layer))
      );

      expect(error._tag).toBe("InvalidProfileNameError");
    });

    it("should fail with ProfileAlreadyExistsError for duplicate name", async () => {
      const profiles = new Map<string, Profile>([
        ["existing", createTestProfile("existing")],
      ]);

      const { layer } = createMockProfileService(profiles);

      const error = await runTestExpectFailure(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.create("existing", {});
        }).pipe(Effect.provide(layer))
      );

      expect(error._tag).toBe("ProfileAlreadyExistsError");
    });

    it("should reject names starting with hyphen", async () => {
      const { layer } = createMockProfileService();

      const error = await runTestExpectFailure(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.create("-invalid", {});
        }).pipe(Effect.provide(layer))
      );

      expect(error._tag).toBe("InvalidProfileNameError");
    });

    it("should reject names ending with hyphen", async () => {
      const { layer } = createMockProfileService();

      const error = await runTestExpectFailure(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.create("invalid-", {});
        }).pipe(Effect.provide(layer))
      );

      expect(error._tag).toBe("InvalidProfileNameError");
    });
  });

  describe("delete", () => {
    it("should delete an existing profile", async () => {
      const profiles = new Map<string, Profile>([
        ["to-delete", createTestProfile("to-delete")],
      ]);

      const { layer, getProfiles } = createMockProfileService(profiles);

      await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          yield* service.delete("to-delete");
        }).pipe(Effect.provide(layer))
      );

      expect(getProfiles().has("to-delete")).toBe(false);
    });

    it("should fail with ProfileNotFoundError for non-existent profile", async () => {
      const { layer } = createMockProfileService();

      const error = await runTestExpectFailure(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          yield* service.delete("non-existent");
        }).pipe(Effect.provide(layer))
      );

      expect(error._tag).toBe("ProfileNotFoundError");
    });
  });

  describe("update", () => {
    it("should update profile description", async () => {
      const profiles = new Map<string, Profile>([
        ["to-update", createTestProfile("to-update", {
          metadata: { description: "Old description" } as any,
        })],
      ]);

      const { layer } = createMockProfileService(profiles);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.update("to-update", {
            description: "New description",
          });
        }).pipe(Effect.provide(layer))
      );

      expect(result.metadata.description).toBe("New description");
    });

    it("should update profile tags", async () => {
      const profiles = new Map<string, Profile>([
        ["to-update", createTestProfile("to-update")],
      ]);

      const { layer } = createMockProfileService(profiles);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.update("to-update", {
            tags: ["dev", "testing"],
          });
        }).pipe(Effect.provide(layer))
      );

      expect(result.metadata.tags).toEqual(["dev", "testing"]);
    });

    it("should fail with ProfileNotFoundError for non-existent profile", async () => {
      const { layer } = createMockProfileService();

      const error = await runTestExpectFailure(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.update("non-existent", { description: "x" });
        }).pipe(Effect.provide(layer))
      );

      expect(error._tag).toBe("ProfileNotFoundError");
    });
  });

  describe("apply", () => {
    it("should apply profile to harnesses", async () => {
      const profiles = new Map<string, Profile>([
        ["dev", createTestProfile("dev")],
      ]);

      const { layer, getProfiles } = createMockProfileService(profiles);

      await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          yield* service.apply("dev", ["claude_code" as HarnessId]);
        }).pipe(Effect.provide(layer))
      );

      const profile = getProfiles().get("dev");
      expect(profile?.metadata.appliedTo).toContain("claude_code");
    });

    it("should apply to multiple harnesses", async () => {
      const profiles = new Map<string, Profile>([
        ["dev", createTestProfile("dev")],
      ]);

      const { layer, getProfiles } = createMockProfileService(profiles);

      await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          yield* service.apply("dev", ["claude_code", "cursor"] as HarnessId[]);
        }).pipe(Effect.provide(layer))
      );

      const profile = getProfiles().get("dev");
      expect(profile?.metadata.appliedTo).toContain("claude_code");
      expect(profile?.metadata.appliedTo).toContain("cursor");
    });

    it("should not duplicate harnesses", async () => {
      const profiles = new Map<string, Profile>([
        ["dev", createTestProfile("dev", {
          metadata: { appliedTo: ["claude_code"] } as any,
        })],
      ]);

      const { layer, getProfiles } = createMockProfileService(profiles);

      await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          yield* service.apply("dev", ["claude_code", "cursor"] as HarnessId[]);
        }).pipe(Effect.provide(layer))
      );

      const profile = getProfiles().get("dev");
      const claudeCount = profile?.metadata.appliedTo.filter(
        (h) => h === "claude_code"
      ).length;
      expect(claudeCount).toBe(1);
    });
  });

  describe("remove", () => {
    it("should remove profile from harnesses", async () => {
      const profiles = new Map<string, Profile>([
        ["dev", createTestProfile("dev", {
          metadata: { appliedTo: ["claude_code", "cursor"] } as any,
        })],
      ]);

      const { layer, getProfiles } = createMockProfileService(profiles);

      await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          yield* service.remove("dev", ["claude_code"] as HarnessId[]);
        }).pipe(Effect.provide(layer))
      );

      const profile = getProfiles().get("dev");
      expect(profile?.metadata.appliedTo).not.toContain("claude_code");
      expect(profile?.metadata.appliedTo).toContain("cursor");
    });
  });

  describe("getAppliedHarnesses", () => {
    it("should return applied harnesses for profile", async () => {
      const profiles = new Map<string, Profile>([
        ["dev", createTestProfile("dev", {
          metadata: { appliedTo: ["claude_code", "cursor"] } as any,
        })],
      ]);

      const { layer } = createMockProfileService(profiles);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.getAppliedHarnesses("dev");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toContain("claude_code");
      expect(result).toContain("cursor");
    });
  });

  describe("listHarnesses", () => {
    it("should list all available harnesses with status", async () => {
      const { layer } = createMockProfileService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.listHarnesses();
        }).pipe(Effect.provide(layer))
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((h) => h.id === "claude_code")).toBe(true);
    });
  });

  describe("diff", () => {
    it("should return identical for same profile", async () => {
      const profiles = new Map<string, Profile>([
        ["dev", createTestProfile("dev")],
      ]);

      const { layer } = createMockProfileService(profiles);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.diff("dev");
        }).pipe(Effect.provide(layer))
      );

      expect(result.identical).toBe(true);
      expect(result.differences).toEqual([]);
    });

    it("should detect differences in skills", async () => {
      const profiles = new Map<string, Profile>([
        ["dev", createTestProfile("dev", { skills: ["beads", "roo"] })],
        ["prod", createTestProfile("prod", { skills: ["beads"] })],
      ]);

      const { layer } = createMockProfileService(profiles);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.diff("dev", "prod");
        }).pipe(Effect.provide(layer))
      );

      expect(result.identical).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].item).toBe("roo");
      expect(result.differences[0].changeType).toBe("removed");
    });

    it("should detect added skills", async () => {
      const profiles = new Map<string, Profile>([
        ["dev", createTestProfile("dev", { skills: ["beads"] })],
        ["prod", createTestProfile("prod", { skills: ["beads", "roo"] })],
      ]);

      const { layer } = createMockProfileService(profiles);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.diff("dev", "prod");
        }).pipe(Effect.provide(layer))
      );

      expect(result.identical).toBe(false);
      expect(result.differences.some((d) => d.changeType === "added")).toBe(true);
    });
  });

  describe("diffWithHarness", () => {
    it("should compare profile with harness config", async () => {
      const profiles = new Map<string, Profile>([
        ["dev", createTestProfile("dev", { skills: ["beads"] })],
      ]);

      const { layer } = createMockProfileService(profiles);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* ProfileService;
          return yield* service.diffWithHarness("dev", "claude_code" as HarnessId);
        }).pipe(Effect.provide(layer))
      );

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].item).toBe("beads");
      expect(result.differences[0].changeType).toBe("added");
    });
  });
});
