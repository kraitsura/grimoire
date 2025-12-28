/**
 * grimoire wt ps - List running spawned agents
 */

import { Effect } from "effect";
import { join } from "path";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
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
 * Pad string to length
 */
function pad(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len - 1) + "…";
  return str + " ".repeat(len - str.length);
}

interface WorktreeWithSession {
  worktree: WorktreeListItem;
  session: AgentSession | null;
  alive: boolean;
}

export const worktreePs = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const runningOnly = args.flags["running"] === true;
    const json = args.flags["json"] === true;

    const worktreeService = yield* WorktreeService;
    const sessionService = yield* AgentSessionService;
    const cwd = process.cwd();

    // Get all worktrees
    const worktreesResult = yield* Effect.either(worktreeService.list(cwd));
    if (worktreesResult._tag === "Left") {
      const e = worktreesResult.left as { message?: string };
      console.log(`Error: ${e.message || String(worktreesResult.left)}`);
      process.exit(1);
    }

    const worktrees = worktreesResult.right as WorktreeListItem[];

    // Get session info for each worktree
    const results: WorktreeWithSession[] = [];
    for (const wt of worktrees) {
      const session = yield* Effect.either(
        sessionService.refreshSessionStatus(wt.path)
      );

      if (session._tag === "Right" && session.right) {
        const s = session.right;
        const alive = sessionService.isPidAlive(s.pid);
        results.push({ worktree: wt, session: s, alive });
      } else {
        results.push({ worktree: wt, session: null, alive: false });
      }
    }

    // Filter if needed
    const filtered = runningOnly
      ? results.filter((r) => r.session?.status === "running" && r.alive)
      : results;

    if (json) {
      const output = filtered.map((r) => ({
        worktree: r.worktree.name,
        path: r.worktree.path,
        pid: r.session?.pid ?? null,
        sessionId: r.session?.sessionId ?? null,
        mode: r.session?.mode ?? null,
        status: r.alive ? "running" : (r.session?.status ?? "none"),
        startedAt: r.session?.startedAt ?? null,
      }));
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // Count running
    const runningCount = results.filter(
      (r) => r.session?.status === "running" && r.alive
    ).length;

    if (filtered.length === 0) {
      if (runningOnly) {
        console.log("No running agents.");
      } else {
        console.log("No worktrees with session history.");
      }
      return;
    }

    // Table header
    console.log(
      `${pad("WORKTREE", 20)}${pad("PID", 8)}${pad("STARTED", 12)}${pad("STATUS", 10)}MODE`
    );

    // Table rows
    for (const r of filtered) {
      const name = r.worktree.name;
      const pid = r.session?.pid?.toString() ?? "-";
      const started = r.session?.startedAt
        ? formatRelativeTime(r.session.startedAt)
        : "-";

      // Determine actual status
      let status: string;
      if (!r.session) {
        status = "-";
      } else if (r.session.status === "running" && !r.alive) {
        status = "crashed";
      } else {
        status = r.session.status;
      }

      const mode = r.session?.mode ?? "-";

      console.log(
        `${pad(name, 20)}${pad(pid, 8)}${pad(started, 12)}${pad(status, 10)}${mode}`
      );
    }

    console.log();
    console.log(`${runningCount} running, ${filtered.length} total`);
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(AgentSessionServiceLive)
  );
