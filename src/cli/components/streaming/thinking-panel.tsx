/**
 * ThinkingPanel - Collapsible panel for displaying AI thinking/reasoning tokens
 *
 * Features:
 * - Auto-expand if <=10 lines, collapse if >10 lines
 * - Manual toggle with 't' key
 * - Preview mode shows first 3 lines when collapsed
 * - Magenta border to distinguish from response content
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { safeBorderStyle } from "../theme.js";

export interface ThinkingPanelProps {
  content: string;
  isStreaming?: boolean;
  focused?: boolean;
}

const AUTO_EXPAND_THRESHOLD = 10;
const PREVIEW_LINES = 3;

export const ThinkingPanel: React.FC<ThinkingPanelProps> = ({
  content,
  isStreaming = false,
  focused = false,
}) => {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);

  // Don't render if no content
  if (!content) return null;

  const lines = content.split("\n");
  const lineCount = lines.length;
  const hasMore = lineCount > PREVIEW_LINES;

  // Auto-expand logic: expanded if <=10 lines, collapsed if >10 lines
  // Manual override takes precedence
  const autoExpanded = lineCount <= AUTO_EXPAND_THRESHOLD;
  const isExpanded = manualExpanded !== null ? manualExpanded : autoExpanded;

  // Handle 't' key to toggle expansion
  useInput(
    (input) => {
      if (input === "t" && hasMore) {
        setManualExpanded((prev) => (prev === null ? !autoExpanded : !prev));
      }
    },
    { isActive: focused }
  );

  // Reset manual state when content changes significantly
  useEffect(() => {
    if (isStreaming) {
      setManualExpanded(null);
    }
  }, [isStreaming]);

  const displayContent = isExpanded
    ? content
    : lines.slice(0, PREVIEW_LINES).join("\n") + (hasMore ? "..." : "");

  return (
    <Box
      flexDirection="column"
      borderStyle={safeBorderStyle}
      borderColor="magenta"
      paddingX={1}
      marginBottom={1}
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Text color="magenta" bold>
          Thinking {isStreaming && "..."} ({lineCount} {lineCount === 1 ? "line" : "lines"})
        </Text>
        {hasMore && (
          <Text dimColor>
            [{isExpanded ? "t: collapse" : "t: expand"}]
          </Text>
        )}
      </Box>

      {/* Content */}
      <Box marginTop={1}>
        <Text color="gray">{displayContent}</Text>
      </Box>
    </Box>
  );
};
