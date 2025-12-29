/**
 * grimoire wt spawn - Create a worktree and launch a sandboxed Claude session
 *
 * This command:
 * 1. Creates a new worktree (reusing grim wt new logic)
 * 2. Generates SRT config scoped to the worktree
 * 3. Launches Claude Code in a sandboxed environment
 */

import { Effect } from "effect";
import { spawn, spawnSync } from "child_process";
import { join } from "path";
import { randomUUID } from "crypto";
import { appendFileSync } from "fs";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
  WorktreeStateService,
  WorktreeStateServiceLive,
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
 * Check if Claude OAuth token is configured for headless mode
 * Returns true if token is set up, false if headless would use API credits
 */
const checkHeadlessAuth = (): { hasToken: boolean; error?: string } => {
  try {
    // Test with $0 budget - if auth works, we hit budget limit
    // If no token, we get "Credit balance is too low"
    const result = spawnSync(
      "claude",
      ["--print", "--max-budget-usd", "0", "test"],
      {
        timeout: 15000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    const output = (result.stdout || "") + (result.stderr || "");

    if (output.includes("Credit balance is too low")) {
      return {
        hasToken: false,
        error: "No OAuth token. Headless mode would use API credits.",
      };
    }

    // Budget exceeded or other response = auth is working
    return { hasToken: true };
  } catch (err) {
    return { hasToken: false, error: `Auth check failed: ${err}` };
  }
};

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

    // Build the full prompt with background agent context
    const bgContext = `You are a background agent working in worktree "${worktree.name}" (branch: ${worktree.branch}).

Log your progress with: grim wt log "message"
Create checkpoints with: grim wt checkpoint "message"

Your task: `;

    // Add prompt with context prefix
    if (prompt) {
      claudeArgs.push(bgContext + prompt);
    } else {
      claudeArgs.push(bgContext.trim());
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
  console.log("Usage: grimoire wt spawn <name> [options] [prompt]");
  console.log();
  console.log("Create a worktree and launch a sandboxed Claude session.");
  console.log("If the worktree/branch already exists, deploys an agent to it.");
  console.log();
  console.log("Arguments:");
  console.log("  <name>                 Worktree/branch name");
  console.log("  [prompt]               Optional prompt (with -bg/--background)");
  console.log();
  console.log("Options:");
  console.log("  --branch, -b <name>    Use different branch name");
  console.log("  --prompt, -p <text>    Initial prompt for Claude");
  console.log("  --issue, -I <id>       Link to beads issue (capital I)");
  console.log("  --new-tab              Open Claude in a new terminal tab/window");
  console.log("  --no-copy              Skip copying config files");
  console.log("  --no-hooks             Skip running post-create hooks");
  console.log("  --no-create            Don't create branch if missing (error instead)");
  console.log();
  console.log("Background Mode (recommended for parallel agents):");
  console.log("  -bg, --background      Quick background agent (-H --srt combined)");
  console.log("                         Usage: grim wt spawn <name> -bg \"prompt\"");
  console.log();
  console.log("Headless Mode (granular control):");
  console.log("  -H, --headless         Run Claude in background (--print mode)");
  console.log("  --srt                  Sandboxed autonomous execution (recommended)");
  console.log("                         Agent runs freely within sandbox constraints");
  console.log("  --dangerously-skip-permissions");
  console.log("                         Autonomous without sandbox (use with caution)");
  console.log("  --no-sandbox           Disable sandbox (for debugging)");
  console.log();
  console.log("Note: Headless mode requires `claude setup-token` for subscription auth.");
  console.log();
  console.log("Examples:");
  console.log('  grimoire wt spawn auth-feature --prompt "Implement OAuth2"');
  console.log("  grimoire wt spawn --issue grimoire-123");
  console.log('  grimoire wt spawn task-1 -bg "Fix the login bug"');
  console.log('  grimoire wt spawn task-1 -H --srt --prompt "Fix the login bug"');
  process.exit(1);
};

export const worktreeSpawn = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    if (!name) {
      printUsage();
      return;
    }

    // Check for --background / -bg flag (combines -H --srt --prompt)
    const isBackground = args.flags.background === true || args.flags.bg === true;

    // Parse options
    const branchName =
      (args.flags.branch as string) || (args.flags.b as string) || name;

    // For -bg mode, the prompt can be positional (args.positional[2]) or via --prompt/-p
    let prompt = (args.flags.prompt as string) || (args.flags.p as string);
    if (isBackground && !prompt && args.positional[2]) {
      prompt = args.positional[2];
    }

    // Use -I (capital) for issue to avoid conflict with -i (interactive)
    const linkedIssue =
      (args.flags.issue as string) || (args.flags.I as string);
    const noSandbox = args.flags["no-sandbox"] === true;
    const skipCopy = args.flags["no-copy"] === true;
    const skipHooks = args.flags["no-hooks"] === true;
    // Default: create branch if it doesn't exist (unless --no-create)
    const noCreate = args.flags["no-create"] === true;
    const createBranch = !noCreate;
    const newTab = args.flags["new-tab"] === true;

    // Headless mode options
    // --background implies both --headless and --srt
    const headless = args.flags.headless === true || args.flags.H === true || isBackground;
    const useSrt = args.flags.srt === true || isBackground;
    // SRT implies skip-permissions - the sandbox IS the safety mechanism
    const dangerouslySkipPermissions =
      args.flags["dangerously-skip-permissions"] === true || useSrt;

    // Validate headless mode requirements (skip for -bg since it auto-enables srt)
    if (headless && !useSrt && !dangerouslySkipPermissions) {
      console.log("Error: Headless mode requires --srt or --dangerously-skip-permissions");
      console.log("Hint: Use --srt for sandboxed autonomous execution (recommended)");
      console.log("Hint: Or use -bg/--background for quick background mode (-H --srt combined)");
      process.exit(1);
    }

    // Check OAuth token for headless mode (subscription vs API credits)
    if (headless) {
      console.log("Checking authentication for headless mode...");
      const authStatus = checkHeadlessAuth();
      if (!authStatus.hasToken) {
        console.log();
        console.log("╔══════════════════════════════════════════════════════════════════╗");
        console.log("║  ⚠️  NO OAUTH TOKEN - HEADLESS WOULD USE API CREDITS              ║");
        console.log("╠══════════════════════════════════════════════════════════════════╣");
        console.log("║  Headless mode requires an OAuth token to use your subscription. ║");
        console.log("║  Without it, background agents charge against API credits.       ║");
        console.log("║                                                                  ║");
        console.log("║  To fix this, run:                                               ║");
        console.log("║    grimoire wt auth --setup                                      ║");
        console.log("║                                                                  ║");
        console.log("║  Or manually:                                                    ║");
        console.log("║    claude setup-token                                            ║");
        console.log("╚══════════════════════════════════════════════════════════════════╝");
        console.log();
        process.exit(1);
      }
      console.log("✓ OAuth token verified - using subscription");
      console.log();
    }

    const worktreeService = yield* WorktreeService;
    const srtService = yield* SrtService;
    const srtConfigService = yield* SrtConfigService;
    const agentSessionService = yield* AgentSessionService;
    const terminalService = yield* TerminalService;
    const cwd = process.cwd();

    // Step 1: Check SRT availability (only if --srt explicitly requested)
    if (useSrt && !noSandbox) {
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

    // Step 2: Check if worktree exists, create if needed
    const existingResult = yield* Effect.either(worktreeService.get(cwd, name));
    let worktree: WorktreeInfo;
    let isExisting = false;

    if (existingResult._tag === "Right") {
      // Worktree already exists - deploy agent to it
      worktree = existingResult.right;
      isExisting = true;
      console.log(`Using existing worktree '${name}'...`);
    } else {
      // Create the worktree
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
        if (e._tag === "BranchNotFoundError") {
          console.log(`Error: ${e.message}`);
          console.log("Remove --no-create to auto-create the branch.");
          process.exit(1);
        } else {
          console.log(`Error creating worktree: ${e.message || String(createResult.left)}`);
          process.exit(1);
        }
      }

      worktree = createResult.right;
    }
    console.log(`  Branch: ${worktree.branch}`);
    console.log(`  Path: ${worktree.path}`);
    if (linkedIssue && !isExisting) {
      console.log(`  Issue: ${linkedIssue}`);
    }

    // Record parent-child relationship for swarm coordination
    const worktreeStateService = yield* WorktreeStateService;
    const parentSessionId = process.env.GRIMOIRE_SESSION_ID;
    const parentWorktreeName = process.env.GRIMOIRE_WORKTREE;

    // Only set parent relationship if this is a new worktree being spawned
    // Existing worktrees retain their original relationships
    if (!isExisting && (parentSessionId || parentWorktreeName)) {
      const now = new Date().toISOString();

      // Update the new worktree with parent info
      yield* worktreeStateService.updateWorktree(cwd, name, {
        parentSession: parentSessionId,
        parentWorktree: parentWorktreeName,
        spawnedAt: now,
        mergeStatus: "pending",
      });

      // If we have a parent worktree name, add this as a child
      if (parentWorktreeName) {
        yield* worktreeStateService.addChildWorktree(cwd, parentWorktreeName, name);
        console.log(`  Parent: ${parentWorktreeName}`);
      }
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
    // Note: SRT sandbox breaks TTY passthrough for interactive sessions
    // Only use sandbox if explicitly requested with --srt flag (not just available)
    const useSandbox = !noSandbox && useSrt && (yield* srtService.isAvailable());

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
                import("fs/promises").then((fs) => fs.unlink(configPath).catch(() => {}))
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
    Effect.provide(WorktreeStateServiceLive),
    Effect.provide(SrtServiceLive),
    Effect.provide(SrtConfigServiceLive),
    Effect.provide(AgentSessionServiceLive),
    Effect.provide(TerminalServiceLive)
  );
