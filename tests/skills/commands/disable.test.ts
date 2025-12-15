/**
 * Tests for skills disable command
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { skillsDisable } from "../../../src/commands/skills/disable";
import { SkillEngineService } from "../../../src/services/skills/skill-engine-service";
import type { ParsedArgs } from "../../../src/cli/parser";
import { SkillNotEnabledError } from "../../../src/models/skill-errors";

const createParsedArgs = (overrides?: Partial<ParsedArgs>): ParsedArgs => ({
  command: "skills",
  subcommand: "disable",
  args: [],
  flags: {},
  ...overrides,
});

const createMockEngineService = (
  disableFn?: (skillName: string) => Effect.Effect<void, any>
): typeof SkillEngineService.Service => ({
  enable: () =>
    Effect.succeed({
      skillName: "test-skill",
      cliInstalled: [],
    }),
  disable: disableFn ? (projectPath, skillName) => disableFn(skillName) : () => Effect.void,
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
    const mockEngine = createMockEngineService((skillName) => {
      disabledSkill = skillName;
      return Effect.void;
    });
    const TestLayer = Layer.succeed(SkillEngineService, mockEngine);

    const args = createParsedArgs({
      args: ["test-skill"],
    });

    const program = skillsDisable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(disabledSkill).toBe("test-skill");
  });

  it("should disable multiple skills", async () => {
    const disabledSkills: string[] = [];
    const mockEngine = createMockEngineService((skillName) => {
      disabledSkills.push(skillName);
      return Effect.void;
    });
    const TestLayer = Layer.succeed(SkillEngineService, mockEngine);

    const args = createParsedArgs({
      args: ["skill1", "skill2", "skill3"],
    });

    const program = skillsDisable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(disabledSkills).toEqual(["skill1", "skill2", "skill3"]);
  });

  it("should fail with no skill names", async () => {
    const mockEngine = createMockEngineService();
    const TestLayer = Layer.succeed(SkillEngineService, mockEngine);

    const args = createParsedArgs({
      args: [],
    });

    const program = skillsDisable(args).pipe(Effect.provide(TestLayer));

    const result = await Effect.runPromise(Effect.either(program));

    expect(result._tag).toBe("Left");
  });

  it("should handle SkillNotEnabledError gracefully", async () => {
    const mockEngine = createMockEngineService(() =>
      Effect.fail(new SkillNotEnabledError({ name: "not-enabled" }))
    );
    const TestLayer = Layer.succeed(SkillEngineService, mockEngine);

    const args = createParsedArgs({
      args: ["not-enabled"],
    });

    const program = skillsDisable(args).pipe(Effect.provide(TestLayer));

    // Should not throw - errors are handled and displayed
    await Effect.runPromise(program);
  });

  it("should continue disabling remaining skills if one fails", async () => {
    const disabledSkills: string[] = [];
    const mockEngine = createMockEngineService((skillName) => {
      if (skillName === "fail-skill") {
        return Effect.fail(new SkillNotEnabledError({ name: skillName }));
      }
      disabledSkills.push(skillName);
      return Effect.void;
    });
    const TestLayer = Layer.succeed(SkillEngineService, mockEngine);

    const args = createParsedArgs({
      args: ["skill1", "fail-skill", "skill2"],
    });

    const program = skillsDisable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(disabledSkills).toEqual(["skill1", "skill2"]);
  });
});
