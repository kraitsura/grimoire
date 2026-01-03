/**
 * Scout Service
 *
 * Core service for spawning and managing scout agents.
 */

import { Context, Duration, Effect, Layer } from "effect";
import { spawn, spawnSync } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import {
  type ScoutEntry,
  type ScoutFindings,
  type ScoutOptions,
  type ScoutDepth,
  DEFAULT_SCOUT_OPTIONS,
  getScoutLogPath,
  getScoutStatePath,
  getScoutFindingsPath,
} from "../../models/scout";
import { ScoutError } from "../../models/errors";
import { ScoutStateService, ScoutStateServiceLive } from "./scout-state-service";
import { generateScoutPrompt, parseFindingsFromOutput } from "./scout-prompt";
import {
  SrtService,
  SrtServiceLive,
  SrtConfigService,
  SrtConfigServiceLive,
  SrtConfigWriteError,
  SrtConfigParseError,
} from "../srt";

/**
 * Errors that can occur during scout operations
 */
type ScoutSpawnError = ScoutError | SrtConfigWriteError | SrtConfigParseError;

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
  ) => Effect.Effect<ScoutEntry, ScoutSpawnError>;

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
 * Helper to check if a file exists (async)
 */
const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Polling state for the completion loop
 */
interface PollState {
  readonly done: boolean;
  readonly startTime: number;
}

/**
 * Read scout state from file
 */
const readScoutState = (
  projectPath: string
): Effect.Effect<{ version: number; scouts: Record<string, ScoutEntry> }> =>
  Effect.gen(function* () {
    const statePath = getScoutStatePath(projectPath);
    const exists = yield* fileExistsEffect(statePath);
    if (!exists) {
      return { version: 1, scouts: {} };
    }
    const content = yield* readFileEffect(statePath).pipe(
      Effect.catchAll(() => Effect.succeed(""))
    );
    if (!content) {
      return { version: 1, scouts: {} };
    }
    try {
      return JSON.parse(content);
    } catch {
      return { version: 1, scouts: {} };
    }
  });

/**
 * Write scout state to file
 */
const writeScoutState = (
  projectPath: string,
  state: unknown
): Effect.Effect<void> =>
  Effect.tryPromise({
    try: async () => {
      const statePath = getScoutStatePath(projectPath);
      await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    },
    catch: () => new Error("Failed to write state"),
  }).pipe(Effect.catchAll(() => Effect.void));

/**
 * Poll for scout completion and parse findings (Effect-based)
 */
const pollForCompletionEffect = (
  projectPath: string,
  name: string,
  logFile: string,
  question: string,
  startedAt: string,
  timeoutMs: number
): Effect.Effect<void> => {
  const pollInterval = 2000;

  const checkOnce = (state: PollState): Effect.Effect<PollState> =>
    Effect.gen(function* () {
      // Check if timed out
      if (Date.now() - state.startTime > timeoutMs) {
        const scoutState = yield* readScoutState(projectPath);
        if (scoutState.scouts[name]) {
          scoutState.scouts[name] = {
            ...scoutState.scouts[name],
            status: "failed",
            completedAt: new Date().toISOString(),
            error: "Timed out",
          };
          yield* writeScoutState(projectPath, scoutState);
        }
        return { ...state, done: true };
      }

      // Get current state
      const scoutState = yield* readScoutState(projectPath);
      const entry = scoutState.scouts[name];
      if (!entry || entry.status !== "running") {
        // Already completed or cancelled
        return { ...state, done: true };
      }

      // Check if process is still alive
      if (entry.pid && !isProcessAlive(entry.pid)) {
        // Process finished - parse results
        const completedAt = new Date().toISOString();

        const parseResult = yield* Effect.gen(function* () {
          const exists = yield* fileExistsEffect(logFile);
          if (!exists) return null;

          const log = yield* readFileEffect(logFile).pipe(
            Effect.catchAll(() => Effect.succeed(null))
          );
          if (!log) return null;

          const parsed = parseFindingsFromOutput(log);
          if (!parsed) return { log, parsed: null };

          return { log, parsed };
        });

        if (parseResult?.parsed) {
          const findings: ScoutFindings = {
            name,
            question,
            exploredAt: completedAt,
            duration: Math.round((Date.now() - new Date(startedAt).getTime()) / 1000),
            ...parseResult.parsed,
            rawLog: parseResult.log,
          };

          // Write findings file
          yield* Effect.tryPromise({
            try: async () => {
              const findingsPath = getScoutFindingsPath(projectPath, name);
              const dir = path.dirname(findingsPath);
              if (!(await fileExists(dir))) {
                await fs.mkdir(dir, { recursive: true });
              }
              await fs.writeFile(findingsPath, JSON.stringify(findings, null, 2));
            },
            catch: () => new Error("Failed to write findings"),
          }).pipe(Effect.catchAll(() => Effect.void));
        }

        scoutState.scouts[name] = {
          ...scoutState.scouts[name],
          status: "done",
          completedAt,
        };
        yield* writeScoutState(projectPath, scoutState);
        return { ...state, done: true };
      }

      // Still running - continue polling after sleep
      yield* Effect.sleep(Duration.millis(pollInterval));
      return state;
    }).pipe(
      // Handle any errors in the check - log and continue
      Effect.catchAll(() => Effect.succeed(state))
    );

  // Use Effect.iterate to poll until done
  return Effect.iterate(
    { done: false, startTime: Date.now() } as PollState,
    {
      while: (state) => !state.done,
      body: checkOnce,
    }
  ).pipe(Effect.asVoid);
};

