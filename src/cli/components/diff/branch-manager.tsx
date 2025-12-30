import React, { useState } from "react";
import { Box, Text } from "ink";
import { useInput } from "ink";
import type { Branch, BranchComparison } from "../../../services/branch-service";
import { getSelectionProps, safeBorderStyle } from "../theme";

export interface BranchManagerProps {
  branches: Branch[];
  activeBranch: Branch;
  comparisons?: Map<string, BranchComparison>; // Map from branch name to comparison with active
  focused?: boolean;
  height?: number;
  onCreate?: (name: string) => void;
  onSwitch?: (branch: Branch) => void;
  onDelete?: (branch: Branch) => void;
  onMerge?: (sourceBranch: Branch, targetBranch: Branch) => void;
}

type Mode = "list" | "create" | "delete" | "merge";

export const BranchManager: React.FC<BranchManagerProps> = ({
  branches,
  activeBranch,
  comparisons,
  focused = false,
  height = 15,
  onCreate,
  onSwitch,
  onDelete,
  onMerge,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [mode, setMode] = useState<Mode>("list");
  const [inputBuffer, setInputBuffer] = useState("");

  const totalBranches = branches.length;
  const maxScroll = Math.max(0, totalBranches - height);

  useInput(
    (input, key) => {
      // Handle different modes
      if (mode === "create") {
        if (key.return) {
          if (inputBuffer.trim() && onCreate) {
            onCreate(inputBuffer.trim());
          }
          setMode("list");
          setInputBuffer("");
        } else if (key.escape) {
          setMode("list");
          setInputBuffer("");
        } else if (key.backspace || key.delete) {
          setInputBuffer((prev) => prev.slice(0, -1));
        } else if (input && !key.ctrl && !key.meta) {
          setInputBuffer((prev) => prev + input);
        }
        return;
      }

      // List mode
      if (key.upArrow || input === "k") {
        const newIndex = Math.max(0, selectedIndex - 1);
        setSelectedIndex(newIndex);
        if (newIndex < scrollOffset) {
          setScrollOffset(newIndex);
        }
      } else if (key.downArrow || input === "j") {
        const newIndex = Math.min(totalBranches - 1, selectedIndex + 1);
        setSelectedIndex(newIndex);
        if (newIndex >= scrollOffset + height) {
          setScrollOffset(newIndex - height + 1);
        }
      } else if (input === "g") {
        setSelectedIndex(0);
        setScrollOffset(0);
      } else if (input === "G") {
        setSelectedIndex(totalBranches - 1);
        setScrollOffset(Math.max(0, totalBranches - height));
      }
      // Switch to branch
      else if (key.return || input === "s") {
        const selectedBranch = branches[selectedIndex];
        if (selectedBranch && onSwitch) {
          onSwitch(selectedBranch);
        }
      }
      // Create new branch
      else if (input === "c") {
        setMode("create");
        setInputBuffer("");
      }
      // Delete branch
      else if (input === "d") {
        const selectedBranch = branches[selectedIndex];
        if (selectedBranch && onDelete) {
          onDelete(selectedBranch);
        }
      }
      // Merge branch
      else if (input === "m") {
        const selectedBranch = branches[selectedIndex];
        if (selectedBranch && onMerge) {
          onMerge(selectedBranch, activeBranch);
        }
      }
    },
    { isActive: focused }
  );

  const visibleBranches = branches.slice(scrollOffset, scrollOffset + height);

  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset < maxScroll;

  const formatDate = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  };

  // Create mode
  if (mode === "create") {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="blue">
            Create New Branch
          </Text>
        </Box>

        <Box flexDirection="column" borderStyle={safeBorderStyle} paddingX={1}>
          <Text>
            <Text>Branch name: </Text>
            <Text color="green">{inputBuffer}</Text>
            <Text backgroundColor="white" color="black">_</Text>
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Enter: create | Esc: cancel</Text>
        </Box>
      </Box>
    );
  }

  // List mode
  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold>Branches</Text>
        <Text dimColor> ({totalBranches} total)</Text>
        <Box marginLeft={2}>
          <Text color="green">Current: {activeBranch.name}</Text>
        </Box>
      </Box>

      {/* Branch list */}
      <Box flexDirection="column" borderStyle={safeBorderStyle} paddingX={1}>
        {visibleBranches.map((branch, idx) => {
          const actualIndex = scrollOffset + idx;
          const isSelected = actualIndex === selectedIndex;
          const isActive = branch.name === activeBranch.name;
          const comparison = comparisons?.get(branch.name);

          return (
            <Box key={branch.id}>
              {/* Selection indicator */}
              <Text color={isSelected ? "blue" : undefined}>{isSelected ? "> " : "  "}</Text>

              {/* Active indicator */}
              <Text color={isActive ? "green" : undefined} bold={isActive}>
                {isActive ? "* " : "o "}
              </Text>

              {/* Branch info */}
              <Box gap={1} flexGrow={1}>
                <Text
                  bold={isSelected || isActive}
                  color={isSelected ? "blue" : isActive ? "green" : undefined}
                >
                  {branch.name}
                </Text>

                <Text dimColor>{formatDate(branch.createdAt)}</Text>

                {branch.createdFromVersion && (
                  <Text dimColor>[from v{branch.createdFromVersion}]</Text>
                )}

                {comparison && !isActive && (
                  <Box marginLeft={1}>
                    {comparison.ahead > 0 && <Text color="green">^{comparison.ahead}</Text>}
                    {comparison.behind > 0 && <Text color="red"> v{comparison.behind}</Text>}
                    {!comparison.canMerge && <Text color="yellow"> [!]</Text>}
                  </Box>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Status bar */}
      <Box marginTop={1} flexDirection="column">
        {/* Scroll indicator */}
        {(canScrollUp || canScrollDown) && (
          <Text color="gray" dimColor>
            {canScrollUp && "^ "}
            {scrollOffset + 1}-{Math.min(scrollOffset + height, totalBranches)} of {totalBranches}
            {canScrollDown && " v"}
          </Text>
        )}

        {/* Action hints */}
        <Box gap={1}>
          <Text dimColor>j/k: navigate</Text>
          <Text dimColor>Enter/s: switch</Text>
          <Text dimColor>c: create</Text>
          <Text dimColor>d: delete</Text>
          <Text dimColor>m: merge</Text>
        </Box>
      </Box>
    </Box>
  );
};
