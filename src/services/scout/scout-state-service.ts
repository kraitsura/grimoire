/**
 * Scout State Service
 *
 * Manages persistent state for scout agents.
 */

import { Context, Effect, Layer } from "effect";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import {
  type ScoutEntry,
  type ScoutState,
  type ScoutFindings,
  type ScoutStatus,
  getScoutStatePath,
  getScoutFindingsPath,
  SCOUT_DIR,
  SCOUT_FINDINGS_DIR,
} from "../../models/scout";

/**
 * Service interface
 */
interface ScoutStateServiceImpl {
  /**
   * Initialize scout directories
   */
  readonly init: (projectPath: string) => Effect.Effect<void>;

  /**
   * Get all scouts
   */
  readonly list: (projectPath: string) => Effect.Effect<ScoutEntry[]>;

  /**
   * Get a specific scout
   */
  readonly get: (projectPath: string, name: string) => Effect.Effect<ScoutEntry | null>;

  /**
   * Create or update a scout entry
   */
  readonly upsert: (projectPath: string, entry: ScoutEntry) => Effect.Effect<void>;

  /**
   * Update scout status
   */
  readonly updateStatus: (
    projectPath: string,
    name: string,
    status: ScoutStatus,
    extra?: { completedAt?: string; error?: string; pid?: number }
  ) => Effect.Effect<void>;

  /**
   * Remove a scout entry
   */
  readonly remove: (projectPath: string, name: string) => Effect.Effect<void>;

  /**
   * Clear all scouts (optionally including running)
   */
  readonly clear: (projectPath: string, includeRunning: boolean) => Effect.Effect<string[]>;

  /**
   * Save scout findings
   */
  readonly saveFindings: (projectPath: string, findings: ScoutFindings) => Effect.Effect<void>;

  /**
   * Get scout findings
   */
  readonly getFindings: (projectPath: string, name: string) => Effect.Effect<ScoutFindings | null>;
}

/**
 * Service tag
 */
export class ScoutStateService extends Context.Tag("ScoutStateService")<
  ScoutStateService,
  ScoutStateServiceImpl
>() {}

/**
 * Read state file
 */
const readState = (projectPath: string): ScoutState => {
  const statePath = getScoutStatePath(projectPath);
  if (!existsSync(statePath)) {
    return { version: 1, scouts: {} };
  }
  try {
    const content = readFileSync(statePath, "utf-8");
    return JSON.parse(content) as ScoutState;
  } catch {
    return { version: 1, scouts: {} };
  }
};

/**
 * Write state file
 */
const writeState = (projectPath: string, state: ScoutState): void => {
  const statePath = getScoutStatePath(projectPath);
  const dir = dirname(statePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2));
};

/**
 * Service implementation
 */
const makeScoutStateService = (): ScoutStateServiceImpl => ({
  init: (projectPath: string) =>
    Effect.sync(() => {
      const scoutDir = `${projectPath}/${SCOUT_DIR}`;
      const findingsDir = `${scoutDir}/${SCOUT_FINDINGS_DIR}`;

      if (!existsSync(scoutDir)) {
        mkdirSync(scoutDir, { recursive: true });
      }
      if (!existsSync(findingsDir)) {
        mkdirSync(findingsDir, { recursive: true });
      }

      // Initialize state file if not exists
      const statePath = getScoutStatePath(projectPath);
      if (!existsSync(statePath)) {
        writeState(projectPath, { version: 1, scouts: {} });
      }
    }),

  list: (projectPath: string) =>
    Effect.sync(() => {
      const state = readState(projectPath);
      return Object.values(state.scouts);
    }),

  get: (projectPath: string, name: string) =>
    Effect.sync(() => {
      const state = readState(projectPath);
      return state.scouts[name] || null;
    }),

  upsert: (projectPath: string, entry: ScoutEntry) =>
    Effect.sync(() => {
      const state = readState(projectPath);
      state.scouts[entry.name] = entry;
      writeState(projectPath, state);
    }),

  updateStatus: (
    projectPath: string,
    name: string,
    status: ScoutStatus,
    extra?: { completedAt?: string; error?: string; pid?: number }
  ) =>
    Effect.sync(() => {
      const state = readState(projectPath);
      const scout = state.scouts[name];
      if (scout) {
        scout.status = status;
        if (extra?.completedAt) scout.completedAt = extra.completedAt;
        if (extra?.error) scout.error = extra.error;
        if (extra?.pid !== undefined) scout.pid = extra.pid;
        writeState(projectPath, state);
      }
    }),

  remove: (projectPath: string, name: string) =>
    Effect.sync(() => {
      const state = readState(projectPath);
      delete state.scouts[name];
      writeState(projectPath, state);
    }),

  clear: (projectPath: string, includeRunning: boolean) =>
    Effect.sync(() => {
      const state = readState(projectPath);
      const removed: string[] = [];

      for (const [name, scout] of Object.entries(state.scouts)) {
        if (includeRunning || scout.status !== "running") {
          removed.push(name);
          delete state.scouts[name];
        }
      }

      writeState(projectPath, state);
      return removed;
    }),

  saveFindings: (projectPath: string, findings: ScoutFindings) =>
    Effect.sync(() => {
      const findingsPath = getScoutFindingsPath(projectPath, findings.name);
      const dir = dirname(findingsPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(findingsPath, JSON.stringify(findings, null, 2));
    }),

  getFindings: (projectPath: string, name: string) =>
    Effect.sync(() => {
      const findingsPath = getScoutFindingsPath(projectPath, name);
      if (!existsSync(findingsPath)) {
        return null;
      }
      try {
        const content = readFileSync(findingsPath, "utf-8");
        return JSON.parse(content) as ScoutFindings;
      } catch {
        return null;
      }
    }),
});

/**
 * Live layer
 */
export const ScoutStateServiceLive = Layer.succeed(
  ScoutStateService,
  makeScoutStateService()
);
