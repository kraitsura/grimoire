/**
 * Tests for SkillStateService
 *
 * Tests project state management, enabled skills tracking, and global skills.
 * Uses mock layers to avoid file system operations.
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { Effect, Layer } from "effect";
import {
  SkillStateService,
  type StateFileReadError,
  type StateFileWriteError,
} from "../../src/services/skills/skill-state-service";
import type { AgentType } from "../../src/models/skill";
import { runTest, runTestExpectFailure } from "../utils";

/**
 * Create a mock SkillStateService for testing
 */
const createMockStateService = (initialState?: {
  projects?: Record<string, {
    agent: AgentType;
    enabled: string[];
    disabled_at: Record<string, string>;
    initialized_at: string;
    last_sync?: string;
  }>;
  global?: Record<AgentType, string[]>;
}) => {
  // In-memory state storage
  const state = {
    version: 1 as const,
    projects: { ...(initialState?.projects || {}) },
    global: { ...(initialState?.global || {}) } as Record<AgentType, string[]>,
  };

  const service = {
    getProjectState: (projectPath: string) =>
      Effect.succeed(state.projects[projectPath] || null),

    initProject: (projectPath: string, agent: AgentType) =>
      Effect.sync(() => {
        if (!state.projects[projectPath]) {
          state.projects[projectPath] = {
            agent,
            enabled: [],
            disabled_at: {},
            initialized_at: new Date().toISOString(),
          };
        }
      }),

    isInitialized: (projectPath: string) =>
      Effect.succeed(!!state.projects[projectPath]),

    getEnabled: (projectPath: string) =>
      Effect.succeed([...(state.projects[projectPath]?.enabled || [])]),

    setEnabled: (projectPath: string, skills: string[]) =>
      Effect.sync(() => {
        if (state.projects[projectPath]) {
          state.projects[projectPath].enabled = [...skills];
        }
      }),

    addEnabled: (projectPath: string, skill: string) =>
      Effect.sync(() => {
        if (state.projects[projectPath]) {
          const enabled = state.projects[projectPath].enabled;
          if (!enabled.includes(skill)) {
            state.projects[projectPath].enabled = [...enabled, skill];
          }
        }
      }),

    removeEnabled: (projectPath: string, skill: string) =>
      Effect.sync(() => {
        if (state.projects[projectPath]) {
          state.projects[projectPath].enabled =
            state.projects[projectPath].enabled.filter((s) => s !== skill);
        }
      }),

    getGlobalEnabled: (agent: AgentType) =>
      Effect.succeed([...(state.global[agent] || [])]),

    addGlobalEnabled: (agent: AgentType, skill: string) =>
      Effect.sync(() => {
        if (!state.global[agent]) {
          state.global[agent] = [];
        }
        if (!state.global[agent].includes(skill)) {
          state.global[agent] = [...state.global[agent], skill];
        }
      }),

    removeGlobalEnabled: (agent: AgentType, skill: string) =>
      Effect.sync(() => {
        if (state.global[agent]) {
          state.global[agent] = state.global[agent].filter((s) => s !== skill);
        }
      }),

    recordDisable: (projectPath: string, skill: string) =>
      Effect.sync(() => {
        if (state.projects[projectPath]) {
          state.projects[projectPath].disabled_at[skill] = new Date().toISOString();
        }
      }),

    updateLastSync: (projectPath: string) =>
      Effect.sync(() => {
        if (state.projects[projectPath]) {
          state.projects[projectPath].last_sync = new Date().toISOString();
        }
      }),
  };

  return {
    layer: Layer.succeed(SkillStateService, service),
    getState: () => state,
  };
};

