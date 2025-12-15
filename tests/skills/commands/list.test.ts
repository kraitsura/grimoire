/**
 * Tests for skills list command
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { skillsList } from "../../../src/commands/skills/list";
import { SkillCacheService } from "../../../src/services/skills/skill-cache-service";
import { SkillStateService } from "../../../src/services/skills/skill-state-service";
import type { ParsedArgs } from "../../../src/cli/parser";
import type { CachedSkill, SkillManifest } from "../../../src/services/skills/skill-cache-service";

const createParsedArgs = (overrides?: Partial<ParsedArgs>): ParsedArgs => ({
  command: "skills",
  subcommand: "list",
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
  cachedSkills: CachedSkill[]
): typeof SkillCacheService.Service => ({
  isCached: (skillName: string) =>
    Effect.succeed(cachedSkills.some((s) => s.manifest.name === skillName)),
  getCached: (skillName: string) =>
    Effect.succeed(
      cachedSkills.find((s) => s.manifest.name === skillName) || createMockCachedSkill(skillName)
    ),
  listCached: () => Effect.succeed(cachedSkills),
  updateIndex: () => Effect.void,
  validateManifest: () => Effect.succeed({} as SkillManifest),
  installFromGitHub: () => Effect.succeed(createMockCachedSkill("test")),
  installFromLocal: () => Effect.succeed(createMockCachedSkill("test")),
  uninstall: () => Effect.void,
  clear: () => Effect.void,
});

const createMockStateService = (
  projects: Map<string, { agent: "claude_code" | "opencode" | "generic"; enabled: string[] }>
): typeof SkillStateService.Service => ({
  getProjectState: (projectPath: string) =>
    Effect.succeed(
      projects.has(projectPath)
        ? {
            ...projects.get(projectPath)!,
            disabled_at: {},
            initialized_at: new Date().toISOString(),
          }
        : null
    ),
  initProject: (projectPath: string, agent) =>
    Effect.sync(() => {
      projects.set(projectPath, { agent, enabled: [] });
    }),
  isInitialized: (projectPath: string) => Effect.succeed(projects.has(projectPath)),
  getEnabled: (projectPath: string) =>
    Effect.succeed(projects.get(projectPath)?.enabled || []),
  setEnabled: (projectPath: string, skills: string[]) =>
    Effect.sync(() => {
      const project = projects.get(projectPath);
      if (project) {
        project.enabled = skills;
      }
    }),
  addEnabled: (projectPath: string, skill: string) =>
    Effect.sync(() => {
      const project = projects.get(projectPath);
      if (project && !project.enabled.includes(skill)) {
        project.enabled.push(skill);
      }
    }),
  removeEnabled: (projectPath: string, skill: string) =>
    Effect.sync(() => {
      const project = projects.get(projectPath);
      if (project) {
        project.enabled = project.enabled.filter((s) => s !== skill);
      }
    }),
  recordDisable: () => Effect.void,
  updateLastSync: () => Effect.void,
});

describe("skills list command", () => {
  it("should list enabled and available skills", async () => {
    const cachedSkills = [
      createMockCachedSkill("skill1"),
      createMockCachedSkill("skill2"),
      createMockCachedSkill("skill3"),
    ];
    const projects = new Map([
      [process.cwd(), { agent: "claude_code" as const, enabled: ["skill1"] }],
    ]);

    const mockCache = createMockCacheService(cachedSkills);
    const mockState = createMockStateService(projects);
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState)
    );

    const args = createParsedArgs();

    const program = skillsList(args).pipe(Effect.provide(TestLayer));

    // Should not throw
    await Effect.runPromise(program);
  });

  it("should list all skills when none are enabled", async () => {
    const cachedSkills = [
      createMockCachedSkill("skill1"),
      createMockCachedSkill("skill2"),
    ];
    const projects = new Map([
      [process.cwd(), { agent: "claude_code" as const, enabled: [] }],
    ]);

    const mockCache = createMockCacheService(cachedSkills);
    const mockState = createMockStateService(projects);
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState)
    );

    const args = createParsedArgs();

    const program = skillsList(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
  });

  it("should handle empty cache", async () => {
    const cachedSkills: CachedSkill[] = [];
    const projects = new Map([
      [process.cwd(), { agent: "claude_code" as const, enabled: [] }],
    ]);

    const mockCache = createMockCacheService(cachedSkills);
    const mockState = createMockStateService(projects);
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState)
    );

    const args = createParsedArgs();

    const program = skillsList(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
  });

  it("should filter to enabled-only when flag is set", async () => {
    const cachedSkills = [
      createMockCachedSkill("skill1"),
      createMockCachedSkill("skill2"),
    ];
    const projects = new Map([
      [process.cwd(), { agent: "claude_code" as const, enabled: ["skill1"] }],
    ]);

    const mockCache = createMockCacheService(cachedSkills);
    const mockState = createMockStateService(projects);
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState)
    );

    const args = createParsedArgs({
      flags: { enabled: true },
    });

    const program = skillsList(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
  });

  it("should filter to available-only when flag is set", async () => {
    const cachedSkills = [
      createMockCachedSkill("skill1"),
      createMockCachedSkill("skill2"),
    ];
    const projects = new Map([
      [process.cwd(), { agent: "claude_code" as const, enabled: ["skill1"] }],
    ]);

    const mockCache = createMockCacheService(cachedSkills);
    const mockState = createMockStateService(projects);
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState)
    );

    const args = createParsedArgs({
      flags: { available: true },
    });

    const program = skillsList(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
  });
});
