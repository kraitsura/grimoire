/**
 * grimoire wt log - Add and view progress logs for worktrees
 */

import { Effect } from "effect";
import { execSync } from "child_process";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
  WorktreeStateService,
  WorktreeStateServiceLive,
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
  const match = cwd.match(/\.worktrees\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Get author identifier
 */
function getAuthor(): string {
  return (
    process.env.CLAUDE_SESSION_ID ||
    process.env.GRIMOIRE_SESSION ||
    "human"
  );
}

export const worktreeLog = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[1];
    const cwd = process.cwd();
    const service = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;

    // Detect if we're viewing logs or adding
    // "logs" subcommand = view, otherwise = add
    if (subcommand === "logs") {
      // View logs: grimoire wt logs [name] [--json]
      const name = args.positional[2] || detectCurrentWorktree(cwd);
      const json = args.flags["json"] === true;

      if (!name) {
        console.error("Error: Specify worktree name or run from within a worktree");
        console.log();
        console.log("Usage: grimoire wt logs <name>");
        console.log("       grimoire wt logs         # from within worktree");
        process.exit(1);
      }

      // Get worktree to verify it exists
      const infoResult = yield* Effect.either(service.get(cwd, name));
      if (infoResult._tag === "Left") {
        console.error(`Error: Worktree '${name}' not found`);
        process.exit(1);
      }

      // Get full state to access logs
      const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

      const state = yield* stateService.getState(repoRoot);
      const entry = state.worktrees.find((w) => w.name === name);
      const logs = (entry?.logs || []) as WorktreeLog[];

      if (json) {
        console.log(JSON.stringify({ name, logs }, null, 2));
        return;
      }

      if (logs.length === 0) {
        console.log(`${name} (no logs)`);
        return;
      }

      console.log(`${name} (${logs.length} logs)`);
      console.log("─".repeat(40));

      let lastDate = "";
      for (const log of logs) {
        const date = formatDate(log.time);
        if (date !== lastDate) {
          if (lastDate) console.log();
          console.log(`  ${date}`);
          lastDate = date;
        }

        const time = formatTime(log.time);
        const typeMarker = log.type === "handoff" ? " [handoff]" : log.type === "interrupt" ? " [interrupt]" : "";
        console.log(`  ${time}  ${log.message}${typeMarker}`);
      }
      return;
    }

    // Add log: grimoire wt log <name> "message" OR grimoire wt log "message"
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
    const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

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
      author: getAuthor(),
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
    Effect.provide(WorktreeStateServiceLive)
  );
