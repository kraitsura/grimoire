/**
 * Skill Engine Service
 *
 * Core orchestration service for enabling and disabling skills in projects.
 * Handles CLI dependencies, agent-specific setup, and state management.
 */

import { Context, Effect, Layer, Data } from "effect";
import { join } from "path";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { SkillCacheService, type CachedSkill } from "./skill-cache-service";
import { SkillStateService } from "./skill-state-service";
import { AgentAdapterService, type AgentAdapter } from "./agent-adapter";
import { CliInstallerService } from "./cli-installer-service";

// Extract service implementation types from Context Tags
type SkillCacheServiceImpl = Context.Tag.Service<typeof SkillCacheService>;
type SkillStateServiceImpl = Context.Tag.Service<typeof SkillStateService>;
type AgentAdapterServiceImpl = Context.Tag.Service<typeof AgentAdapterService>;
type CliInstallerServiceImpl = Context.Tag.Service<typeof CliInstallerService>;
import {
  SkillNotCachedError,
  SkillAlreadyEnabledError,
  SkillNotEnabledError,
  ProjectNotInitializedError,
  CliDependencyError,
  InjectionError,
  PluginInstallError,
} from "../../models/skill-errors";
import { addSkillInjection } from "./injection-utils";
import { StateFileReadError, StateFileWriteError } from "./skill-state-service";
import { AgentAdapterError } from "./agent-adapter";

/**
 * Error type for skill operations
 */
export type SkillError =
  | SkillNotCachedError
  | SkillAlreadyEnabledError
  | SkillNotEnabledError
  | ProjectNotInitializedError
  | CliDependencyError
  | InjectionError
  | PluginInstallError
  | StateFileReadError
  | StateFileWriteError
  | AgentAdapterError;

/**
 * Options for enabling a skill
 */
export interface EnableOptions {
  yes?: boolean; // Auto-confirm
  noDeps?: boolean; // Skip CLI deps
  noInit?: boolean; // Skip init commands
}

/**
 * Options for disabling a skill
 */
export interface DisableOptions {
  purge?: boolean; // Remove project artifacts
  yes?: boolean; // Skip confirmation for purge
}

/**
 * Result of enabling a skill
 */
export interface EnableResult {
  skillName: string;
  cliInstalled?: string[];
  pluginInstalled?: boolean;
  mcpConfigured?: boolean;
  injected?: boolean;
  initRan?: boolean;
}

/**
 * Result of checking if a skill can be enabled
 */
export interface EnableCheck {
  canEnable: boolean;
  isEnabled: boolean;
  missingDeps?: string[];
  reason?: string;
}

/**
 * Rollback state for tracking what needs to be undone
 */
interface RollbackState {
  installedCli: string[];
  copiedSkillFile: boolean;
  injectedContent: boolean;
  updatedState: boolean;
  skillName: string;
  projectPath: string;
}


/**
 * Copy skill file to project skills directory
 */
