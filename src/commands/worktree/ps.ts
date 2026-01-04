/**
 * grimoire wt ps - Comprehensive worktree status view
 */

import { Effect } from "effect";
import { execSync } from "child_process";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
  AgentSessionService,
  AgentSessionServiceLive,
  WorktreeStateService,
  WorktreeStateServiceLive,
} from "../../services/worktree";
import type { WorktreeListItem } from "../../models/worktree";
import type { AgentSession } from "../../models/agent-session";

/**
 * Get visual width of a string (accounts for wide characters)
 */
function visualWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    const code = char.codePointAt(0) || 0;
    // East Asian Wide and Fullwidth characters
    if (
      (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
      (code >= 0x2e80 && code <= 0x9fff) || // CJK
      (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
      (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility
      (code >= 0xfe10 && code <= 0xfe19) || // Vertical forms
      (code >= 0xfe30 && code <= 0xfe6f) || // CJK Compatibility Forms
      (code >= 0xff00 && code <= 0xff60) || // Fullwidth Forms
      (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth Forms
      (code >= 0x20000 && code <= 0x2fffd) || // CJK Extension
      (code >= 0x30000 && code <= 0x3fffd) // CJK Extension
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * Pad string to length, truncating if needed (Unicode-safe)
 */
function pad(str: string, len: number): string {
  const width = visualWidth(str);
  if (width > len) {
    // Truncate safely - leave room for ellipsis
    let result = "";
    let currentWidth = 0;
    const ellipsis = "...";  // ASCII instead of Unicode … due to Bun bundler bug
    const ellipsisWidth = 3;
    const targetLen = len - ellipsisWidth;

    for (const char of str) {
      const charWidth = visualWidth(char);
      if (currentWidth + charWidth > targetLen) break;
      result += char;
      currentWidth += charWidth;
    }
    return result + ellipsis + " ".repeat(Math.max(0, len - currentWidth - ellipsisWidth));
  }
  return str + " ".repeat(len - width);
}

/**
 * Find the main branch (main or master)
 */
async function getMainBranch(repoRoot: string): Promise<string> {
  try {
    const proc = Bun.spawn(
      [
        "sh",
        "-c",
        "git rev-parse --verify refs/heads/main 2>/dev/null && echo main || (git rev-parse --verify refs/heads/master 2>/dev/null && echo master)",
      ],
      { cwd: repoRoot, stdout: "pipe", stderr: "pipe" }
    );
    const output = (await new Response(proc.stdout).text()).trim();
    await proc.exited;
    const branch = output.split("\n").pop() || "main";
    return branch;
  } catch {
    return "main";
  }
}

/**
 * Count commits in worktree vs base branch
 */
async function getCommitsVsBase(
  worktreePath: string,
  baseBranch: string
): Promise<number> {
  try {
    const proc = Bun.spawn(
      ["git", "rev-list", "--count", `${baseBranch}..HEAD`],
      { cwd: worktreePath, stdout: "pipe", stderr: "pipe" }
    );
    const output = (await new Response(proc.stdout).text()).trim();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !output) {
      // Fallback: count all commits
      const fallbackProc = Bun.spawn(
        ["git", "rev-list", "--count", "HEAD"],
        { cwd: worktreePath, stdout: "pipe", stderr: "pipe" }
      );
      const fallbackOutput = (
        await new Response(fallbackProc.stdout).text()
      ).trim();
      await fallbackProc.exited;
      return parseInt(fallbackOutput, 10) || 0;
    }

    return parseInt(output, 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Count dirty (uncommitted) files
 */
async function getDirtyCount(worktreePath: string): Promise<number> {
  try {
    const proc = Bun.spawn(["git", "status", "--porcelain"], {
      cwd: worktreePath,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = (await new Response(proc.stdout).text()).trim();
    await proc.exited;

    if (!output) return 0;
    return output.split("\n").filter((line) => line.trim()).length;
  } catch {
    return 0;
  }
}

interface DiffStats {
  insertions: number;
  deletions: number;
}

/**
 * Get diff stats (insertions/deletions) for uncommitted changes
 */
async function getDiffStats(worktreePath: string): Promise<DiffStats> {
  try {
    const proc = Bun.spawn(["git", "diff", "--numstat"], {
      cwd: worktreePath,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    if (!output.trim()) return { insertions: 0, deletions: 0 };

    let insertions = 0;
    let deletions = 0;
    for (const line of output.split("\n")) {
      const parts = line.split("\t");
      if (parts.length >= 2) {
        const ins = parseInt(parts[0], 10);
        const del = parseInt(parts[1], 10);
        if (!isNaN(ins)) insertions += ins;
        if (!isNaN(del)) deletions += del;
      }
    }
    return { insertions, deletions };
  } catch {
    return { insertions: 0, deletions: 0 };
  }
}

interface WorktreeData {
  worktree: WorktreeListItem;
  session: AgentSession | null;
  dirty: number;
  commits: number;
  mergeStatus?: string;
  managed: boolean;
  parentWorktree?: string;
  diff: DiffStats;
}

/**
 * Get agent display string
 */
function getAgentDisplay(session: AgentSession | null, alive: boolean): string {
  if (!session) return "no agent";
  if (alive) return `pid=${session.pid}`;
  if (session.exitCode !== undefined && session.exitCode !== null) {
    return `exited(${session.exitCode})`;
  }
  if (session.status === "crashed") return "exited(1)";
  if (session.status === "stopped") return "exited(0)";
  return session.status;
}

/**
 * Get synthesized status with Unicode symbols
 */
function getStatus(data: WorktreeData, alive: boolean): string {
  if (alive) return "\u25B6 running";      // ▶
  if (data.dirty > 0 && data.commits === 0) return "\u26A0 uncommitted"; // ⚠
  if (data.commits > 0 && data.dirty > 0) return "+ committed";
  if (data.commits > 0 && data.dirty === 0) return "\u2713 clean";  // ✓
  return "\u25CB empty";  // ○
}

/**
 * Get collect status with Unicode
 */
function getCollectStatus(data: WorktreeData, alive: boolean): string {
  if (data.commits === 0 && data.dirty === 0) return "-";
  if (alive) return "blocked";
  if (data.commits === 0) return "blocked";
  if (data.dirty > 0) return "blocked";
  if (data.mergeStatus === "conflict") return "blocked";
  return "\u2713";  // ✓
}

/**
 * Format diff stats as +N/-M
 */
function formatDiff(diff: DiffStats): string {
  if (diff.insertions === 0 && diff.deletions === 0) return "-";
  const parts: string[] = [];
  if (diff.insertions > 0) parts.push(`+${diff.insertions}`);
  if (diff.deletions > 0) parts.push(`-${diff.deletions}`);
  return parts.join("/");
}

// Column widths
const COL = {
  name: 16,
  agent: 12,
  diff: 10,
  status: 14,
  collect: 8,
};

/**
 * Detect current worktree name from cwd
 */
function detectCurrentWorktree(cwd: string, basePath: string): string | null {
  if (!cwd.includes(basePath)) return null;
  const afterBase = cwd.substring(cwd.indexOf(basePath) + basePath.length + 1);
  const name = afterBase.split("/")[0];
  return name || null;
}

export const worktreePs = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const json = args.flags.json === true;
    const showAll = args.flags.all === true || args.flags.a === true;

    const worktreeService = yield* WorktreeService;
    const sessionService = yield* AgentSessionService;
    const stateService = yield* WorktreeStateService;
    const cwd = process.cwd();

    // Get repository root
    let repoRoot: string;
    try {
      repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
    } catch {
      console.log("Error: Not in a git repository");
      process.exit(1);
    }

    // Get all worktrees
    const worktreesResult = yield* Effect.either(worktreeService.list(cwd));
    if (worktreesResult._tag === "Left") {
      const e = worktreesResult.left as { message?: string };
      console.log(`Error: ${e.message || String(worktreesResult.left)}`);
      process.exit(1);
    }

    const worktrees = worktreesResult.right;

    if (worktrees.length === 0) {
      if (json) {
        console.log(JSON.stringify({ worktrees: [], summary: {} }, null, 2));
      } else {
        console.log("No worktrees found.");
        console.log();
        console.log("Create one with: grim wt new <branch>");
      }
      return;
    }

    // Get main branch and state
    const mainBranch = yield* Effect.promise(() => getMainBranch(repoRoot));
    const state = yield* stateService.getState(repoRoot);

    // Collect data for all worktrees in parallel using Effect.forEach
    const dataArr: WorktreeData[] = yield* Effect.forEach(
      worktrees,
      (wt) =>
        Effect.gen(function* () {
          // Get session info
          const sessionResult = yield* sessionService
            .refreshSessionStatus(wt.path)
            .pipe(Effect.either);
          const session =
            sessionResult._tag === "Right" ? sessionResult.right : null;

          // Get git stats
          const dirty = yield* Effect.promise(() => getDirtyCount(wt.path));
          const commits = yield* Effect.promise(() =>
            getCommitsVsBase(wt.path, mainBranch)
          );
          const diff = yield* Effect.promise(() => getDiffStats(wt.path));

          // Get merge status from state
          const entry = state.worktrees.find((w) => w.name === wt.name);
          const mergeStatus = entry?.mergeStatus;

          // Get parent worktree from state
          const parentWorktree = entry?.parentWorktree;

          return {
            worktree: wt,
            session,
            dirty,
            commits,
            mergeStatus,
            managed: wt.managed !== false,
            parentWorktree,
            diff,
          };
        }),
      { concurrency: "unbounded" }
    );

    // Filter worktrees based on context (unless --all)
    let filteredData = dataArr;
    let hiddenCount = 0;
    let hiddenUnmanaged = 0;

    if (!showAll) {
      // Detect if we're in a worktree
      const currentWorktreeName = detectCurrentWorktree(cwd, ".worktrees");

      if (currentWorktreeName) {
        // In a worktree: show self, parent, siblings, children
        const currentEntry = state.worktrees.find((w) => w.name === currentWorktreeName);
        const myParent = currentEntry?.parentWorktree;

        filteredData = dataArr.filter((d) => {
          // Must be managed
          if (!d.managed) {
            hiddenUnmanaged++;
            return false;
          }
          // Self
          if (d.worktree.name === currentWorktreeName) return true;
          // Parent
          if (myParent && d.worktree.name === myParent) return true;
          // Sibling (same parent)
          if (myParent && d.parentWorktree === myParent) return true;
          // Child (parent is me)
          if (d.parentWorktree === currentWorktreeName) return true;
          return false;
        });
      } else {
        // On main: show top-level worktrees (no parent) that are managed
        filteredData = dataArr.filter((d) => {
          if (!d.managed) {
            hiddenUnmanaged++;
            return false;
          }
          // Top-level: no parent worktree
          return !d.parentWorktree;
        });
      }

      hiddenCount = dataArr.length - filteredData.length - hiddenUnmanaged;
    }

    if (json) {
      const output = {
        worktrees: filteredData.map((data) => {
          const alive = data.session?.status === "running";
          return {
            name: data.worktree.name,
            branch: data.worktree.branch,
            path: data.worktree.path,
            managed: data.managed,
            parentWorktree: data.parentWorktree ?? null,
            agent: {
              status: alive ? "running" : data.session ? "exited" : "none",
              pid: data.session?.pid ?? null,
              exitCode: data.session?.exitCode ?? null,
            },
            dirty: data.dirty,
            commits: data.commits,
            diff: {
              insertions: data.diff.insertions,
              deletions: data.diff.deletions,
            },
            status: getStatus(data, alive),
            collect: getCollectStatus(data, alive),
          };
        }),
        summary: {
          shown: filteredData.length,
          total: dataArr.length,
          hidden: hiddenCount,
          hiddenUnmanaged: hiddenUnmanaged,
          running: filteredData.filter((d) => d.session?.status === "running").length,
          clean: filteredData.filter(
            (d) => d.commits > 0 && d.dirty === 0 && d.session?.status !== "running"
          ).length,
          uncommitted: filteredData.filter((d) => d.dirty > 0).length,
          ready: filteredData.filter(
            (d) =>
              getCollectStatus(d, d.session?.status === "running") === "\u2713"
          ).length,
        },
      };
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // Handle empty filtered results
    if (filteredData.length === 0) {
      console.log("No worktrees in current context.");
      if (hiddenCount > 0 || hiddenUnmanaged > 0) {
        console.log();
        const parts: string[] = [];
        if (hiddenCount > 0) parts.push(`${hiddenCount} in other branches`);
        if (hiddenUnmanaged > 0) parts.push(`${hiddenUnmanaged} unmanaged`);
        console.log(`Hidden: ${parts.join(", ")}`);
        console.log("Use --all to show everything");
      }
      return;
    }

    // Table header
    console.log(
      `${pad("WORKTREE", COL.name)}${pad("AGENT", COL.agent)}${pad("DIFF", COL.diff)}${pad("STATUS", COL.status)}COLLECT`
    );

    // Table rows
    for (const data of filteredData) {
      const alive = data.session?.status === "running";
      console.log(
        `${pad(data.worktree.name, COL.name)}${pad(getAgentDisplay(data.session, alive), COL.agent)}${pad(formatDiff(data.diff), COL.diff)}${pad(getStatus(data, alive), COL.status)}${getCollectStatus(data, alive)}`
      );
    }

    // Summary
    const running = filteredData.filter((d) => d.session?.status === "running").length;
    const clean = filteredData.filter(
      (d) => d.commits > 0 && d.dirty === 0 && d.session?.status !== "running"
    ).length;
    const uncommitted = filteredData.filter((d) => d.dirty > 0).length;

    console.log();
    let summary = `Summary: ${running} running, ${clean} clean, ${uncommitted} uncommitted`;
    if (hiddenCount > 0 || hiddenUnmanaged > 0) {
      const parts: string[] = [];
      if (hiddenCount > 0) parts.push(`${hiddenCount} hidden`);
      if (hiddenUnmanaged > 0) parts.push(`${hiddenUnmanaged} unmanaged`);
      summary += ` (${parts.join(", ")})`;
    }
    console.log(summary);

    // Ready to collect
    const readyWorktrees = filteredData.filter(
      (d) => getCollectStatus(d, d.session?.status === "running") === "\u2713"
    );
    if (readyWorktrees.length > 0) {
      const names = readyWorktrees.map((d) => d.worktree.name).join(" ");
      console.log(`Ready to collect: ${names}`);
    }

    // Needs commit
    const dirtyWorktrees = filteredData.filter((d) => d.dirty > 0);
    if (dirtyWorktrees.length > 0) {
      const details = dirtyWorktrees
        .map((d) => `${d.worktree.name} (${formatDiff(d.diff)})`)
        .join(", ");
      console.log(`Needs commit: ${details}`);
    }

    // Next action
    if (readyWorktrees.length > 0) {
      const names = readyWorktrees.map((d) => d.worktree.name).join(" ");
      console.log();
      console.log(`Next: grim wt collect ${names} --delete`);
    }
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(AgentSessionServiceLive),
    Effect.provide(WorktreeStateServiceLive)
  );
