import { Context, Effect, Layer, Data } from "effect";
import { join } from "path";
import { homedir } from "os";
import type { AgentType, ProjectState, SkillsState, InstallScope } from "../../models/skill";

// Mutable internal types for state manipulation
interface MutableProjectState {
  agent: AgentType;
  enabled: string[];
  disabled_at: Record<string, string>;
  initialized_at: string;
  last_sync?: string;
}

/**
 * Global skills state per agent type
 * Tracks skills installed at the user level (not project-specific)
 */
type MutableGlobalState = Record<AgentType, string[]>;

interface MutableSkillsState {
  version: number;
  /** Global (user-wide) skill installations per agent */
  global?: MutableGlobalState;
  /** Per-project skill installations */
  projects: Record<string, MutableProjectState>;
}

// Error types
export class StateFileReadError extends Data.TaggedError("StateFileReadError")<{
  message: string;
}> {}

export class StateFileWriteError extends Data.TaggedError("StateFileWriteError")<{
  message: string;
}> {}

/**
 * Get the skills state file path
 */
const getStateFilePath = (): string => {
  return join(homedir(), ".grimoire", "skills-state.json");
};

/**
 * Get the default state
 */
const getDefaultState = (): MutableSkillsState => ({
  version: 1,
  projects: {},
});

/**
 * Parse JSON state file content
 */
const parseStateFile = (
  content: string
): Effect.Effect<MutableSkillsState, StateFileReadError> =>
  Effect.try({
    try: () => {
      const parsed = JSON.parse(content) as MutableSkillsState;
      // Ensure we have required structure
      return {
        version: parsed.version || 1,
        projects: parsed.projects || {},
      };
    },
    catch: (error) =>
      new StateFileReadError({
        message: `Failed to parse state file: ${error instanceof Error ? error.message : String(error)}`,
      }),
  });

/**
 * Read the state file
 */
const readStateFile = (): Effect.Effect<MutableSkillsState, StateFileReadError> =>
  Effect.gen(function* () {
    const statePath = getStateFilePath();
    const file = Bun.file(statePath);

    const exists = yield* Effect.promise(() => file.exists());
    if (!exists) {
      // Return default state if file doesn't exist
      return getDefaultState();
    }

    const content = yield* Effect.promise(() => file.text());
    return yield* parseStateFile(content);
  }).pipe(
    Effect.catchAll(() => {
      // On any error, return default state
      return Effect.succeed(getDefaultState());
    })
  );

/**
 * Write the state file atomically
 */
