/**
 * Integration Tests - Full Skills Workflow
 *
 * Tests the complete skills workflow from initialization through enable/disable.
 * These tests use real service implementations where possible and verify
 * end-to-end behavior.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect, Layer } from "effect";
import {
  SkillStateService,
  SkillStateServiceLive,
} from "../../../src/services/skills/skill-state-service";
import { SkillCacheService } from "../../../src/services/skills/skill-cache-service";
import { SkillEngineService } from "../../../src/services/skills/skill-engine-service";
import { AgentAdapterService, type AgentAdapter } from "../../../src/services/skills/agent-adapter";
import { CliInstallerService } from "../../../src/services/skills/cli-installer-service";
import type { CachedSkill, SkillManifest } from "../../../src/services/skills/skill-cache-service";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import { unlink, rm, mkdir, writeFile } from "fs/promises";

const testStateDir = join(homedir(), ".skills");
const testStatePath = join(testStateDir, "state.json");

// Mock implementations for integration testing
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
      : Effect.fail({
          _tag: "SkillNotCachedError" as const,
          name: skillName,
        }),
  listCached: () => Effect.succeed(Array.from(cachedSkills.values())),
  updateIndex: () => Effect.void,
  validateManifest: () => Effect.succeed({} as SkillManifest),
  installFromGitHub: (source) =>
    Effect.gen(function* () {
      const skill = createMockCachedSkill(source.repo);
      cachedSkills.set(source.repo, skill);
      return skill;
    }),
  installFromLocal: (path) =>
    Effect.gen(function* () {
      const name = path.split("/").pop() || "local-skill";
      const skill = createMockCachedSkill(name);
      cachedSkills.set(name, skill);
      return skill;
    }),
  uninstall: (skillName) =>
    Effect.sync(() => {
      cachedSkills.delete(skillName);
    }),
  clear: () =>
    Effect.sync(() => {
      cachedSkills.clear();
    }),
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

describe("Full Skills Workflow Integration Tests", () => {
  let cleanupNeeded = false;
  let originalState: string | null = null;
  let originalCwd: string;
  let testDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();

    // Create a temporary test directory
    testDir = join(homedir(), ".grimoire-integration-test-" + Date.now());
    await mkdir(testDir, { recursive: true });
    process.chdir(testDir);

    // Backup existing state if it exists
    if (existsSync(testStatePath)) {
      const file = Bun.file(testStatePath);
      originalState = await file.text();
    }
  });

  afterEach(async () => {
    // Restore cwd
    process.chdir(originalCwd);

    // Clean up test directory
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }

    if (cleanupNeeded) {
      // Restore original state or clean up
      if (originalState) {
        await writeFile(testStatePath, originalState, "utf-8");
      } else if (existsSync(testStatePath)) {
        await unlink(testStatePath);
      }
      cleanupNeeded = false;
      originalState = null;
    }
  });

  it("should complete full workflow: init -> add -> enable -> disable", async () => {
    cleanupNeeded = true;

    // Setup
    const cachedSkills = new Map<string, CachedSkill>();
    const installedBinaries = new Set<string>();

    const mockCache = createMockCacheService(cachedSkills);
    const mockAdapter = createMockAgentAdapter();
    const mockAdapters = createMockAdapterService(mockAdapter);
    const mockCliInstaller = createMockCliInstallerService(installedBinaries);

    const TestLayer = Layer.mergeAll(
      SkillStateServiceLive,
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(AgentAdapterService, mockAdapters),
      Layer.succeed(CliInstallerService, mockCliInstaller)
    );

    const program = Effect.gen(function* () {
      const state = yield* SkillStateService;
      const cache = yield* SkillCacheService;
      const engine = yield* SkillEngineService;

      const projectPath = testDir;

      // 1. Initialize project
      yield* state.initProject(projectPath, "claude_code");
      const isInitialized = yield* state.isInitialized(projectPath);
      expect(isInitialized).toBe(true);

      // 2. Add skill to cache
      const skill = yield* cache.installFromGitHub({
        owner: "test-owner",
        repo: "test-skill",
      });
      expect(skill.manifest.name).toBe("test-skill");
      const isCached = yield* cache.isCached("test-skill");
      expect(isCached).toBe(true);

      // 3. Enable skill
      const enableResult = yield* engine.enable(projectPath, "test-skill");
      expect(enableResult.skillName).toBe("test-skill");

      // Verify skill is enabled
      const enabled = yield* state.getEnabled(projectPath);
      expect(enabled).toContain("test-skill");

      // 4. Disable skill
      yield* engine.disable(projectPath, "test-skill");

      // Verify skill is disabled
      const enabledAfterDisable = yield* state.getEnabled(projectPath);
      expect(enabledAfterDisable).not.toContain("test-skill");
    }).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
  });

  it("should handle multiple skills enabled simultaneously", async () => {
    cleanupNeeded = true;

    const cachedSkills = new Map<string, CachedSkill>([
      ["skill1", createMockCachedSkill("skill1")],
      ["skill2", createMockCachedSkill("skill2")],
      ["skill3", createMockCachedSkill("skill3")],
    ]);
    const installedBinaries = new Set<string>();

    const mockCache = createMockCacheService(cachedSkills);
    const mockAdapter = createMockAgentAdapter();
    const mockAdapters = createMockAdapterService(mockAdapter);
    const mockCliInstaller = createMockCliInstallerService(installedBinaries);

    const TestLayer = Layer.mergeAll(
      SkillStateServiceLive,
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(AgentAdapterService, mockAdapters),
      Layer.succeed(CliInstallerService, mockCliInstaller)
    );

    const program = Effect.gen(function* () {
      const state = yield* SkillStateService;
      const engine = yield* SkillEngineService;

      const projectPath = testDir;

      // Initialize
      yield* state.initProject(projectPath, "claude_code");

      // Enable multiple skills
      yield* engine.enable(projectPath, "skill1");
      yield* engine.enable(projectPath, "skill2");
      yield* engine.enable(projectPath, "skill3");

      // Verify all enabled
      const enabled = yield* state.getEnabled(projectPath);
      expect(enabled).toContain("skill1");
      expect(enabled).toContain("skill2");
      expect(enabled).toContain("skill3");
      expect(enabled.length).toBe(3);

      // Disable one skill
      yield* engine.disable(projectPath, "skill2");

      // Verify only skill2 is disabled
      const enabledAfter = yield* state.getEnabled(projectPath);
      expect(enabledAfter).toContain("skill1");
      expect(enabledAfter).not.toContain("skill2");
      expect(enabledAfter).toContain("skill3");
      expect(enabledAfter.length).toBe(2);
    }).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
  });

  it("should install CLI dependencies when enabling skill with deps", async () => {
    cleanupNeeded = true;

    const cachedSkills = new Map<string, CachedSkill>([
      [
        "skill-with-cli",
        createMockCachedSkill("skill-with-cli", {
          manifest: {
            name: "skill-with-cli",
            version: "1.0.0",
            description: "Skill with CLI dependencies",
            type: "prompt",
            cli: {
              "test-cli": {
                check: "test-cli --version",
                install: {
                  npm: "test-cli",
                },
              },
            },
          },
        }),
      ],
    ]);
    const installedBinaries = new Set<string>();

    const mockCache = createMockCacheService(cachedSkills);
    const mockAdapter = createMockAgentAdapter();
    const mockAdapters = createMockAdapterService(mockAdapter);
    const mockCliInstaller = createMockCliInstallerService(installedBinaries);

    const TestLayer = Layer.mergeAll(
      SkillStateServiceLive,
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(AgentAdapterService, mockAdapters),
      Layer.succeed(CliInstallerService, mockCliInstaller)
    );

    const program = Effect.gen(function* () {
      const state = yield* SkillStateService;
      const engine = yield* SkillEngineService;

      const projectPath = testDir;

      // Initialize
      yield* state.initProject(projectPath, "claude_code");

      // Enable skill with CLI deps
      const result = yield* engine.enable(projectPath, "skill-with-cli");

      // Verify CLI was installed
      expect(result.cliInstalled).toContain("test-cli");
      expect(installedBinaries.has("test-cli")).toBe(true);
    }).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
  });

  it("should prevent duplicate enables (idempotent)", async () => {
    cleanupNeeded = true;

    const cachedSkills = new Map<string, CachedSkill>([
      ["test-skill", createMockCachedSkill("test-skill")],
    ]);
    const installedBinaries = new Set<string>();

    const mockCache = createMockCacheService(cachedSkills);
    const mockAdapter = createMockAgentAdapter();
    const mockAdapters = createMockAdapterService(mockAdapter);
    const mockCliInstaller = createMockCliInstallerService(installedBinaries);

    const TestLayer = Layer.mergeAll(
      SkillStateServiceLive,
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(AgentAdapterService, mockAdapters),
      Layer.succeed(CliInstallerService, mockCliInstaller)
    );

    const program = Effect.gen(function* () {
      const state = yield* SkillStateService;
      const engine = yield* SkillEngineService;

      const projectPath = testDir;

      // Initialize
      yield* state.initProject(projectPath, "claude_code");

      // Enable skill
      yield* engine.enable(projectPath, "test-skill");

      // Try to enable again - should fail
      const result = yield* Effect.either(engine.enable(projectPath, "test-skill"));
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SkillAlreadyEnabledError");
      }

      // Verify still only enabled once
      const enabled = yield* state.getEnabled(projectPath);
      expect(enabled.filter((s) => s === "test-skill").length).toBe(1);
    }).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
  });

  it("should persist state across service instances", async () => {
    cleanupNeeded = true;

    const cachedSkills = new Map<string, CachedSkill>([
      ["test-skill", createMockCachedSkill("test-skill")],
    ]);

    const mockCache = createMockCacheService(cachedSkills);
    const mockAdapter = createMockAgentAdapter();
    const mockAdapters = createMockAdapterService(mockAdapter);
    const mockCliInstaller = createMockCliInstallerService();

    const TestLayer = Layer.mergeAll(
      SkillStateServiceLive,
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(AgentAdapterService, mockAdapters),
      Layer.succeed(CliInstallerService, mockCliInstaller)
    );

    const projectPath = testDir;

    // First program - initialize and enable
    const program1 = Effect.gen(function* () {
      const state = yield* SkillStateService;
      const engine = yield* SkillEngineService;

      yield* state.initProject(projectPath, "claude_code");
      yield* engine.enable(projectPath, "test-skill");
    }).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program1);

    // Second program - verify state persisted
    const program2 = Effect.gen(function* () {
      const state = yield* SkillStateService;

      const isInitialized = yield* state.isInitialized(projectPath);
      expect(isInitialized).toBe(true);

      const enabled = yield* state.getEnabled(projectPath);
      expect(enabled).toContain("test-skill");
    }).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program2);
  });

  it("should handle canEnable checks correctly", async () => {
    cleanupNeeded = true;

    const cachedSkills = new Map<string, CachedSkill>([
      ["cached-skill", createMockCachedSkill("cached-skill")],
    ]);
    const installedBinaries = new Set<string>();

    const mockCache = createMockCacheService(cachedSkills);
    const mockAdapter = createMockAgentAdapter();
    const mockAdapters = createMockAdapterService(mockAdapter);
    const mockCliInstaller = createMockCliInstallerService(installedBinaries);

    const TestLayer = Layer.mergeAll(
      SkillStateServiceLive,
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(AgentAdapterService, mockAdapters),
      Layer.succeed(CliInstallerService, mockCliInstaller)
    );

    const program = Effect.gen(function* () {
      const state = yield* SkillStateService;
      const engine = yield* SkillEngineService;

      const projectPath = testDir;

      // Before init - cannot enable (project not initialized)
      const checkBeforeInit = yield* engine.canEnable(projectPath, "cached-skill");
      expect(checkBeforeInit.canEnable).toBe(false);
      expect(checkBeforeInit.reason).toContain("not initialized");

      // Initialize
      yield* state.initProject(projectPath, "claude_code");

      // After init - can enable
      const checkAfterInit = yield* engine.canEnable(projectPath, "cached-skill");
      expect(checkAfterInit.canEnable).toBe(true);

      // Enable skill
      yield* engine.enable(projectPath, "cached-skill");

      // After enable - cannot enable (already enabled)
      const checkAfterEnable = yield* engine.canEnable(projectPath, "cached-skill");
      expect(checkAfterEnable.canEnable).toBe(false);
      expect(checkAfterEnable.isEnabled).toBe(true);

      // Check non-existent skill
      const checkNonExistent = yield* engine.canEnable(projectPath, "non-existent");
      expect(checkNonExistent.canEnable).toBe(false);
      expect(checkNonExistent.reason).toContain("not cached");
    }).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
  });
});
