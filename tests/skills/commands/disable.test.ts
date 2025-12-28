/**
 * Tests for skills disable command
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { skillsDisable } from "../../../src/commands/skills/disable";
import { SkillEngineService } from "../../../src/services/skills/skill-engine-service";
import { SkillStateService } from "../../../src/services/skills/skill-state-service";
import type { ParsedArgs } from "../../../src/cli/parser";
import { SkillNotEnabledError } from "../../../src/models/skill-errors";

const createParsedArgs = (overrides?: Partial<ParsedArgs>): ParsedArgs => ({
  command: "skills",
  flags: {},
  positional: ["disable"],
  ...overrides,
});

const createMockStateService = (
  enabledSkills: string[] = []
): typeof SkillStateService.Service => ({
  getProjectState: () => Effect.succeed({
    agent: "claude_code" as const,
    enabled: enabledSkills,
    disabled_at: {},
    initialized_at: new Date().toISOString(),
    enabledSkills,
  }),
  initProject: () => Effect.void,
  isInitialized: () => Effect.succeed(true),
  getEnabled: () => Effect.succeed(enabledSkills),
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
  disableFn?: (skillName: string) => Effect.Effect<void, any>
): typeof SkillEngineService.Service => ({
  enable: () =>
    Effect.succeed({
      skillName: "test-skill",
      cliInstalled: [],
    }),
  disable: disableFn
    ? (_projectPath, skillName) => disableFn(skillName)
    : () => Effect.void,
  canEnable: () =>
    Effect.succeed({
      canEnable: true,
      isEnabled: false,
    }),
  rollback: () => Effect.void,
});

describe("skills disable command", () => {
  it("should disable a single skill", async () => {
    let disabledSkill: string | undefined;
    const mockState = createMockStateService(["test-skill"]);
    const mockEngine = createMockEngineService((skillName) => {
      disabledSkill = skillName;
      return Effect.void;
    });
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillStateService, mockState),
      Layer.succeed(SkillEngineService, mockEngine)
    );

    const args = createParsedArgs({
      positional: ["disable", "test-skill"],
    });

    const program = skillsDisable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(disabledSkill).toBe("test-skill");
  });

  it("should disable multiple skills", async () => {
    const disabledSkills: string[] = [];
    const mockState = createMockStateService(["skill1", "skill2", "skill3"]);
    const mockEngine = createMockEngineService((skillName) => {
      disabledSkills.push(skillName);
      return Effect.void;
    });
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillStateService, mockState),
      Layer.succeed(SkillEngineService, mockEngine)
    );

    const args = createParsedArgs({
      positional: ["disable", "skill1", "skill2", "skill3"],
    });

    const program = skillsDisable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(disabledSkills).toEqual(["skill1", "skill2", "skill3"]);
  });

  it("should exit with no skill names", async () => {
    const mockState = createMockStateService();
    const mockEngine = createMockEngineService();
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillStateService, mockState),
      Layer.succeed(SkillEngineService, mockEngine)
    );

    const args = createParsedArgs({
      positional: ["disable"],
    });

    // Mock process.exit to prevent actual exit
    const originalExit = process.exit;
    let exitCalled = false;
    process.exit = (() => {
      exitCalled = true;
    }) as typeof process.exit;

    try {
      const program = skillsDisable(args).pipe(Effect.provide(TestLayer));
      await Effect.runPromise(program);
      expect(exitCalled).toBe(true);
    } finally {
      process.exit = originalExit;
    }
  });

  it("should handle SkillNotEnabledError gracefully", async () => {
    const mockState = createMockStateService(["not-enabled"]);
    const mockEngine = createMockEngineService(() =>
      Effect.fail(new SkillNotEnabledError({ name: "not-enabled" }))
    );
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillStateService, mockState),
      Layer.succeed(SkillEngineService, mockEngine)
    );

    const args = createParsedArgs({
      positional: ["disable", "not-enabled"],
    });

    const program = skillsDisable(args).pipe(Effect.provide(TestLayer));

    // Should not throw - errors are handled and displayed
    await Effect.runPromise(program);
  });

  it("should continue disabling remaining skills if one fails", async () => {
    const disabledSkills: string[] = [];
    const mockState = createMockStateService(["skill1", "fail-skill", "skill2"]);
    const mockEngine = createMockEngineService((skillName) => {
      if (skillName === "fail-skill") {
        return Effect.fail(new SkillNotEnabledError({ name: skillName }));
      }
      disabledSkills.push(skillName);
      return Effect.void;
    });
    const TestLayer = Layer.mergeAll(
      Layer.succeed(SkillStateService, mockState),
      Layer.succeed(SkillEngineService, mockEngine)
    );

    const args = createParsedArgs({
      positional: ["disable", "skill1", "fail-skill", "skill2"],
    });

    const program = skillsDisable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(disabledSkills).toEqual(["skill1", "skill2"]);
  });
});
