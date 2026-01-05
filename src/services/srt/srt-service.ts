/**
 * SRT Service
 *
 * Effect service wrapping Anthropic's Sandbox Runtime (SRT) for
 * filesystem and network sandboxing of agent processes.
 *
 * Provides:
 * - Platform detection and availability checking
 * - SRT config generation scoped to worktree paths
 * - Command wrapping for sandboxed execution
 */

import { Context, Data, Effect, Layer } from "effect";
import { join } from "path";
import { tmpdir, homedir } from "os";
import { randomUUID } from "crypto";

// =============================================================================
// Types
// =============================================================================

/**
 * Platform detection result
 */
export interface PlatformInfo {
  /** Detected platform */
  platform: "darwin" | "linux" | "unsupported";
  /** Whether SRT is available and working */
  srtAvailable: boolean;
  /** Missing dependencies (for Linux) */
  missingDeps: string[];
  /** Human-readable instructions to fix */
  instructions?: string;
}

/**
 * SRT filesystem configuration
 */
export interface SrtFilesystemConfig {
  /** Paths to deny read access */
  denyRead: string[];
  /** Paths to allow write access */
  allowWrite: string[];
  /** Paths to deny write access (takes precedence) */
  denyWrite: string[];
}

/**
 * SRT network configuration
 */
export interface SrtNetworkConfig {
  /** Domains to allow network access */
  allowedDomains: string[];
  /** Domains to explicitly deny */
  deniedDomains: string[];
}

/**
 * Complete SRT configuration
 */
export interface SrtConfig {
  filesystem: SrtFilesystemConfig;
  network: SrtNetworkConfig;
}

/**
 * Options for generating SRT config
 */
export interface SrtConfigOptions {
  /** Worktree path - will be added to allowWrite */
  worktreePath: string;
  /** Additional domains to allow (extends defaults) */
  additionalDomains?: string[];
  /** Additional write paths (extends defaults) */
  additionalWritePaths?: string[];
  /** Additional read deny paths (extends defaults) */
  additionalDenyRead?: string[];
}

/**
 * Result of sandboxed command execution
 */
export interface SrtExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// =============================================================================
// Errors
// =============================================================================

export class SrtNotAvailableError extends Data.TaggedError("SrtNotAvailableError")<{
  info: PlatformInfo;
}> {}

export class SrtConfigWriteError extends Data.TaggedError("SrtConfigWriteError")<{
  path: string;
  cause: string;
}> {}

export class SrtExecError extends Data.TaggedError("SrtExecError")<{
  command: string;
  stderr: string;
  exitCode: number;
}> {}

// =============================================================================
// Default Configuration
// =============================================================================

/** Default domains allowed for agent operations */
export const DEFAULT_ALLOWED_DOMAINS = [
  // Package registries
  "registry.npmjs.org",
  "*.npmjs.org",
  // GitHub for cloning/fetching
  "github.com",
  "*.github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  // Anthropic API
  "api.anthropic.com",
  // Common CDNs
  "unpkg.com",
  "cdn.jsdelivr.net",
];

/** Paths to always deny read access */
export const DEFAULT_DENY_READ = [
  "~/.ssh",
  "~/.aws",
  "~/.gnupg",
  "~/.config/gh",
  "~/.netrc",
];

/** Paths to always deny write access */
export const DEFAULT_DENY_WRITE = [
  ".env",
  ".env.*",
  ".bashrc",
  ".zshrc",
  ".profile",
  ".gitconfig",
  "~/.ssh",
  "~/.aws",
];

/** Default additional write paths (use getDefaultAllowWriteExtra() for expanded paths) */
export const DEFAULT_ALLOW_WRITE_EXTRA = [
  "/tmp",
  "~/.claude.json", // Claude Code config file
  "~/.claude", // Claude Code directory
];

/**
 * Expand ~ to home directory in a path
 */
const expandTilde = (path: string): string => {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  if (path === "~") {
    return homedir();
  }
  return path;
};

