/**
 * Tests for AgentService
 *
 * Tests agent CRUD operations, caching, project management, and platform detection.
 * Uses mock layers to avoid file system operations.
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import {
  AgentService,
  AgentStateReadError,
  AgentStateWriteError,
  AgentCacheError,
} from "../../src/services/agents/agent-service";
import type {
  AgentDefinition,
  AgentPlatform,
  CachedAgent,
  AgentProjectState,
} from "../../src/models/agent";
import {
  AgentNotCachedError,
  AgentProjectNotInitializedError,
} from "../../src/models/agent-errors";
import { runTest, runTestExpectFailure } from "../utils";

/**
 * Create a mock AgentService for testing
 */
const createMockAgentService = (initialState?: {
  cachedAgents?: Map<string, CachedAgent>;
  projects?: Record<string, {
    platforms: AgentPlatform[];
    enabled: string[];
    initializedAt: string;
    lastSync?: string;
  }>;
}) => {
  const cachedAgents = initialState?.cachedAgents || new Map<string, CachedAgent>();
  const projects = { ...(initialState?.projects || {}) };

  const service = {
    // Cache management
    listCached: () =>
      Effect.succeed(Array.from(cachedAgents.values())),

    getCached: (name: string) =>
      Effect.gen(function* () {
        const agent = cachedAgents.get(name);
        if (!agent) {
          return yield* Effect.fail(new AgentNotCachedError({ name }));
        }
        return agent;
      }),

    cache: (agent: AgentDefinition, source = "local") =>
      Effect.sync(() => {
        cachedAgents.set(agent.name, {
          name: agent.name,
          source,
          cachedAt: new Date().toISOString(),
          definition: agent,
        });
      }),

    removeCached: (name: string) =>
      Effect.sync(() => {
        cachedAgents.delete(name);
      }),

    // Project management
    listEnabled: (projectPath: string) =>
      Effect.succeed([...(projects[projectPath]?.enabled || [])] as readonly string[]),

    isEnabled: (name: string, projectPath: string) =>
      Effect.succeed(projects[projectPath]?.enabled?.includes(name) || false),

    enable: (name: string, projectPath: string) =>
      Effect.gen(function* () {
        if (!projects[projectPath]) {
          return yield* Effect.fail(new AgentProjectNotInitializedError({ path: projectPath }));
        }
        if (!cachedAgents.has(name)) {
          return yield* Effect.fail(new AgentNotCachedError({ name }));
        }
        if (!projects[projectPath].enabled.includes(name)) {
          projects[projectPath].enabled.push(name);
        }
      }),

    disable: (name: string, projectPath: string) =>
      Effect.sync(() => {
        if (projects[projectPath]) {
          projects[projectPath].enabled = projects[projectPath].enabled.filter(
            (n) => n !== name
          );
        }
      }),

    isInitialized: (projectPath: string) =>
      Effect.succeed(!!projects[projectPath]),

    initProject: (projectPath: string, platforms: AgentPlatform[]) =>
      Effect.sync(() => {
        projects[projectPath] = {
          platforms,
          enabled: [],
          initializedAt: new Date().toISOString(),
        };
      }),

    getProjectState: (projectPath: string) =>
      Effect.succeed(projects[projectPath] || null),

    // Platform detection
    detectPlatforms: (_projectPath: string) =>
      Effect.succeed(["claude_code"] as AgentPlatform[]),
  };

  return {
    layer: Layer.succeed(AgentService, service),
    getCache: () => cachedAgents,
    getProjects: () => projects,
  };
};

/**
 * Create a test agent definition
 */
const createTestAgent = (name: string, overrides?: Partial<AgentDefinition>): AgentDefinition => ({
  name,
  description: `Test agent: ${name}`,
  content: `# ${name}\n\nThis is a test agent.`,
  ...overrides,
});

