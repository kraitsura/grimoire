/**
 * Scout Service
 *
 * Core service for spawning and managing scout agents.
 */

import { Context, Effect, Layer } from "effect";
import { spawn, spawnSync } from "child_process";
import { appendFileSync, readFileSync, existsSync } from "fs";
import {
  type ScoutEntry,
  type ScoutFindings,
  type ScoutOptions,
  type ScoutDepth,
  DEFAULT_SCOUT_OPTIONS,
  getScoutLogPath,
} from "../../models/scout";
import { ScoutStateService, ScoutStateServiceLive } from "./scout-state-service";
import { generateScoutPrompt, parseFindingsFromOutput } from "./scout-prompt";
import {
  SrtService,
  SrtServiceLive,
  SrtConfigService,
  SrtConfigServiceLive,
} from "../srt";

/**
 * Service interface
 */
interface ScoutServiceImpl {
  /**
   * Spawn a new scout
   */
  readonly spawn: (
    projectPath: string,
    name: string,
    question: string,
    options?: ScoutOptions
  ) => Effect.Effect<ScoutEntry>;

  /**
   * List all scouts
   */
  readonly list: (projectPath: string) => Effect.Effect<ScoutEntry[]>;

  /**
   * Get scout findings
   */
  readonly show: (projectPath: string, name: string) => Effect.Effect<ScoutFindings | null>;

  /**
   * Cancel a running scout
   */
  readonly cancel: (projectPath: string, name: string) => Effect.Effect<boolean>;

  /**
   * Clear completed scouts
   */
  readonly clear: (projectPath: string, includeRunning?: boolean) => Effect.Effect<string[]>;

  /**
   * Wait for scout to complete
   */
  readonly waitFor: (
    projectPath: string,
    name: string,
    timeoutMs?: number
  ) => Effect.Effect<ScoutFindings | null>;

  /**
   * Check if a scout is still running
   */
  readonly isRunning: (projectPath: string, name: string) => Effect.Effect<boolean>;
}

/**
 * Service tag
 */
export class ScoutService extends Context.Tag("ScoutService")<
  ScoutService,
  ScoutServiceImpl
>() {}

/**
 * Check if Claude OAuth token is available
 */
const checkAuth = (): { hasToken: boolean; error?: string } => {
  try {
    const testEnv = { ...process.env };
    delete testEnv.ANTHROPIC_API_KEY;

    const result = spawnSync(
      "claude",
      ["--print", "--max-budget-usd", "0", "test"],
      {
        timeout: 15000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        env: testEnv,
      }
    );

    const output = (result.stdout || "") + (result.stderr || "");
    if (output.includes("Credit balance is too low")) {
      return { hasToken: false, error: "No OAuth token" };
    }
    return { hasToken: true };
  } catch {
    return { hasToken: false, error: "Auth check failed" };
  }
};

/**
 * Check if process is alive
 */
const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Model mapping for scout
 */
const modelFlags: Record<string, string[]> = {
  haiku: ["--model", "haiku"],
  sonnet: ["--model", "sonnet"],
  opus: ["--model", "opus"],
};

/**
 * Poll for scout completion and parse findings
 */