const writeStateFile = (
  state: MutableSkillsState
): Effect.Effect<void, StateFileWriteError> =>
  Effect.gen(function* () {
    const statePath = getStateFilePath();
    const stateDir = join(homedir(), ".grimoire");
    const tempPath = `${statePath}.tmp`;

    try {
      // Ensure directory exists
      yield* Effect.promise(() =>
        import("fs/promises").then((fs) => fs.mkdir(stateDir, { recursive: true }))
      );

      // Serialize state to JSON
      const content = JSON.stringify(state, null, 2);

      // Write to temp file
      yield* Effect.promise(() => Bun.write(tempPath, content));

      // Atomic rename
      yield* Effect.promise(() =>
        import("fs/promises").then((fs) => fs.rename(tempPath, statePath))
      );
    } catch (error) {
      return yield* Effect.fail(
        new StateFileWriteError({
          message: `Failed to write state file: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
  });

// Service interface
interface SkillStateServiceImpl {
  // Project state
  readonly getProjectState: (
    projectPath: string
  ) => Effect.Effect<ProjectState | null, StateFileReadError>;
  readonly initProject: (
    projectPath: string,
    agent: AgentType
  ) => Effect.Effect<void, StateFileReadError | StateFileWriteError>;
  readonly isInitialized: (
    projectPath: string
  ) => Effect.Effect<boolean, StateFileReadError>;

  // Project-scoped enabled skills
  readonly getEnabled: (
    projectPath: string
  ) => Effect.Effect<string[], StateFileReadError>;
  readonly setEnabled: (
    projectPath: string,
    skills: string[]
  ) => Effect.Effect<void, StateFileReadError | StateFileWriteError>;
  readonly addEnabled: (
    projectPath: string,
    skill: string
  ) => Effect.Effect<void, StateFileReadError | StateFileWriteError>;
  readonly removeEnabled: (
    projectPath: string,
    skill: string
  ) => Effect.Effect<void, StateFileReadError | StateFileWriteError>;

  // Global-scoped enabled skills (user-wide per agent type)
  readonly getGlobalEnabled: (
    agent: AgentType
  ) => Effect.Effect<string[], StateFileReadError>;
  readonly addGlobalEnabled: (
    agent: AgentType,
    skill: string
  ) => Effect.Effect<void, StateFileReadError | StateFileWriteError>;
  readonly removeGlobalEnabled: (
    agent: AgentType,
    skill: string
  ) => Effect.Effect<void, StateFileReadError | StateFileWriteError>;

  // Tracking
  readonly recordDisable: (
    projectPath: string,
    skill: string
  ) => Effect.Effect<void, StateFileReadError | StateFileWriteError>;
  readonly updateLastSync: (
    projectPath: string
  ) => Effect.Effect<void, StateFileReadError | StateFileWriteError>;
}

// Service tag
export class SkillStateService extends Context.Tag("SkillStateService")<
  SkillStateService,
  SkillStateServiceImpl
>() {}

// Service implementation
const makeSkillStateService = (): SkillStateServiceImpl => ({
  getProjectState: (projectPath: string) =>
    Effect.gen(function* () {
      const state = yield* readStateFile();
      return state.projects[projectPath] || null;
    }),

  initProject: (projectPath: string, agent: AgentType) =>
    Effect.gen(function* () {
      const state = yield* readStateFile();

      // Don't overwrite existing project
      if (state.projects[projectPath]) {
        return;
      }

      // Initialize new project state
      state.projects[projectPath] = {
        agent,
        enabled: [],
        disabled_at: {},
        initialized_at: new Date().toISOString(),
      };

      yield* writeStateFile(state);
    }),

  isInitialized: (projectPath: string) =>
    Effect.gen(function* () {
      const state = yield* readStateFile();
      return projectPath in state.projects;
    }),

  getEnabled: (projectPath: string) =>
    Effect.gen(function* () {
      const state = yield* readStateFile();
      const enabled = state.projects[projectPath]?.enabled || [];
      // Return mutable copy
      return [...enabled];
    }),

  setEnabled: (projectPath: string, skills: string[]) =>
    Effect.gen(function* () {
      const state = yield* readStateFile();

      // Ensure project exists
      if (!state.projects[projectPath]) {
        return;
      }

      state.projects[projectPath].enabled = skills;
      yield* writeStateFile(state);
    }),

  addEnabled: (projectPath: string, skill: string) =>
    Effect.gen(function* () {
      const state = yield* readStateFile();

      // Ensure project exists
      if (!state.projects[projectPath]) {
        return;
      }

      const project = state.projects[projectPath];

      // Add skill if not already enabled
      if (!project.enabled.includes(skill)) {
        project.enabled = [...project.enabled, skill];
        yield* writeStateFile(state);
      }
    }),

  removeEnabled: (projectPath: string, skill: string) =>
    Effect.gen(function* () {
      const state = yield* readStateFile();

      // Ensure project exists
      if (!state.projects[projectPath]) {
        return;
      }

      const project = state.projects[projectPath];

      // Remove skill if present
      const newEnabled = project.enabled.filter((s) => s !== skill);
      if (newEnabled.length !== project.enabled.length) {
        project.enabled = newEnabled;
        yield* writeStateFile(state);
      }
    }),

  // Global-scoped skill methods
  getGlobalEnabled: (agent: AgentType) =>
    Effect.gen(function* () {
      const state = yield* readStateFile();
      const globalState = state.global || ({} as MutableGlobalState);
      const enabled = globalState[agent] || [];
      return [...enabled];
    }),

  addGlobalEnabled: (agent: AgentType, skill: string) =>
    Effect.gen(function* () {
      const state = yield* readStateFile();

      // Initialize global state if not present
      if (!state.global) {
        state.global = {} as MutableGlobalState;
      }
      if (!state.global[agent]) {
        state.global[agent] = [];
      }

      // Add skill if not already enabled
      if (!state.global[agent].includes(skill)) {
        state.global[agent] = [...state.global[agent], skill];
        yield* writeStateFile(state);
      }
    }),

  removeGlobalEnabled: (agent: AgentType, skill: string) =>
    Effect.gen(function* () {
      const state = yield* readStateFile();

      // Check if global state exists
      if (!state.global?.[agent]) {
        return;
      }

      // Remove skill if present
      const newEnabled = state.global[agent].filter((s) => s !== skill);
      if (newEnabled.length !== state.global[agent].length) {
        state.global[agent] = newEnabled;
        yield* writeStateFile(state);
      }
    }),

  recordDisable: (projectPath: string, skill: string) =>
    Effect.gen(function* () {
      const state = yield* readStateFile();

      // Ensure project exists
      if (!state.projects[projectPath]) {
        return;
      }

      const project = state.projects[projectPath];

      // Record when the skill was disabled
      project.disabled_at[skill] = new Date().toISOString();

      yield* writeStateFile(state);
    }),

  updateLastSync: (projectPath: string) =>
    Effect.gen(function* () {
      const state = yield* readStateFile();

      // Ensure project exists
      if (!state.projects[projectPath]) {
        return;
      }

      state.projects[projectPath].last_sync = new Date().toISOString();
      yield* writeStateFile(state);
    }),
});

// Live layer
export const SkillStateServiceLive = Layer.succeed(
  SkillStateService,
  makeSkillStateService()
);
