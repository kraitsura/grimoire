import React, { useState } from "react";
import { Box, Text } from "ink";
import { useInput } from "ink";
import type { PromptVersion } from "../../../services/version-service";
import type { DiffResult } from "../../../services/diff-service";
import { DiffViewer } from "./diff-viewer";

export interface RollbackConfirmProps {
  currentVersion: PromptVersion;
  targetVersion: PromptVersion;
  diff: DiffResult;
  focused?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const RollbackConfirm: React.FC<RollbackConfirmProps> = ({
  currentVersion,
  targetVersion,
  diff,
  focused = false,
  onConfirm,
  onCancel,
}) => {
  const [selectedAction, setSelectedAction] = useState<"confirm" | "cancel">("cancel");

  useInput(
    (input, key) => {
      // Toggle between confirm and cancel
      if (key.leftArrow || key.rightArrow || input === "h" || input === "l") {
        setSelectedAction((prev) => (prev === "confirm" ? "cancel" : "confirm"));
      }
      // Execute selected action
      else if (key.return) {
        if (selectedAction === "confirm") {
          onConfirm();
        } else {
          onCancel();
        }
      }
      // Quick keys
      else if (input === "y") {
        onConfirm();
      } else if (input === "n" || key.escape) {
        onCancel();
      }
    },
    { isActive: focused }
  );

  const formatDate = (date: Date): string => {
    return date.toLocaleString();
  };

  return (
    <Box flexDirection="column">
      {/* Warning header */}
      <Box marginBottom={1} borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text color="yellow" bold>
          ⚠ Rollback Confirmation
        </Text>
      </Box>

      {/* Version info */}
      <Box flexDirection="column" marginBottom={1} paddingX={1}>
        <Text>
          <Text bold>Current Version: </Text>
          <Text color="blue">v{currentVersion.version}</Text>
          {currentVersion.changeReason && <Text dimColor> - {currentVersion.changeReason}</Text>}
        </Text>

        <Text dimColor>{formatDate(currentVersion.createdAt)}</Text>

        <Box marginTop={1}>
          <Text>
            <Text bold>Rolling back to: </Text>
            <Text color="green">v{targetVersion.version}</Text>
            {targetVersion.changeReason && <Text dimColor> - {targetVersion.changeReason}</Text>}
          </Text>
        </Box>

        <Text dimColor>{formatDate(targetVersion.createdAt)}</Text>
      </Box>

      {/* Diff summary */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Changes Preview:</Text>
        <Box marginTop={1}>
          <DiffViewer diff={diff} focused={false} height={15} showStats={true} />
        </Box>
      </Box>

      {/* Warning message */}
      <Box marginBottom={1} paddingX={1}>
        <Text color="yellow">
          This will create a new version with the content from v{targetVersion.version}.
        </Text>
      </Box>

      {/* Action buttons */}
      <Box gap={2} paddingX={1}>
        <Box
          borderStyle="round"
          borderColor={selectedAction === "cancel" ? "blue" : undefined}
          paddingX={1}
        >
          <Text
            color={selectedAction === "cancel" ? "blue" : undefined}
            bold={selectedAction === "cancel"}
          >
            {selectedAction === "cancel" ? "▶ " : "  "}
            Cancel (n)
          </Text>
        </Box>

        <Box
          borderStyle="round"
          borderColor={selectedAction === "confirm" ? "blue" : undefined}
          paddingX={1}
        >
          <Text
            color={selectedAction === "confirm" ? "blue" : undefined}
            bold={selectedAction === "confirm"}
          >
            {selectedAction === "confirm" ? "▶ " : "  "}
            Confirm Rollback (y)
          </Text>
        </Box>
      </Box>

      {/* Hints */}
      <Box marginTop={1} paddingX={1}>
        <Text dimColor>h/l or ←/→: select | Enter: execute | Esc: cancel</Text>
      </Box>
    </Box>
  );
};