function pollForCompletion(
  projectPath: string,
  name: string,
  logFile: string,
  question: string,
  startedAt: string,
  timeoutMs: number
): void {
  const startTime = Date.now();
  const pollInterval = 2000;

  // We need to run the state updates without the full service layer
  // So we'll use a simpler approach - directly manipulate the state files
  const { readFileSync: readFs, writeFileSync: writeFs, existsSync: existsFs } = require("fs");
  const { getScoutStatePath, getScoutFindingsPath } = require("../../models/scout");

  const readState = () => {
    const statePath = getScoutStatePath(projectPath);
    if (!existsFs(statePath)) return { version: 1, scouts: {} };
    try {
      return JSON.parse(readFs(statePath, "utf-8"));
    } catch {
      return { version: 1, scouts: {} };
    }
  };

  const writeState = (state: any) => {
    const statePath = getScoutStatePath(projectPath);
    writeFs(statePath, JSON.stringify(state, null, 2));
  };

  const checkCompletion = () => {
    // Check if timed out
    if (Date.now() - startTime > timeoutMs) {
      const state = readState();
      if (state.scouts[name]) {
        state.scouts[name].status = "failed";
        state.scouts[name].completedAt = new Date().toISOString();
        state.scouts[name].error = "Timed out";
        writeState(state);
      }
      return;
    }

    // Get current state
    const state = readState();
    const entry = state.scouts[name];
    if (!entry || entry.status !== "running") {
      return; // Already completed or cancelled
    }

    // Check if process is still alive
    if (entry.pid && !isProcessAlive(entry.pid)) {
      // Process finished - parse results
      const completedAt = new Date().toISOString();

      try {
        if (existsFs(logFile)) {
          const log = readFs(logFile, "utf-8");
          const parsed = parseFindingsFromOutput(log);

          if (parsed) {
            const findings: ScoutFindings = {
              name,
              question,
              exploredAt: completedAt,
              duration: Math.round((Date.now() - new Date(startedAt).getTime()) / 1000),
              ...parsed,
              rawLog: log,
            };

            const findingsPath = getScoutFindingsPath(projectPath, name);
            const { dirname } = require("path");
            const { mkdirSync } = require("fs");
            const dir = dirname(findingsPath);
            if (!existsFs(dir)) {
              mkdirSync(dir, { recursive: true });
            }
            writeFs(findingsPath, JSON.stringify(findings, null, 2));
          }
        }

        state.scouts[name].status = "done";
        state.scouts[name].completedAt = completedAt;
        writeState(state);
      } catch (err) {
        state.scouts[name].status = "failed";
        state.scouts[name].completedAt = completedAt;
        state.scouts[name].error = String(err);
        writeState(state);
      }

      return;
    }

    // Still running - continue polling
    setTimeout(checkCompletion, pollInterval);
  };

  setTimeout(checkCompletion, pollInterval);
}

/**
 * Service implementation factory
 */
