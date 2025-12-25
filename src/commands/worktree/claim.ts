/**
 * grimoire wt claim/release - Worktree coordination commands
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
import type { WorktreeLog, WorktreeLogType } from "../../models/worktree";

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

/**
 * Format relative time
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return "just now";
}

export const worktreeClaim = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    const force = args.flags["force"] === true || args.flags["f"] === true;

    if (!name) {
      console.log("Usage: grimoire wt claim <name>");
      console.log();
      console.log("Claim a worktree for exclusive work.");
      console.log();
      console.log("Options:");
      console.log("  --force, -f   Override existing claim");
      console.log();
      console.log("Examples:");
      console.log("  grimoire wt claim feature-auth");
      console.log("  grimoire wt claim feature-auth --force");
      process.exit(1);
    }

    const service = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const cwd = process.cwd();

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

    const author = getAuthor();
    const now = new Date().toISOString();

    // Check if already claimed
    if (entry.claimedBy && entry.claimedBy !== author) {
      if (!force) {
        const since = entry.claimedAt ? formatRelativeTime(entry.claimedAt) : "unknown";
        console.error(`Error: ${name} is claimed by ${entry.claimedBy} (since ${since})`);
        console.error("Use --force to override.");
        process.exit(1);
      }
      console.log(`⚠ Overriding claim from ${entry.claimedBy}`);
    }

    // Create claim log entry
    const claimLog: WorktreeLog = {
      time: now,
      message: `Claimed by ${author}`,
      author,
      type: "log" as WorktreeLogType,
    };

    const currentLogs = (entry.logs || []) as WorktreeLog[];

    // Update state with claim
    yield* stateService.updateWorktree(repoRoot, name, {
      claimedBy: author,
      claimedAt: now,
      logs: [...currentLogs, claimLog],
    });

    console.log(`✓ Claimed ${name}`);

    // Optional: sync to beads assignee
    if (entry.linkedIssue) {
      try {
        execSync(`bd update ${entry.linkedIssue} --status=in_progress`, {
          stdio: "ignore",
        });
      } catch {
        // Beads not available - ignore
      }
    }
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive)
  );

export const worktreeRelease = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    const note = args.flags["note"] as string | undefined;
    const reason = args.flags["reason"] as string | undefined;
    const nextStage = args.flags["next"] as string | undefined;

    if (!name) {
      console.log("Usage: grimoire wt release <name>");
      console.log();
      console.log("Release claim on a worktree.");
      console.log();
      console.log("Options:");
      console.log("  --note <msg>    Add release note");
      console.log("  --reason <r>    Mark as interrupt (e.g., incident)");
      console.log("  --next <stage>  Handoff to next stage (plan/implement/test/review)");
      console.log();
      console.log("Examples:");
      console.log("  grimoire wt release feature-auth");
      console.log('  grimoire wt release feature-auth --note "Ready for review"');
      console.log("  grimoire wt release feature-auth --next=test");
      console.log("  grimoire wt release feature-auth --reason=incident");
      process.exit(1);
    }

    const service = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const cwd = process.cwd();

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

    const author = getAuthor();
    const now = new Date().toISOString();

    // Determine log type and message
    let logType: WorktreeLogType = "log";
    let message = `Released by ${author}`;
    let metadata: { nextStage?: string; reason?: string } | undefined;

    if (reason) {
      logType = "interrupt";
      message = note || `Interrupted: ${reason}`;
      metadata = { reason };
    } else if (nextStage) {
      logType = "handoff";
      message = note || `Handoff to ${nextStage}`;
      metadata = { nextStage };
    } else if (note) {
      message = note;
    }

    // Create release log entry
    const releaseLog: WorktreeLog = {
      time: now,
      message,
      author,
      type: logType,
      ...(metadata && { metadata }),
    };

    const currentLogs = (entry.logs || []) as WorktreeLog[];

    // Build update object
    const updates: Record<string, unknown> = {
      claimedBy: undefined,
      claimedAt: undefined,
      logs: [...currentLogs, releaseLog],
    };

    // Update stage if handoff
    if (nextStage && ["plan", "implement", "test", "review"].includes(nextStage)) {
      const stageHistory = entry.stageHistory || [];
      updates.currentStage = nextStage;
      updates.stageHistory = [
        ...stageHistory,
        {
          from: entry.currentStage || "unknown",
          to: nextStage,
          time: now,
          agent: author,
        },
      ];
    }

    // Update state
    yield* stateService.updateWorktree(repoRoot, name, updates as any);

    console.log(`✓ Released ${name}`);
    if (note) {
      console.log(`  Note: ${note}`);
    }
    if (nextStage) {
      console.log(`  Next stage: ${nextStage}`);
    }
    if (reason) {
      console.log(`  Reason: ${reason}`);
    }

    // Optional: sync to beads
    if (entry.linkedIssue) {
      try {
        // Clear assignee on release
        execSync(`bd update ${entry.linkedIssue} --assignee=""`, {
          stdio: "ignore",
        });
      } catch {
        // Beads not available - ignore
      }
    }
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive)
  );
