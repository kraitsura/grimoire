/**
 * Tests for SkillEngineService
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import {
  SkillEngineService,
  SkillEngineServiceLive,
} from "../../src/services/skills/skill-engine-service";
import {
  SkillCacheService,
  type CachedSkill,
} from "../../src/services/skills/skill-cache-service";
import { SkillStateService } from "../../src/services/skills/skill-state-service";
import { AgentAdapterService, type AgentAdapter } from "../../src/services/skills/agent-adapter";
import { CliInstallerService } from "../../src/services/skills/cli-installer-service";
import {
  SkillNotCachedError,
  SkillAlreadyEnabledError,
  ProjectNotInitializedError,
} from "../../src/models/skill-errors";
import type { SkillManifest, AgentType } from "../../src/models/skill";

// Mock implementations
const createMockCachedSkill = (
  name: string,
  overrides?: Partial<CachedSkill>
): CachedSkill => ({
  manifest: {
    name,
    description: `Test skill ${name}`,
    ...overrides?.manifest,
  },
  cachedAt: new Date(),
  source: "test",
  skillMdPath: `/test/cache/${name}/SKILL.md`,
  ...overrides,
});

const createMockCacheService = (
  cachedSkills: Map<string, CachedSkill>
): typeof SkillCacheService.Service => ({
  isCached: (skillName: string) => Effect.succeed(cachedSkills.has(skillName)),
  getCached: (skillName: string) =>
    cachedSkills.has(skillName)
      ? Effect.succeed(cachedSkills.get(skillName)!)
      : Effect.fail(new SkillNotCachedError({ name: skillName })),
  listCached: () => Effect.succeed(Array.from(cachedSkills.values())),
  updateIndex: () => Effect.void,
  fetchFromGitHub: () => Effect.succeed(createMockCachedSkill("test")),
  fetchFromLocal: () => Effect.succeed(createMockCachedSkill("test")),
  detectRepoType: () => Effect.succeed({ type: "empty" as const }),
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
            enabled: projects.get(projectPath)!.enabled as readonly string[],
            disabled_at: {} as Record<string, string>,
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
});

const createMockAgentAdapter = (): AgentAdapter => ({
  name: "claude_code",
  detect: () => Effect.succeed(true),
  init: () => Effect.void,
  getSkillsDir: (projectPath: string) => `${projectPath}/.claude/skills`,
  getAgentMdPath: (projectPath: string) => `${projectPath}/CLAUDE.md`,
  enableSkill: () =>
    Effect.succeed({
      injected: true,
      skillFileCopied: true,
    }),
  disableSkill: () => Effect.void,
  injectContent: () => Effect.void,
  removeInjection: () => Effect.void,
  installPlugin: () => Effect.void,
  configureMcp: () => Effect.void,
});

const createMockAdapterService = (
  adapter: AgentAdapter
): typeof AgentAdapterService.Service => ({
  getAdapter: () => adapter,
  detectAgent: () => Effect.succeed(null),
});

const createMockCliInstallerService = (
  installedBinaries: Set<string> = new Set()
): typeof CliInstallerService.Service => ({
  availableInstallers: () => Effect.succeed([]),
  check: (binary: string) => Effect.succeed(installedBinaries.has(binary)),
  install: (binary: string) =>
    Effect.sync(() => {
      installedBinaries.add(binary);
    }),
});

describe("SkillEngineService", () => {
  describe("enable", () => {
    it("should enable a basic prompt skill", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
        ["/test/project", { agent: "claude_code", enabled: [] }],
      ]);

      const mockCache = createMockCacheService(cachedSkills);
      const mockState = createMockStateService(projects);
      const mockAdapter = createMockAgentAdapter();
      const mockAdapters = createMockAdapterService(mockAdapter);
      const mockCliInstaller = createMockCliInstallerService();

      const TestLayer = Layer.mergeAll(
        Layer.succeed(SkillCacheService, mockCache),
        Layer.succeed(SkillStateService, mockState),
        Layer.succeed(AgentAdapterService, mockAdapters),
        Layer.succeed(CliInstallerService, mockCliInstaller)
      );

      const program = Effect.gen(function* () {
        const service = yield* SkillEngineService;
        return yield* service.enable("/test/project", "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(program);
      expect(result.skillName).toBe("test-skill");
    });

    it("should fail if project is not initialized", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>(); // Empty - no initialized projects

      const mockCache = createMockCacheService(cachedSkills);
      const mockState = createMockStateService(projects);
      const mockAdapter = createMockAgentAdapter();
      const mockAdapters = createMockAdapterService(mockAdapter);
      const mockCliInstaller = createMockCliInstallerService();

      const TestLayer = Layer.mergeAll(
        Layer.succeed(SkillCacheService, mockCache),
        Layer.succeed(SkillStateService, mockState),
        Layer.succeed(AgentAdapterService, mockAdapters),
        Layer.succeed(CliInstallerService, mockCliInstaller)
      );

      const program = Effect.gen(function* () {
        const service = yield* SkillEngineService;
        return yield* service.enable("/test/project", "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(Effect.either(program));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ProjectNotInitializedError");
      }
    });

    it("should fail if skill is not cached", async () => {
      const cachedSkills = new Map<string, CachedSkill>(); // Empty cache
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
        ["/test/project", { agent: "claude_code", enabled: [] }],
      ]);

      const mockCache = createMockCacheService(cachedSkills);
      const mockState = createMockStateService(projects);
      const mockAdapter = createMockAgentAdapter();
      const mockAdapters = createMockAdapterService(mockAdapter);
      const mockCliInstaller = createMockCliInstallerService();

      const TestLayer = Layer.mergeAll(
        Layer.succeed(SkillCacheService, mockCache),
        Layer.succeed(SkillStateService, mockState),
        Layer.succeed(AgentAdapterService, mockAdapters),
        Layer.succeed(CliInstallerService, mockCliInstaller)
      );

      const program = Effect.gen(function* () {
        const service = yield* SkillEngineService;
        return yield* service.enable("/test/project", "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(Effect.either(program));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SkillNotCachedError");
      }
    });

    it("should fail if skill is already enabled", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
        ["/test/project", { agent: "claude_code", enabled: ["test-skill"] }],
      ]);

      const mockCache = createMockCacheService(cachedSkills);
      const mockState = createMockStateService(projects);
      const mockAdapter = createMockAgentAdapter();
      const mockAdapters = createMockAdapterService(mockAdapter);
      const mockCliInstaller = createMockCliInstallerService();

      const TestLayer = Layer.mergeAll(
        Layer.succeed(SkillCacheService, mockCache),
        Layer.succeed(SkillStateService, mockState),
        Layer.succeed(AgentAdapterService, mockAdapters),
        Layer.succeed(CliInstallerService, mockCliInstaller)
      );

      const program = Effect.gen(function* () {
        const service = yield* SkillEngineService;
        return yield* service.enable("/test/project", "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(Effect.either(program));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SkillAlreadyEnabledError");
      }
    });
  });

  describe("disable", () => {
    it("should disable an enabled skill", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
        ["/test/project", { agent: "claude_code", enabled: ["test-skill"] }],
      ]);

      const mockCache = createMockCacheService(cachedSkills);
      const mockState = createMockStateService(projects);
      const mockAdapter = createMockAgentAdapter();
      const mockAdapters = createMockAdapterService(mockAdapter);
      const mockCliInstaller = createMockCliInstallerService();

      const TestLayer = Layer.mergeAll(
        Layer.succeed(SkillCacheService, mockCache),
        Layer.succeed(SkillStateService, mockState),
        Layer.succeed(AgentAdapterService, mockAdapters),
        Layer.succeed(CliInstallerService, mockCliInstaller)
      );

      const program = Effect.gen(function* () {
        const service = yield* SkillEngineService;
        yield* service.disable("/test/project", "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      await Effect.runPromise(program);
      // If we get here without error, the test passes
    });
  });

  describe("canEnable", () => {
    it("should return true when skill can be enabled", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
        ["/test/project", { agent: "claude_code", enabled: [] }],
      ]);

      const mockCache = createMockCacheService(cachedSkills);
      const mockState = createMockStateService(projects);
      const mockAdapter = createMockAgentAdapter();
      const mockAdapters = createMockAdapterService(mockAdapter);
      const mockCliInstaller = createMockCliInstallerService();

      const TestLayer = Layer.mergeAll(
        Layer.succeed(SkillCacheService, mockCache),
        Layer.succeed(SkillStateService, mockState),
        Layer.succeed(AgentAdapterService, mockAdapters),
        Layer.succeed(CliInstallerService, mockCliInstaller)
      );

      const program = Effect.gen(function* () {
        const service = yield* SkillEngineService;
        return yield* service.canEnable("/test/project", "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(program);
      expect(result.canEnable).toBe(true);
      expect(result.isEnabled).toBe(false);
    });

    it("should return false when skill is not cached", async () => {
      const cachedSkills = new Map<string, CachedSkill>();
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
        ["/test/project", { agent: "claude_code", enabled: [] }],
      ]);

      const mockCache = createMockCacheService(cachedSkills);
      const mockState = createMockStateService(projects);
      const mockAdapter = createMockAgentAdapter();
      const mockAdapters = createMockAdapterService(mockAdapter);
      const mockCliInstaller = createMockCliInstallerService();

      const TestLayer = Layer.mergeAll(
        Layer.succeed(SkillCacheService, mockCache),
        Layer.succeed(SkillStateService, mockState),
        Layer.succeed(AgentAdapterService, mockAdapters),
        Layer.succeed(CliInstallerService, mockCliInstaller)
      );

      const program = Effect.gen(function* () {
        const service = yield* SkillEngineService;
        return yield* service.canEnable("/test/project", "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(program);
      expect(result.canEnable).toBe(false);
      expect(result.reason).toContain("not cached");
    });

    it("should indicate when skill is already enabled", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
        ["/test/project", { agent: "claude_code", enabled: ["test-skill"] }],
      ]);

      const mockCache = createMockCacheService(cachedSkills);
      const mockState = createMockStateService(projects);
      const mockAdapter = createMockAgentAdapter();
      const mockAdapters = createMockAdapterService(mockAdapter);
      const mockCliInstaller = createMockCliInstallerService();

      const TestLayer = Layer.mergeAll(
        Layer.succeed(SkillCacheService, mockCache),
        Layer.succeed(SkillStateService, mockState),
        Layer.succeed(AgentAdapterService, mockAdapters),
        Layer.succeed(CliInstallerService, mockCliInstaller)
      );

      const program = Effect.gen(function* () {
        const service = yield* SkillEngineService;
        return yield* service.canEnable("/test/project", "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(program);
      expect(result.isEnabled).toBe(true);
      expect(result.reason).toContain("already enabled");
    });
  });
});
