/**
 * WorktreeList - Navigable list of worktrees
 *
 * Displays worktrees in a clean, scannable list with status indicators.
 * Uses ASCII-safe characters for maximum terminal compatibility.
 */

import React from "react";
import { Box, Text, useInput } from "ink";

interface WorktreeItem {
  name: string;
  branch: string;
  status: "active" | "stale" | "orphaned";
  linkedIssue?: string;
  claimedBy?: string;
  uncommittedChanges?: number;
  unpushedCommits?: number;
}

interface WorktreeListProps {
  worktrees: WorktreeItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  focused: boolean;
}

export function WorktreeList({ worktrees, selectedIndex, onSelect, focused }: WorktreeListProps) {
  useInput(
    (input, key) => {
      if (key.upArrow || input === "k") {
        onSelect(Math.max(0, selectedIndex - 1));
      }
      if (key.downArrow || input === "j") {
        onSelect(Math.min(worktrees.length - 1, selectedIndex + 1));
      }
    },
    { isActive: focused }
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {worktrees.map((wt, i) => {
        const isSelected = i === selectedIndex;

        // Status indicator (left side)
        let statusIndicator = " ";
        let statusColor: "green" | "yellow" | "gray" = "green";
        if (wt.status === "stale") {
          statusIndicator = "~";
          statusColor = "yellow";
        } else if (wt.status === "orphaned") {
          statusIndicator = "?";
          statusColor = "gray";
        }

        // Truncate name to fit
        const maxNameLen = 22;
        const displayName = wt.name.length > maxNameLen
          ? wt.name.slice(0, maxNameLen - 2) + ".."
          : wt.name.padEnd(maxNameLen);

        // Build status badges (right-aligned)
        const badges: { text: string; color: "yellow" | "cyan" | "magenta" }[] = [];

        // Uncommitted changes: show as "M3" (modified)
        if (wt.uncommittedChanges && wt.uncommittedChanges > 0) {
          badges.push({ text: `M${wt.uncommittedChanges}`, color: "yellow" });
        }

        // Unpushed commits: show as "^3" (up arrow, ASCII-safe)
        if (wt.unpushedCommits && wt.unpushedCommits > 0) {
          badges.push({ text: `^${wt.unpushedCommits}`, color: "cyan" });
        }

        // Claimed by indicator
        if (wt.claimedBy) {
          badges.push({ text: `@${wt.claimedBy.slice(0, 6)}`, color: "magenta" });
        }

        return (
          <Box key={wt.name} gap={1}>
            {/* Selection indicator */}
            <Text color={isSelected && focused ? "cyan" : undefined}>
              {isSelected ? ">" : " "}
            </Text>

            {/* Status indicator */}
            <Text color={statusColor}>{statusIndicator}</Text>

            {/* Worktree name */}
            <Text
              bold={isSelected}
              color={isSelected && focused ? "cyan" : undefined}
            >
              {displayName}
            </Text>

            {/* Badges */}
            {badges.map((badge, idx) => (
              <Text key={idx} color={badge.color} dimColor={!isSelected}>
                {badge.text}
              </Text>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}
