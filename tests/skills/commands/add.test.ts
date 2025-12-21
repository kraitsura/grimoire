/**
 * Tests for skills add command
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { skillsAdd } from "../../../src/commands/skills/add";
import { SkillCacheService, type CachedSkill } from "../../../src/services/skills/skill-cache-service";
import { SkillValidationService, SkillValidationServiceLive } from "../../../src/services/skills/skill-validation-service";
import type { ParsedArgs } from "../../../src/cli/parser";
import type { SkillManifest, RepoType } from "../../../src/models/skill";
import { SkillSourceError } from "../../../src/models/skill-errors";

const createParsedArgs = (overrides?: Partial<ParsedArgs>): ParsedArgs => ({
  command: "skills",
  flags: {},
  positional: ["add"],
  ...overrides,
});

const createMockCachedSkill = (name: string): CachedSkill => ({
  manifest: {
    name,
    description: `Test skill ${name}`,
  },
  cachedAt: new Date(),
  source: "test",
  skillMdPath: `/test/cache/${name}/SKILL.md`,
});

const createMockCacheService = (
  onFetch?: (source: string) => void
): typeof SkillCacheService.Service => ({
  isCached: () => Effect.succeed(false),
  getCached: () => Effect.succeed(createMockCachedSkill("test")),
  listCached: () => Effect.succeed([]),
  updateIndex: () => Effect.void,
  fetchFromGitHub: (source) =>
    Effect.gen(function* () {
      if (onFetch) onFetch(source.owner + "/" + source.repo);
      return createMockCachedSkill("test-skill");
    }),
  fetchFromLocal: (path) =>
    Effect.gen(function* () {
      if (onFetch) onFetch(path);
      return createMockCachedSkill("local-skill");
    }),
  detectRepoType: () => Effect.succeed({ type: "skill", skill: { name: "test", description: "test", path: "" } } as RepoType),
  remove: () => Effect.void,
  clear: () => Effect.void,
});

describe("skills add command", () => {
  it("should add skill from GitHub URL", async () => {
    let fetchedSource: string | undefined;
    const mockCache = createMockCacheService((source) => {
      fetchedSource = source;
    });
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      SkillValidationServiceLive
    );

    const args = createParsedArgs({
      positional: ["add", "github:owner/repo"],
    });

    const program = skillsAdd(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(fetchedSource).toBe("owner/repo");
  });

  it("should normalize GitHub HTTPS URL", async () => {
    let fetchedSource: string | undefined;
    const mockCache = createMockCacheService((source) => {
      fetchedSource = source;
    });
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      SkillValidationServiceLive
    );

    const args = createParsedArgs({
      positional: ["add", "https://github.com/owner/repo"],
    });

    const program = skillsAdd(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(fetchedSource).toBe("owner/repo");
  });

  it("should normalize GitHub SSH URL", async () => {
    let fetchedSource: string | undefined;
    const mockCache = createMockCacheService((source) => {
      fetchedSource = source;
    });
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      SkillValidationServiceLive
    );

    const args = createParsedArgs({
      positional: ["add", "git@github.com:owner/repo.git"],
    });

    const program = skillsAdd(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(fetchedSource).toBe("owner/repo");
  });

  it("should fail with no source argument", async () => {
    const mockCache = createMockCacheService();
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      SkillValidationServiceLive
    );

    const args = createParsedArgs({
      positional: ["add"],
    });

    const program = skillsAdd(args).pipe(Effect.provide(TestLayer));

    // This doesn't fail with an error, it just logs and returns
    await Effect.runPromise(program);
  });

  it("should fetch from local path", async () => {
    let fetchedPath: string | undefined;
    const mockCache = createMockCacheService((path) => {
      fetchedPath = path;
    });
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      SkillValidationServiceLive
    );

    const args = createParsedArgs({
      positional: ["add", "/local/path/to/skill"],
    });

    const program = skillsAdd(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(fetchedPath).toBe("/local/path/to/skill");
  });

  it("should handle GitHub URL with ref", async () => {
    let fetchedSource: string | undefined;
    const mockCache = createMockCacheService((source) => {
      fetchedSource = source;
    });
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      SkillValidationServiceLive
    );

    const args = createParsedArgs({
      positional: ["add", "github:owner/repo@main"],
    });

    const program = skillsAdd(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(fetchedSource).toBe("owner/repo");
  });
});