/**
 * Effect wrapper for async file existence check
 */
const fileExistsEffect = (filePath: string): Effect.Effect<boolean> =>
  Effect.tryPromise({
    try: () => fileExists(filePath),
    catch: () => false as const,
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));

/**
 * Effect wrapper for async file read
 */
const readFileEffect = (filePath: string): Effect.Effect<string, Error> =>
  Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf-8"),
    catch: (error) => new Error(`Failed to read file: ${error}`),
  });

/**
 * Effect wrapper for async file append
 */
const appendFileEffect = (filePath: string, content: string): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: () => fs.appendFile(filePath, content),
    catch: (error) => new Error(`Failed to append to file: ${error}`),
  });

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
        return yield* Effect.fail(
          new ScoutError({ message: "No OAuth token. Run 'claude setup-token' to authenticate." })
        );
      }

      // Initialize directories
      yield* stateService.init(projectPath);

      // Check if scout already exists
      const existing = yield* stateService.get(projectPath, name);
      if (existing && existing.status === "running") {
        return yield* Effect.fail(
          new ScoutError({ message: `Scout "${name}" is already running` })
        );
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

        // Create a modified config with restricted write paths for scouts
        const scoutConfig = {
          ...resolved.config,
          filesystem: {
            ...resolved.config.filesystem,
            allowWrite: [
              `${projectPath}/.grim/scouts`,
              "/tmp",
            ],
          },
        };

        const configPath = yield* srtService.writeConfigFile(scoutConfig);
        const claudeCommand = `claude ${argsStr}`;
        const srtCommand = srtService.wrapCommand(claudeCommand, configPath);
        fullCommand = `${srtCommand} > ${shellEscape(logFile)} 2>&1`;
      } else {
        fullCommand = `claude ${argsStr} > ${shellEscape(logFile)} 2>&1`;
      }

      // Write initial log entry (async)
      yield* appendFileEffect(
        logFile,
        `=== Scout "${name}" started at ${startedAt} ===\n` +
          `Question: ${question}\n` +
          `Options: ${JSON.stringify(resolvedOptions)}\n\n`
      ).pipe(Effect.catchAll(() => Effect.void));

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

      // Update entry with PID (create new object since ScoutEntry is readonly)
      const runningEntry: ScoutEntry = {
        ...entry,
        status: "running",
        pid: child.pid,
      };
      yield* stateService.upsert(projectPath, runningEntry);

      // Set up completion handler via polling in background
      // Use Effect.fork with delay to run polling asynchronously
      // The fiber is interruptible - when the scout is cancelled, the polling stops
      yield* pollForCompletionEffect(
        projectPath,
        name,
        logFile,
        question,
        startedAt,
        resolvedOptions.timeout * 1000
      ).pipe(
        Effect.delay(Duration.millis(1000)),
        Effect.fork,
        // Ignore the fiber reference - polling runs in background
        Effect.asVoid
      );

      return runningEntry;
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
        const exists = yield* fileExistsEffect(logFile);
        if (exists) {
          const logResult = yield* readFileEffect(logFile).pipe(
            Effect.catchAll(() => Effect.succeed(null))
          );
          if (logResult) {
            const parsed = parseFindingsFromOutput(logResult);
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
                rawLog: logResult,
              };
              yield* stateService.saveFindings(projectPath, findings);
              return findings;
            }
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

        yield* Effect.sleep(Duration.millis(pollInterval));
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