/**
 * Get default allow write paths with ~ expanded to actual home directory
 * This is needed because SRT doesn't expand ~ in paths
 */
export const getDefaultAllowWriteExtra = (): string[] =>
  DEFAULT_ALLOW_WRITE_EXTRA.map(expandTilde);

// =============================================================================
// Service Interface
// =============================================================================

interface SrtServiceImpl {
  /**
   * Check platform and SRT availability
   */
  readonly checkPlatform: () => Effect.Effect<PlatformInfo, never>;

  /**
   * Check if SRT is available and ready to use
   */
  readonly isAvailable: () => Effect.Effect<boolean, never>;

  /**
   * Generate SRT config for a worktree
   */
  readonly generateConfig: (
    options: SrtConfigOptions
  ) => Effect.Effect<SrtConfig, never>;

  /**
   * Write SRT config to a temp file
   * Returns the path to the config file
   */
  readonly writeConfigFile: (
    config: SrtConfig
  ) => Effect.Effect<string, SrtConfigWriteError>;

  /**
   * Get the srt command with config
   * Returns the full command string to prefix other commands
   */
  readonly wrapCommand: (
    command: string,
    configPath: string
  ) => string;

  /**
   * Execute a command in the sandbox
   */
  readonly exec: (
    command: string,
    config: SrtConfig,
    cwd?: string
  ) => Effect.Effect<SrtExecResult, SrtNotAvailableError | SrtConfigWriteError>;

  /**
   * Get the path to the srt binary
   */
  readonly getSrtPath: () => Effect.Effect<string | null, never>;
}

// =============================================================================
// Service Tag
// =============================================================================

export class SrtService extends Context.Tag("SrtService")<
  SrtService,
  SrtServiceImpl
>() {}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Execute a shell command and return result
 */
const execCommand = (
  command: string,
  cwd?: string
): Effect.Effect<{ stdout: string; stderr: string; exitCode: number }, never> =>
  Effect.tryPromise({
    try: async () => {
      const proc = Bun.spawn(["sh", "-c", command], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
    },
    catch: (error) => ({
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    }),
  }).pipe(
    Effect.catchAll((result) =>
      Effect.succeed(result as { stdout: string; stderr: string; exitCode: number })
    )
  );

/**
 * Check if a command exists
 */
const commandExists = (cmd: string): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const result = yield* execCommand(`which ${cmd}`);
    return result.exitCode === 0;
  });

/**
 * Create the SRT service implementation
 */
