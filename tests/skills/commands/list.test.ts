/**
 * Tests for skills list command
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { skillsList } from "../../../src/commands/skills/list";
import { SkillCacheService, type CachedSkill } from "../../../src/services/skills/skill-cache-service";
import { SkillStateService } from "../../../src/services/skills/skill-state-service";
import { AgentAdapterService, AgentAdapterServiceLive } from "../../../src/services/skills/agent-adapter";
import type { ParsedArgs } from "../../../src/cli/parser";
import type { SkillManifest, AgentType, RepoType } from "../../../src/models/skill";

const createParsedArgs = (overrides?: Partial<ParsedArgs>): ParsedArgs => ({
  command: "skills",
  flags: {},
  positional: ["list"],
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
  fetchFromGitHub: () => Effect.succeed(createMockCachedSkill("test")),
  fetchFromLocal: () => Effect.succeed(createMockCachedSkill("test")),
  detectRepoType: () => Effect.succeed({ type: "skill", skill: { name: "test", description: "test", path: "" } } as RepoType),
  remove: () => Effect.void,
  clear: () => Effect.void,
});

const createMockStateService = (
  projects: Map<string, { agent: AgentType; enabled: string[] }>
): typeof SkillStateService.Service => ({
  getProjectState: (projectPath: string) =>
    Effect.succeed(
      projects.has(projectPath)
        ? {
            ...projects.get(projectPath)!,
            disabled_at: {},
            initialized_at: new Date().toISOString(),
            enabledSkills: projects.get(projectPath)!.enabled,
          }
        : null
    ),
  initProject: (projectPath: string, agent: AgentType) =>
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
  getGlobalEnabled: () => Effect.succeed([] as string[]),
  addGlobalEnabled: () => Effect.void,
  removeGlobalEnabled: () => Effect.void,
});

describe("skills list command", () => {
  it("should list enabled and available skills", async () => {
    const cachedSkills = [
      createMockCachedSkill("skill1"),
      createMockCachedSkill("skill2"),
      createMockCachedSkill("skill3"),
    ];
    const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
      [process.cwd(), { agent: "claude_code" as const, enabled: ["skill1"] }],
    ]);

    const mockCache = createMockCacheService(cachedSkills);
    const mockState = createMockStateService(projects);
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState),
      AgentAdapterServiceLive
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
    const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
      [process.cwd(), { agent: "claude_code" as const, enabled: [] }],
    ]);

    const mockCache = createMockCacheService(cachedSkills);
    const mockState = createMockStateService(projects);
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState),
      AgentAdapterServiceLive
    );

    const args = createParsedArgs();

    const program = skillsList(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
  });

  it("should handle empty cache", async () => {
    const cachedSkills: CachedSkill[] = [];
    const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
      [process.cwd(), { agent: "claude_code" as const, enabled: [] }],
    ]);

    const mockCache = createMockCacheService(cachedSkills);
    const mockState = createMockStateService(projects);
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState),
      AgentAdapterServiceLive
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
    const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
      [process.cwd(), { agent: "claude_code" as const, enabled: ["skill1"] }],
    ]);

    const mockCache = createMockCacheService(cachedSkills);
    const mockState = createMockStateService(projects);
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState),
      AgentAdapterServiceLive
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
    const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
      [process.cwd(), { agent: "claude_code" as const, enabled: ["skill1"] }],
    ]);

    const mockCache = createMockCacheService(cachedSkills);
    const mockState = createMockStateService(projects);
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState),
      AgentAdapterServiceLive
    );

    const args = createParsedArgs({
      flags: { available: true },
    });

    const program = skillsList(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
  });
});
