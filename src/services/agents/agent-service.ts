/**
 * Agent Service
 *
 * Manages agent CRUD operations for CLI tool subagents.
 * Agents are stored in ~/.grimoire/agents/ with state tracked in agents-state.json.
 */

import { Context, Effect, Layer, Data } from "effect";
import { join } from "path";
import { homedir } from "os";
import * as yaml from "js-yaml";
import type {
  AgentDefinition,
  AgentPlatform,
  AgentState,
  AgentProjectState,
  CachedAgent,
  MutableAgentState,
  MutableAgentProjectState,
} from "../../models/agent";
import {
  GLOBAL_AGENT_LOCATIONS,
  PROJECT_AGENT_LOCATIONS,
  PLATFORM_DETECTION_PATTERNS,
} from "../../models/agent";
import {
  AgentNotCachedError,
  AgentNotFoundError,
  AgentDefinitionError,
  AgentPlatformNotDetectedError,
  AgentProjectNotInitializedError,
} from "../../models/agent-errors";

// ============================================================================
// Error Types
// ============================================================================

export class AgentStateReadError extends Data.TaggedError("AgentStateReadError")<{
  message: string;
}> {}

export class AgentStateWriteError extends Data.TaggedError("AgentStateWriteError")<{
  message: string;
}> {}

export class AgentCacheError extends Data.TaggedError("AgentCacheError")<{
  message: string;
}> {}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the agents cache directory path
 */
const getCacheDir = (): string => {
  return join(homedir(), ".grimoire", "agents");
};

/**
 * Get the agents state file path
 */
const getStateFilePath = (): string => {
  return join(homedir(), ".grimoire", "agents-state.json");
};

/**
 * Get the default state
 */
const getDefaultState = (): MutableAgentState => ({
  version: 1,
  projects: {},
});

/**
 * Read and parse the state file
 */
const readStateFile = (): Effect.Effect<MutableAgentState, AgentStateReadError> =>
  Effect.gen(function* () {
    const statePath = getStateFilePath();
    const file = Bun.file(statePath);

    const exists = yield* Effect.promise(() => file.exists());
    if (!exists) {
      return getDefaultState();
    }

    const content = yield* Effect.promise(() => file.text());
    try {
      const parsed = JSON.parse(content) as MutableAgentState;
      // Create mutable copies of project states
      const projects: Record<string, MutableAgentProjectState> = {};
      for (const [key, proj] of Object.entries(parsed.projects || {})) {
        projects[key] = {
          platforms: [...(proj.platforms || [])],
          enabled: [...(proj.enabled || [])],
          initializedAt: proj.initializedAt,
          lastSync: proj.lastSync,
        };
      }
      return {
        version: parsed.version || 1,
        projects,
      };
    } catch {
      return getDefaultState();
    }
  }).pipe(
    Effect.catchAll(() => Effect.succeed(getDefaultState()))
  );

/**
 * Write the state file atomically
 */
