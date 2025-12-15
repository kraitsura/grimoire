import React, { useState } from "react";
import { Box, Text } from "ink";
import { useInput } from "ink";
import type { DiffResult, Hunk } from "../../../services/diff-service";

export interface DiffViewerProps {
  diff: DiffResult;
  focused?: boolean;
  height?: number;
  showStats?: boolean;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  diff,
  focused = false,
  height = 20,
  showStats = true,
}) => {
  const [scrollOffset, setScrollOffset] = useState(0);

  // Flatten all hunks into a list of lines
  const lines: Array<{ type: "header" | "hunk" | "line"; content: string }> = [];

  if (showStats) {
    lines.push({ type: "header", content: `--- old` });
    lines.push({ type: "header", content: `+++ new` });
  }

  for (const hunk of diff.hunks) {
    // Add hunk header
    lines.push({
      type: "hunk",
      content: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    });

    // Add hunk lines
    for (const line of hunk.lines) {
      lines.push({ type: "line", content: line });
    }
  }

  const totalLines = lines.length;
  const maxScroll = Math.max(0, totalLines - height);

  // Handle keyboard input for scrolling
  useInput(
    (input, key) => {
      if (key.upArrow || input === "k") {
        setScrollOffset(Math.max(0, scrollOffset - 1));
      } else if (key.downArrow || input === "j") {
        setScrollOffset(Math.min(maxScroll, scrollOffset + 1));
      } else if (key.pageUp) {
        setScrollOffset(Math.max(0, scrollOffset - height));
      } else if (key.pageDown) {
        setScrollOffset(Math.min(maxScroll, scrollOffset + height));
      } else if (input === "g") {
        setScrollOffset(0);
      } else if (input === "G") {
        setScrollOffset(maxScroll);
      }
    },
    { isActive: focused }
  );

  const visibleLines = lines.slice(scrollOffset, scrollOffset + height);

  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset < maxScroll;

  return (
    <Box flexDirection="column">
      {/* Stats section */}
      {showStats && (
        <Box marginBottom={1}>
          <Text>
            <Text color="green">+{diff.additions}</Text>
            <Text> </Text>
            <Text color="red">-{diff.deletions}</Text>
            <Text dimColor> ({diff.unchanged} unchanged)</Text>
          </Text>
        </Box>
      )}

      {/* Diff content */}
      <Box flexDirection="column" borderStyle="single" paddingX={1}>
        {visibleLines.map((line, idx) => {
          const key = `${scrollOffset + idx}`;

          if (line.type === "header") {
            return (
              <Text key={key} dimColor>
                {line.content}
              </Text>
            );
          }

          if (line.type === "hunk") {
            return (
              <Text key={key} color="cyan">
                {line.content}
              </Text>
            );
          }

          // Parse line type from prefix
          const firstChar = line.content[0];

          if (firstChar === "+") {
            return (
              <Text key={key} color="green">
                {line.content}
              </Text>
            );
          }

          if (firstChar === "-") {
            return (
              <Text key={key} color="red">
                {line.content}
              </Text>
            );
          }

          // Context line
          return (
            <Text key={key} dimColor>
              {line.content}
            </Text>
          );
        })}
      </Box>

      {/* Scroll indicator */}
      {(canScrollUp || canScrollDown) && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {canScrollUp && "↑ "}
            {scrollOffset + 1}-{Math.min(scrollOffset + height, totalLines)} of{" "}
            {totalLines}
            {canScrollDown && " ↓"}
          </Text>
          <Text dimColor> | j/k: scroll | g/G: top/bottom</Text>
        </Box>
      )}
    </Box>
  );
};
