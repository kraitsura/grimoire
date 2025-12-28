/**
 * grimoire wt spawn - Create a worktree and launch a sandboxed Claude session
 *
 * This command:
 * 1. Creates a new worktree (reusing grim wt new logic)
 * 2. Generates SRT config scoped to the worktree
 * 3. Launches Claude Code in a sandboxed environment
 */

import { Effect } from "effect";
import { spawn } from "child_process";
import { join } from "path";
import { randomUUID } from "crypto";
import { appendFileSync } from "fs";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
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
  TerminalNotSupportedError,
} from "../../services/terminal";
import type { WorktreeInfo } from "../../models/worktree";
import type { AgentSessionMode } from "../../models/agent-session";

/**
 * Parameters for spawning a headless session
 */
interface SpawnHeadlessParams {
  worktree: WorktreeInfo;
  prompt: string | undefined;
  useSrt: boolean;
  dangerouslySkipPermissions: boolean;
  cwd: string;
}

/**
 * Spawn a headless (background) Claude session
 */
const spawnHeadless = (params: SpawnHeadlessParams) =>
  Effect.gen(function* () {
    const { worktree, prompt, useSrt, dangerouslySkipPermissions, cwd } = params;

    const srtService = yield* SrtService;
    const srtConfigService = yield* SrtConfigService;
    const agentSessionService = yield* AgentSessionService;

    const sessionId = `sess_${randomUUID().slice(0, 8)}`;
    const mode: AgentSessionMode = "headless";
    const logFile = join(worktree.path, ".claude-session.log");

    console.log("Spawning headless Claude agent...");

    // Build the claude command with --print for non-interactive mode
    const claudeArgs: string[] = ["--print"];

    // Add security flag
    if (dangerouslySkipPermissions) {
      claudeArgs.push("--dangerously-skip-permissions");
    }

    // Add prompt if provided
    if (prompt) {
      claudeArgs.push(prompt);
    }

    // Escape function for shell arguments
    const shellEscape = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    const argsStr = claudeArgs.map(shellEscape).join(" ");

    let fullCommand: string;

    if (useSrt) {
      // Generate SRT config
      const resolved = yield* srtConfigService.resolveConfig(worktree.path, cwd);
      const configPath = yield* srtService.writeConfigFile(resolved.config);

      // Build wrapped command with shell redirection
      const claudeCommand = `claude ${argsStr}`;
      const srtCommand = srtService.wrapCommand(claudeCommand, configPath);
      fullCommand = `${srtCommand} >> ${shellEscape(logFile)} 2>&1`;
    } else {
      // No SRT - direct claude with shell redirection
      fullCommand = `claude ${argsStr} >> ${shellEscape(logFile)} 2>&1`;
    }

    // Write header to log file
    appendFileSync(
      logFile,
      `\n=== Session ${sessionId} started at ${new Date().toISOString()} ===\n` +
      `Command: ${fullCommand}\n\n`
    );

    // Spawn detached process with shell redirection
    const child = spawn("sh", ["-c", fullCommand], {
      cwd: worktree.path,
      env: {
        ...process.env,
        GRIMOIRE_WORKTREE: worktree.name,
        GRIMOIRE_WORKTREE_PATH: worktree.path,
        GRIMOIRE_SESSION_ID: sessionId,
      },
      detached: true,
      stdio: "ignore",
    });

    // Unref so parent can exit
    child.unref();

    // Create session state
    yield* agentSessionService.createSession(worktree.path, {
      sessionId,
      pid: child.pid!,
      mode,
      prompt,
      logFile,
    });

    // Output info
    console.log(`Spawned headless agent in worktree "${worktree.name}"`);
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  PID: ${child.pid}`);
    console.log(`  Log: ${logFile}`);
    console.log();
    console.log(`Monitor: grimoire wt logs ${worktree.name}`);
    console.log(`Status:  grimoire wt ps`);
  });

/**
 * Print usage and exit
 */
const printUsage = () => {
  console.log("Usage: grimoire wt spawn <name> [options]");
  console.log();
  console.log("Create a worktree and launch a sandboxed Claude session.");
  console.log();
  console.log("Arguments:");
  console.log("  <name>                 Worktree/branch name");
  console.log();
  console.log("Options:");
  console.log("  --branch, -b <name>    Use different branch name");
  console.log("  --prompt, -p <text>    Initial prompt for Claude");
  console.log("  --issue, -i <id>       Link to beads issue");
  console.log("  --new-tab              Open Claude in a new terminal tab/window");
  console.log("  --no-sandbox           Skip SRT sandboxing (for debugging)");
  console.log("  --no-copy              Skip copying config files");
  console.log("  --no-hooks             Skip running post-create hooks");
  console.log("  --create-branch        Create new branch if doesn't exist");
  console.log();
  console.log("Headless Mode:");
  console.log("  -H, --headless         Run Claude in background (--print mode)");
  console.log("  --srt                  Use SRT sandbox (required for headless)");
  console.log("  --dangerously-skip-permissions");
  console.log("                         Skip permission checks (required if no --srt)");
  console.log();
  console.log("Examples:");
  console.log('  grimoire wt spawn auth-feature --prompt "Implement OAuth2"');
  console.log("  grimoire wt spawn --issue BD-15");
  console.log("  grimoire wt spawn fix-bug --no-sandbox");
  console.log('  grimoire wt spawn task-1 -H --srt --prompt "Fix bug"');
  process.exit(1);
};

export const worktreeSpawn = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    if (!name) {
      printUsage();
      return;
    }

    // Parse options
    const branchName =
      (args.flags["branch"] as string) || (args.flags["b"] as string) || name;
    const prompt = (args.flags["prompt"] as string) || (args.flags["p"] as string);
    const linkedIssue =
      (args.flags["issue"] as string) || (args.flags["i"] as string);
    const noSandbox = args.flags["no-sandbox"] === true;
    const skipCopy = args.flags["no-copy"] === true;
    const skipHooks = args.flags["no-hooks"] === true;
    const createBranch = args.flags["create-branch"] === true;
    const newTab = args.flags["new-tab"] === true;

    // Headless mode options
    const headless = args.flags["headless"] === true || args.flags["H"] === true;
    const useSrt = args.flags["srt"] === true;
    const dangerouslySkipPermissions = args.flags["dangerously-skip-permissions"] === true;

    // Validate headless mode requirements
    if (headless && !useSrt && !dangerouslySkipPermissions) {
      console.log("Error: Headless mode requires --srt or --dangerously-skip-permissions");
      console.log("Hint: Use --srt for sandboxed execution (recommended)");
      process.exit(1);
    }

    const worktreeService = yield* WorktreeService;
    const srtService = yield* SrtService;
    const srtConfigService = yield* SrtConfigService;
    const agentSessionService = yield* AgentSessionService;
    const terminalService = yield* TerminalService;
    const cwd = process.cwd();

    // Step 1: Check SRT availability (unless --no-sandbox)
    if (!noSandbox) {
      const platformInfo = yield* srtService.checkPlatform();
      if (!platformInfo.srtAvailable) {
        console.log("Warning: SRT sandboxing not available");
        if (platformInfo.instructions) {
          console.log();
          console.log("To enable sandboxing:");
          console.log(platformInfo.instructions);
        }
        console.log();
        console.log("Continuing without sandbox (use --no-sandbox to suppress this warning)");
        console.log();
      }
    }

    // Step 2: Create the worktree
    console.log(`Creating worktree '${name}'...`);

    const createResult = yield* Effect.either(
      worktreeService.create(cwd, {
        branch: branchName,
        name,
        linkedIssue,
        skipCopy,
        skipHooks,
        createBranch,
        createdBy: "agent",
        sessionId: randomUUID(),
      })
    );

    if (createResult._tag === "Left") {
      const e = createResult.left as { _tag?: string; message?: string };
      if (e._tag === "WorktreeAlreadyExistsError") {
        // Worktree exists, try to use it
        console.log(`Worktree '${name}' already exists, using existing...`);
      } else if (e._tag === "BranchNotFoundError") {
        console.log(`Error: ${e.message}`);
        console.log("Use --create-branch to create a new branch.");
        process.exit(1);
      } else {
        console.log(`Error creating worktree: ${e.message || String(createResult.left)}`);
        process.exit(1);
      }
    }

    // Get worktree info (either newly created or existing)
    const worktreeResult = yield* Effect.either(worktreeService.get(cwd, name));
    if (worktreeResult._tag === "Left") {
      console.log("Error: Failed to get worktree info");
      process.exit(1);
    }

    const worktree = worktreeResult.right as WorktreeInfo;
    console.log(`  Branch: ${worktree.branch}`);
    console.log(`  Path: ${worktree.path}`);
    if (linkedIssue) {
      console.log(`  Issue: ${linkedIssue}`);
    }
    console.log();

    // Headless mode - spawn background agent
    if (headless) {
      yield* spawnHeadless({
        worktree,
        prompt,
        useSrt,
        dangerouslySkipPermissions,
        cwd,
      });
      return;
    }

    // Step 3: Generate SRT config
    const useSandbox = !noSandbox && (yield* srtService.isAvailable());

    // Build the claude command
    const shellEscape = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    let claudeCommand = "claude";
    if (prompt) {
      claudeCommand = `claude ${shellEscape(prompt)}`;
    }

    // Wrap with SRT if using sandbox
    let fullCommand = claudeCommand;
    let configPath: string | undefined;

    if (useSandbox) {
      console.log("Generating sandbox configuration...");
      const resolved = yield* srtConfigService.resolveConfig(worktree.path, cwd);
      console.log(`  Write access: ${worktree.path}`);
      console.log(`  Network: ${resolved.config.network.allowedDomains.slice(0, 3).join(", ")}...`);
      console.log();

      // Write config to temp file
      configPath = yield* srtService.writeConfigFile(resolved.config);
      fullCommand = srtService.wrapCommand(claudeCommand, configPath);
    }

    // Handle --new-tab mode
    if (newTab) {
      const terminal = yield* terminalService.detect();

      if (!terminal.supportsNewTab) {
        console.log();
        console.log(terminalService.getUnsupportedMessage(terminal, fullCommand, worktree.path));
        process.exit(1);
      }

      console.log(`Opening Claude in new ${terminal.opensTab ? "tab" : "window"} (${terminal.name})...`);
      const sessionId = `sess_${randomUUID().slice(0, 8)}`;
      console.log(`  Session ID: ${sessionId}`);
      console.log(`  Worktree: ${worktree.path}`);
      console.log();

      // Set environment variables in the command
      const envPrefix = [
        `GRIMOIRE_WORKTREE=${shellEscape(name)}`,
        `GRIMOIRE_WORKTREE_PATH=${shellEscape(worktree.path)}`,
        `GRIMOIRE_SESSION_ID=${shellEscape(sessionId)}`,
      ].join(" ");
      const commandWithEnv = `${envPrefix} ${fullCommand}`;

      const openResult = yield* Effect.either(
        terminalService.openNewTab(commandWithEnv, worktree.path)
      );

      if (openResult._tag === "Left") {
        const err = openResult.left;
        if (err._tag === "TerminalNotSupportedError") {
          console.log();
          console.log(terminalService.getUnsupportedMessage(err.terminal, fullCommand, worktree.path));
        } else {
          console.log(`Error opening new tab: ${err.stderr}`);
        }
        process.exit(1);
      }

      console.log("Claude session launched in new terminal.");
      console.log();
      console.log(`Monitor: grimoire wt logs ${name}`);
      console.log(`Status:  grimoire wt ps`);
      return;
    }

    // Default: run in current terminal
    console.log("Launching Claude Code session...");
    const sessionId = `sess_${randomUUID().slice(0, 8)}`;
    const mode: AgentSessionMode = "interactive";
    console.log(`  Session ID: ${sessionId}`);
    console.log();

    // Spawn the process
    const child = spawn("sh", ["-c", fullCommand], {
      cwd: worktree.path,
      env: {
        ...process.env,
        GRIMOIRE_WORKTREE: name,
        GRIMOIRE_WORKTREE_PATH: worktree.path,
        GRIMOIRE_SESSION_ID: sessionId,
      },
      stdio: "inherit",
    });

    // Create session state (linkedIssue is in main worktree state, not here)
    yield* agentSessionService.createSession(worktree.path, {
      sessionId,
      pid: child.pid!,
      mode,
      prompt,
    });

    // Wait for process to exit
    yield* Effect.promise(
      () =>
        new Promise<void>((resolve) => {
          child.on("close", (code) => {
            // Cleanup config file and update session state
            const cleanupPromises: Promise<unknown>[] = [
              Effect.runPromise(
                agentSessionService.updateSession(worktree.path, {
                  status: code === 0 ? "stopped" : "crashed",
                  endedAt: new Date().toISOString(),
                  exitCode: code ?? undefined,
                })
              ).catch(() => {}),
            ];
            if (configPath) {
              cleanupPromises.push(
                import("fs/promises").then((fs) => fs.unlink(configPath!).catch(() => {}))
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
              agentSessionService.updateSession(worktree.path, {
                status: "crashed",
                endedAt: new Date().toISOString(),
              })
            ).catch(() => {});
            process.exitCode = 1;
            resolve();
          });
        })
    );
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(SrtServiceLive),
    Effect.provide(SrtConfigServiceLive),
    Effect.provide(AgentSessionServiceLive),
    Effect.provide(TerminalServiceLive)
  );
