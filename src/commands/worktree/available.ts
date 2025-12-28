/**
 * grimoire wt available - Find worktrees available for work
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
import type { WorktreeListItem } from "../../models/worktree";

/**
 * Format relative time
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return "just now";
}

/**
 * Get issue priority from beads
 */
function getIssuePriority(issueId: string): number | null {
  try {
    const output = execSync(`bd show ${issueId} --json`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const data = JSON.parse(output);
    return data.priority ?? null;
  } catch {
    return null;
  }
}

/**
 * Get last log message
 */
function getLastLog(logs: unknown[]): { message: string; time: string } | null {
  if (!logs || logs.length === 0) return null;
  const last = logs[logs.length - 1] as { message?: string; time?: string };
  return last.message && last.time
    ? { message: last.message, time: last.time }
    : null;
}

export const worktreeAvailable = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const json = args.flags.json === true;
    const stageFilter = args.flags.stage as string | undefined;
    const sortByPriority = args.flags.priority === true;

    const service = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const cwd = process.cwd();

    const worktreesResult = yield* Effect.either(service.list(cwd));

    if (worktreesResult._tag === "Left") {
      const e = worktreesResult.left as { message?: string };
      console.error(`Error: ${e.message || "Failed to list worktrees"}`);
      process.exit(1);
    }

    const worktrees = worktreesResult.right;

    if (worktrees.length === 0) {
      if (json) {
        console.log(JSON.stringify({ available: [] }, null, 2));
      } else {
        console.log("No worktrees found.");
      }
      return;
    }

    // Get full state
    const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
    const state = yield* stateService.getState(repoRoot);

    // Build available list (unclaimed, active worktrees)
    let available = worktrees
      .filter((wt) => wt.status === "active")
      .map((wt) => {
        const entry = state.worktrees.find((w) => w.name === wt.name);
        return {
          ...wt,
          claimedBy: entry?.claimedBy,
          claimedAt: entry?.claimedAt,
          logs: entry?.logs || [],
          currentStage: entry?.currentStage,
          issueProvider: entry?.issueProvider,
          priority: entry?.linkedIssue ? getIssuePriority(entry.linkedIssue) : null,
        };
      })
      .filter((wt) => !wt.claimedBy);

    // Filter by stage if specified
    if (stageFilter) {
      available = available.filter((wt) => wt.currentStage === stageFilter);
    }

    // Sort by priority if requested
    if (sortByPriority) {
      available.sort((a, b) => {
        const pa = a.priority ?? 99;
        const pb = b.priority ?? 99;
        return pa - pb;
      });
    }

    if (json) {
      console.log(JSON.stringify({ available }, null, 2));
      return;
    }

    if (available.length === 0) {
      console.log("No available worktrees.");
      if (stageFilter) {
        console.log(`  (filtered by stage: ${stageFilter})`);
      }
      return;
    }

    console.log();
    console.log(`Available Worktrees (${available.length})`);
    console.log("═".repeat(60));
    console.log();

    for (const wt of available) {
      // Priority indicator
      const priorityIcon = wt.priority === 0 ? "🚨" : wt.priority === 1 ? "⚡" : "  ";
      const priorityStr = wt.priority !== null ? `P${wt.priority}` : "";

      // Name and priority
      console.log(`${priorityIcon} ${wt.name}  ${priorityStr}`);

      // Issue info
      if (wt.linkedIssue) {
        console.log(`   Issue: ${wt.linkedIssue}`);
      }

      // Stage
      if (wt.currentStage) {
        console.log(`   Stage: ${wt.currentStage}`);
      }

      // Last log (shows context)
      const lastLog = getLastLog(wt.logs as unknown[]);
      if (lastLog) {
        const ago = formatRelativeTime(lastLog.time);
        const msg = lastLog.message.length > 50
          ? lastLog.message.slice(0, 47) + "..."
          : lastLog.message;
        console.log(`   Last: "${msg}" (${ago})`);
      }

      console.log();
    }

    // Suggest action
    if (available.length > 0) {
      const first = available[0];
      console.log("Quick start:");
      console.log(`  grimoire wt claim ${first.name}`);
      console.log(`  cd $(grimoire wt path ${first.name})`);
    }
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive)
  );
