import React, { useState } from "react";
import { Box, Text } from "ink";
import { useInput } from "ink";
import type { SideBySideDiff } from "../../../services/diff-service";

export interface SideBySideDiffViewerProps {
  diff: SideBySideDiff;
  focused?: boolean;
  height?: number;
  columnWidth?: number;
}

export const SideBySideDiffViewer: React.FC<SideBySideDiffViewerProps> = ({
  diff,
  focused = false,
  height = 20,
  columnWidth = 40,
}) => {
  const [scrollOffset, setScrollOffset] = useState(0);

  const totalLines = diff.left.length;
  const maxScroll = Math.max(0, totalLines - height);

  // Handle keyboard input for synchronized scrolling
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

  const visibleLines = Array.from(
    { length: Math.min(height, totalLines - scrollOffset) },
    (_, i) => scrollOffset + i
  );

  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset < maxScroll;

  // Truncate or pad text to fit column width
  const formatColumn = (text: string, width: number): string => {
    if (text.length > width) {
      return text.slice(0, width - 3) + "...";
    }
    return text.padEnd(width);
  };

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Box width={columnWidth + 8}>
          <Text bold>Old</Text>
        </Box>
        <Text> │ </Text>
        <Box width={columnWidth + 8}>
          <Text bold>New</Text>
        </Box>
      </Box>

      {/* Side-by-side diff content */}
      <Box flexDirection="column" borderStyle="single" paddingX={1}>
        {visibleLines.map((lineIdx) => {
          const leftContent = diff.left[lineIdx];
          const rightContent = diff.right[lineIdx];
          const info = diff.lineInfo[lineIdx];

          const leftLineNum = info.leftLine?.toString().padStart(4) || "    ";
          const rightLineNum = info.rightLine?.toString().padStart(4) || "    ";

          const leftText = formatColumn(leftContent, columnWidth);
          const rightText = formatColumn(rightContent, columnWidth);

          // Determine colors based on line type
          let leftColor: "red" | "gray" | undefined = undefined;
          let rightColor: "green" | "gray" | undefined = undefined;

          if (info.type === "removed") {
            leftColor = "red";
            rightColor = "gray";
          } else if (info.type === "added") {
            leftColor = "gray";
            rightColor = "green";
          } else if (info.type === "modified") {
            leftColor = "red";
            rightColor = "green";
          }

          return (
            <Box key={lineIdx}>
              {/* Left side (old) */}
              <Text color={leftColor} dimColor={leftColor === "gray"}>
                {leftLineNum} {leftText}
              </Text>

              {/* Separator */}
              <Text dimColor> │ </Text>

              {/* Right side (new) */}
              <Text color={rightColor} dimColor={rightColor === "gray"}>
                {rightLineNum} {rightText}
              </Text>
            </Box>
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
