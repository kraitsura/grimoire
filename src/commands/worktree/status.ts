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
  AgentSessionService,
  AgentSessionServiceLive,
} from "../../services/worktree";
import type { AgentSession } from "../../models/agent-session";
import type { WorktreeListItem } from "../../models/worktree";

/**
 * Format relative time (e.g., "2h ago", "3d ago")
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
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
    const json = args.flags.json === true;
    const brief = args.flags.brief === true;

    const service = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const agentSessionService = yield* AgentSessionService;
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

    // Build rich data with agent session info
    interface RichWorktreeData extends WorktreeListItem {
      claimedBy?: string;
      claimedAt?: string;
      logs: unknown[];
      checkpoints: unknown[];
      currentStage?: string;
      issueProvider?: string;
      agentSession?: AgentSession | null;
      agentAlive?: boolean;
    }

    const richData: RichWorktreeData[] = [];
    for (const wt of worktrees) {
      const entry = state.worktrees.find((w) => w.name === wt.name);

      // Get agent session info (refreshes status automatically)
      const sessionResult = yield* Effect.either(
        agentSessionService.refreshSessionStatus(wt.path)
      );
      const session = sessionResult._tag === "Right" ? sessionResult.right : null;
      const alive = session?.status === "running" && agentSessionService.isPidAlive(session.pid);

      richData.push({
        ...wt,
        claimedBy: entry?.claimedBy,
        claimedAt: entry?.claimedAt,
        logs: entry?.logs || [],
        checkpoints: entry?.checkpoints || [],
        currentStage: entry?.currentStage,
        issueProvider: entry?.issueProvider,
        agentSession: session,
        agentAlive: alive,
      });
    }

    // Calculate summary
    const active = richData.filter((w) => w.status === "active").length;
    const stale = richData.filter((w) => w.status === "stale").length;
    const claimed = richData.filter((w) => w.claimedBy).length;
    const available = active - claimed;
    const totalLogs = richData.reduce((sum, w) => sum + w.logs.length, 0);
    const totalCheckpoints = richData.reduce((sum, w) => sum + w.checkpoints.length, 0);
    const runningAgents = richData.filter((w) => w.agentAlive).length;

    if (json) {
      console.log(
        JSON.stringify(
          {
            worktrees: richData.map((w) => ({
              ...w,
              agentSession: w.agentSession
                ? {
                    sessionId: w.agentSession.sessionId,
                    pid: w.agentSession.pid,
                    mode: w.agentSession.mode,
                    status: w.agentAlive ? "running" : w.agentSession.status,
                    startedAt: w.agentSession.startedAt,
                    prompt: w.agentSession.prompt,
                    logFile: w.agentSession.logFile,
                  }
                : null,
            })),
            summary: { active, stale, claimed, available, runningAgents, totalLogs, totalCheckpoints },
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
      if (runningAgents > 0) console.log(`Agents: ${runningAgents} running`);
      for (const wt of richData) {
        const claimInfo = wt.claimedBy ? `[${wt.claimedBy}]` : "";
        const agentInfo = wt.agentAlive ? "[agent]" : "";
        const issueInfo = wt.linkedIssue || "";
        console.log(`  ${wt.name} ${wt.status} ${claimInfo} ${agentInfo} ${issueInfo}`.trim());
      }
      return;
    }

    // Compact default view (optimized for agents)
    console.log(`worktrees: ${active} active, ${claimed} claimed, ${available} available${stale > 0 ? `, ${stale} stale` : ""}${runningAgents > 0 ? `, ${runningAgents} agents` : ""}`);
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

      // Agent session info
      if (wt.agentSession) {
        const status = wt.agentAlive ? "running" : wt.agentSession.status;
        parts.push(`agent=${status}`);
        if (wt.agentAlive) {
          parts.push(`pid=${wt.agentSession.pid}`);
          parts.push(`started=${formatRelativeTime(wt.agentSession.startedAt)}`);
        }
        if (wt.agentSession.prompt) {
          const shortPrompt = wt.agentSession.prompt.length > 40
            ? wt.agentSession.prompt.substring(0, 37) + "..."
            : wt.agentSession.prompt;
          parts.push(`prompt="${shortPrompt}"`);
        }
      }

      console.log(`  ${parts.join(" ")}`);
    }
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive),
    Effect.provide(AgentSessionServiceLive)
  );
