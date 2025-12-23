/**
 * grimoire wt list - List all worktrees
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { WorktreeService, WorktreeServiceLive } from "../../services/worktree";
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
 * Pad string to length
 */
function pad(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len - 1) + "…";
  return str + " ".repeat(len - str.length);
}

export const worktreeList = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const staleOnly = args.flags["stale"] === true;
    const json = args.flags["json"] === true;

    const service = yield* WorktreeService;
    const cwd = process.cwd();

    const worktreesResult = yield* Effect.either(service.list(cwd));

    if (worktreesResult._tag === "Left") {
      const e = worktreesResult.left as { _tag?: string; message?: string };
      console.log(`Error: ${e.message || String(worktreesResult.left)}`);
      process.exit(1);
    }

    const worktrees = worktreesResult.right as WorktreeListItem[];

    // Filter if needed
    const filtered = staleOnly
      ? worktrees.filter((w) => w.status === "stale")
      : worktrees;

    if (json) {
      console.log(JSON.stringify({ worktrees: filtered, basePath: ".worktrees" }, null, 2));
      return;
    }

    if (filtered.length === 0) {
      if (staleOnly) {
        console.log("No stale worktrees found.");
      } else {
        console.log("No worktrees found.");
        console.log();
        console.log("Create one with: grimoire wt new <branch>");
      }
      return;
    }

    // Table header
    console.log(
      `${pad("NAME", 16)}${pad("BRANCH", 20)}${pad("ISSUE", 12)}${pad("CREATED", 10)}STATUS`
    );

    // Table rows
    for (const wt of filtered) {
      const issue = wt.linkedIssue || "-";
      const created = formatRelativeTime(wt.createdAt);
      const statusIcon = wt.status === "stale" ? " (merged)" : "";
      const changesNote = wt.uncommittedChanges
        ? ` [${wt.uncommittedChanges} changes]`
        : "";

      console.log(
        `${pad(wt.name, 16)}${pad(wt.branch, 20)}${pad(issue, 12)}${pad(created, 10)}${wt.status}${statusIcon}${changesNote}`
      );
    }

    console.log();
    console.log(`${filtered.length} worktree${filtered.length === 1 ? "" : "s"} (.worktrees/)`);
  }).pipe(Effect.provide(WorktreeServiceLive));
