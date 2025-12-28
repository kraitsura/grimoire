/**
 * Claude CLI Service
 *
 * Wraps Claude Code CLI commands for plugin and marketplace management.
 * Uses Bun.spawn to execute `claude` commands and parse their output.
 */

import { Context, Effect, Layer } from "effect";
import type { Scope, InstalledPlugin, Marketplace } from "../../models/plugin";
import { ClaudeCliError } from "../../models/plugin-errors";

/**
 * Result of running a Claude CLI command
 */
interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a Claude CLI command
 */
const runCommand = (
  args: string[]
): Effect.Effect<CommandResult, ClaudeCliError> =>
  Effect.tryPromise({
    try: async () => {
      const proc = Bun.spawn(["claude", ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      return { stdout, stderr, exitCode };
    },
    catch: (error) =>
      new ClaudeCliError({
        command: `claude ${args.join(" ")}`,
        message: error instanceof Error ? error.message : String(error),
      }),
  });

/**
 * Run a command and fail if exit code is non-zero
 */
const runCommandStrict = (
  args: string[]
): Effect.Effect<string, ClaudeCliError> =>
  Effect.gen(function* () {
    const result = yield* runCommand(args);

    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new ClaudeCliError({
          command: `claude ${args.join(" ")}`,
          message: result.stderr || `Command failed with exit code ${result.exitCode}`,
          exitCode: result.exitCode,
          stderr: result.stderr,
        })
      );
    }

    return result.stdout;
  });

/**
 * Parse scope flag for Claude CLI
 */
const scopeFlag = (scope: Scope): string[] =>
  scope === "user" ? ["--user"] : ["--project"];

// Service interface
interface ClaudeCliServiceImpl {
  /**
   * Add a marketplace
   * `claude marketplace add <source> [--user|--project]`
   */
  readonly marketplaceAdd: (
    source: string,
    scope: Scope
  ) => Effect.Effect<void, ClaudeCliError>;

  /**
   * Remove a marketplace
   * `claude marketplace remove <name>`
   */
  readonly marketplaceRemove: (
    name: string
  ) => Effect.Effect<void, ClaudeCliError>;

  /**
   * List marketplaces
   * `claude marketplace list --json`
   */
  readonly marketplaceList: () => Effect.Effect<Marketplace[], ClaudeCliError>;

  /**
   * Install a plugin
   * `claude plugin install <name> --marketplace <marketplace> [--user|--project]`
   */
  readonly pluginInstall: (
    name: string,
    marketplace: string,
    scope: Scope
  ) => Effect.Effect<void, ClaudeCliError>;

  /**
   * Uninstall a plugin
   * `claude plugin uninstall <name>`
   */
  readonly pluginUninstall: (
    name: string
  ) => Effect.Effect<void, ClaudeCliError>;

  /**
   * List installed plugins
   * `claude plugin list --json`
   */
  readonly pluginList: () => Effect.Effect<InstalledPlugin[], ClaudeCliError>;

  /**
   * Enable a plugin
   * `claude plugin enable <name>`
   */
  readonly pluginEnable: (
    name: string
  ) => Effect.Effect<void, ClaudeCliError>;

  /**
   * Disable a plugin
   * `claude plugin disable <name>`
   */
  readonly pluginDisable: (
    name: string
  ) => Effect.Effect<void, ClaudeCliError>;

  /**
   * Check if Claude CLI is available
   */
  readonly isAvailable: () => Effect.Effect<boolean, never>;
}

// Service tag
export class ClaudeCliService extends Context.Tag("ClaudeCliService")<
  ClaudeCliService,
  ClaudeCliServiceImpl
>() {}

/**
 * Parse JSON output from Claude CLI, handling potential non-JSON output
 */
const parseJsonOutput = <T>(
  output: string,
  command: string
): Effect.Effect<T, ClaudeCliError> =>
  Effect.try({
    try: () => {
      // Claude CLI might output non-JSON messages before/after JSON
      // Try to find JSON array or object in the output
      const trimmed = output.trim();

      // If output starts with [ or {, try to parse directly
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        return JSON.parse(trimmed) as T;
      }

      // Otherwise, try to find JSON in the output
      const jsonMatch = /(\[[\s\S]*\]|\{[\s\S]*\})/.exec(trimmed);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]) as T;
      }

      // If no JSON found, return empty array for list commands
      return [] as unknown as T;
    },
    catch: (error) =>
      new ClaudeCliError({
        command,
        message: `Failed to parse JSON output: ${error instanceof Error ? error.message : String(error)}`,
      }),
  });

// Service implementation
const makeClaudeCliService = (): ClaudeCliServiceImpl => ({
  marketplaceAdd: (source: string, scope: Scope) =>
    Effect.gen(function* () {
      yield* runCommandStrict([
        "marketplace",
        "add",
        source,
        ...scopeFlag(scope),
      ]);
    }),

  marketplaceRemove: (name: string) =>
    Effect.gen(function* () {
      yield* runCommandStrict(["marketplace", "remove", name]);
    }),

  marketplaceList: () =>
    Effect.gen(function* () {
      const output = yield* runCommandStrict([
        "marketplace",
        "list",
        "--json",
      ]);

      // Parse JSON output
      const data = yield* parseJsonOutput<
        { name: string; url?: string; scope?: string }[]
      >(output, "marketplace list");

      return data.map((m) => ({
        name: m.name,
        url: m.url,
        scope: (m.scope === "user" ? "user" : "project"),
      }));
    }),

  pluginInstall: (name: string, marketplace: string, scope: Scope) =>
    Effect.gen(function* () {
      yield* runCommandStrict([
        "plugin",
        "install",
        name,
        "--marketplace",
        marketplace,
        ...scopeFlag(scope),
      ]);
    }),

  pluginUninstall: (name: string) =>
    Effect.gen(function* () {
      yield* runCommandStrict(["plugin", "uninstall", name]);
    }),

  pluginList: () =>
    Effect.gen(function* () {
      const output = yield* runCommandStrict(["plugin", "list", "--json"]);

      // Parse JSON output
      const data = yield* parseJsonOutput<
        {
          name: string;
          marketplace: string;
          version?: string;
          scope?: string;
          enabled?: boolean;
        }[]
      >(output, "plugin list");

      return data.map((p) => ({
        name: p.name,
        marketplace: p.marketplace,
        version: p.version,
        scope: (p.scope === "user" ? "user" : "project"),
        enabled: p.enabled ?? true,
      }));
    }),

  pluginEnable: (name: string) =>
    Effect.gen(function* () {
      yield* runCommandStrict(["plugin", "enable", name]);
    }),

  pluginDisable: (name: string) =>
    Effect.gen(function* () {
      yield* runCommandStrict(["plugin", "disable", name]);
    }),

  isAvailable: () =>
    Effect.gen(function* () {
      const result = yield* runCommand(["--version"]).pipe(
        Effect.map(() => true),
        Effect.catchAll(() => Effect.succeed(false))
      );
      return result;
    }),
});

// Live layer
export const ClaudeCliServiceLive = Layer.succeed(
  ClaudeCliService,
  makeClaudeCliService()
);
