/**
 * Tests for skills enable command
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { skillsEnable } from "../../../src/commands/skills/enable";
import { SkillEngineService } from "../../../src/services/skills/skill-engine-service";
import { SkillCacheService, type CachedSkill } from "../../../src/services/skills/skill-cache-service";
import { SkillStateService } from "../../../src/services/skills/skill-state-service";
import type { ParsedArgs } from "../../../src/cli/parser";
import type { RepoType } from "../../../src/models/skill";
import {
  SkillNotCachedError,
  SkillAlreadyEnabledError,
  ProjectNotInitializedError,
} from "../../../src/models/skill-errors";

const createParsedArgs = (overrides?: Partial<ParsedArgs>): ParsedArgs => ({
  command: "skills",
  flags: {},
  positional: ["enable"],
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

const createMockCacheService = (): typeof SkillCacheService.Service => ({
  isCached: () => Effect.succeed(true),
  getCached: (name) => Effect.succeed(createMockCachedSkill(name)),
  listCached: () => Effect.succeed([]),
  updateIndex: () => Effect.void,
  fetchFromGitHub: () => Effect.succeed(createMockCachedSkill("test")),
  fetchFromLocal: () => Effect.succeed(createMockCachedSkill("test")),
  detectRepoType: () => Effect.succeed({ type: "skill", skill: { name: "test", description: "test", path: "" } } as RepoType),
  remove: () => Effect.void,
  clear: () => Effect.void,
});

const createMockStateService = (): typeof SkillStateService.Service => ({
  getProjectState: () => Effect.succeed({
    agent: "claude_code" as const,
    enabled: [],
    disabled_at: {},
    initialized_at: new Date().toISOString(),
    enabledSkills: [],
  }),
  initProject: () => Effect.void,
  isInitialized: () => Effect.succeed(true),
  getEnabled: () => Effect.succeed([]),
  setEnabled: () => Effect.void,
  addEnabled: () => Effect.void,
  removeEnabled: () => Effect.void,
  recordDisable: () => Effect.void,
  updateLastSync: () => Effect.void,
  getGlobalEnabled: () => Effect.succeed([] as string[]),
  addGlobalEnabled: () => Effect.void,
  removeGlobalEnabled: () => Effect.void,
});

const createMockEngineService = (
  enableFn?: (skillName: string) => Effect.Effect<any, any>
): typeof SkillEngineService.Service => ({
  enable: enableFn
    ? (_projectPath, skillName) => enableFn(skillName)
    : () =>
        Effect.succeed({
          skillName: "test-skill",
          cliInstalled: [],
        }),
  disable: () => Effect.void,
  canEnable: () =>
    Effect.succeed({
      canEnable: true,
      isEnabled: false,
    }),
  rollback: () => Effect.void,
});

describe("skills enable command", () => {
  it("should enable a single skill", async () => {
    let enabledSkill: string | undefined;
    const mockCache = createMockCacheService();
    const mockState = createMockStateService();
    const mockEngine = createMockEngineService((skillName) => {
      enabledSkill = skillName;
      return Effect.succeed({ skillName, cliInstalled: [] });
    });
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState),
      Layer.succeed(SkillEngineService, mockEngine)
    );

    const args = createParsedArgs({
      positional: ["enable", "test-skill"],
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(enabledSkill).toBe("test-skill");
  });

  it("should enable multiple skills", async () => {
    const enabledSkills: string[] = [];
    const mockCache = createMockCacheService();
    const mockState = createMockStateService();
    const mockEngine = createMockEngineService((skillName) => {
      enabledSkills.push(skillName);
      return Effect.succeed({ skillName, cliInstalled: [] });
    });
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState),
      Layer.succeed(SkillEngineService, mockEngine)
    );

    const args = createParsedArgs({
      positional: ["enable", "skill1", "skill2", "skill3"],
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(enabledSkills).toEqual(["skill1", "skill2", "skill3"]);
  });

  it("should exit with no skill names", async () => {
    const mockCache = createMockCacheService();
    const mockState = createMockStateService();
    const mockEngine = createMockEngineService();
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState),
      Layer.succeed(SkillEngineService, mockEngine)
    );

    const args = createParsedArgs({
      positional: ["enable"],
    });

    // Mock process.exit to prevent actual exit
    const originalExit = process.exit;
    let exitCalled = false;
    process.exit = (() => {
      exitCalled = true;
    }) as typeof process.exit;

    try {
      const program = skillsEnable(args).pipe(Effect.provide(TestLayer));
      await Effect.runPromise(program);
      expect(exitCalled).toBe(true);
    } finally {
      process.exit = originalExit;
    }
  });

  it("should handle SkillNotCachedError gracefully", async () => {
    const mockCache = createMockCacheService();
    const mockState = createMockStateService();
    const mockEngine = createMockEngineService(() =>
      Effect.fail(new SkillNotCachedError({ name: "missing-skill" }))
    );
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState),
      Layer.succeed(SkillEngineService, mockEngine)
    );

    const args = createParsedArgs({
      positional: ["enable", "missing-skill"],
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    // Should not throw - errors are handled and displayed
    await Effect.runPromise(program);
  });

  it("should handle SkillAlreadyEnabledError gracefully", async () => {
    const mockCache = createMockCacheService();
    const mockState = createMockStateService();
    const mockEngine = createMockEngineService(() =>
      Effect.fail(new SkillAlreadyEnabledError({ name: "already-enabled" }))
    );
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState),
      Layer.succeed(SkillEngineService, mockEngine)
    );

    const args = createParsedArgs({
      positional: ["enable", "already-enabled"],
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    // Should not throw - errors are handled and displayed
    await Effect.runPromise(program);
  });

  it("should handle ProjectNotInitializedError gracefully", async () => {
    const mockCache = createMockCacheService();
    const mockState: typeof SkillStateService.Service = {
      ...createMockStateService(),
      isInitialized: () => Effect.succeed(false),
    };
    const mockEngine = createMockEngineService();
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState),
      Layer.succeed(SkillEngineService, mockEngine)
    );

    const args = createParsedArgs({
      positional: ["enable", "test-skill"],
    });

    // Mock process.exit to prevent actual exit
    const originalExit = process.exit;
    let exitCalled = false;
    process.exit = (() => {
      exitCalled = true;
    }) as typeof process.exit;

    try {
      const program = skillsEnable(args).pipe(Effect.provide(TestLayer));
      await Effect.runPromise(program);
      expect(exitCalled).toBe(true);
    } finally {
      process.exit = originalExit;
    }
  });

  it("should pass noDeps flag to engine", async () => {
    let receivedOptions: any;
    const mockCache = createMockCacheService();
    const mockState = createMockStateService();
    const mockEngine: typeof SkillEngineService.Service = {
      enable: (_projectPath, skillName, options) => {
        receivedOptions = options;
        return Effect.succeed({ skillName, cliInstalled: [] });
      },
      disable: () => Effect.void,
      canEnable: () =>
        Effect.succeed({
          canEnable: true,
          isEnabled: false,
        }),
      rollback: () => Effect.void,
    };
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState),
      Layer.succeed(SkillEngineService, mockEngine)
    );

    const args = createParsedArgs({
      positional: ["enable", "test-skill"],
      flags: { "no-deps": true },
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(receivedOptions?.noDeps).toBe(true);
  });

  it("should pass noInit flag to engine", async () => {
    let receivedOptions: any;
    const mockCache = createMockCacheService();
    const mockState = createMockStateService();
    const mockEngine: typeof SkillEngineService.Service = {
      enable: (_projectPath, skillName, options) => {
        receivedOptions = options;
        return Effect.succeed({ skillName, cliInstalled: [] });
      },
      disable: () => Effect.void,
      canEnable: () =>
        Effect.succeed({
          canEnable: true,
          isEnabled: false,
        }),
      rollback: () => Effect.void,
    };
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillCacheService, mockCache),
      Layer.succeed(SkillStateService, mockState),
      Layer.succeed(SkillEngineService, mockEngine)
    );

    const args = createParsedArgs({
      positional: ["enable", "test-skill"],
      flags: { "no-init": true },
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(receivedOptions?.noInit).toBe(true);
  });
});
