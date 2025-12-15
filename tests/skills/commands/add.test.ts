/**
 * Tests for skills add command
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { skillsAdd } from "../../../src/commands/skills/add";
import { SkillCacheService } from "../../../src/services/skills/skill-cache-service";
import type { ParsedArgs } from "../../../src/cli/parser";
import type { CachedSkill, SkillManifest } from "../../../src/services/skills/skill-cache-service";
import { SkillSourceError } from "../../../src/models/skill-errors";

const createParsedArgs = (overrides?: Partial<ParsedArgs>): ParsedArgs => ({
  command: "skills",
  subcommand: "add",
  args: [],
  flags: {},
  ...overrides,
});

const createMockCachedSkill = (name: string): CachedSkill => ({
  manifest: {
    name,
    version: "1.0.0",
    description: `Test skill ${name}`,
    type: "prompt",
  },
  cachedAt: new Date(),
  source: "test",
  skillMdPath: `/test/cache/${name}/SKILL.md`,
});

const createMockCacheService = (
  onInstall?: (source: string) => void
): typeof SkillCacheService.Service => ({
  isCached: () => Effect.succeed(false),
  getCached: () => Effect.succeed(createMockCachedSkill("test")),
  listCached: () => Effect.succeed([]),
  updateIndex: () => Effect.void,
  validateManifest: () => Effect.succeed({} as SkillManifest),
  installFromGitHub: (source) =>
    Effect.gen(function* () {
      if (onInstall) onInstall(source.owner + "/" + source.repo);
      return createMockCachedSkill("test-skill");
    }),
  installFromLocal: (path) =>
    Effect.gen(function* () {
      if (onInstall) onInstall(path);
      return createMockCachedSkill("local-skill");
    }),
  uninstall: () => Effect.void,
  clear: () => Effect.void,
});

describe("skills add command", () => {
  it("should add skill from GitHub URL", async () => {
    let installedSource: string | undefined;
    const mockCache = createMockCacheService((source) => {
      installedSource = source;
    });
    const TestLayer = Layer.succeed(SkillCacheService, mockCache);

    const args = createParsedArgs({
      args: ["github:owner/repo"],
    });

    const program = skillsAdd(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(installedSource).toBe("owner/repo");
  });

  it("should normalize GitHub HTTPS URL", async () => {
    let installedSource: string | undefined;
    const mockCache = createMockCacheService((source) => {
      installedSource = source;
    });
    const TestLayer = Layer.succeed(SkillCacheService, mockCache);

    const args = createParsedArgs({
      args: ["https://github.com/owner/repo"],
    });

    const program = skillsAdd(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(installedSource).toBe("owner/repo");
  });

  it("should normalize GitHub SSH URL", async () => {
    let installedSource: string | undefined;
    const mockCache = createMockCacheService((source) => {
      installedSource = source;
    });
    const TestLayer = Layer.succeed(SkillCacheService, mockCache);

    const args = createParsedArgs({
      args: ["git@github.com:owner/repo.git"],
    });

    const program = skillsAdd(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(installedSource).toBe("owner/repo");
  });

  it("should fail with no source argument", async () => {
    const mockCache = createMockCacheService();
    const TestLayer = Layer.succeed(SkillCacheService, mockCache);

    const args = createParsedArgs({
      args: [],
    });

    const program = skillsAdd(args).pipe(Effect.provide(TestLayer));

    const result = await Effect.runPromise(Effect.either(program));

    expect(result._tag).toBe("Left");
  });

  it("should install from local path", async () => {
    let installedPath: string | undefined;
    const mockCache = createMockCacheService((path) => {
      installedPath = path;
    });
    const TestLayer = Layer.succeed(SkillCacheService, mockCache);

    const args = createParsedArgs({
      args: ["/local/path/to/skill"],
    });

    const program = skillsAdd(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(installedPath).toBe("/local/path/to/skill");
  });

  it("should handle GitHub URL with ref", async () => {
    let installedSource: string | undefined;
    const mockCache = createMockCacheService((source) => {
      installedSource = source;
    });
    const TestLayer = Layer.succeed(SkillCacheService, mockCache);

    const args = createParsedArgs({
      args: ["github:owner/repo@main"],
    });

    const program = skillsAdd(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(installedSource).toBe("owner/repo");
  });
});