const makeScoutService = (
  stateService: Context.Tag.Service<typeof ScoutStateService>,
  srtService: Context.Tag.Service<typeof SrtService>,
  srtConfigService: Context.Tag.Service<typeof SrtConfigService>
): ScoutServiceImpl => ({
  spawn: (
    projectPath: string,
    name: string,
    question: string,
    options?: ScoutOptions
  ) =>
    Effect.gen(function* () {
      // Check auth
      const auth = checkAuth();
      if (!auth.hasToken) {
        console.error("Error: Scout requires OAuth token for headless mode");
        console.error("Run: claude setup-token");
        throw new Error("No OAuth token");
      }

      // Initialize directories
      yield* stateService.init(projectPath);

      // Check if scout already exists
      const existing = yield* stateService.get(projectPath, name);
      if (existing && existing.status === "running") {
        throw new Error(`Scout "${name}" is already running`);
      }

      // Merge options with defaults
      const resolvedOptions = {
        depth: (options?.depth || DEFAULT_SCOUT_OPTIONS.depth) as ScoutDepth,
        focus: options?.focus,
        timeout: options?.timeout || DEFAULT_SCOUT_OPTIONS.timeout,
        model: options?.model || DEFAULT_SCOUT_OPTIONS.model,
      };

      // Create entry
      const startedAt = new Date().toISOString();
      const entry: ScoutEntry = {
        name,
        question,
        status: "pending",
        startedAt,
        options: resolvedOptions,
      };

      yield* stateService.upsert(projectPath, entry);

      // Generate prompt
      const prompt = generateScoutPrompt(question, resolvedOptions);

      // Build claude command
      const claudeArgs: string[] = ["--print"];

      // Add model flag
      const modelFlag = modelFlags[resolvedOptions.model];
      if (modelFlag) {
        claudeArgs.push(...modelFlag);
      }

      // Add prompt
      claudeArgs.push(prompt);

      const shellEscape = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
      const argsStr = claudeArgs.map(shellEscape).join(" ");

      // Log file
      const logFile = getScoutLogPath(projectPath, name);

      // Generate SRT config (read-only focused)
      const srtAvailable = yield* srtService.isAvailable();
      let fullCommand: string;

      if (srtAvailable) {
        // Get base config and restrict to read-only
        const resolved = yield* srtConfigService.resolveConfig(projectPath, projectPath);

        // Override to be more restrictive for scouts
        resolved.config.filesystem.allowedWritePaths = [
          `${projectPath}/.grim/scouts`,
          "/tmp",
        ];

        const configPath = yield* srtService.writeConfigFile(resolved.config);
        const claudeCommand = `claude ${argsStr}`;
        const srtCommand = srtService.wrapCommand(claudeCommand, configPath);
        fullCommand = `${srtCommand} > ${shellEscape(logFile)} 2>&1`;
      } else {
        fullCommand = `claude ${argsStr} > ${shellEscape(logFile)} 2>&1`;
      }

      // Write initial log entry
      appendFileSync(
        logFile,
        `=== Scout "${name}" started at ${startedAt} ===\n` +
          `Question: ${question}\n` +
          `Options: ${JSON.stringify(resolvedOptions)}\n\n`
      );

      // Spawn process
      const spawnEnv = { ...process.env };
      delete spawnEnv.ANTHROPIC_API_KEY;

      const child = spawn("sh", ["-c", fullCommand], {
        cwd: projectPath,
        env: {
          ...spawnEnv,
          GRIMOIRE_SCOUT_NAME: name,
        },
        detached: true,
        stdio: "ignore",
      });

      child.unref();

      // Update entry with PID
      entry.status = "running";
      entry.pid = child.pid;
      yield* stateService.upsert(projectPath, entry);

      // Set up completion handler via polling
      setTimeout(() => {
        pollForCompletion(
          projectPath,
          name,
          logFile,
          question,
          startedAt,
          resolvedOptions.timeout * 1000
        );
      }, 1000);

      return entry;
    }),

  list: (projectPath: string) => stateService.list(projectPath),

  show: (projectPath: string, name: string) =>
    Effect.gen(function* () {
      const findings = yield* stateService.getFindings(projectPath, name);
      if (findings) {
        return findings;
      }

      // Try to parse from log file if scout is done but findings not saved
      const entry = yield* stateService.get(projectPath, name);
      if (!entry) {
        return null;
      }

      if (entry.status === "done" || entry.status === "failed") {
        const logFile = getScoutLogPath(projectPath, name);
        if (existsSync(logFile)) {
          const log = readFileSync(logFile, "utf-8");
          const parsed = parseFindingsFromOutput(log);
          if (parsed) {
            const findings: ScoutFindings = {
              name,
              question: entry.question,
              exploredAt: entry.completedAt || entry.startedAt,
              duration: entry.completedAt
                ? Math.round(
                    (new Date(entry.completedAt).getTime() -
                      new Date(entry.startedAt).getTime()) /
                      1000
                  )
                : 0,
              ...parsed,
              rawLog: log,
            };
            yield* stateService.saveFindings(projectPath, findings);
            return findings;
          }
        }
      }

      return null;
    }),

  cancel: (projectPath: string, name: string) =>
    Effect.gen(function* () {
      const entry = yield* stateService.get(projectPath, name);
      if (!entry || entry.status !== "running") {
        return false;
      }

      if (entry.pid) {
        try {
          process.kill(entry.pid, "SIGTERM");
        } catch {
          // Process may already be dead
        }
      }

      yield* stateService.updateStatus(projectPath, name, "cancelled", {
        completedAt: new Date().toISOString(),
      });

      return true;
    }),

  clear: (projectPath: string, includeRunning?: boolean) =>
    stateService.clear(projectPath, includeRunning ?? false),

  waitFor: (projectPath: string, name: string, timeoutMs?: number) =>
    Effect.gen(function* () {
      const timeout = timeoutMs || 300_000; // 5 minutes default
      const startTime = Date.now();
      const pollInterval = 1000;

      while (Date.now() - startTime < timeout) {
        const entry = yield* stateService.get(projectPath, name);
        if (!entry) {
          return null;
        }

        if (entry.status === "done" || entry.status === "failed" || entry.status === "cancelled") {
          return yield* stateService.getFindings(projectPath, name);
        }

        yield* Effect.sleep(pollInterval);
      }

      return null;
    }),

  isRunning: (projectPath: string, name: string) =>
    Effect.gen(function* () {
      const entry = yield* stateService.get(projectPath, name);
      if (!entry || entry.status !== "running") {
        return false;
      }

      if (entry.pid) {
        return isProcessAlive(entry.pid);
      }

      return false;
    }),
});

/**
 * Live layer
 */
export const ScoutServiceLive = Layer.effect(
  ScoutService,
  Effect.gen(function* () {
    const stateService = yield* ScoutStateService;
    const srtService = yield* SrtService;
    const srtConfigService = yield* SrtConfigService;

    return makeScoutService(stateService, srtService, srtConfigService);
  })
).pipe(
  Layer.provide(ScoutStateServiceLive),
  Layer.provide(SrtServiceLive),
  Layer.provide(SrtConfigServiceLive)
);
