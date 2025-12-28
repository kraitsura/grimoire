/**
 * grimoire wt children - Show worktrees spawned by current session/worktree
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
  WorktreeStateService,
  WorktreeStateServiceLive,
  AgentSessionService,
  AgentSessionServiceLive,
} from "../../services/worktree";
import type { WorktreeListItem } from "../../models/worktree";
import type { AgentSession } from "../../models/agent-session";

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
 * Pad string to length with truncation
 */
function pad(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len - 1) + "…";
  return str + " ".repeat(len - str.length);
}

interface ChildWorktreeInfo {
  worktree: WorktreeListItem;
  session: AgentSession | null;
  alive: boolean;
  linkedIssue: string | null;
  mergeStatus: string | null;
  spawnedAt: string | null;
}

export const worktreeChildren = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const json = args.flags["json"] === true;
    const all = args.flags["all"] === true;

    const worktreeService = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const sessionService = yield* AgentSessionService;
    const cwd = process.cwd();

    // Detect current worktree/session from environment
    const currentWorktree = process.env.GRIMOIRE_WORKTREE;
    const currentSession = process.env.GRIMOIRE_SESSION_ID;

    if (!currentWorktree && !currentSession && !all) {
      console.log("Not running in a spawned worktree context.");
      console.log("Use --all to show all parent-child relationships.");
      console.log();
      console.log("Hint: This command works best when run from within a spawned worktree,");
      console.log("      or set GRIMOIRE_WORKTREE/GRIMOIRE_SESSION_ID environment variables.");
      return;
    }

    // Get all worktrees
    const worktreesResult = yield* Effect.either(worktreeService.list(cwd));
    if (worktreesResult._tag === "Left") {
      const e = worktreesResult.left as { message?: string };
      console.log(`Error: ${e.message || String(worktreesResult.left)}`);
      process.exit(1);
    }

    const worktrees = worktreesResult.right as WorktreeListItem[];

    // Get state entries for each worktree
    const state = yield* stateService.getState(cwd);

    // Find children of current worktree/session
    const children: ChildWorktreeInfo[] = [];

    for (const wt of worktrees) {
      const entry = state.worktrees.find((w) => w.name === wt.name);
      if (!entry) continue;

      // Check if this is a child of current worktree/session
      const isChild = all
        ? (entry.parentWorktree || entry.parentSession) // Show any with parent
        : (entry.parentWorktree === currentWorktree || entry.parentSession === currentSession);

      if (!isChild) continue;

      // Get session info
      const sessionResult = yield* Effect.either(
        sessionService.refreshSessionStatus(wt.path)
      );

      const session = sessionResult._tag === "Right" ? sessionResult.right : null;
      const alive = session ? sessionService.isPidAlive(session.pid) : false;

      children.push({
        worktree: wt,
        session,
        alive,
        linkedIssue: entry.linkedIssue || null,
        mergeStatus: entry.mergeStatus || null,
        spawnedAt: entry.spawnedAt || null,
      });
    }

    if (json) {
      const output = children.map((c) => ({
        worktree: c.worktree.name,
        branch: c.worktree.branch,
        path: c.worktree.path,
        task: c.linkedIssue,
        status: c.alive ? "running" : (c.session?.status ?? "none"),
        mergeStatus: c.mergeStatus,
        spawnedAt: c.spawnedAt,
        sessionId: c.session?.sessionId ?? null,
        pid: c.session?.pid ?? null,
      }));
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    if (children.length === 0) {
      if (all) {
        console.log("No spawned child worktrees found.");
      } else {
        console.log(`No child worktrees spawned from ${currentWorktree || currentSession}.`);
      }
      return;
    }

    // Table header - TASK, WORKTREE, STATUS, AGE, BRANCH
    console.log(
      `${pad("TASK", 16)}${pad("WORKTREE", 20)}${pad("STATUS", 12)}${pad("AGE", 10)}BRANCH`
    );

    // Table rows
    for (const c of children) {
      const task = c.linkedIssue || "-";
      const name = c.worktree.name;

      // Determine status
      let status: string;
      if (!c.session) {
        status = c.mergeStatus || "unknown";
      } else if (c.session.status === "running" && !c.alive) {
        status = "crashed";
      } else if (c.session.status === "stopped") {
        status = c.mergeStatus === "merged" ? "merged" : "done";
      } else {
        status = c.session.status;
      }

      const age = c.spawnedAt ? formatRelativeTime(c.spawnedAt) : "-";
      const branch = c.worktree.branch;

      console.log(
        `${pad(task, 16)}${pad(name, 20)}${pad(status, 12)}${pad(age, 10)}${branch}`
      );
    }

    // Summary
    const running = children.filter(
      (c) => c.session?.status === "running" && c.alive
    ).length;
    const done = children.filter(
      (c) => c.session?.status === "stopped" || (!c.session && c.mergeStatus)
    ).length;

    console.log();
    console.log(`${running} running, ${done} done, ${children.length} total`);
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive),
    Effect.provide(AgentSessionServiceLive)
  );
