/**
 * WorktreeDetail - Detail view with tabs for Logs and Commits
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { execSync } from "child_process";
import { selectionStyle } from "../theme";

interface LogEntry {
  time: string;
  message: string;
  author?: string;
  type?: string;
}

interface Checkpoint {
  hash: string;
  message: string;
  time: string;
}

interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

interface WorktreeDetailProps {
  worktree: {
    name: string;
    branch: string;
    path: string;
    linkedIssue?: string;
    claimedBy?: string;
    currentStage?: string;
    logs: LogEntry[];
    checkpoints: Checkpoint[];
  } | undefined;
  focused: boolean;
}

type Tab = "logs" | "commits";

export function WorktreeDetail({ worktree, focused }: WorktreeDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("logs");
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Load git commits specific to this worktree (since diverged from main)
  useEffect(() => {
    if (!worktree) return;
    try {
      // Find the merge base with main/master to only show worktree-specific commits
      let mergeBase = "";
      try {
        mergeBase = execSync(
          `git merge-base ${worktree.branch} main 2>/dev/null || git merge-base ${worktree.branch} master 2>/dev/null || echo ""`,
          { encoding: "utf8", cwd: worktree.path }
        ).trim();
      } catch {
        // If no merge base found, just show recent commits
      }

      const range = mergeBase ? `${mergeBase}..${worktree.branch}` : `-20 ${worktree.branch}`;
      const output = execSync(
        `git log --format="%h|%s|%an|%ar" ${range} 2>/dev/null || echo ""`,
        { encoding: "utf8", cwd: worktree.path }
      );
      const parsed = output
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash, message, author, date] = line.split("|");
          return { hash, message, author, date };
        });
      setCommits(parsed);
    } catch {
      setCommits([]);
    }
    setScrollOffset(0);
  }, [worktree?.name, worktree?.branch]);

  useInput(
    (input, key) => {
      // Tab switching with h/l or left/right
      if (input === "h" || key.leftArrow) {
        setActiveTab("logs");
        setScrollOffset(0);
      }
      if (input === "l" || key.rightArrow) {
        setActiveTab("commits");
        setScrollOffset(0);
      }
      // Scrolling
      if (input === "j" || key.downArrow) {
        setScrollOffset((prev) => prev + 1);
      }
      if (input === "k" || key.upArrow) {
        setScrollOffset((prev) => Math.max(0, prev - 1));
      }
    },
    { isActive: focused }
  );

  if (!worktree) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>No worktree selected</Text>
      </Box>
    );
  }

  // Format time to short format
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoString.slice(11, 16);
    }
  };

  const logsTab = activeTab === "logs";
  const commitsTab = activeTab === "commits";

  return (
    <Box flexDirection="column" height="100%">
      {/* Header with worktree info */}
      <Box paddingX={1} flexDirection="column">
        <Box gap={2}>
          <Text bold>{worktree.name}</Text>
          {worktree.linkedIssue && (
            <Text color="cyan">[{worktree.linkedIssue}]</Text>
          )}
          {worktree.claimedBy && (
            <Text color="magenta">claimed by {worktree.claimedBy}</Text>
          )}
        </Box>
        <Text dimColor>branch: {worktree.branch}</Text>
      </Box>

      {/* Tab bar */}
      <Box paddingX={1} marginTop={1} gap={2}>
        <Text
          {...(logsTab && focused ? selectionStyle.primary : {})}
          bold={logsTab}
        >
          Logs ({worktree.logs.length})
        </Text>
        <Text
          {...(commitsTab && focused ? selectionStyle.primary : {})}
          bold={commitsTab}
        >
          Commits ({commits.length})
        </Text>
      </Box>

      {/* Content area */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} marginTop={1}>
        {activeTab === "logs" && (
          <LogsView logs={worktree.logs} checkpoints={worktree.checkpoints} scrollOffset={scrollOffset} />
        )}
        {activeTab === "commits" && (
          <CommitsView commits={commits} scrollOffset={scrollOffset} />
        )}
      </Box>

      {/* Navigation hint */}
      <Box paddingX={1}>
        <Text dimColor>[h/l] switch tabs  [j/k] scroll</Text>
      </Box>
    </Box>
  );
}

function LogsView({
  logs,
  checkpoints,
  scrollOffset,
}: {
  logs: LogEntry[];
  checkpoints: Checkpoint[];
  scrollOffset: number;
}) {
  if (logs.length === 0 && checkpoints.length === 0) {
    return <Text dimColor>No logs yet. Use 'grim wt log' to add entries.</Text>;
  }

  // Merge logs and checkpoints into timeline
  interface TimelineEntry { time: string; type: "log" | "checkpoint"; data: LogEntry | Checkpoint }
  const timeline: TimelineEntry[] = [
    ...logs.map((l) => ({ time: l.time, type: "log" as const, data: l })),
    ...checkpoints.map((c) => ({ time: c.time, type: "checkpoint" as const, data: c })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const visible = timeline.slice(scrollOffset, scrollOffset + 15);

  return (
    <Box flexDirection="column">
      {visible.map((entry, i) => {
        const time = formatShortTime(entry.time);
        if (entry.type === "checkpoint") {
          const cp = entry.data as Checkpoint;
          return (
            <Box key={`cp-${i}`} gap={1}>
              <Text dimColor>{time}</Text>
              <Text color="green">*</Text>
              <Text color="green">{cp.message}</Text>
              <Text dimColor>({cp.hash.slice(0, 7)})</Text>
            </Box>
          );
        }
        const log = entry.data as LogEntry;
        const typeIcon = log.type === "handoff" ? ">" : log.type === "interrupt" ? "!" : " ";
        return (
          <Box key={`log-${i}`} gap={1}>
            <Text dimColor>{time}</Text>
            <Text>{typeIcon}</Text>
            <Text>{log.message}</Text>
            {log.author && <Text dimColor>[{log.author}]</Text>}
          </Box>
        );
      })}
      {timeline.length > 15 && (
        <Text dimColor>... {timeline.length - 15} more entries</Text>
      )}
    </Box>
  );
}

function CommitsView({ commits, scrollOffset }: { commits: GitCommit[]; scrollOffset: number }) {
  if (commits.length === 0) {
    return <Text dimColor>No commits on this branch (since diverging from main)</Text>;
  }

  const visible = commits.slice(scrollOffset, scrollOffset + 15);

  return (
    <Box flexDirection="column">
      {visible.map((commit, i) => (
        <Box key={commit.hash + i} gap={1}>
          <Text color="yellow">{commit.hash}</Text>
          <Text>{commit.message.length > 50 ? commit.message.slice(0, 47) + "..." : commit.message}</Text>
          <Text dimColor>{commit.date}</Text>
        </Box>
      ))}
      {commits.length > 15 && (
        <Text dimColor>... {commits.length - 15} more commits</Text>
      )}
    </Box>
  );
}

function formatShortTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    if (diffDays < 7) {
      return `${diffDays}d`;
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return isoString.slice(0, 10);
  }
}
