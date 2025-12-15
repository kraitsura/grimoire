import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Prompt } from "../../../models";
import { ScrollableBox } from "../input/scrollable-box";

export interface FavoriteManagerProps {
  prompts: Prompt[];
  onToggle?: (promptId: string) => void;
  onReorder?: (promptIds: string[]) => void;
  onExit?: () => void;
  height?: number;
}

export const FavoriteManager: React.FC<FavoriteManagerProps> = ({
  prompts,
  onToggle,
  onReorder,
  onExit,
  height = 15,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"view" | "reorder">("view");

  useInput((input, key) => {
    if (mode === "view") {
      // Navigation
      if (input === "j" || key.downArrow) {
        setCurrentIndex((prev) => Math.min(prompts.length - 1, prev + 1));
      }
      if (input === "k" || key.upArrow) {
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      }

      // Toggle favorite/pin
      if (key.return && onToggle && prompts[currentIndex]) {
        onToggle(prompts[currentIndex].id);
      }

      // Multi-select with space
      if (input === " ") {
        setSelectedItems((prev) => {
          const next = new Set(prev);
          if (next.has(currentIndex)) {
            next.delete(currentIndex);
          } else {
            next.add(currentIndex);
          }
          return next;
        });
      }

      // Enter reorder mode
      if (input === "r" && selectedItems.size > 1) {
        setMode("reorder");
      }

      // Bulk operations
      if (input === "a") {
        // Select all
        setSelectedItems(new Set(prompts.map((_, idx) => idx)));
      }

      if (input === "d" && selectedItems.size > 0 && onToggle) {
        // Deselect/toggle all selected
        selectedItems.forEach((idx) => {
          if (prompts[idx]) {
            onToggle(prompts[idx].id);
          }
        });
        setSelectedItems(new Set());
      }

      // Exit
      if (input === "q" && onExit) {
        onExit();
      }
    } else if (mode === "reorder") {
      // Reorder mode
      if (input === "j" || key.downArrow) {
        // Move selected items down
        if (currentIndex < prompts.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        }
      }
      if (input === "k" || key.upArrow) {
        // Move selected items up
        if (currentIndex > 0) {
          setCurrentIndex((prev) => prev - 1);
        }
      }

      // Apply reorder
      if (key.return && onReorder) {
        // Create new order based on current selection
        const selected = Array.from(selectedItems)
          .sort()
          .map((idx) => prompts[idx].id);
        onReorder(selected);
        setMode("view");
        setSelectedItems(new Set());
      }

      // Cancel reorder
      if (key.escape || input === "q") {
        setMode("view");
        setSelectedItems(new Set());
      }
    }
  });

  const renderPromptItem = (prompt: Prompt, index: number) => {
    const isSelected = selectedItems.has(index);
    const isCurrent = index === currentIndex;

    // Show favorite/pin indicators
    const favIcon = prompt.isFavorite ? "★" : "☆";
    const pinIcon = prompt.isPinned ? "📌" : "  ";

    const name = prompt.name.slice(0, 35).padEnd(37);
    const tags = (prompt.tags?.join(", ") || "").slice(0, 20).padEnd(22);

    const checkbox = mode === "view" ? (isSelected ? "[x] " : "[ ] ") : "";

    return (
      <Box key={prompt.id}>
        <Text inverse={isCurrent}>
          {checkbox}
          {favIcon} {pinIcon} {name} {tags}
        </Text>
      </Box>
    );
  };

  const renderHeader = () => {
    return (
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="cyan">
          {mode === "view" ? "Favorite & Pin Manager" : "Reorder Mode"}
        </Text>
        {selectedItems.size > 0 && (
          <Text color="yellow">
            {selectedItems.size} item{selectedItems.size > 1 ? "s" : ""}{" "}
            selected
          </Text>
        )}
      </Box>
    );
  };

  const renderHelp = () => {
    if (mode === "view") {
      return (
        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">
            j/k: navigate | Enter: toggle | Space: select | a: select all | d:
            remove selected | r: reorder | q: quit
          </Text>
        </Box>
      );
    } else {
      return (
        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">
            j/k: reposition | Enter: apply | q/Esc: cancel
          </Text>
        </Box>
      );
    }
  };

  if (prompts.length === 0) {
    return (
      <Box flexDirection="column">
        {renderHeader()}
        <Text color="gray">No prompts found.</Text>
        <Box marginTop={1}>
          <Text color="gray">Press q to exit</Text>
        </Box>
      </Box>
    );
  }

  const columnHeader = (
    <Box marginBottom={1}>
      <Text color="gray" bold>
        {"   NAME".padEnd(40)} {"TAGS".padEnd(22)}
      </Text>
    </Box>
  );

  return (
    <Box flexDirection="column">
      {renderHeader()}
      {columnHeader}
      <ScrollableBox height={height} focused={true} showScrollIndicator={true}>
        {prompts.map((prompt, idx) => renderPromptItem(prompt, idx))}
      </ScrollableBox>
      {renderHelp()}
    </Box>
  );
};
