import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SkillInfo } from "../../models/skill";

interface Props {
  skills: SkillInfo[];
  multiSelect?: boolean;
  onSelect?: (skills: SkillInfo[]) => void;
  onCancel?: () => void;
}

/**
 * Interactive skill selector component
 *
 * Supports both single and multi-select modes.
 * Navigation: up/down arrows or j/k
 * Toggle: space (multi-select) or enter (single-select)
 * Confirm: enter (multi-select)
 * Cancel: escape or q
 */
export const SkillSelector: React.FC<Props> = ({
  skills,
  multiSelect = false,
  onSelect,
  onCancel
}) => {
  const [cursorIndex, setCursorIndex] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  useInput((input, key) => {
    // Navigation
    if (key.upArrow || input === "k") {
      setCursorIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === "j") {
      setCursorIndex((prev) => Math.min(skills.length - 1, prev + 1));
    }

    // Toggle selection (multi-select mode)
    if (multiSelect && input === " ") {
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

    // Confirm selection
    if (key.return) {
      if (multiSelect) {
        // In multi-select, return all selected items
        if (selectedIndices.size > 0) {
          const selected = Array.from(selectedIndices).map((i) => skills[i]);
          onSelect?.(selected);
        }
      } else {
        // In single-select, return current cursor item
        if (skills[cursorIndex]) {
          onSelect?.([skills[cursorIndex]]);
        }
      }
    }

    // Select all (multi-select mode)
    if (multiSelect && input === "a") {
      if (selectedIndices.size === skills.length) {
        // All selected, deselect all
        setSelectedIndices(new Set());
      } else {
        // Select all
        setSelectedIndices(new Set(skills.map((_, i) => i)));
      }
    }

    // Cancel
    if (key.escape || input === "q") {
      onCancel?.();
    }
  });

  if (skills.length === 0) {
    return <Text color="gray">No skills found.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>
          {multiSelect ? "Select skills to install:" : "Choose a skill:"}
        </Text>
      </Box>

      {skills.map((skill, i) => {
        const isCursor = i === cursorIndex;
        const isSelected = selectedIndices.has(i);
        const checkbox = multiSelect
          ? (isSelected ? "[x]" : "[ ]")
          : (isCursor ? ">" : " ");

        return (
          <Box key={skill.name}>
            <Text
              color={isCursor ? "cyan" : undefined}
              bold={isCursor}
            >
              {checkbox} {skill.name}
            </Text>
            {skill.description && (
              <Text color="gray" dimColor> - {skill.description.slice(0, 50)}</Text>
            )}
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {multiSelect
            ? "j/k navigate  space toggle  a all  enter confirm  q cancel"
            : "j/k navigate  enter select  q cancel"}
        </Text>
      </Box>

      {multiSelect && selectedIndices.size > 0 && (
        <Box marginTop={1}>
          <Text color="green">
            {selectedIndices.size} skill{selectedIndices.size !== 1 ? "s" : ""} selected
          </Text>
        </Box>
      )}
    </Box>
  );
};
