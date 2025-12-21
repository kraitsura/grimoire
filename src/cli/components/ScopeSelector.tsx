import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Scope } from "../../models/plugin";

interface Props {
  onSelect: (scope: Scope) => void;
  onCancel?: () => void;
}

interface ScopeOption {
  value: Scope;
  label: string;
  description: string;
  path: string;
}

const SCOPE_OPTIONS: ScopeOption[] = [
  {
    value: "user",
    label: "User scope",
    description: "Available in all projects",
    path: "~/.claude/",
  },
  {
    value: "project",
    label: "Project scope",
    description: "Shared with team",
    path: ".claude/",
  },
];

/**
 * Interactive scope selector component
 *
 * Allows user to choose between user and project scope for installation.
 * Navigation: up/down arrows or j/k
 * Confirm: enter
 * Cancel: escape or q
 */
export const ScopeSelector: React.FC<Props> = ({ onSelect, onCancel }) => {
  const [cursorIndex, setCursorIndex] = useState(0);

  useInput((input, key) => {
    // Navigation
    if (key.upArrow || input === "k") {
      setCursorIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === "j") {
      setCursorIndex((prev) => Math.min(SCOPE_OPTIONS.length - 1, prev + 1));
    }

    // Confirm selection
    if (key.return) {
      const selected = SCOPE_OPTIONS[cursorIndex];
      if (selected) {
        onSelect(selected.value);
      }
    }

    // Cancel
    if (key.escape || input === "q") {
      onCancel?.();
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Where should plugins be installed?</Text>
      </Box>

      {SCOPE_OPTIONS.map((option, i) => {
        const isCursor = i === cursorIndex;
        const indicator = isCursor ? ">" : " ";
        const checkbox = isCursor ? "[x]" : "[ ]";

        return (
          <Box key={option.value} flexDirection="column" marginLeft={1}>
            <Box>
              <Text color={isCursor ? "cyan" : undefined} bold={isCursor}>
                {indicator} {checkbox} {option.label}
              </Text>
              <Text color="gray" dimColor>
                {" "}
                - {option.description} ({option.path})
              </Text>
            </Box>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          j/k navigate  enter confirm  q cancel
        </Text>
      </Box>
    </Box>
  );
};
