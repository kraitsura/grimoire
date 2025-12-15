/**
 * Tests for skills enable command
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { skillsEnable } from "../../../src/commands/skills/enable";
import { SkillEngineService } from "../../../src/services/skills/skill-engine-service";
import type { ParsedArgs } from "../../../src/cli/parser";
import {
  SkillNotCachedError,
  SkillAlreadyEnabledError,
  ProjectNotInitializedError,
} from "../../../src/models/skill-errors";

const createParsedArgs = (overrides?: Partial<ParsedArgs>): ParsedArgs => ({
  command: "skills",
  subcommand: "enable",
  args: [],
  flags: {},
  ...overrides,
});

const createMockEngineService = (
  enableFn?: (skillName: string) => Effect.Effect<any, any>
): typeof SkillEngineService.Service => ({
  enable: enableFn
    ? (projectPath, skillName, options) => enableFn(skillName)
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
    const mockEngine = createMockEngineService((skillName) => {
      enabledSkill = skillName;
      return Effect.succeed({ skillName, cliInstalled: [] });
    });
    const TestLayer = Layer.succeed(SkillEngineService, mockEngine);

    const args = createParsedArgs({
      args: ["test-skill"],
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(enabledSkill).toBe("test-skill");
  });

  it("should enable multiple skills", async () => {
    const enabledSkills: string[] = [];
    const mockEngine = createMockEngineService((skillName) => {
      enabledSkills.push(skillName);
      return Effect.succeed({ skillName, cliInstalled: [] });
    });
    const TestLayer = Layer.succeed(SkillEngineService, mockEngine);

    const args = createParsedArgs({
      args: ["skill1", "skill2", "skill3"],
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(enabledSkills).toEqual(["skill1", "skill2", "skill3"]);
  });

  it("should fail with no skill names", async () => {
    const mockEngine = createMockEngineService();
    const TestLayer = Layer.succeed(SkillEngineService, mockEngine);

    const args = createParsedArgs({
      args: [],
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    const result = await Effect.runPromise(Effect.either(program));

    expect(result._tag).toBe("Left");
  });

  it("should handle SkillNotCachedError gracefully", async () => {
    const mockEngine = createMockEngineService(() =>
      Effect.fail(new SkillNotCachedError({ name: "missing-skill" }))
    );
    const TestLayer = Layer.succeed(SkillEngineService, mockEngine);

    const args = createParsedArgs({
      args: ["missing-skill"],
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    // Should not throw - errors are handled and displayed
    await Effect.runPromise(program);
  });

  it("should handle SkillAlreadyEnabledError gracefully", async () => {
    const mockEngine = createMockEngineService(() =>
      Effect.fail(new SkillAlreadyEnabledError({ name: "already-enabled" }))
    );
    const TestLayer = Layer.succeed(SkillEngineService, mockEngine);

    const args = createParsedArgs({
      args: ["already-enabled"],
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    // Should not throw - errors are handled and displayed
    await Effect.runPromise(program);
  });

  it("should handle ProjectNotInitializedError gracefully", async () => {
    const mockEngine = createMockEngineService(() =>
      Effect.fail(new ProjectNotInitializedError({ path: "/test/project" }))
    );
    const TestLayer = Layer.succeed(SkillEngineService, mockEngine);

    const args = createParsedArgs({
      args: ["test-skill"],
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    // Should not throw - errors are handled and displayed
    await Effect.runPromise(program);
  });

  it("should pass noDeps flag to engine", async () => {
    let receivedOptions: any;
    const mockEngine: typeof SkillEngineService.Service = {
      enable: (projectPath, skillName, options) => {
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
    const TestLayer = Layer.succeed(SkillEngineService, mockEngine);

    const args = createParsedArgs({
      args: ["test-skill"],
      flags: { "no-deps": true },
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(receivedOptions?.noDeps).toBe(true);
  });

  it("should pass noInit flag to engine", async () => {
    let receivedOptions: any;
    const mockEngine: typeof SkillEngineService.Service = {
      enable: (projectPath, skillName, options) => {
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
    const TestLayer = Layer.succeed(SkillEngineService, mockEngine);

    const args = createParsedArgs({
      args: ["test-skill"],
      flags: { "no-init": true },
    });

    const program = skillsEnable(args).pipe(Effect.provide(TestLayer));

    await Effect.runPromise(program);
    expect(receivedOptions?.noInit).toBe(true);
  });
});
