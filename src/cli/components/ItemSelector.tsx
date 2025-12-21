import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SelectableItem } from "../../models/plugin";

interface Props {
  items: SelectableItem[];
  onConfirm: (selected: SelectableItem[]) => void;
  onCancel?: () => void;
}

/**
 * Interactive item selector component for plugins and skills
 *
 * Features:
 * - Type badges: [plugin] in cyan, [skill] in green
 * - Multi-select with Space
 * - 'a' to select/deselect all
 * - j/k or arrows to navigate
 * - Enter to confirm
 * - q or Escape to cancel
 */
export const ItemSelector: React.FC<Props> = ({ items, onConfirm, onCancel }) => {
  const [cursorIndex, setCursorIndex] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  useInput((input, key) => {
    // Navigation
    if (key.upArrow || input === "k") {
      setCursorIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === "j") {
      setCursorIndex((prev) => Math.min(items.length - 1, prev + 1));
    }

    // Toggle selection
    if (input === " ") {
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        if (next.has(cursorIndex)) {
          next.delete(cursorIndex);
        } else {
          next.add(cursorIndex);
        }
        return next;
      });
    }

    // Select all / deselect all
    if (input === "a") {
      if (selectedIndices.size === items.length) {
        setSelectedIndices(new Set());
      } else {
        setSelectedIndices(new Set(items.map((_, i) => i)));
      }
    }

    // Confirm selection
    if (key.return) {
      if (selectedIndices.size > 0) {
        const selected = Array.from(selectedIndices).map((i) => items[i]);
        onConfirm(selected);
      }
    }

    // Cancel
    if (key.escape || input === "q") {
      onCancel?.();
    }
  });

  if (items.length === 0) {
    return <Text color="gray">No items found.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Select items to install:</Text>
        <Text color="gray" dimColor>
          {" "}
          (Space=toggle, Enter=confirm, a=all)
        </Text>
      </Box>

      {items.map((item, i) => {
        const isCursor = i === cursorIndex;
        const isSelected = selectedIndices.has(i);
        const checkbox = isSelected ? "[x]" : "[ ]";
        const indicator = isCursor ? ">" : " ";

        // Type badge with color
        const typeBadge = item.type === "plugin" ? "[plugin]" : "[skill]";
        const badgeColor = item.type === "plugin" ? "cyan" : "green";

        // Truncate description
        const maxDescLen = 40;
        const desc = item.description
          ? item.description.length > maxDescLen
            ? item.description.slice(0, maxDescLen - 3) + "..."
            : item.description
          : "";

        return (
          <Box key={`${item.type}-${item.name}`}>
            <Text color={isCursor ? "cyan" : undefined} bold={isCursor}>
              {indicator} {checkbox}{" "}
            </Text>
            <Text color={badgeColor}>{typeBadge}</Text>
            <Text color={isCursor ? "cyan" : undefined} bold={isCursor}>
              {" "}
              {item.name}
            </Text>
            {desc && (
              <Text color="gray" dimColor>
                {" "}
                - {desc}
              </Text>
            )}
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          j/k navigate  space toggle  a all  enter confirm  q cancel
        </Text>
      </Box>

      {selectedIndices.size > 0 && (
        <Box marginTop={1}>
          <Text color="green">
            {selectedIndices.size} item{selectedIndices.size !== 1 ? "s" : ""} selected
          </Text>
        </Box>
      )}
    </Box>
  );
};