const writeStateFile = (
  state: MutableAgentState
): Effect.Effect<void, AgentStateWriteError> =>
  Effect.gen(function* () {
    const statePath = getStateFilePath();
    const stateDir = join(homedir(), ".grimoire");
    const tempPath = `${statePath}.tmp`;

    try {
      // Ensure directory exists
      yield* Effect.promise(() =>
        import("fs/promises").then((fs) => fs.mkdir(stateDir, { recursive: true }))
      );

      const content = JSON.stringify(state, null, 2);
      yield* Effect.promise(() => Bun.write(tempPath, content));
      yield* Effect.promise(() =>
        import("fs/promises").then((fs) => fs.rename(tempPath, statePath))
      );
    } catch (error) {
      return yield* Effect.fail(
        new AgentStateWriteError({
          message: `Failed to write state file: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
  });

/**
 * Parse agent markdown file (frontmatter + content)
 */
const parseAgentFile = (
  content: string,
  name: string
): Effect.Effect<AgentDefinition, AgentDefinitionError> =>
  Effect.try({
    try: () => {
      // Check for YAML frontmatter
      if (!content.startsWith("---")) {
        throw new Error("Agent file must have YAML frontmatter");
      }

      const endMarker = content.indexOf("---", 3);
      if (endMarker === -1) {
        throw new Error("Invalid frontmatter - missing closing ---");
      }

      const frontmatterStr = content.slice(3, endMarker).trim();
      const body = content.slice(endMarker + 3).trim();

      const frontmatter = yaml.load(frontmatterStr) as Record<string, unknown>;

      return {
        name: (frontmatter.name as string) || name,
        description: (frontmatter.description as string) || "",
        tools: frontmatter.tools as string[] | undefined,
        model: frontmatter.model as string | undefined,
        content: body,
        wraps_cli: frontmatter.wraps_cli as string | undefined,
        tags: frontmatter.tags as string[] | undefined,
      };
    },
    catch: (error) =>
      new AgentDefinitionError({
        name,
        message: error instanceof Error ? error.message : String(error),
      }),
  });

/**
 * Serialize agent definition to markdown
 */
const serializeAgent = (agent: AgentDefinition): string => {
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
  };

  if (agent.tools && agent.tools.length > 0) {
    frontmatter.tools = agent.tools;
  }
  if (agent.model) {
    frontmatter.model = agent.model;
  }
  if (agent.wraps_cli) {
    frontmatter.wraps_cli = agent.wraps_cli;
  }
  if (agent.tags && agent.tags.length > 0) {
    frontmatter.tags = agent.tags;
  }

  const yamlStr = yaml.dump(frontmatter, { lineWidth: -1 });
  return `---\n${yamlStr}---\n\n${agent.content}`;
};

// ============================================================================
// Service Interface
// ============================================================================

interface AgentServiceImpl {
  // Cache management (global agents in ~/.grimoire/agents/)
  readonly listCached: () => Effect.Effect<CachedAgent[], AgentStateReadError>;
  readonly getCached: (name: string) => Effect.Effect<CachedAgent, AgentNotCachedError | AgentDefinitionError>;
  readonly cache: (agent: AgentDefinition, source?: string) => Effect.Effect<void, AgentCacheError>;
  readonly removeCached: (name: string) => Effect.Effect<void, AgentCacheError>;

  // Project agents
  readonly listEnabled: (projectPath: string) => Effect.Effect<readonly string[], AgentStateReadError>;
  readonly isEnabled: (name: string, projectPath: string) => Effect.Effect<boolean, AgentStateReadError>;
  readonly enable: (
    name: string,
    projectPath: string
  ) => Effect.Effect<void, AgentStateReadError | AgentStateWriteError | AgentNotCachedError | AgentProjectNotInitializedError>;
  readonly disable: (
    name: string,
    projectPath: string
  ) => Effect.Effect<void, AgentStateReadError | AgentStateWriteError>;

  // Project initialization
  readonly isInitialized: (projectPath: string) => Effect.Effect<boolean, AgentStateReadError>;
  readonly initProject: (
    projectPath: string,
    platforms: AgentPlatform[]
  ) => Effect.Effect<void, AgentStateReadError | AgentStateWriteError>;
  readonly getProjectState: (
    projectPath: string
  ) => Effect.Effect<AgentProjectState | null, AgentStateReadError>;

  // Platform detection
  readonly detectPlatforms: (projectPath: string) => Effect.Effect<AgentPlatform[], never>;
}

// ============================================================================
// Service Tag
// ============================================================================

export class AgentService extends Context.Tag("AgentService")<
  AgentService,
  AgentServiceImpl
>() {}

// ============================================================================
// Service Implementation
// ============================================================================

export const AgentServiceLive = Layer.succeed(
  AgentService,
  AgentService.of({
    // ========================================================================
    // Cache Management
    // ========================================================================

    listCached: () =>
      Effect.gen(function* () {
        const cacheDir = getCacheDir();
        const fs = yield* Effect.promise(() => import("fs/promises"));

        // Check if cache directory exists
        try {
          yield* Effect.promise(() => fs.access(cacheDir));
        } catch {
          return [];
        }

        // Read directory entries
        const entries = yield* Effect.promise(() => fs.readdir(cacheDir, { withFileTypes: true }));

        const agents: CachedAgent[] = [];

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const agentPath = join(cacheDir, entry.name, "AGENT.md");
          const metaPath = join(cacheDir, entry.name, ".meta.json");

          const agentFile = Bun.file(agentPath);
          const agentExists = yield* Effect.promise(() => agentFile.exists());
          if (!agentExists) continue;

          const content = yield* Effect.promise(() => agentFile.text());
          const definition = yield* parseAgentFile(content, entry.name).pipe(
            Effect.catchAll(() => Effect.succeed(null))
          );

          if (!definition) continue;

          // Try to read metadata
          let source = "local";
          let cachedAt = new Date().toISOString();

          const metaFile = Bun.file(metaPath);
          const metaExists = yield* Effect.promise(() => metaFile.exists());
          if (metaExists) {
            try {
              const metaContent = yield* Effect.promise(() => metaFile.text());
              const meta = JSON.parse(metaContent) as { source?: string; cachedAt?: string };
              source = meta.source || source;
              cachedAt = meta.cachedAt || cachedAt;
            } catch {
              // Ignore meta read errors
            }
          }

          agents.push({
            name: definition.name,
            source,
            cachedAt,
            definition,
          });
        }

        return agents;
      }),

    getCached: (name: string) =>
      Effect.gen(function* () {
        const cacheDir = getCacheDir();
        const agentPath = join(cacheDir, name, "AGENT.md");
        const metaPath = join(cacheDir, name, ".meta.json");

        const agentFile = Bun.file(agentPath);
        const exists = yield* Effect.promise(() => agentFile.exists());

        if (!exists) {
          return yield* Effect.fail(new AgentNotCachedError({ name }));
        }

        const content = yield* Effect.promise(() => agentFile.text());
        const definition = yield* parseAgentFile(content, name);

        // Try to read metadata
        let source = "local";
        let cachedAt = new Date().toISOString();

        const metaFile = Bun.file(metaPath);
        const metaExists = yield* Effect.promise(() => metaFile.exists());
        if (metaExists) {
          try {
            const metaContent = yield* Effect.promise(() => metaFile.text());
            const meta = JSON.parse(metaContent) as { source?: string; cachedAt?: string };
            source = meta.source || source;
            cachedAt = meta.cachedAt || cachedAt;
          } catch {
            // Ignore meta read errors
          }
        }

        return {
          name: definition.name,
          source,
          cachedAt,
          definition,
        };
      }),

    cache: (agent: AgentDefinition, source = "local") =>
      Effect.gen(function* () {
        const cacheDir = getCacheDir();
        const agentDir = join(cacheDir, agent.name);
        const agentPath = join(agentDir, "AGENT.md");
        const metaPath = join(agentDir, ".meta.json");

        try {
          // Ensure directory exists
          const fs = yield* Effect.promise(() => import("fs/promises"));
          yield* Effect.promise(() => fs.mkdir(agentDir, { recursive: true }));

          // Write agent file
          const content = serializeAgent(agent);
          yield* Effect.promise(() => Bun.write(agentPath, content));

          // Write metadata
          const meta = {
            source,
            cachedAt: new Date().toISOString(),
          };
          yield* Effect.promise(() => Bun.write(metaPath, JSON.stringify(meta, null, 2)));
        } catch (error) {
          return yield* Effect.fail(
            new AgentCacheError({
              message: `Failed to cache agent: ${error instanceof Error ? error.message : String(error)}`,
            })
          );
        }
      }),

    removeCached: (name: string) =>
      Effect.gen(function* () {
        const cacheDir = getCacheDir();
        const agentDir = join(cacheDir, name);

        try {
          const fs = yield* Effect.promise(() => import("fs/promises"));
          yield* Effect.promise(() => fs.rm(agentDir, { recursive: true, force: true }));
        } catch (error) {
          return yield* Effect.fail(
            new AgentCacheError({
              message: `Failed to remove cached agent: ${error instanceof Error ? error.message : String(error)}`,
            })
          );
        }
      }),

    // ========================================================================
    // Project Management
    // ========================================================================

    listEnabled: (projectPath: string) =>
      Effect.gen(function* () {
        const state = yield* readStateFile();
        const projectState = state.projects[projectPath];
        return projectState?.enabled || [];
      }),

    isEnabled: (name: string, projectPath: string) =>
      Effect.gen(function* () {
        const state = yield* readStateFile();
        const projectState = state.projects[projectPath];
        return projectState?.enabled?.includes(name) || false;
      }),

    enable: (name: string, projectPath: string) =>
      Effect.gen(function* () {
        const state = yield* readStateFile();

        // Ensure project is initialized
        if (!state.projects[projectPath]) {
          return yield* Effect.fail(
            new AgentProjectNotInitializedError({ path: projectPath })
          );
        }

        // Check agent exists in cache
        const cacheDir = getCacheDir();
        const agentPath = join(cacheDir, name, "AGENT.md");
        const exists = yield* Effect.promise(() => Bun.file(agentPath).exists());
        if (!exists) {
          return yield* Effect.fail(new AgentNotCachedError({ name }));
        }

        // Add to enabled list if not already
        const projectState = state.projects[projectPath];
        if (!projectState.enabled.includes(name)) {
          projectState.enabled.push(name);
          yield* writeStateFile(state);
        }
      }),

    disable: (name: string, projectPath: string) =>
      Effect.gen(function* () {
        const state = yield* readStateFile();
        const projectState = state.projects[projectPath];

        if (projectState) {
          projectState.enabled = projectState.enabled.filter((n) => n !== name);
          yield* writeStateFile(state);
        }
      }),

    isInitialized: (projectPath: string) =>
      Effect.gen(function* () {
        const state = yield* readStateFile();
        return !!state.projects[projectPath];
      }),

    initProject: (projectPath: string, platforms: AgentPlatform[]) =>
      Effect.gen(function* () {
        const state = yield* readStateFile();

        state.projects[projectPath] = {
          platforms,
          enabled: [],
          initializedAt: new Date().toISOString(),
        };

        yield* writeStateFile(state);
      }),

    getProjectState: (projectPath: string) =>
      Effect.gen(function* () {
        const state = yield* readStateFile();
        return state.projects[projectPath] || null;
      }),

    // ========================================================================
    // Platform Detection
    // ========================================================================

    detectPlatforms: (projectPath: string) =>
      Effect.gen(function* () {
        const detected: AgentPlatform[] = [];
        const fs = yield* Effect.promise(() => import("fs/promises"));

        for (const [platform, patterns] of Object.entries(PLATFORM_DETECTION_PATTERNS)) {
          for (const pattern of patterns) {
            const fullPath = join(projectPath, pattern);
            const exists = yield* Effect.promise(async () => {
              try {
                await fs.access(fullPath);
                return true;
              } catch {
                return false;
              }
            });
            if (exists) {
              detected.push(platform as AgentPlatform);
              break; // Only need to match one pattern per platform
            }
          }
        }

        // If nothing detected, default to claude_code
        if (detected.length === 0) {
          detected.push("claude_code");
        }

        return detected;
      }),
  })
);
