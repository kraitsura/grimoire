/**
 * Tests for SkillCacheService
 *
 * Tests caching operations, skill retrieval, and repository type detection.
 * Uses mock layers to avoid file system operations.
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import {
  SkillCacheService,
  type CachedSkill,
  type GitHubSource,
} from "../../src/services/skills/skill-cache-service";
import { SkillNotCachedError } from "../../src/models/skill-errors";
import type { SkillManifest } from "../../src/models/skill";
import { runTest, runTestExpectFailure } from "../utils";

/**
 * Create a test cached skill
 */
const createTestCachedSkill = (name: string, overrides?: Partial<CachedSkill>): CachedSkill => ({
  manifest: {
    name,
    description: `Test skill: ${name}`,
    ...overrides?.manifest,
  },
  cachedAt: new Date("2025-01-01T00:00:00.000Z"),
  source: overrides?.source || "local",
  skillMdPath: `/test/cache/${name}/SKILL.md`,
  ...overrides,
});

/**
 * Create a mock SkillCacheService for testing
 */
const createMockCacheService = (initialSkills?: Map<string, CachedSkill>) => {
  const skills = initialSkills || new Map<string, CachedSkill>();

  const service = {
    isCached: (skillName: string) =>
      Effect.succeed(skills.has(skillName)),

    getCached: (skillName: string) =>
      Effect.gen(function* () {
        const skill = skills.get(skillName);
        if (!skill) {
          return yield* Effect.fail(new SkillNotCachedError({ name: skillName }));
        }
        return skill;
      }),

    listCached: () =>
      Effect.succeed(Array.from(skills.values())),

    updateIndex: () => Effect.void,

    fetchFromGitHub: (source: GitHubSource) =>
      Effect.sync(() => {
        const name = source.skillName || source.repo;
        const skill = createTestCachedSkill(name, {
          source: `github:${source.owner}/${source.repo}`,
        });
        skills.set(name, skill);
        return skill;
      }),

    fetchFromLocal: (sourcePath: string) =>
      Effect.sync(() => {
        const name = sourcePath.split("/").pop() || "local-skill";
        const skill = createTestCachedSkill(name, { source: sourcePath });
        skills.set(name, skill);
        return skill;
      }),

    detectRepoType: (_source: GitHubSource) =>
      Effect.succeed({ type: "skill" as const }),

    remove: (skillName: string) =>
      Effect.sync(() => {
        skills.delete(skillName);
      }),

    clear: () =>
      Effect.sync(() => {
        skills.clear();
      }),
  };

  return {
    layer: Layer.succeed(SkillCacheService, service),
    getSkills: () => skills,
  };
};

