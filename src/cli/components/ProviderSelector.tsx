/**
 * ProviderSelector Component - Interactive multi-select for agent providers
 *
 * A TUI component for selecting AI agent providers during skills init.
 * Inspired by better-t-stack's inline selection UI.
 *
 * Features:
 * - j/k or arrow navigation (includes confirm button)
 * - Enter to toggle selection
 * - Navigate to confirm button and press enter to submit
 * - Escape/q to cancel
 */

import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";

export interface ProviderOption {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
}

export interface ProviderSelectorProps {
  title?: string;
  options: ProviderOption[];
  multiSelect?: boolean;
  onConfirm: (selected: string[]) => void;
  onCancel?: () => void;
}

const DEFAULT_OPTIONS: ProviderOption[] = [
  {
    id: "claude_code",
    label: "Claude Code",
    description: "Anthropic's Claude Code CLI",
    shortcut: "c",
  },
  {
    id: "opencode",
    label: "OpenCode",
    description: "OpenCode AI assistant",
    shortcut: "o",
  },
  {
    id: "codex",
    label: "Codex",
    description: "OpenAI Codex CLI",
    shortcut: "x",
  },
  {
    id: "cursor",
    label: "Cursor",
    description: "Cursor IDE AI features",
    shortcut: "u",
  },
  {
    id: "aider",
    label: "Aider",
    description: "Aider AI pair programmer",
    shortcut: "i",
  },
  {
    id: "amp",
    label: "Amp",
    description: "Sourcegraph Amp",
    shortcut: "m",
  },
  {
    id: "all",
    label: "All Providers",
    description: "Initialize for all supported providers",
    shortcut: "a",
  },
];

/**
 * ProviderSelector - Interactive multi-select for agent providers
 */
export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  title = "Select AI Provider(s)",
  options = DEFAULT_OPTIONS,
  multiSelect = true,
  onConfirm,
  onCancel,
}) => {
  const { exit } = useApp();
  // cursorIndex: 0 to options.length-1 = options, options.length = confirm button
  const [cursorIndex, setCursorIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const totalItems = options.length + 1; // options + confirm button
  const isOnConfirmButton = cursorIndex === options.length;

  // Handle "All" selection logic
  const handleToggle = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);

        if (id === "all") {
          if (next.has("all")) {
            return new Set();
          }
          const allIds = options.filter((o) => o.id !== "all").map((o) => o.id);
          return new Set([...allIds, "all"]);
        }

        if (next.has(id)) {
          next.delete(id);
          next.delete("all");
        } else {
          next.add(id);
          const nonAllOptions = options.filter((o) => o.id !== "all");
          const allSelected = nonAllOptions.every((o) => next.has(o.id));
          if (allSelected) {
            next.add("all");
          }
        }

        return next;
      });
    },
    [options]
  );

  const handleConfirm = useCallback(() => {
    if (selectedIds.size === 0) {
      // Nothing selected - select claude_code by default
      onConfirm(["claude_code"]);
      return;
    }

    const selected = Array.from(selectedIds).filter((id) => id !== "all");
    if (selected.length === 0 && selectedIds.has("all")) {
      const allIds = options.filter((o) => o.id !== "all").map((o) => o.id);
      onConfirm(allIds);
    } else {
      onConfirm(selected);
    }
  }, [selectedIds, options, onConfirm]);

  useInput((input, key) => {
    // Navigation (wraps around)
    if (key.upArrow || input === "k") {
      setCursorIndex((prev) => (prev === 0 ? totalItems - 1 : prev - 1));
    }
    if (key.downArrow || input === "j") {
      setCursorIndex((prev) => (prev === totalItems - 1 ? 0 : prev + 1));
    }

    // Enter: toggle if on option, confirm if on button
    if (key.return) {
      if (isOnConfirmButton) {
        handleConfirm();
      } else if (multiSelect) {
        const currentOption = options[cursorIndex];
        if (currentOption) {
          handleToggle(currentOption.id);
        }
      } else {
        // Single select - just confirm with current item
        const currentOption = options[cursorIndex];
        if (currentOption) {
          onConfirm([currentOption.id]);
        }
      }
    }

    // Shortcut keys (only toggle, don't confirm)
    if (!isOnConfirmButton) {
      const shortcutOption = options.find(
        (o) => o.shortcut?.toLowerCase() === input.toLowerCase()
      );
      if (shortcutOption && multiSelect) {
        handleToggle(shortcutOption.id);
        const idx = options.findIndex((o) => o.id === shortcutOption.id);
        if (idx >= 0) {
          setCursorIndex(idx);
        }
      }
    }

    // Cancel
    if (key.escape || input === "q") {
      if (onCancel) {
        onCancel();
      } else {
        exit();
      }
    }
  });

  const selectionText = selectedIds.has("all")
    ? "all"
    : selectedIds.size > 0
      ? `${selectedIds.size}`
      : "0";

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          ? {title}
        </Text>
      </Box>

      {/* Options list */}
      <Box flexDirection="column">
        {options.map((option, idx) => {
          const isCursor = idx === cursorIndex;
          const isSelected = selectedIds.has(option.id);

          return (
            <Box key={option.id}>
              {/* Cursor indicator */}
              <Text color="cyan">{isCursor ? ">" : " "} </Text>

              {/* Checkbox */}
              {multiSelect && (
                <Text color={isSelected ? "green" : "gray"}>
                  {isSelected ? "[x]" : "[ ]"}{" "}
                </Text>
              )}

              {/* Label */}
              <Text bold={isCursor} color={isCursor ? "cyan" : isSelected ? "green" : undefined}>
                {option.label}
              </Text>

              {/* Description */}
              <Text color="gray"> - {option.description}</Text>

              {/* Shortcut hint */}
              {option.shortcut && (
                <Text color="gray" dimColor>
                  {" "}
                  ({option.shortcut})
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Confirm button */}
      <Box marginTop={1}>
        <Text color="cyan">{isOnConfirmButton ? ">" : " "} </Text>
        <Text
          bold={isOnConfirmButton}
          color={isOnConfirmButton ? "green" : "gray"}
          inverse={isOnConfirmButton}
        >
          {isOnConfirmButton ? " Confirm " : " Confirm "}
        </Text>
        <Text color="gray"> ({selectionText} selected)</Text>
      </Box>

      {/* Instructions */}
      <Box marginTop={1}>
        <Text color="gray">
          arrows/jk: move | enter: toggle/confirm | q: cancel
        </Text>
      </Box>
    </Box>
  );
};

export { DEFAULT_OPTIONS };