const copySkillFile = (
  skill: CachedSkill,
  destDir: string
): Effect.Effect<boolean, InjectionError> =>
  Effect.gen(function* () {
    if (!skill.skillMdPath) {
      return false;
    }

    try {
      // Ensure destination directory exists
      yield* Effect.promise(() => mkdir(destDir, { recursive: true }));

      // Copy SKILL.md to destination
      const destPath = join(destDir, `${skill.manifest.name}.md`);
      const content = yield* Effect.promise(() => readFile(skill.skillMdPath!, "utf-8"));
      yield* Effect.promise(() => writeFile(destPath, content, "utf-8"));

      return true;
    } catch (error) {
      return yield* Effect.fail(
        new InjectionError({
          file: skill.skillMdPath,
          message: `Failed to copy skill file: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
  });

/**
 * Remove skill file from project skills directory
 */
const removeSkillFile = (
  skillName: string,
  skillsDir: string
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const skillPath = join(skillsDir, `${skillName}.md`);

    if (existsSync(skillPath)) {
      try {
        yield* Effect.promise(() => unlink(skillPath));
      } catch {
        // Ignore errors when removing skill file
      }
    }
  });

/**
 * Inject skill content into agent markdown file
 */
const injectSkillContent = (
  agentMdPath: string,
  skillName: string,
  content: string
): Effect.Effect<void, InjectionError> =>
  Effect.gen(function* () {
    // Read current content
    let currentContent = "";
    if (existsSync(agentMdPath)) {
      currentContent = yield* Effect.tryPromise({
        try: () => readFile(agentMdPath, "utf-8"),
        catch: (error) =>
          new InjectionError({
            file: agentMdPath,
            message: `Failed to read agent MD file: ${error instanceof Error ? error.message : String(error)}`,
          }),
      });
    }

    // Add skill injection
    const updatedContent = yield* addSkillInjection(currentContent, skillName, content);

    // Write updated content
    yield* Effect.tryPromise({
      try: () => writeFile(agentMdPath, updatedContent, "utf-8"),
      catch: (error) =>
        new InjectionError({
          file: agentMdPath,
          message: `Failed to write agent MD file: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  });

// Service interface
interface SkillEngineServiceImpl {
  // Enable skill in project
  readonly enable: (
    projectPath: string,
    skillName: string,
    options?: EnableOptions
  ) => Effect.Effect<EnableResult, SkillError>;

  // Disable skill in project
  readonly disable: (
    projectPath: string,
    skillName: string,
    options?: DisableOptions
  ) => Effect.Effect<void, SkillError>;

  // Check if skill can be enabled
  readonly canEnable: (
    projectPath: string,
    skillName: string
  ) => Effect.Effect<EnableCheck, SkillError>;

  // Rollback a failed enable
  readonly rollback: (
    projectPath: string,
    skillName: string
  ) => Effect.Effect<void>;
}

// Service tag
export class SkillEngineService extends Context.Tag("SkillEngineService")<
  SkillEngineService,
  SkillEngineServiceImpl
>() {}

// Service implementation factory
const makeSkillEngineService = (
  cache: SkillCacheServiceImpl,
  state: SkillStateServiceImpl,
  adapters: AgentAdapterServiceImpl,
  cliInstaller: CliInstallerServiceImpl
): SkillEngineServiceImpl => ({
  enable: (projectPath: string, skillName: string, options?: EnableOptions) =>
    Effect.gen(function* () {
      const rollbackState: RollbackState = {
        installedCli: [],
        copiedSkillFile: false,
        injectedContent: false,
        updatedState: false,
        skillName,
        projectPath,
      };

      const result: EnableResult = {
        skillName,
      };

      try {
        // 1. Resolve skill from cache
        const skill = yield* cache.getCached(skillName);

        // 2. Check project is initialized
        const isInitialized = yield* state.isInitialized(projectPath);
        if (!isInitialized) {
          return yield* Effect.fail(
            new ProjectNotInitializedError({ path: projectPath })
          );
        }

        // 3. Check skill not already enabled
        const enabled = yield* state.getEnabled(projectPath);
        if (enabled.includes(skillName)) {
          return yield* Effect.fail(
            new SkillAlreadyEnabledError({ name: skillName })
          );
        }

        // 4. Skills no longer have CLI dependencies
        // Real plugins manage their own dependencies

        // 5. Get agent adapter for project
        const projectState = yield* state.getProjectState(projectPath);
        if (!projectState) {
          return yield* Effect.fail(
            new ProjectNotInitializedError({ path: projectPath })
          );
        }

        const adapter = adapters.getAdapter(projectState.agent);

        // 6. Delegate to AgentAdapter.enableSkill() for agent-specific setup
        // This handles: plugin installation, MCP configuration, skill file copying, and injection
        const adapterResult = yield* adapter.enableSkill(projectPath, skill);

        if (adapterResult.pluginInstalled) {
          result.pluginInstalled = true;
        }
        if (adapterResult.mcpConfigured) {
          result.mcpConfigured = true;
        }
        if (adapterResult.skillFileCopied) {
          rollbackState.copiedSkillFile = true;
        }
        if (adapterResult.injected) {
          rollbackState.injectedContent = true;
          result.injected = true;
        }

        // 7. Skills no longer have init commands
        // Real plugins manage their own initialization

        // 8. Update state
        yield* state.addEnabled(projectPath, skillName);
        rollbackState.updatedState = true;

        return result;
      } catch (error) {
        // Rollback on any error
        yield* performRollbackWithServices(rollbackState, state, adapters);
        throw error;
      }
    }),

  disable: (projectPath: string, skillName: string, options?: DisableOptions) =>
    Effect.gen(function* () {
      // 1. Verify skill is enabled
      const enabled = yield* state.getEnabled(projectPath);
      if (!enabled.includes(skillName)) {
        return yield* Effect.fail(
          new SkillNotEnabledError({ name: skillName })
        );
      }

      // 2. Get agent adapter for project
      const projectState = yield* state.getProjectState(projectPath);
      if (!projectState) {
        return yield* Effect.fail(
          new ProjectNotInitializedError({ path: projectPath })
        );
      }

      const adapter = adapters.getAdapter(projectState.agent);
      const skillsDir = adapter.getSkillsDir(projectPath);

      // 3. Call adapter.disableSkill()
      yield* adapter.disableSkill(projectPath, skillName);

      // 4. Call adapter.removeInjection()
      yield* adapter.removeInjection(projectPath, skillName);

      // 5. Remove skill file from project skills dir
      yield* removeSkillFile(skillName, skillsDir);

      // 6. Update state (removeEnabled, recordDisable)
      yield* state.removeEnabled(projectPath, skillName);
      yield* state.recordDisable(projectPath, skillName);
    }),

  canEnable: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      const result: EnableCheck = {
        canEnable: false,
        isEnabled: false,
      };

      // Check if skill is cached
      const isCached = yield* cache.isCached(skillName);
      if (!isCached) {
        result.reason = `Skill "${skillName}" is not cached. Run: gm skills install ${skillName}`;
        return result;
      }

      // Check if project is initialized
      const isInitialized = yield* state.isInitialized(projectPath);
      if (!isInitialized) {
        result.reason = `Project not initialized. Run: gm skills init`;
        return result;
      }

      // Check if already enabled
      const enabled = yield* state.getEnabled(projectPath);
      if (enabled.includes(skillName)) {
        result.isEnabled = true;
        result.reason = `Skill "${skillName}" is already enabled`;
        return result;
      }

      // Skills no longer have CLI dependencies
      // Real plugins manage their own dependencies

      result.canEnable = true;
      return result;
    }),

  rollback: (projectPath: string, skillName: string) =>
    Effect.gen(function* () {
      // Create a rollback state with all flags set to true
      // This ensures we attempt to clean up everything
      const rollbackState: RollbackState = {
        installedCli: [],
        copiedSkillFile: true,
        injectedContent: true,
        updatedState: true,
        skillName,
        projectPath,
      };

      yield* performRollbackWithServices(rollbackState, state, adapters);
    }),
});

/**
 * Perform rollback of a failed enable operation
 */
const performRollbackWithServices = (
  rollbackState: RollbackState,
  stateService: SkillStateServiceImpl,
  adapterService: AgentAdapterServiceImpl
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const { skillName, projectPath } = rollbackState;

    // Rollback in reverse order

    // Remove from state
    if (rollbackState.updatedState) {
      yield* stateService.removeEnabled(projectPath, skillName).pipe(
        Effect.catchAll(() => Effect.void)
      );
    }

    // Remove injection
    if (rollbackState.injectedContent) {
      const projectState = yield* stateService.getProjectState(projectPath).pipe(
        Effect.catchAll(() => Effect.succeed(null))
      );

      if (projectState) {
        const adapter = adapterService.getAdapter(projectState.agent);
        yield* adapter.removeInjection(projectPath, skillName).pipe(
          Effect.catchAll(() => Effect.void)
        );
      }
    }

    // Remove skill file
    if (rollbackState.copiedSkillFile) {
      const projectState = yield* stateService.getProjectState(projectPath).pipe(
        Effect.catchAll(() => Effect.succeed(null))
      );

      if (projectState) {
        const adapter = adapterService.getAdapter(projectState.agent);
        const skillsDir = adapter.getSkillsDir(projectPath);
        yield* removeSkillFile(skillName, skillsDir).pipe(
          Effect.catchAll(() => Effect.void)
        );
      }
    }

    // Note: We do NOT uninstall CLI dependencies by design
    // They may be used by other skills or purposes
  });

// Live layer
export const SkillEngineServiceLive = Layer.effect(
  SkillEngineService,
  Effect.gen(function* () {
    const cache = yield* SkillCacheService;
    const state = yield* SkillStateService;
    const adapters = yield* AgentAdapterService;
    const cliInstaller = yield* CliInstallerService;

    return makeSkillEngineService(cache, state, adapters, cliInstaller);
  })
);