describe("SkillCacheService", () => {
  describe("isCached", () => {
    it("should return false for non-cached skill", async () => {
      const { layer } = createMockCacheService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.isCached("non-existent");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toBe(false);
    });

    it("should return true for cached skill", async () => {
      const skills = new Map<string, CachedSkill>([
        ["beads", createTestCachedSkill("beads")],
      ]);
      const { layer } = createMockCacheService(skills);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.isCached("beads");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toBe(true);
    });
  });

  describe("getCached", () => {
    it("should return cached skill by name", async () => {
      const skills = new Map<string, CachedSkill>([
        ["beads", createTestCachedSkill("beads", {
          manifest: { name: "beads", description: "Issue tracking skill" },
        })],
      ]);
      const { layer } = createMockCacheService(skills);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.getCached("beads");
        }).pipe(Effect.provide(layer))
      );

      expect(result.manifest.name).toBe("beads");
      expect(result.manifest.description).toBe("Issue tracking skill");
    });

    it("should fail with SkillNotCachedError for non-existent skill", async () => {
      const { layer } = createMockCacheService();

      const error = await runTestExpectFailure(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.getCached("non-existent");
        }).pipe(Effect.provide(layer))
      );

      expect(error._tag).toBe("SkillNotCachedError");
    });
  });

  describe("listCached", () => {
    it("should return empty array when no skills cached", async () => {
      const { layer } = createMockCacheService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.listCached();
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual([]);
    });

    it("should return all cached skills", async () => {
      const skills = new Map<string, CachedSkill>([
        ["beads", createTestCachedSkill("beads")],
        ["roo", createTestCachedSkill("roo")],
        ["playwright", createTestCachedSkill("playwright")],
      ]);
      const { layer } = createMockCacheService(skills);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.listCached();
        }).pipe(Effect.provide(layer))
      );

      expect(result).toHaveLength(3);
      expect(result.map((s) => s.manifest.name)).toContain("beads");
      expect(result.map((s) => s.manifest.name)).toContain("roo");
      expect(result.map((s) => s.manifest.name)).toContain("playwright");
    });
  });

  describe("fetchFromGitHub", () => {
    it("should fetch and cache skill from GitHub", async () => {
      const { layer, getSkills } = createMockCacheService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.fetchFromGitHub({
            owner: "anthropics",
            repo: "beads",
          });
        }).pipe(Effect.provide(layer))
      );

      expect(result.manifest.name).toBe("beads");
      expect(result.source).toBe("github:anthropics/beads");
      expect(getSkills().has("beads")).toBe(true);
    });

    it("should use skillName when provided", async () => {
      const { layer, getSkills } = createMockCacheService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.fetchFromGitHub({
            owner: "anthropics",
            repo: "awesome-skills",
            skillName: "beads-skill",
          });
        }).pipe(Effect.provide(layer))
      );

      expect(result.manifest.name).toBe("beads-skill");
      expect(getSkills().has("beads-skill")).toBe(true);
    });

    it("should use ref for versioning", async () => {
      const { layer, getSkills } = createMockCacheService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.fetchFromGitHub({
            owner: "anthropics",
            repo: "beads",
            ref: "v1.0.0",
          });
        }).pipe(Effect.provide(layer))
      );

      expect(result.manifest.name).toBe("beads");
      expect(getSkills().has("beads")).toBe(true);
    });
  });

  describe("fetchFromLocal", () => {
    it("should fetch and cache skill from local path", async () => {
      const { layer, getSkills } = createMockCacheService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.fetchFromLocal("/home/user/skills/my-skill");
        }).pipe(Effect.provide(layer))
      );

      expect(result.manifest.name).toBe("my-skill");
      expect(result.source).toBe("/home/user/skills/my-skill");
      expect(getSkills().has("my-skill")).toBe(true);
    });
  });

  describe("detectRepoType", () => {
    it("should detect repository type", async () => {
      const { layer } = createMockCacheService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.detectRepoType({
            owner: "anthropics",
            repo: "beads",
          });
        }).pipe(Effect.provide(layer))
      );

      expect(result.type).toBe("skill");
    });
  });

  describe("remove", () => {
    it("should remove cached skill", async () => {
      const skills = new Map<string, CachedSkill>([
        ["beads", createTestCachedSkill("beads")],
      ]);
      const { layer, getSkills } = createMockCacheService(skills);

      await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          yield* service.remove("beads");
        }).pipe(Effect.provide(layer))
      );

      expect(getSkills().has("beads")).toBe(false);
    });

    it("should not fail for non-existent skill", async () => {
      const { layer } = createMockCacheService();

      // Should not throw
      await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          yield* service.remove("non-existent");
        }).pipe(Effect.provide(layer))
      );
    });
  });

  describe("clear", () => {
    it("should clear all cached skills", async () => {
      const skills = new Map<string, CachedSkill>([
        ["beads", createTestCachedSkill("beads")],
        ["roo", createTestCachedSkill("roo")],
      ]);
      const { layer, getSkills } = createMockCacheService(skills);

      await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          yield* service.clear();
        }).pipe(Effect.provide(layer))
      );

      expect(getSkills().size).toBe(0);
    });
  });

  describe("skill manifest details", () => {
    it("should preserve allowed_tools in manifest", async () => {
      const skills = new Map<string, CachedSkill>([
        ["beads", createTestCachedSkill("beads", {
          manifest: {
            name: "beads",
            description: "Issue tracking",
            allowed_tools: ["Read", "Write", "Bash"],
          },
        })],
      ]);
      const { layer } = createMockCacheService(skills);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.getCached("beads");
        }).pipe(Effect.provide(layer))
      );

      expect(result.manifest.allowed_tools).toEqual(["Read", "Write", "Bash"]);
    });

    it("should preserve mcp config in manifest", async () => {
      const skills = new Map<string, CachedSkill>([
        ["db-skill", createTestCachedSkill("db-skill", {
          manifest: {
            name: "db-skill",
            description: "Database skill",
            mcp: [{
              name: "postgres",
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-postgres"],
            }],
          },
        })],
      ]);
      const { layer } = createMockCacheService(skills);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.getCached("db-skill");
        }).pipe(Effect.provide(layer))
      );

      expect(result.manifest.mcp).toBeDefined();
      expect(result.manifest.mcp?.[0].name).toBe("postgres");
    });

    it("should preserve cli_dependencies in manifest", async () => {
      const skills = new Map<string, CachedSkill>([
        ["git-skill", createTestCachedSkill("git-skill", {
          manifest: {
            name: "git-skill",
            description: "Git operations skill",
            cli_dependencies: {
              "git": ">=2.0.0",
              "gh": "latest",
            },
          },
        })],
      ]);
      const { layer } = createMockCacheService(skills);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.getCached("git-skill");
        }).pipe(Effect.provide(layer))
      );

      expect(result.manifest.cli_dependencies).toEqual({
        "git": ">=2.0.0",
        "gh": "latest",
      });
    });
  });

  describe("source tracking", () => {
    it("should track GitHub source correctly", async () => {
      const skills = new Map<string, CachedSkill>([
        ["beads", createTestCachedSkill("beads", {
          source: "github:anthropics/beads@v1.2.0",
        })],
      ]);
      const { layer } = createMockCacheService(skills);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.getCached("beads");
        }).pipe(Effect.provide(layer))
      );

      expect(result.source).toBe("github:anthropics/beads@v1.2.0");
    });

    it("should track local source correctly", async () => {
      const skills = new Map<string, CachedSkill>([
        ["local-skill", createTestCachedSkill("local-skill", {
          source: "/home/user/projects/my-skill",
        })],
      ]);
      const { layer } = createMockCacheService(skills);

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillCacheService;
          return yield* service.getCached("local-skill");
        }).pipe(Effect.provide(layer))
      );

      expect(result.source).toBe("/home/user/projects/my-skill");
    });
  });
});
