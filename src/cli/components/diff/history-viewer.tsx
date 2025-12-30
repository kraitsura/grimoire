import React, { useState } from "react";
import { Box, Text } from "ink";
import { useInput } from "ink";
import type { PromptVersion } from "../../../services/version-service";
import type { DiffResult } from "../../../services/diff-service";
import { DiffViewer } from "./diff-viewer";
import { safeBorderStyle } from "../theme";

export interface HistoryViewerProps {
  versions: PromptVersion[];
  diffs?: Map<number, DiffResult>; // Map from version number to diff from previous
  focused?: boolean;
  height?: number;
  onSelect?: (version: PromptVersion) => void;
  onRestore?: (version: PromptVersion) => void;
}

export const HistoryViewer: React.FC<HistoryViewerProps> = ({
  versions,
  diffs,
  focused = false,
  height = 15,
  onSelect,
  onRestore,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  const totalVersions = versions.length;

  // Handle keyboard input
  useInput(
    (input, key) => {
      // Navigation
      if (key.upArrow || input === "k") {
        const newIndex = Math.max(0, selectedIndex - 1);
        setSelectedIndex(newIndex);
        // Auto-scroll to keep selected item in view
        if (newIndex < scrollOffset) {
          setScrollOffset(newIndex);
        }
      } else if (key.downArrow || input === "j") {
        const newIndex = Math.min(totalVersions - 1, selectedIndex + 1);
        setSelectedIndex(newIndex);
        // Auto-scroll to keep selected item in view
        if (newIndex >= scrollOffset + height) {
          setScrollOffset(newIndex - height + 1);
        }
      } else if (input === "g") {
        setSelectedIndex(0);
        setScrollOffset(0);
      } else if (input === "G") {
        setSelectedIndex(totalVersions - 1);
        setScrollOffset(Math.max(0, totalVersions - height));
      }
      // Expand/collapse
      else if (key.return || input === " ") {
        if (expandedIndex === selectedIndex) {
          setExpandedIndex(null);
        } else {
          setExpandedIndex(selectedIndex);
        }
      }
      // Restore
      else if (input === "r") {
        const selectedVersion = versions[selectedIndex];
        if (selectedVersion && onRestore) {
          onRestore(selectedVersion);
        }
      }
      // Select
      else if (input === "s") {
        const selectedVersion = versions[selectedIndex];
        if (selectedVersion && onSelect) {
          onSelect(selectedVersion);
        }
      }
    },
    { isActive: focused }
  );

  const visibleVersions = versions.slice(scrollOffset, scrollOffset + height);

  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + height < totalVersions;

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

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold>Version History</Text>
        <Text dimColor> ({totalVersions} versions)</Text>
      </Box>

      {/* Version list */}
      <Box flexDirection="column" borderStyle={safeBorderStyle} paddingX={1}>
        {visibleVersions.map((version, idx) => {
          const actualIndex = scrollOffset + idx;
          const isSelected = actualIndex === selectedIndex;
          const isExpanded = actualIndex === expandedIndex;
          const diff = diffs?.get(version.version);

          return (
            <Box key={version.id} flexDirection="column">
              {/* Version item */}
              <Box>
                {/* Selection indicator */}
                <Text color={isSelected ? "blue" : undefined}>{isSelected ? "> " : "  "}</Text>

                {/* Version info */}
                <Box gap={1}>
                  <Text bold={isSelected} color={isSelected ? "blue" : undefined}>
                    v{version.version}
                  </Text>

                  <Text dimColor>({version.branch})</Text>

                  <Text dimColor>{formatDate(version.createdAt)}</Text>

                  {version.changeReason && <Text color="yellow">- {version.changeReason}</Text>}

                  {version.parentVersion && (
                    <Text dimColor>[parent: v{version.parentVersion}]</Text>
                  )}
                </Box>
              </Box>

              {/* Expanded diff view */}
              {isExpanded && diff && (
                <Box marginTop={1} marginBottom={1} marginLeft={2}>
                  <DiffViewer diff={diff} focused={false} height={10} showStats={true} />
                </Box>
              )}
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
            {scrollOffset + 1}-{Math.min(scrollOffset + height, totalVersions)} of {totalVersions}
            {canScrollDown && " v"}
          </Text>
        )}

        {/* Action hints */}
        <Box gap={1}>
          <Text dimColor>j/k: navigate</Text>
          <Text dimColor>Enter: expand</Text>
          <Text dimColor>r: restore</Text>
          <Text dimColor>s: select</Text>
        </Box>
      </Box>
    </Box>
  );
};
