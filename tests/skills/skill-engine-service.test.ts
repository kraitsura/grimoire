/**
 * Tests for SkillEngineService
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect, Layer, Context } from "effect";
import {
  SkillEngineService,
  SkillEngineServiceLive,
  type EnableOptions,
  type DisableOptions,
} from "../../src/services/skills/skill-engine-service";
import {
  SkillCacheService,
  type CachedSkill,
  type SkillManifest,
} from "../../src/services/skills/skill-cache-service";
import { SkillStateService } from "../../src/services/skills/skill-state-service";
import { AgentAdapterService, type AgentAdapter } from "../../src/services/skills/agent-adapter";
import { CliInstallerService } from "../../src/services/skills/cli-installer-service";
import {
  SkillNotCachedError,
  SkillAlreadyEnabledError,
  SkillNotEnabledError,
  ProjectNotInitializedError,
} from "../../src/models/skill-errors";

// Mock implementations
const createMockCachedSkill = (
  name: string,
  overrides?: Partial<CachedSkill>
): CachedSkill => ({
  manifest: {
    name,
    version: "1.0.0",
    description: `Test skill ${name}`,
    type: "prompt",
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
  availableInstallers: () => Effect.succeed(["npm", "brew"]),
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
      const projects = new Map([
        ["/test/project", { agent: "claude_code" as const, enabled: [] }],
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
      const projects = new Map(); // Empty - no initialized projects

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
      const cachedSkills = new Map(); // Empty cache
      const projects = new Map([
        ["/test/project", { agent: "claude_code" as const, enabled: [] }],
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
        return yield* service.enable("/test/project", "non-existent");
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
      const projects = new Map([
        ["/test/project", { agent: "claude_code" as const, enabled: ["test-skill"] }],
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

    it("should install CLI dependencies if needed", async () => {
      const cachedSkills = new Map([
        [
          "cli-skill",
          createMockCachedSkill("cli-skill", {
            manifest: {
              name: "cli-skill",
              version: "1.0.0",
              description: "Skill with CLI deps",
              type: "prompt",
              cli: {
                "test-binary": {
                  check: "test-binary --version",
                  install: {
                    npm: "test-binary",
                  },
                },
              },
            },
          }),
        ],
      ]);
      const projects = new Map([
        ["/test/project", { agent: "claude_code" as const, enabled: [] }],
      ]);

      const installedBinaries = new Set<string>();
      const mockCache = createMockCacheService(cachedSkills);
      const mockState = createMockStateService(projects);
      const mockAdapter = createMockAgentAdapter();
      const mockAdapters = createMockAdapterService(mockAdapter);
      const mockCliInstaller = createMockCliInstallerService(installedBinaries);

      const TestLayer = Layer.mergeAll(
        Layer.succeed(SkillCacheService, mockCache),
        Layer.succeed(SkillStateService, mockState),
        Layer.succeed(AgentAdapterService, mockAdapters),
        Layer.succeed(CliInstallerService, mockCliInstaller)
      );

      const program = Effect.gen(function* () {
        const service = yield* SkillEngineService;
        return yield* service.enable("/test/project", "cli-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(program);
      expect(result.cliInstalled).toEqual(["test-binary"]);
      expect(installedBinaries.has("test-binary")).toBe(true);
    });

    it("should skip CLI dependencies with noDeps option", async () => {
      const cachedSkills = new Map([
        [
          "cli-skill",
          createMockCachedSkill("cli-skill", {
            manifest: {
              name: "cli-skill",
              version: "1.0.0",
              description: "Skill with CLI deps",
              type: "prompt",
              cli: {
                "test-binary": {
                  check: "test-binary --version",
                  install: {
                    npm: "test-binary",
                  },
                },
              },
            },
          }),
        ],
      ]);
      const projects = new Map([
        ["/test/project", { agent: "claude_code" as const, enabled: [] }],
      ]);

      const installedBinaries = new Set<string>();
      const mockCache = createMockCacheService(cachedSkills);
      const mockState = createMockStateService(projects);
      const mockAdapter = createMockAgentAdapter();
      const mockAdapters = createMockAdapterService(mockAdapter);
      const mockCliInstaller = createMockCliInstallerService(installedBinaries);

      const TestLayer = Layer.mergeAll(
        Layer.succeed(SkillCacheService, mockCache),
        Layer.succeed(SkillStateService, mockState),
        Layer.succeed(AgentAdapterService, mockAdapters),
        Layer.succeed(CliInstallerService, mockCliInstaller)
      );

      const program = Effect.gen(function* () {
        const service = yield* SkillEngineService;
        return yield* service.enable("/test/project", "cli-skill", { noDeps: true });
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(program);
      expect(result.cliInstalled).toBeUndefined();
      expect(installedBinaries.has("test-binary")).toBe(false);
    });
  });

  describe("disable", () => {
    it("should disable an enabled skill", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map([
        ["/test/project", { agent: "claude_code" as const, enabled: ["test-skill"] }],
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
        const state = yield* SkillStateService;
        return yield* state.getEnabled("/test/project");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(program);
      expect(result).toEqual([]);
    });

    it("should fail if skill is not enabled", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map([
        ["/test/project", { agent: "claude_code" as const, enabled: [] }],
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
        return yield* service.disable("/test/project", "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(Effect.either(program));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SkillNotEnabledError");
      }
    });

    it("should fail if project is not initialized", async () => {
      const cachedSkills = new Map();
      const projects = new Map(); // Empty

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
        return yield* service.disable("/test/project", "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(Effect.either(program));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SkillNotEnabledError");
      }
    });
  });

  describe("canEnable", () => {
    it("should return true if skill can be enabled", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map([
        ["/test/project", { agent: "claude_code" as const, enabled: [] }],
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

    it("should indicate if skill is already enabled", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map([
        ["/test/project", { agent: "claude_code" as const, enabled: ["test-skill"] }],
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
      expect(result.isEnabled).toBe(true);
      expect(result.reason).toContain("already enabled");
    });

    it("should indicate if skill is not cached", async () => {
      const cachedSkills = new Map(); // Empty
      const projects = new Map([
        ["/test/project", { agent: "claude_code" as const, enabled: [] }],
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

    it("should indicate if project is not initialized", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map(); // Empty

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
      expect(result.reason).toContain("not initialized");
    });

    it("should list missing CLI dependencies", async () => {
      const cachedSkills = new Map([
        [
          "cli-skill",
          createMockCachedSkill("cli-skill", {
            manifest: {
              name: "cli-skill",
              version: "1.0.0",
              description: "Skill with CLI deps",
              type: "prompt",
              cli: {
                "missing-binary": {
                  check: "missing-binary --version",
                  install: {
                    npm: "missing-binary",
                  },
                },
              },
            },
          }),
        ],
      ]);
      const projects = new Map([
        ["/test/project", { agent: "claude_code" as const, enabled: [] }],
      ]);

      const mockCache = createMockCacheService(cachedSkills);
      const mockState = createMockStateService(projects);
      const mockAdapter = createMockAgentAdapter();
      const mockAdapters = createMockAdapterService(mockAdapter);
      const mockCliInstaller = createMockCliInstallerService(); // No installed binaries

      const TestLayer = Layer.mergeAll(
        Layer.succeed(SkillCacheService, mockCache),
        Layer.succeed(SkillStateService, mockState),
        Layer.succeed(AgentAdapterService, mockAdapters),
        Layer.succeed(CliInstallerService, mockCliInstaller)
      );

      const program = Effect.gen(function* () {
        const service = yield* SkillEngineService;
        return yield* service.canEnable("/test/project", "cli-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(program);
      expect(result.canEnable).toBe(true);
      expect(result.missingDeps).toEqual(["missing-binary"]);
    });
  });
});
