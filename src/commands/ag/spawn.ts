/**
 * ag spawn - Spawn a worker agent in current directory
 *
 * This is the ag-context wrapper around the spawn functionality.
 * For worktree-isolated spawning, use `grim wt spawn`.
 */

import { Effect } from "effect";
import { spawn, spawnSync } from "child_process";
import { join, basename } from "path";
import { randomUUID } from "crypto";
import { appendFileSync } from "fs";
import type { ParsedArgs } from "../../cli/parser";
import {
  AgentSessionService,
  AgentSessionServiceLive,
} from "../../services/worktree";
import {
  SrtService,
  SrtServiceLive,
  SrtConfigService,
  SrtConfigServiceLive,
} from "../../services/srt";
import {
  TerminalService,
  TerminalServiceLive,
} from "../../services/terminal";
import type { AgentSessionMode } from "../../models/agent-session";
import { requireDependency } from "../../utils/dependency-check";

/**
 * Check if Claude OAuth token is configured for headless mode
 */
const checkHeadlessAuth = (): { hasToken: boolean; hasApiKey: boolean; error?: string } => {
  const hasApiKey = !!(process.env.ANTHROPIC_API_KEY);

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
      return {
        hasToken: false,
        hasApiKey,
        error: "No OAuth token configured. Run 'claude setup-token' to enable subscription-based headless mode.",
      };
    }

    return { hasToken: true, hasApiKey };
  } catch (err) {
    return { hasToken: false, hasApiKey, error: `Auth check failed: ${err}` };
  }
};

/**
 * Parameters for spawning a headless session
 */
interface SpawnHeadlessParams {
  targetDir: string;
  prompt: string | undefined;
  useSrt: boolean;
  dangerouslySkipPermissions: boolean;
}

/**
 * Spawn a headless (background) Claude session in a directory
 */