describe("AgentService", () => {
  describe("Cache Management", () => {
    describe("listCached", () => {
      it("should return empty array when no agents cached", async () => {
        const { layer } = createMockAgentService();

        const result = await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            return yield* service.listCached();
          }).pipe(Effect.provide(layer))
        );

        expect(result).toEqual([]);
      });

      it("should return all cached agents", async () => {
        const cachedAgents = new Map<string, CachedAgent>([
          ["agent1", {
            name: "agent1",
            source: "local",
            cachedAt: "2025-01-01T00:00:00.000Z",
            definition: createTestAgent("agent1"),
          }],
          ["agent2", {
            name: "agent2",
            source: "github:test/repo",
            cachedAt: "2025-01-01T00:00:00.000Z",
            definition: createTestAgent("agent2"),
          }],
        ]);

        const { layer } = createMockAgentService({ cachedAgents });

        const result = await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            return yield* service.listCached();
          }).pipe(Effect.provide(layer))
        );

        expect(result).toHaveLength(2);
        expect(result.map((a) => a.name)).toContain("agent1");
        expect(result.map((a) => a.name)).toContain("agent2");
      });
    });

    describe("getCached", () => {
      it("should return cached agent by name", async () => {
        const cachedAgents = new Map<string, CachedAgent>([
          ["test-agent", {
            name: "test-agent",
            source: "local",
            cachedAt: "2025-01-01T00:00:00.000Z",
            definition: createTestAgent("test-agent"),
          }],
        ]);

        const { layer } = createMockAgentService({ cachedAgents });

        const result = await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            return yield* service.getCached("test-agent");
          }).pipe(Effect.provide(layer))
        );

        expect(result.name).toBe("test-agent");
        expect(result.definition.description).toBe("Test agent: test-agent");
      });

      it("should fail with AgentNotCachedError for non-existent agent", async () => {
        const { layer } = createMockAgentService();

        const error = await runTestExpectFailure(
          Effect.gen(function* () {
            const service = yield* AgentService;
            return yield* service.getCached("non-existent");
          }).pipe(Effect.provide(layer))
        );

        expect(error._tag).toBe("AgentNotCachedError");
      });
    });

    describe("cache", () => {
      it("should cache an agent definition", async () => {
        const { layer, getCache } = createMockAgentService();

        await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            yield* service.cache(createTestAgent("new-agent"), "local");
          }).pipe(Effect.provide(layer))
        );

        const cache = getCache();
        expect(cache.has("new-agent")).toBe(true);
        expect(cache.get("new-agent")?.source).toBe("local");
      });

      it("should overwrite existing cached agent", async () => {
        const cachedAgents = new Map<string, CachedAgent>([
          ["test-agent", {
            name: "test-agent",
            source: "local",
            cachedAt: "2025-01-01T00:00:00.000Z",
            definition: createTestAgent("test-agent", { description: "Old" }),
          }],
        ]);

        const { layer, getCache } = createMockAgentService({ cachedAgents });

        await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            yield* service.cache(
              createTestAgent("test-agent", { description: "New" }),
              "github:new/source"
            );
          }).pipe(Effect.provide(layer))
        );

        const cache = getCache();
        expect(cache.get("test-agent")?.definition.description).toBe("New");
        expect(cache.get("test-agent")?.source).toBe("github:new/source");
      });
    });

    describe("removeCached", () => {
      it("should remove cached agent", async () => {
        const cachedAgents = new Map<string, CachedAgent>([
          ["test-agent", {
            name: "test-agent",
            source: "local",
            cachedAt: "2025-01-01T00:00:00.000Z",
            definition: createTestAgent("test-agent"),
          }],
        ]);

        const { layer, getCache } = createMockAgentService({ cachedAgents });

        await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            yield* service.removeCached("test-agent");
          }).pipe(Effect.provide(layer))
        );

        const cache = getCache();
        expect(cache.has("test-agent")).toBe(false);
      });

      it("should not fail for non-existent agent", async () => {
        const { layer } = createMockAgentService();

        // Should not throw
        await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            yield* service.removeCached("non-existent");
          }).pipe(Effect.provide(layer))
        );
      });
    });
  });

  describe("Project Management", () => {
    describe("initProject", () => {
      it("should initialize project with platforms", async () => {
        const { layer, getProjects } = createMockAgentService();

        await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            yield* service.initProject("/test/project", ["claude_code"]);
          }).pipe(Effect.provide(layer))
        );

        const projects = getProjects();
        expect(projects["/test/project"]).toBeDefined();
        expect(projects["/test/project"].platforms).toEqual(["claude_code"]);
        expect(projects["/test/project"].enabled).toEqual([]);
      });

      it("should initialize project with multiple platforms", async () => {
        const { layer, getProjects } = createMockAgentService();

        await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            yield* service.initProject("/test/project", ["claude_code", "opencode"]);
          }).pipe(Effect.provide(layer))
        );

        const projects = getProjects();
        expect(projects["/test/project"].platforms).toEqual(["claude_code", "opencode"]);
      });
    });

    describe("isInitialized", () => {
      it("should return false for non-initialized project", async () => {
        const { layer } = createMockAgentService();

        const result = await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            return yield* service.isInitialized("/non/existent");
          }).pipe(Effect.provide(layer))
        );

        expect(result).toBe(false);
      });

      it("should return true for initialized project", async () => {
        const { layer } = createMockAgentService({
          projects: {
            "/test/project": {
              platforms: ["claude_code"],
              enabled: [],
              initializedAt: "2025-01-01T00:00:00.000Z",
            },
          },
        });

        const result = await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            return yield* service.isInitialized("/test/project");
          }).pipe(Effect.provide(layer))
        );

        expect(result).toBe(true);
      });
    });

    describe("getProjectState", () => {
      it("should return null for non-initialized project", async () => {
        const { layer } = createMockAgentService();

        const result = await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            return yield* service.getProjectState("/non/existent");
          }).pipe(Effect.provide(layer))
        );

        expect(result).toBeNull();
      });

      it("should return project state for initialized project", async () => {
        const { layer } = createMockAgentService({
          projects: {
            "/test/project": {
              platforms: ["claude_code"],
              enabled: ["agent1"],
              initializedAt: "2025-01-01T00:00:00.000Z",
            },
          },
        });

        const result = await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            return yield* service.getProjectState("/test/project");
          }).pipe(Effect.provide(layer))
        );

        expect(result).not.toBeNull();
        expect(result?.platforms).toEqual(["claude_code"]);
        expect(result?.enabled).toEqual(["agent1"]);
      });
    });

    describe("enable", () => {
      it("should enable a cached agent in initialized project", async () => {
        const cachedAgents = new Map<string, CachedAgent>([
          ["test-agent", {
            name: "test-agent",
            source: "local",
            cachedAt: "2025-01-01T00:00:00.000Z",
            definition: createTestAgent("test-agent"),
          }],
        ]);

        const { layer, getProjects } = createMockAgentService({
          cachedAgents,
          projects: {
            "/test/project": {
              platforms: ["claude_code"],
              enabled: [],
              initializedAt: "2025-01-01T00:00:00.000Z",
            },
          },
        });

        await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            yield* service.enable("test-agent", "/test/project");
          }).pipe(Effect.provide(layer))
        );

        const projects = getProjects();
        expect(projects["/test/project"].enabled).toContain("test-agent");
      });

      it("should fail if project not initialized", async () => {
        const cachedAgents = new Map<string, CachedAgent>([
          ["test-agent", {
            name: "test-agent",
            source: "local",
            cachedAt: "2025-01-01T00:00:00.000Z",
            definition: createTestAgent("test-agent"),
          }],
        ]);

        const { layer } = createMockAgentService({ cachedAgents });

        const error = await runTestExpectFailure(
          Effect.gen(function* () {
            const service = yield* AgentService;
            yield* service.enable("test-agent", "/non/existent");
          }).pipe(Effect.provide(layer))
        );

        expect(error._tag).toBe("AgentProjectNotInitializedError");
      });

      it("should fail if agent not cached", async () => {
        const { layer } = createMockAgentService({
          projects: {
            "/test/project": {
              platforms: ["claude_code"],
              enabled: [],
              initializedAt: "2025-01-01T00:00:00.000Z",
            },
          },
        });

        const error = await runTestExpectFailure(
          Effect.gen(function* () {
            const service = yield* AgentService;
            yield* service.enable("non-existent", "/test/project");
          }).pipe(Effect.provide(layer))
        );

        expect(error._tag).toBe("AgentNotCachedError");
      });

      it("should not duplicate enabled agents", async () => {
        const cachedAgents = new Map<string, CachedAgent>([
          ["test-agent", {
            name: "test-agent",
            source: "local",
            cachedAt: "2025-01-01T00:00:00.000Z",
            definition: createTestAgent("test-agent"),
          }],
        ]);

        const { layer, getProjects } = createMockAgentService({
          cachedAgents,
          projects: {
            "/test/project": {
              platforms: ["claude_code"],
              enabled: ["test-agent"],
              initializedAt: "2025-01-01T00:00:00.000Z",
            },
          },
        });

        await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            yield* service.enable("test-agent", "/test/project");
          }).pipe(Effect.provide(layer))
        );

        const projects = getProjects();
        expect(projects["/test/project"].enabled).toEqual(["test-agent"]);
      });
    });

    describe("disable", () => {
      it("should disable an enabled agent", async () => {
        const { layer, getProjects } = createMockAgentService({
          projects: {
            "/test/project": {
              platforms: ["claude_code"],
              enabled: ["agent1", "agent2"],
              initializedAt: "2025-01-01T00:00:00.000Z",
            },
          },
        });

        await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            yield* service.disable("agent1", "/test/project");
          }).pipe(Effect.provide(layer))
        );

        const projects = getProjects();
        expect(projects["/test/project"].enabled).toEqual(["agent2"]);
      });

      it("should not fail for non-enabled agent", async () => {
        const { layer } = createMockAgentService({
          projects: {
            "/test/project": {
              platforms: ["claude_code"],
              enabled: [],
              initializedAt: "2025-01-01T00:00:00.000Z",
            },
          },
        });

        // Should not throw
        await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            yield* service.disable("non-existent", "/test/project");
          }).pipe(Effect.provide(layer))
        );
      });
    });

    describe("listEnabled", () => {
      it("should return empty array for non-initialized project", async () => {
        const { layer } = createMockAgentService();

        const result = await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            return yield* service.listEnabled("/non/existent");
          }).pipe(Effect.provide(layer))
        );

        expect(result).toEqual([]);
      });

      it("should return enabled agents for project", async () => {
        const { layer } = createMockAgentService({
          projects: {
            "/test/project": {
              platforms: ["claude_code"],
              enabled: ["agent1", "agent2"],
              initializedAt: "2025-01-01T00:00:00.000Z",
            },
          },
        });

        const result = await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            return yield* service.listEnabled("/test/project");
          }).pipe(Effect.provide(layer))
        );

        expect(result).toEqual(["agent1", "agent2"]);
      });
    });

    describe("isEnabled", () => {
      it("should return false for non-initialized project", async () => {
        const { layer } = createMockAgentService();

        const result = await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            return yield* service.isEnabled("agent1", "/non/existent");
          }).pipe(Effect.provide(layer))
        );

        expect(result).toBe(false);
      });

      it("should return true for enabled agent", async () => {
        const { layer } = createMockAgentService({
          projects: {
            "/test/project": {
              platforms: ["claude_code"],
              enabled: ["agent1"],
              initializedAt: "2025-01-01T00:00:00.000Z",
            },
          },
        });

        const result = await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            return yield* service.isEnabled("agent1", "/test/project");
          }).pipe(Effect.provide(layer))
        );

        expect(result).toBe(true);
      });

      it("should return false for non-enabled agent", async () => {
        const { layer } = createMockAgentService({
          projects: {
            "/test/project": {
              platforms: ["claude_code"],
              enabled: ["agent1"],
              initializedAt: "2025-01-01T00:00:00.000Z",
            },
          },
        });

        const result = await runTest(
          Effect.gen(function* () {
            const service = yield* AgentService;
            return yield* service.isEnabled("agent2", "/test/project");
          }).pipe(Effect.provide(layer))
        );

        expect(result).toBe(false);
      });
    });
  });

  describe("Platform Detection", () => {
    it("should detect platforms for project", async () => {
      const { layer } = createMockAgentService();

      const result = await runTest(
        Effect.gen(function* () {
          const service = yield* AgentService;
          return yield* service.detectPlatforms("/test/project");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toContain("claude_code");
    });
  });
});
