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
 * Get issue status from beads
 */
function getIssueStatus(issueId: string): string {
  try {
    const output = execSync(`bd show ${issueId} --json`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const data = JSON.parse(output);
    // bd show --json returns an array
    const issue = Array.isArray(data) ? data[0] : data;
    return issue?.status || "";
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

    // Compact default view (optimized for agents)
    console.log(`worktrees: ${active} active, ${claimed} claimed, ${available} available${stale > 0 ? `, ${stale} stale` : ""}`);
    for (const wt of richData) {
      const parts: string[] = [`name=${wt.name}`, `status=${wt.status}`];
      if (wt.claimedBy) parts.push(`claimed_by=${wt.claimedBy}`);
      if (wt.linkedIssue) {
        parts.push(`issue=${wt.linkedIssue}`);
        if (wt.issueProvider === "beads") {
          const issueStatus = getIssueStatus(wt.linkedIssue);
          if (issueStatus) parts.push(`issue_status=${issueStatus}`);
        }
      }
      if (wt.logs.length > 0) parts.push(`logs=${wt.logs.length}`);
      if (wt.currentStage) parts.push(`stage=${wt.currentStage}`);
      console.log(`  ${parts.join(" ")}`);
    }
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive)
  );
