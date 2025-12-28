/**
 * grimoire wt list - List all worktrees
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { WorktreeService, WorktreeServiceLive } from "../../services/worktree";
import type { WorktreeListItem } from "../../models/worktree";

// ANSI color codes
const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

/**
 * Format relative time (e.g., "2d", "3h")
 */
function formatAge(dateStr: string): string {
  const date = new Date(dateStr);
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
 * Right-pad a string to a fixed width, truncating if needed
 */
function col(str: string, width: number): string {
  if (str.length > width) {
    return str.slice(0, width - 2) + "..";
  }
  return str.padEnd(width);
}

/**
 * Get diff stats for a worktree compared to main/master
 */
async function getDiffStats(
  worktreePath: string
): Promise<{ ins: number; del: number } | null> {
  try {
    // Find the main branch
    const mainProc = Bun.spawn(
      [
        "sh",
        "-c",
        "git rev-parse --verify refs/heads/main 2>/dev/null && echo main || (git rev-parse --verify refs/heads/master 2>/dev/null && echo master)",
      ],
      { cwd: worktreePath, stdout: "pipe", stderr: "pipe" }
    );
    const mainOut = (await new Response(mainProc.stdout).text()).trim();
    await mainProc.exited;
    const mainBranch = mainOut.split("\n").pop() || "main";

    // Get diff stats
    const proc = Bun.spawn(
      ["git", "diff", "--shortstat", `${mainBranch}...HEAD`],
      { cwd: worktreePath, stdout: "pipe", stderr: "pipe" }
    );
    const output = (await new Response(proc.stdout).text()).trim();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !output) return null;

    // Parse: "X files changed, Y insertions(+), Z deletions(-)"
    const insMatch = output.match(/(\d+) insertion/);
    const delMatch = output.match(/(\d+) deletion/);

    return {
      ins: insMatch ? parseInt(insMatch[1], 10) : 0,
      del: delMatch ? parseInt(delMatch[1], 10) : 0,
    };
  } catch {
    return null;
  }
}

// Column widths
const COL = {
  name: 20,
  branch: 24,
  issue: 14,
  age: 5,
  diff: 12,
  status: 10,
};

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
      console.log(
        JSON.stringify({ worktrees: filtered, basePath: ".worktrees" }, null, 2)
      );
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

    // Get diff stats for all worktrees in parallel
    const diffStatsArr = yield* Effect.promise(() =>
      Promise.all(filtered.map((wt) => getDiffStats(wt.path)))
    );

    // Header
    console.log(
      `${c.dim}${col("NAME", COL.name)}${col("BRANCH", COL.branch)}${col("ISSUE", COL.issue)}${col("AGE", COL.age)}${col("DIFF", COL.diff)}STATUS${c.reset}`
    );

    // Rows
    for (let i = 0; i < filtered.length; i++) {
      const wt = filtered[i];
      const stats = diffStatsArr[i];

      // Name column
      const nameStr = col(wt.name, COL.name);

      // Branch column - show "=" if same as name
      const branchDisplay = wt.branch === wt.name ? "=" : wt.branch;
      const branchStr =
        wt.branch === wt.name
          ? `${c.dim}${col(branchDisplay, COL.branch)}${c.reset}`
          : col(branchDisplay, COL.branch);

      // Issue column
      const issueDisplay = wt.linkedIssue || "-";
      const issueStr = wt.linkedIssue
        ? `${c.cyan}${col(issueDisplay, COL.issue)}${c.reset}`
        : `${c.dim}${col(issueDisplay, COL.issue)}${c.reset}`;

      // Age column
      const ageStr = col(formatAge(wt.createdAt), COL.age);

      // Diff column
      let diffStr: string;
      if (!stats || (stats.ins === 0 && stats.del === 0)) {
        diffStr = `${c.dim}${col("-", COL.diff)}${c.reset}`;
      } else {
        const diffParts: string[] = [];
        if (stats.ins > 0) diffParts.push(`${c.green}+${stats.ins}${c.reset}`);
        if (stats.del > 0) diffParts.push(`${c.red}-${stats.del}${c.reset}`);
        const diffText = diffParts.join(" ");
        // Calculate visible length for padding
        const visLen =
          (stats.ins > 0 ? `+${stats.ins}`.length : 0) +
          (stats.del > 0 ? `-${stats.del}`.length : 0) +
          (stats.ins > 0 && stats.del > 0 ? 1 : 0);
        diffStr = diffText + " ".repeat(Math.max(0, COL.diff - visLen));
      }

      // Status column
      let statusStr: string;
      if (wt.status === "stale") {
        statusStr = `${c.yellow}merged${c.reset}`;
      } else if (wt.uncommittedChanges && wt.uncommittedChanges > 0) {
        statusStr = `${c.magenta}${wt.uncommittedChanges} dirty${c.reset}`;
      } else {
        statusStr = `${c.dim}clean${c.reset}`;
      }

      console.log(
        `${nameStr}${branchStr}${issueStr}${ageStr}${diffStr}${statusStr}`
      );
    }

    console.log();
    console.log(
      `${c.dim}${filtered.length} worktree${filtered.length === 1 ? "" : "s"} in .worktrees/${c.reset}`
    );
  }).pipe(Effect.provide(WorktreeServiceLive));
