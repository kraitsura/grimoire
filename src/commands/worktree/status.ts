/**
 * grimoire wt status - Rich status display for all worktrees
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
 * Pad string to length
 */
function pad(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len - 1) + "…";
  return str + " ".repeat(len - str.length);
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
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return "now";
}

/**
 * Get issue status indicator
 */
function getIssueIndicator(issueId: string): string {
  try {
    const output = execSync(`bd show ${issueId} --json`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const data = JSON.parse(output);
    switch (data.status) {
      case "in_progress":
        return "●";
      case "closed":
        return "✓";
      case "blocked":
        return "⚠";
      default:
        return "○";
    }
  } catch {
    return "";
  }
}

export const worktreeStatus = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const json = args.flags["json"] === true;
    const brief = args.flags["brief"] === true;

    const service = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const cwd = process.cwd();

    const worktreesResult = yield* Effect.either(service.list(cwd));

    if (worktreesResult._tag === "Left") {
      const e = worktreesResult.left as { message?: string };
      console.error(`Error: ${e.message || "Failed to list worktrees"}`);
      process.exit(1);
    }

    const worktrees = worktreesResult.right as WorktreeListItem[];

    if (worktrees.length === 0) {
      if (json) {
        console.log(JSON.stringify({ worktrees: [], summary: {} }, null, 2));
      } else {
        console.log("No worktrees found.");
        console.log("Create one with: grimoire wt new <branch>");
      }
      return;
    }

    // Get full state for claims, logs, etc.
    const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
    const state = yield* stateService.getState(repoRoot);

    // Build rich data
    const richData = worktrees.map((wt) => {
      const entry = state.worktrees.find((w) => w.name === wt.name);
      return {
        ...wt,
        claimedBy: entry?.claimedBy,
        claimedAt: entry?.claimedAt,
        logs: entry?.logs || [],
        checkpoints: entry?.checkpoints || [],
        currentStage: entry?.currentStage,
        issueProvider: entry?.issueProvider,
      };
    });

    // Calculate summary
    const active = richData.filter((w) => w.status === "active").length;
    const stale = richData.filter((w) => w.status === "stale").length;
    const claimed = richData.filter((w) => w.claimedBy).length;
    const available = active - claimed;
    const totalLogs = richData.reduce((sum, w) => sum + w.logs.length, 0);
    const totalCheckpoints = richData.reduce((sum, w) => sum + w.checkpoints.length, 0);

    if (json) {
      console.log(
        JSON.stringify(
          {
            worktrees: richData,
            summary: { active, stale, claimed, available, totalLogs, totalCheckpoints },
          },
          null,
          2
        )
      );
      return;
    }

    if (brief) {
      // Compact view
      console.log(`Worktrees: ${active} active (${claimed} claimed, ${available} available), ${stale} stale`);
      for (const wt of richData) {
        const claimInfo = wt.claimedBy ? `[${wt.claimedBy}]` : "";
        const issueInfo = wt.linkedIssue || "";
        console.log(`  ${wt.name} ${wt.status} ${claimInfo} ${issueInfo}`);
      }
      return;
    }

    // Rich view
    console.log();
    console.log("Worktree Status");
    console.log("═".repeat(80));
    console.log();

    // Header
    console.log(
      `${pad("NAME", 22)}${pad("STATUS", 10)}${pad("CLAIMED", 14)}${pad("ISSUE", 16)}${pad("LOGS", 6)}STAGE`
    );
    console.log("─".repeat(80));

    for (const wt of richData) {
      const statusStr = wt.status === "stale" ? "stale" : "active";
      const claimedStr = wt.claimedBy
        ? wt.claimedBy.length > 12
          ? wt.claimedBy.slice(0, 11) + "…"
          : wt.claimedBy
        : "-";

      let issueStr = wt.linkedIssue || "-";
      if (wt.linkedIssue && wt.issueProvider === "beads") {
        const indicator = getIssueIndicator(wt.linkedIssue);
        issueStr = `${wt.linkedIssue} ${indicator}`;
      }

      const logsStr = wt.logs.length.toString();
      const stageStr = wt.currentStage || "-";

      console.log(
        `${pad(wt.name, 22)}${pad(statusStr, 10)}${pad(claimedStr, 14)}${pad(issueStr, 16)}${pad(logsStr, 6)}${stageStr}`
      );
    }

    console.log();
    console.log("Summary:");
    console.log(`  Active: ${active} (${claimed} claimed, ${available} available)`);
    if (stale > 0) {
      console.log(`  Stale: ${stale} (ready for cleanup)`);
    }
    console.log(`  Total logs: ${totalLogs}, checkpoints: ${totalCheckpoints}`);
    console.log();
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive)
  );
