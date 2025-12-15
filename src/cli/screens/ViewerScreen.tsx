/**
 * Viewer Screen - Displays a single prompt with full content
 *
 * Features:
 * - Metadata header (name, tags, dates, version)
 * - Scrollable content area
 * - Actions: e=edit, c=copy, t=test, h=history, Esc=back
 * - Scroll navigation: j/k or arrows, Page up/down, g/G for top/bottom
 */

import React from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useAppState } from "../context/app-context.js";
import { useEffectRun, useEffectCallback } from "../context/runtime-context.js";
import { StorageService, Clipboard } from "../../services/index.js";
import { ScrollableBox } from "../components/input/scrollable-box.js";
import { ActionBar } from "../components/layout/action-bar.js";
import type { Prompt } from "../../models/prompt.js";

export interface ViewerScreenProps {
  promptId: string;
}

/**
 * Format a date as a relative time string or absolute date
 */
const formatDate = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return "just now";
  } else if (diffMins < 60) {
    return `${diffMins} ${diffMins === 1 ? "minute" : "minutes"} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
  } else {
    // Format as "Dec 10, 2024"
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
};

/**
 * Metadata header component
 */
const MetadataHeader: React.FC<{ prompt: Prompt }> = ({ prompt }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Name */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {prompt.name}
        </Text>
      </Box>

      {/* Tags */}
      {prompt.tags && prompt.tags.length > 0 && (
        <Box gap={1} marginBottom={1}>
          {prompt.tags.map((tag) => (
            <Text key={tag} color="magenta">
              #{tag}
            </Text>
          ))}
        </Box>
      )}

      {/* Dates and Version */}
      <Box gap={2}>
        <Text dimColor>Created: {formatDate(new Date(prompt.created))}</Text>
        <Text dimColor>Updated: {formatDate(new Date(prompt.updated))}</Text>
        {prompt.version !== undefined && <Text dimColor>Version: {prompt.version}</Text>}
      </Box>

      {/* Special flags */}
      <Box gap={2}>
        {prompt.isTemplate && (
          <Text color="yellow" dimColor>
            [Template]
          </Text>
        )}
        {prompt.isFavorite && <Text color="yellow">★ Favorite</Text>}
        {prompt.isPinned && (
          <Text color="blue" dimColor>
            📌 Pinned
          </Text>
        )}
      </Box>

      {/* Separator */}
      <Box marginTop={1}>
        <Text dimColor>{"─".repeat(80)}</Text>
      </Box>
    </Box>
  );
};

/**
 * ViewerScreen component
 */
export const ViewerScreen: React.FC<ViewerScreenProps> = ({ promptId }) => {
  const { actions } = useAppState();

  // Fetch prompt data
  const {
    result: prompt,
    error,
    loading,
  } = useEffectRun(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.getById(promptId);
    }),
    [promptId]
  );

  // Copy to clipboard callback
  const { execute: copyToClipboard, loading: copying } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!prompt) return;

      const clipboard = yield* Clipboard;
      yield* clipboard.copy(prompt.content);

      actions.showNotification({
        type: "success",
        message: "Prompt copied to clipboard",
      });
    })
  );

  // Handle keyboard input for actions (non-scroll actions)
  useInput(
    (input, key) => {
      // Skip scroll keys - they're handled by ScrollableBox
      if (key.upArrow || key.downArrow || key.pageUp || key.pageDown) {
        return;
      }
      if (input === "j" || input === "k" || input === "g" || input === "G") {
        return;
      }

      if (key.escape) {
        actions.goBack();
      } else if (input === "e") {
        actions.navigate({ name: "edit", promptId });
      } else if (input === "c") {
        void copyToClipboard();
      } else if (input === "h") {
        actions.navigate({ name: "history", promptId });
      } else if (input === "t") {
        // Test action - could open in editor or test mode
        actions.showNotification({
          type: "info",
          message: "Test mode not yet implemented",
        });
      }
    },
    { isActive: true }
  );

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading prompt...</Text>
      </Box>
    );
  }

  // Error state
  if (error || !prompt) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error ? String(error) : "Prompt not found"}</Text>
        <Box marginTop={1}>
          <ActionBar actions={[{ key: "Esc", label: "Back" }]} />
        </Box>
      </Box>
    );
  }

  // Split content into lines for scrolling
  const contentLines = prompt.content.split("\n").map((line, idx) => <Text key={idx}>{line}</Text>);

  // Calculate available height for content (terminal height - header - actions - padding)
  const contentHeight = 20; // Reasonable default, could be made dynamic

  return (
    <Box flexDirection="column" padding={1}>
      {/* Metadata Header */}
      <MetadataHeader prompt={prompt} />

      {/* Scrollable Content */}
      <Box marginBottom={1}>
        <ScrollableBox height={contentHeight} focused={true} showScrollIndicator={true}>
          {contentLines}
        </ScrollableBox>
      </Box>

      {/* Action Bar */}
      <Box marginTop={1}>
        <ActionBar
          actions={[
            { key: "e", label: "Edit" },
            { key: "c", label: copying ? "Copying..." : "Copy" },
            { key: "t", label: "Test" },
            { key: "h", label: "History" },
            { key: "j/k/↑↓", label: "Scroll" },
            { key: "g/G", label: "Top/Bottom" },
            { key: "Esc", label: "Back" },
          ]}
        />
      </Box>
    </Box>
  );
};