describe("SkillStateService", () => {
  describe("getProjectState", () => {
    it("should return null for non-existent project", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          return yield* service.getProjectState("/non/existent/project");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toBeNull();
    });

    it("should return project state after initialization", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project";

          yield* service.initProject(projectPath, "claude_code");
          return yield* service.getProjectState(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("claude_code");
      expect(result?.enabled).toEqual([]);
      expect(result?.initialized_at).toBeDefined();
    });
  });

  describe("initProject", () => {
    it("should initialize new project with claude_code agent", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/claude";

          yield* service.initProject(projectPath, "claude_code");
          return yield* service.getProjectState(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("claude_code");
      expect(result?.enabled).toEqual([]);
      expect(result?.disabled_at).toEqual({});
    });

    it("should initialize new project with opencode agent", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/opencode";

          yield* service.initProject(projectPath, "opencode");
          return yield* service.getProjectState(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result?.agent).toBe("opencode");
    });

    it("should not overwrite existing project", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/existing";

          // Initialize first time
          yield* service.initProject(projectPath, "claude_code");
          const state1 = yield* service.getProjectState(projectPath);

          // Try to initialize again with different agent
          yield* service.initProject(projectPath, "opencode");
          const state2 = yield* service.getProjectState(projectPath);

          return { state1, state2 };
        }).pipe(Effect.provide(layer))
      );

      // Agent should remain claude_code
      expect(result.state1?.agent).toBe("claude_code");
      expect(result.state2?.agent).toBe("claude_code");
    });
  });

  describe("isInitialized", () => {
    it("should return false for non-initialized project", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          return yield* service.isInitialized("/non/existent/project");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toBe(false);
    });

    it("should return true for initialized project", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/init-check";

          yield* service.initProject(projectPath, "claude_code");
          return yield* service.isInitialized(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result).toBe(true);
    });
  });

  describe("getEnabled", () => {
    it("should return empty array for new project", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/get-enabled";

          yield* service.initProject(projectPath, "claude_code");
          return yield* service.getEnabled(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual([]);
    });

    it("should return empty array for non-existent project", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          return yield* service.getEnabled("/non/existent/project");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual([]);
    });
  });

  describe("setEnabled", () => {
    it("should set enabled skills for project", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/set-enabled";

          yield* service.initProject(projectPath, "claude_code");
          yield* service.setEnabled(projectPath, ["beads", "roo"]);
          return yield* service.getEnabled(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual(["beads", "roo"]);
    });

    it("should replace existing enabled skills", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/replace-enabled";

          yield* service.initProject(projectPath, "claude_code");
          yield* service.setEnabled(projectPath, ["skill1", "skill2"]);
          yield* service.setEnabled(projectPath, ["skill3"]);
          return yield* service.getEnabled(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual(["skill3"]);
    });
  });

  describe("addEnabled", () => {
    it("should add skill to enabled list", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/add-enabled";

          yield* service.initProject(projectPath, "claude_code");
          yield* service.addEnabled(projectPath, "beads");
          return yield* service.getEnabled(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual(["beads"]);
    });

    it("should not duplicate skills", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/no-duplicate";

          yield* service.initProject(projectPath, "claude_code");
          yield* service.addEnabled(projectPath, "beads");
          yield* service.addEnabled(projectPath, "beads");
          return yield* service.getEnabled(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual(["beads"]);
    });

    it("should add multiple skills", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/add-multiple";

          yield* service.initProject(projectPath, "claude_code");
          yield* service.addEnabled(projectPath, "beads");
          yield* service.addEnabled(projectPath, "roo");
          yield* service.addEnabled(projectPath, "playwright");
          return yield* service.getEnabled(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual(["beads", "roo", "playwright"]);
    });
  });

  describe("removeEnabled", () => {
    it("should remove skill from enabled list", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/remove-enabled";

          yield* service.initProject(projectPath, "claude_code");
          yield* service.addEnabled(projectPath, "beads");
          yield* service.addEnabled(projectPath, "roo");
          yield* service.removeEnabled(projectPath, "beads");
          return yield* service.getEnabled(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual(["roo"]);
    });

    it("should not fail for non-existent skill", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/remove-nonexistent";

          yield* service.initProject(projectPath, "claude_code");
          yield* service.removeEnabled(projectPath, "non-existent");
          return yield* service.getEnabled(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual([]);
    });
  });

  describe("Global Enabled Skills", () => {
    it("should get empty global enabled for new agent", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          return yield* service.getGlobalEnabled("claude_code");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual([]);
    });

    it("should add global enabled skill", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          yield* service.addGlobalEnabled("claude_code", "beads");
          return yield* service.getGlobalEnabled("claude_code");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual(["beads"]);
    });

    it("should not duplicate global skills", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          yield* service.addGlobalEnabled("claude_code", "beads");
          yield* service.addGlobalEnabled("claude_code", "beads");
          return yield* service.getGlobalEnabled("claude_code");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual(["beads"]);
    });

    it("should remove global enabled skill", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          yield* service.addGlobalEnabled("claude_code", "beads");
          yield* service.addGlobalEnabled("claude_code", "roo");
          yield* service.removeGlobalEnabled("claude_code", "beads");
          return yield* service.getGlobalEnabled("claude_code");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual(["roo"]);
    });

    it("should track skills separately per agent type", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          yield* service.addGlobalEnabled("claude_code", "beads");
          yield* service.addGlobalEnabled("opencode", "roo");

          const claudeSkills = yield* service.getGlobalEnabled("claude_code");
          const opencodeSkills = yield* service.getGlobalEnabled("opencode");

          return { claudeSkills, opencodeSkills };
        }).pipe(Effect.provide(layer))
      );

      expect(result.claudeSkills).toEqual(["beads"]);
      expect(result.opencodeSkills).toEqual(["roo"]);
    });
  });

  describe("recordDisable", () => {
    it("should record when skill was disabled", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/record-disable";

          yield* service.initProject(projectPath, "claude_code");
          yield* service.recordDisable(projectPath, "beads");
          return yield* service.getProjectState(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result?.disabled_at).toHaveProperty("beads");
      expect(result?.disabled_at.beads).toBeDefined();
    });
  });

  describe("updateLastSync", () => {
    it("should update last sync timestamp", async () => {
      const { layer } = createMockStateService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/last-sync";

          yield* service.initProject(projectPath, "claude_code");
          yield* service.updateLastSync(projectPath);
          return yield* service.getProjectState(projectPath);
        }).pipe(Effect.provide(layer))
      );

      expect(result?.last_sync).toBeDefined();
    });
  });

  describe("persistence", () => {
    it("should maintain state across operations", async () => {
      const { layer, getState } = createMockStateService();

      await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          const projectPath = "/test/project/persistence";

          yield* service.initProject(projectPath, "claude_code");
          yield* service.addEnabled(projectPath, "beads");
        }).pipe(Effect.provide(layer))
      );

      // Verify state is updated
      const state = getState();
      expect(state.projects["/test/project/persistence"].enabled).toEqual(["beads"]);
    });

    it("should initialize with pre-existing state", async () => {
      const { layer } = createMockStateService({
        projects: {
          "/existing/project": {
            agent: "claude_code",
            enabled: ["beads", "roo"],
            disabled_at: {},
            initialized_at: "2025-01-01T00:00:00.000Z",
          },
        },
      });

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* SkillStateService;
          return yield* service.getEnabled("/existing/project");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual(["beads", "roo"]);
    });
  });
});