const makeSrtService = (): SrtServiceImpl => {
  // Cache platform check result
  let platformCache: PlatformInfo | null = null;
  let srtPathCache: string | null | undefined = undefined;

  return {
    checkPlatform: () =>
      Effect.gen(function* () {
        if (platformCache) {
          return platformCache;
        }

        const platform = process.platform;

        if (platform === "darwin") {
          // macOS uses sandbox-exec (built-in)
          // Check if srt CLI is available
          const srtExists = yield* commandExists("srt");
          const npxSrtExists = yield* Effect.gen(function* () {
            const result = yield* execCommand("npx srt --version");
            return result.exitCode === 0;
          });

          platformCache = {
            platform: "darwin",
            srtAvailable: srtExists || npxSrtExists,
            missingDeps: [],
            instructions: srtExists || npxSrtExists
              ? undefined
              : "SRT not found. Install with: npm install -g @anthropic-ai/sandbox-runtime",
          };
        } else if (platform === "linux") {
          // Linux needs bubblewrap and socat
          const bwrapExists = yield* commandExists("bwrap");
          const socatExists = yield* commandExists("socat");
          const srtExists = yield* commandExists("srt");
          const npxSrtExists = yield* Effect.gen(function* () {
            const result = yield* execCommand("npx srt --version");
            return result.exitCode === 0;
          });

          const missingDeps: string[] = [];
          if (!bwrapExists) missingDeps.push("bubblewrap");
          if (!socatExists) missingDeps.push("socat");

          const hasSrt = srtExists || npxSrtExists;
          const hasDeps = bwrapExists && socatExists;

          let instructions: string | undefined;
          if (!hasSrt || !hasDeps) {
            const parts: string[] = [];
            if (!hasSrt) {
              parts.push("npm install -g @anthropic-ai/sandbox-runtime");
            }
            if (missingDeps.length > 0) {
              parts.push(`sudo apt install ${missingDeps.join(" ")}`);
            }
            instructions = parts.join("\n");
          }

          platformCache = {
            platform: "linux",
            srtAvailable: hasSrt && hasDeps,
            missingDeps,
            instructions,
          };
        } else {
          platformCache = {
            platform: "unsupported",
            srtAvailable: false,
            missingDeps: [],
            instructions: `SRT is not supported on ${platform}. Supported platforms: macOS, Linux`,
          };
        }

        return platformCache;
      }),

    isAvailable: () =>
      Effect.gen(function* () {
        const info = yield* Effect.succeed(null).pipe(
          Effect.flatMap(() =>
            Effect.gen(function* () {
              if (platformCache) return platformCache;
              const service = makeSrtService();
              return yield* service.checkPlatform();
            })
          )
        );
        return info?.srtAvailable ?? false;
      }),

    generateConfig: (options: SrtConfigOptions) =>
      Effect.succeed({
        filesystem: {
          denyRead: [...DEFAULT_DENY_READ, ...(options.additionalDenyRead ?? [])].map(expandTilde),
          allowWrite: [
            options.worktreePath,
            ...getDefaultAllowWriteExtra(),
            ...(options.additionalWritePaths ?? []).map(expandTilde),
          ],
          denyWrite: [...DEFAULT_DENY_WRITE].map(expandTilde),
        },
        network: {
          allowedDomains: [
            ...DEFAULT_ALLOWED_DOMAINS,
            ...(options.additionalDomains ?? []),
          ],
          deniedDomains: [],
        },
      }),

    writeConfigFile: (config: SrtConfig) =>
      Effect.gen(function* () {
        const configPath = join(tmpdir(), `srt-config-${randomUUID()}.json`);

        yield* Effect.tryPromise({
          try: () => Bun.write(configPath, JSON.stringify(config, null, 2)),
          catch: (error) =>
            new SrtConfigWriteError({
              path: configPath,
              cause: error instanceof Error ? error.message : String(error),
            }),
        });

        return configPath;
      }),

    wrapCommand: (command: string, configPath: string) => {
      // Use npx to ensure we find the srt binary
      return `npx srt --settings "${configPath}" -c '${command.replace(/'/g, "'\\''")}'`;
    },

    exec: (command: string, config: SrtConfig, cwd?: string) =>
      Effect.gen(function* () {
        // Check availability first
        const info = yield* makeSrtService().checkPlatform();
        if (!info.srtAvailable) {
          return yield* Effect.fail(new SrtNotAvailableError({ info }));
        }

        // Write config
        const configPath = yield* makeSrtService().writeConfigFile(config);

        // Execute
        const wrappedCommand = makeSrtService().wrapCommand(command, configPath);
        const result = yield* execCommand(wrappedCommand, cwd);

        // Cleanup config file (best effort)
        yield* Effect.tryPromise({
          try: () => import("fs/promises").then((fs) => fs.unlink(configPath)),
          catch: () => undefined,
        }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        };
      }),

    getSrtPath: () =>
      Effect.gen(function* () {
        if (srtPathCache !== undefined) {
          return srtPathCache;
        }

        // Check global install first
        const globalResult = yield* execCommand("which srt");
        if (globalResult.exitCode === 0 && globalResult.stdout) {
          srtPathCache = globalResult.stdout;
          return srtPathCache;
        }

        // Check npx
        const npxResult = yield* execCommand("npx srt --version");
        if (npxResult.exitCode === 0) {
          srtPathCache = "npx srt";
          return srtPathCache;
        }

        srtPathCache = null;
        return null;
      }),
  };
};

// =============================================================================
// Layer
// =============================================================================

export const SrtServiceLive = Layer.succeed(SrtService, makeSrtService());
