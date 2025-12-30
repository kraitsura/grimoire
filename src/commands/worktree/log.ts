/**
 * grimoire wt log - Add and view progress logs for worktrees
 *
 * - `wt log "message"` - Add manual progress note to state
 * - `wt logs <name>` - View agent session output (from .claude-session.log)
 */

import { Effect } from "effect";
import { execSync, spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
  WorktreeStateService,
  WorktreeStateServiceLive,
  AgentSessionService,
  AgentSessionServiceLive,
  getMainRepoRoot,
} from "../../services/worktree";
import type { WorktreeLog } from "../../models/worktree";

/**
 * Format timestamp for display
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Format date header
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Detect current worktree from cwd
 */
function detectCurrentWorktree(cwd: string): string | null {
  const match = /\.worktrees\/([^/]+)/.exec(cwd);
  return match ? match[1] : null;
}


export const worktreeLog = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0]; // "log" or "logs"
    const cwd = process.cwd();
    const service = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const agentSessionService = yield* AgentSessionService;

    // Detect if we're viewing logs or adding
    // "logs" subcommand = view agent output, otherwise = add manual log
    if (subcommand === "logs") {
      // View agent session output: grimoire wt logs [name] [-f] [-n N]
      const name = args.positional[1] || detectCurrentWorktree(cwd);
      const follow = args.flags.f === true || args.flags.follow === true;
      const numLines = (args.flags.n as number) || (args.flags.lines as number) || 50;

      if (!name) {
        console.error("Error: Specify worktree name or run from within a worktree");
        console.log();
        console.log("Usage: grimoire wt logs <name>       # View agent session output");
        console.log("       grimoire wt logs <name> -f    # Follow (like tail -f)");
        console.log("       grimoire wt logs <name> -n 100 # Last N lines");
        console.log();
        console.log("       grimoire wt logs              # From within worktree");
        process.exit(1);
      }

      // Get worktree to verify it exists and get path
      const infoResult = yield* Effect.either(service.get(cwd, name));
      if (infoResult._tag === "Left") {
        console.error(`Error: Worktree '${name}' not found`);
        process.exit(1);
      }

      const worktree = infoResult.right;

      // Get session to find log file
      const sessionResult = yield* Effect.either(
        agentSessionService.getSession(worktree.path)
      );

      let logFile: string;

      if (sessionResult._tag === "Right" && sessionResult.right?.logFile) {
        logFile = sessionResult.right.logFile;
      } else {
        // Fallback to default location
        logFile = join(worktree.path, ".claude-session.log");
      }

      // Check if log file exists
      if (!existsSync(logFile)) {
        console.error(`Error: No logs found for worktree "${name}"`);
        console.log();
        console.log("Hint: Was this worktree spawned with --headless (-H) or --background (-bg)?");
        console.log("      Interactive sessions don't write to log files.");
        process.exit(1);
      }

      if (follow) {
        // Use tail -f for following
        console.log(`Following logs for ${name} (Ctrl+C to stop)...`);
        console.log("─".repeat(60));

        const tail = spawn("tail", ["-f", logFile], {
          stdio: "inherit",
        });

        // Handle graceful exit
        yield* Effect.promise(
          () =>
            new Promise<void>((resolve) => {
              process.on("SIGINT", () => {
                tail.kill();
                resolve();
              });
              tail.on("close", () => resolve());
            })
        );
      } else {
        // Read last N lines
        const content = readFileSync(logFile, "utf8");
        const lines = content.split("\n");
        const lastLines = lines.slice(-numLines);

        console.log(`Logs for ${name} (last ${Math.min(numLines, lines.length)} lines)`);
        console.log("─".repeat(60));
        console.log(lastLines.join("\n"));
      }
      return;
    }

    // Add log: grimoire wt log <name> "message" OR grimoire wt log "message"
    // positional[0] = "log", positional[1] = name or message, positional[2+] = message parts
    let name: string | null;
    let message: string;

    if (args.positional.length >= 3) {
      // grimoire wt log <name> "message"
      name = args.positional[1];
      message = args.positional.slice(2).join(" ");
    } else if (args.positional.length === 2) {
      // grimoire wt log "message" - auto-detect worktree
      name = detectCurrentWorktree(cwd);
      message = args.positional[1];
    } else {
      console.log("Usage: grimoire wt log <name> <message>");
      console.log("       grimoire wt log <message>    # from within worktree");
      console.log();
      console.log("View logs:");
      console.log("       grimoire wt logs <name>");
      console.log("       grimoire wt logs --json");
      process.exit(1);
    }

    if (!name) {
      console.error("Error: Specify worktree name or run from within a worktree");
      process.exit(1);
    }

    if (!message) {
      console.error("Error: Log message required");
      process.exit(1);
    }

    // Verify worktree exists
    const infoResult = yield* Effect.either(service.get(cwd, name));
    if (infoResult._tag === "Left") {
      console.error(`Error: Worktree '${name}' not found`);
      process.exit(1);
    }

    // Get repo root and current state
    const repoRoot = yield* getMainRepoRoot(cwd);

    const state = yield* stateService.getState(repoRoot);
    const entry = state.worktrees.find((w) => w.name === name);

    if (!entry) {
      console.error(`Error: Worktree '${name}' not in state`);
      process.exit(1);
    }

    // Create new log entry
    const newLog: WorktreeLog = {
      time: new Date().toISOString(),
      message,
      author: (args.flags.author as string) || "human",
      type: "log",
    };

    // Append to logs
    const currentLogs = (entry.logs || []) as WorktreeLog[];
    const updatedLogs = [...currentLogs, newLog];

    // Update state
    yield* stateService.updateWorktree(repoRoot, name, { logs: updatedLogs });

    console.log(`✓ Logged: ${message}`);

    // Optional: sync to beads if linked
    if (entry.linkedIssue) {
      try {
        execSync(`bd comment add ${entry.linkedIssue} "[wt] ${message}"`, {
          stdio: "ignore",
        });
      } catch {
        // Beads not available or failed - ignore silently
      }
    }
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive),
    Effect.provide(AgentSessionServiceLive)
  );
