/**
 * WorktreeList - Navigable list of worktrees
 */

import React from "react";
import { Box, Text, useInput } from "ink";
import { selectionStyle, statusColors } from "../theme";

interface WorktreeItem {
  name: string;
  branch: string;
  status: "active" | "stale" | "orphaned";
  linkedIssue?: string;
  claimedBy?: string;
  uncommittedChanges?: number;
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
        const indicator = isSelected ? "> " : "  ";

        // Status badge
        let statusBadge = "";
        let statusColor: "green" | "yellow" | "gray" = "green";
        if (wt.status === "stale") {
          statusBadge = "[stale]";
          statusColor = "yellow";
        } else if (wt.status === "orphaned") {
          statusBadge = "[orphan]";
          statusColor = "gray";
        }

        // Claim indicator
        const claimBadge = wt.claimedBy ? `[${wt.claimedBy}]` : "";

        // Changes indicator
        const changesBadge = wt.uncommittedChanges && wt.uncommittedChanges > 0
          ? `*${wt.uncommittedChanges}`
          : "";

        return (
          <Box key={wt.name}>
            <Text
              {...(isSelected && focused ? selectionStyle.primary : {})}
            >
              {indicator}
              {wt.name.length > 20 ? wt.name.slice(0, 18) + ".." : wt.name}
            </Text>
            {statusBadge && (
              <Text color={statusColor}> {statusBadge}</Text>
            )}
            {claimBadge && (
              <Text color="magenta"> {claimBadge}</Text>
            )}
            {changesBadge && (
              <Text color="yellow"> {changesBadge}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