const spawnHeadless = (params: SpawnHeadlessParams) =>
  Effect.gen(function* () {
    const { targetDir, prompt, useSrt, dangerouslySkipPermissions } = params;

    const srtService = yield* SrtService;
    const srtConfigService = yield* SrtConfigService;
    const agentSessionService = yield* AgentSessionService;

    const sessionId = `sess_${randomUUID().slice(0, 8)}`;
    const mode: AgentSessionMode = "headless";
    const logFile = join(targetDir, ".claude-session.log");
    const dirName = basename(targetDir);

    console.log("Spawning headless Claude agent...");

    const claudeArgs: string[] = ["--print"];

    if (dangerouslySkipPermissions) {
      claudeArgs.push("--dangerously-skip-permissions");
    }

    // Build prompt with context
    const bgContext = `You are a background agent working in "${dirName}".

## Committing Your Work

Stage files you want to commit, then create a commit:

\`\`\`bash
git add src/file1.ts src/file2.ts
git commit -m "Description of changes"
\`\`\`

## Logging Progress

Use standard git commits to track your progress.

Your task: `;

    if (prompt) {
      claudeArgs.push(bgContext + prompt);
    } else {
      claudeArgs.push(bgContext.trim());
    }

    const shellEscape = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    const argsStr = claudeArgs.map(shellEscape).join(" ");

    let fullCommand: string;

    if (useSrt) {
      const resolved = yield* srtConfigService.resolveConfig(targetDir, targetDir);
      const configPath = yield* srtService.writeConfigFile(resolved.config);

      const claudeCommand = `claude ${argsStr}`;
      const srtCommand = srtService.wrapCommand(claudeCommand, configPath);
      fullCommand = `${srtCommand} >> ${shellEscape(logFile)} 2>&1`;
    } else {
      fullCommand = `claude ${argsStr} >> ${shellEscape(logFile)} 2>&1`;
    }

    appendFileSync(
      logFile,
      `\n=== Session ${sessionId} started at ${new Date().toISOString()} ===\n` +
      `Command: ${fullCommand}\n\n`
    );

    const spawnEnv = { ...process.env };
    delete spawnEnv.ANTHROPIC_API_KEY;

    const child = spawn("sh", ["-c", fullCommand], {
      cwd: targetDir,
      env: {
        ...spawnEnv,
        GRIMOIRE_SESSION_ID: sessionId,
      },
      detached: true,
      stdio: "ignore",
    });

    child.unref();

    yield* agentSessionService.createSession(targetDir, {
      sessionId,
      pid: child.pid!,
      mode,
      prompt,
      logFile,
    });

    console.log(`Spawned headless agent in "${dirName}"`);
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  PID: ${child.pid}`);
    console.log(`  Log: ${logFile}`);
    console.log();
    console.log(`Monitor: tail -f ${logFile}`);
  });

/**
 * Print usage
 */
const printUsage = () => {
  console.log("Usage: grim ag spawn [options] [prompt]");
  console.log();
  console.log("Spawn a Claude agent in the current directory.");
  console.log();
  console.log("Arguments:");
  console.log("  [prompt]               Initial prompt for Claude (with -bg)");
  console.log();
  console.log("Options:");
  console.log("  --prompt, -p <text>    Initial prompt for Claude");
  console.log("  --new-tab              Open Claude in a new terminal tab/window");
  console.log();
  console.log("Background Mode (recommended for parallel agents):");
  console.log("  -bg, --background      Quick background agent (-H --srt combined)");
  console.log();
  console.log("Headless Mode (granular control):");
  console.log("  -H, --headless         Run Claude in background (--print mode)");
  console.log("  --srt                  Sandboxed autonomous execution");
  console.log("  --dangerously-skip-permissions");
  console.log("                         Autonomous without sandbox");
  console.log();
  console.log("Note: Headless mode requires `claude setup-token` for subscription auth.");
  console.log();
  console.log("Examples:");
  console.log('  grim ag spawn -bg "Implement the auth feature"');
  console.log('  grim ag spawn --prompt "Fix the bug in main.ts"');
  console.log("  grim ag spawn --new-tab");
  console.log();
  console.log("For worktree isolation, use: grim wt spawn <name> \"task\"");
};

/**
 * ag spawn command
 */
export const agSpawnCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    // Show help
    if (args.flags.help || args.flags.h) {
      printUsage();
      return;
    }

    // Check that Claude CLI is installed
    requireDependency("claude", "spawning agents");

    // Check for --background / -bg flag
    const isBackground = args.flags.background === true || args.flags.bg === true;

    // Parse options
    let prompt = (args.flags.prompt as string) || (args.flags.p as string);
    if (!prompt && args.positional[0]) {
      prompt = args.positional[0];
    }

    const newTab = args.flags["new-tab"] === true;

    // Headless mode options
    const headless = args.flags.headless === true || args.flags.H === true || isBackground;
    const useSrt = args.flags.srt === true || isBackground;
    const dangerouslySkipPermissions =
      args.flags["dangerously-skip-permissions"] === true || useSrt;

    // Validate headless mode requirements
    if (headless && !useSrt && !dangerouslySkipPermissions) {
      console.log("Error: Headless mode requires --srt or --dangerously-skip-permissions");
      console.log("Hint: Use --srt for sandboxed autonomous execution (recommended)");
      console.log("Hint: Or use -bg/--background for quick background mode");
      process.exit(1);
    }

    // Check OAuth token for headless mode
    if (headless) {
      console.log("Checking authentication for headless mode...");
      const authStatus = checkHeadlessAuth();

      if (authStatus.hasApiKey) {
        console.log("  Note: ANTHROPIC_API_KEY detected - will be excluded to use subscription");
      }

      if (!authStatus.hasToken) {
        console.log();
        console.log("╔══════════════════════════════════════════════════════════════════╗");
        console.log("║  WARNING: NO OAUTH TOKEN - HEADLESS WOULD USE API CREDITS       ║");
        console.log("╠══════════════════════════════════════════════════════════════════╣");
        console.log("║  Headless mode requires an OAuth token to use your subscription. ║");
        console.log("║  Without it, background agents charge against API credits.       ║");
        console.log("║                                                                  ║");
        console.log("║  To fix this, run:                                               ║");
        console.log("║    claude setup-token                                            ║");
        console.log("║                                                                  ║");
        console.log("║  Then set the token in your environment:                         ║");
        console.log("║    export CLAUDE_CODE_OAUTH_TOKEN=<your-token>                   ║");
        console.log("╚══════════════════════════════════════════════════════════════════╝");
        console.log();
        process.exit(1);
      }
      console.log("+ OAuth token verified - using subscription");
      console.log();
    }

    const srtService = yield* SrtService;
    const srtConfigService = yield* SrtConfigService;
    const agentSessionService = yield* AgentSessionService;
    const terminalService = yield* TerminalService;
    const cwd = process.cwd();

    // Check SRT availability
    if (useSrt) {
      const platformInfo = yield* srtService.checkPlatform();
      if (!platformInfo.srtAvailable) {
        console.log("Warning: SRT sandboxing requested but not available");
        if (platformInfo.instructions) {
          console.log();
          console.log("To enable sandboxing:");
          console.log(platformInfo.instructions);
        }
        console.log();
        console.log("Continuing without sandbox...");
        console.log();
      }
    }

    // Headless mode - spawn background agent
    if (headless) {
      yield* spawnHeadless({
        targetDir: cwd,
        prompt,
        useSrt,
        dangerouslySkipPermissions,
      });
      return;
    }

    // Build the claude command
    const shellEscape = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    let claudeCommand = "claude";
    if (prompt) {
      claudeCommand = `claude ${shellEscape(prompt)}`;
    }

    // Wrap with SRT if using sandbox
    let fullCommand = claudeCommand;
    let configPath: string | undefined;

    const useSandbox = useSrt && (yield* srtService.isAvailable());

    if (useSandbox) {
      console.log("Generating sandbox configuration...");
      const resolved = yield* srtConfigService.resolveConfig(cwd, cwd);
      console.log(`  Write access: ${cwd}`);
      console.log(`  Network: ${resolved.config.network.allowedDomains.slice(0, 3).join(", ")}...`);
      console.log();

      configPath = yield* srtService.writeConfigFile(resolved.config);
      fullCommand = srtService.wrapCommand(claudeCommand, configPath);
    }

    // Handle --new-tab mode
    if (newTab) {
      const terminal = yield* terminalService.detect();

      if (!terminal.supportsNewTab) {
        console.log();
        console.log(terminalService.getUnsupportedMessage(terminal, fullCommand, cwd));
        process.exit(1);
      }

      console.log(`Opening Claude in new ${terminal.opensTab ? "tab" : "window"} (${terminal.name})...`);
      const sessionId = `sess_${randomUUID().slice(0, 8)}`;
      console.log(`  Session ID: ${sessionId}`);
      console.log(`  Directory: ${cwd}`);
      console.log();

      const envPrefix = `GRIMOIRE_SESSION_ID=${shellEscape(sessionId)}`;
      const commandWithEnv = `${envPrefix} ${fullCommand}`;

      const openResult = yield* Effect.either(
        terminalService.openNewTab(commandWithEnv, cwd)
      );

      if (openResult._tag === "Left") {
        const err = openResult.left;
        if (err._tag === "TerminalNotSupportedError") {
          console.log();
          console.log(terminalService.getUnsupportedMessage(err.terminal, fullCommand, cwd));
        } else {
          console.log(`Error opening new tab: ${err.stderr}`);
        }
        process.exit(1);
      }

      console.log("Claude session launched in new terminal.");
      return;
    }

    // Default: run in current terminal
    console.log("Launching Claude Code session...");
    const sessionId = `sess_${randomUUID().slice(0, 8)}`;
    const mode: AgentSessionMode = "interactive";
    console.log(`  Session ID: ${sessionId}`);
    console.log();

    const child = spawn("sh", ["-c", fullCommand], {
      cwd,
      env: {
        ...process.env,
        GRIMOIRE_SESSION_ID: sessionId,
      },
      stdio: "inherit",
    });

    yield* agentSessionService.createSession(cwd, {
      sessionId,
      pid: child.pid!,
      mode,
      prompt,
    });

    yield* Effect.promise(
      () =>
        new Promise<void>((resolve) => {
          child.on("close", (code) => {
            const cleanupPromises: Promise<unknown>[] = [
              Effect.runPromise(
                agentSessionService.updateSession(cwd, {
                  status: code === 0 ? "stopped" : "crashed",
                  endedAt: new Date().toISOString(),
                  exitCode: code ?? undefined,
                })
              ).catch((err) => {
                console.warn("Warning: Failed to update session status:", err);
              }),
            ];
            if (configPath) {
              cleanupPromises.push(
                import("fs/promises").then((fs) =>
                  fs.unlink(configPath).catch(() => undefined) // Temp file cleanup can fail silently
                )
              );
            }
            Promise.all(cleanupPromises).finally(() => {
              process.exitCode = code ?? 0;
              resolve();
            });
          });
          child.on("error", (err) => {
            console.error(`Error launching Claude: ${err.message}`);
            console.error("Make sure 'claude' CLI is installed and in your PATH");
            Effect.runPromise(
              agentSessionService.updateSession(cwd, {
                status: "crashed",
                endedAt: new Date().toISOString(),
              })
            ).catch((updateErr) => {
              console.warn("Warning: Failed to update session status:", updateErr);
            });
            process.exitCode = 1;
            resolve();
          });
        })
    );
  }).pipe(
    Effect.provide(SrtServiceLive),
    Effect.provide(SrtConfigServiceLive),
    Effect.provide(AgentSessionServiceLive),
    Effect.provide(TerminalServiceLive)
  );
