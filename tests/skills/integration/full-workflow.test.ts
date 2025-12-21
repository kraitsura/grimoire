/**
 * Integration Tests - Full Skills Workflow
 *
 * Tests the complete skills workflow from initialization through enable/disable.
 * These tests use mock service implementations and verify end-to-end behavior.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect, Layer } from "effect";
import { SkillStateService } from "../../../src/services/skills/skill-state-service";
import {
  SkillCacheService,
  type CachedSkill,
  type GitHubSource,
} from "../../../src/services/skills/skill-cache-service";
import {
  SkillEngineService,
  SkillEngineServiceLive,
} from "../../../src/services/skills/skill-engine-service";
import { AgentAdapterService, type AgentAdapter } from "../../../src/services/skills/agent-adapter";
import { CliInstallerService } from "../../../src/services/skills/cli-installer-service";
import type { SkillManifest, AgentType, RepoType } from "../../../src/models/skill";
import { SkillNotCachedError } from "../../../src/models/skill-errors";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import { rm, mkdir } from "fs/promises";

// Mock implementations for integration testing
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
  fetchFromGitHub: (source: GitHubSource) =>
    Effect.gen(function* () {
      const skill = createMockCachedSkill(source.repo);
      cachedSkills.set(source.repo, skill);
      return skill;
    }),
  fetchFromLocal: (path: string) =>
    Effect.gen(function* () {
      const name = path.split("/").pop() || "local-skill";
      const skill = createMockCachedSkill(name);
      cachedSkills.set(name, skill);
      return skill;
    }),
  detectRepoType: () => Effect.succeed({ type: "empty" } as RepoType),
  remove: (skillName: string) =>
    Effect.sync(() => {
      cachedSkills.delete(skillName);
    }),
  clear: () =>
    Effect.sync(() => {
      cachedSkills.clear();
    }),
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

describe("Full Skills Workflow Integration Tests", () => {
  let originalCwd: string;
  let testDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();

    // Create a temporary test directory
    testDir = join(homedir(), ".grimoire-integration-test-" + Date.now());
    await mkdir(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(async () => {
    // Restore cwd
    process.chdir(originalCwd);

    // Clean up test directory
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe("complete workflow", () => {
    it("should initialize project, enable skill, and disable skill", async () => {
      // Setup state
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
        [testDir, { agent: "claude_code", enabled: [] }],
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

      // Enable skill
      const enableProgram = Effect.gen(function* () {
        const engine = yield* SkillEngineService;
        return yield* engine.enable(testDir, "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const enableResult = await Effect.runPromise(enableProgram);
      expect(enableResult.skillName).toBe("test-skill");
      expect(projects.get(testDir)?.enabled).toContain("test-skill");

      // Disable skill
      const disableProgram = Effect.gen(function* () {
        const engine = yield* SkillEngineService;
        yield* engine.disable(testDir, "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      await Effect.runPromise(disableProgram);
      expect(projects.get(testDir)?.enabled).not.toContain("test-skill");
    });

    it("should handle multiple skills", async () => {
      const cachedSkills = new Map([
        ["skill-a", createMockCachedSkill("skill-a")],
        ["skill-b", createMockCachedSkill("skill-b")],
        ["skill-c", createMockCachedSkill("skill-c")],
      ]);
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
        [testDir, { agent: "claude_code", enabled: [] }],
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
        const engine = yield* SkillEngineService;

        // Enable all skills
        yield* engine.enable(testDir, "skill-a");
        yield* engine.enable(testDir, "skill-b");
        yield* engine.enable(testDir, "skill-c");

        // Verify all enabled
        const enabledCheck = projects.get(testDir)?.enabled || [];
        expect(enabledCheck).toContain("skill-a");
        expect(enabledCheck).toContain("skill-b");
        expect(enabledCheck).toContain("skill-c");

        // Disable one
        yield* engine.disable(testDir, "skill-b");

        // Verify only one disabled
        const afterDisable = projects.get(testDir)?.enabled || [];
        expect(afterDisable).toContain("skill-a");
        expect(afterDisable).not.toContain("skill-b");
        expect(afterDisable).toContain("skill-c");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      await Effect.runPromise(program);
    });

    it("should prevent enabling non-cached skills", async () => {
      const cachedSkills = new Map<string, CachedSkill>();
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
        [testDir, { agent: "claude_code", enabled: [] }],
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
        const engine = yield* SkillEngineService;
        return yield* engine.enable(testDir, "non-existent-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(Effect.either(program));
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SkillNotCachedError");
      }
    });

    it("should prevent duplicate enables", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
        [testDir, { agent: "claude_code", enabled: ["test-skill"] }],
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
        const engine = yield* SkillEngineService;
        return yield* engine.enable(testDir, "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(Effect.either(program));
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SkillAlreadyEnabledError");
      }
    });
  });

  describe("canEnable checks", () => {
    it("should correctly report when skill can be enabled", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
        [testDir, { agent: "claude_code", enabled: [] }],
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
        const engine = yield* SkillEngineService;
        return yield* engine.canEnable(testDir, "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(program);
      expect(result.canEnable).toBe(true);
      expect(result.isEnabled).toBe(false);
    });

    it("should report skill is already enabled", async () => {
      const cachedSkills = new Map([
        ["test-skill", createMockCachedSkill("test-skill")],
      ]);
      const projects = new Map<string, { agent: AgentType; enabled: string[] }>([
        [testDir, { agent: "claude_code", enabled: ["test-skill"] }],
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
        const engine = yield* SkillEngineService;
        return yield* engine.canEnable(testDir, "test-skill");
      }).pipe(Effect.provide(SkillEngineServiceLive), Effect.provide(TestLayer));

      const result = await Effect.runPromise(program);
      expect(result.isEnabled).toBe(true);
      expect(result.reason).toContain("already enabled");
    });
  });
});
