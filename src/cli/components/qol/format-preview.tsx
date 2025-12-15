import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { LintIssue } from "../../../services/format-service";

export interface FormatChange {
  type: "trailing-whitespace" | "final-newline" | "xml-normalize" | "other";
  description: string;
  before: string;
  after: string;
  line?: number;
}

export interface FormatPreviewProps {
  changes: FormatChange[];
  issues: LintIssue[];
  onApply?: (selectedChanges: number[]) => void;
  onCancel?: () => void;
}

export const FormatPreview: React.FC<FormatPreviewProps> = ({
  changes,
  issues,
  onApply,
  onCancel,
}) => {
  const [selectedChanges, setSelectedChanges] = useState<Set<number>>(
    new Set(changes.map((_, idx) => idx))
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setCurrentIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === "j") {
      setCurrentIndex((prev) => Math.min(changes.length - 1, prev + 1));
    }

    // Toggle selection with space
    if (input === " " && changes.length > 0) {
      setSelectedChanges((prev) => {
        const next = new Set(prev);
        if (next.has(currentIndex)) {
          next.delete(currentIndex);
        } else {
          next.add(currentIndex);
        }
        return next;
      });
    }

    // Select all
    if (input === "a") {
      setSelectedChanges(new Set(changes.map((_, idx) => idx)));
    }

    // Skip all (deselect all)
    if (input === "s") {
      setSelectedChanges(new Set());
    }

    // Apply selected changes
    if (key.return && onApply) {
      onApply(Array.from(selectedChanges));
    }

    // Cancel
    if (key.escape || input === "q") {
      if (onCancel) {
        onCancel();
      }
    }
  });

  const renderDiff = (change: FormatChange) => {
    const beforeLines = change.before.split("\n").slice(0, 3);
    const afterLines = change.after.split("\n").slice(0, 3);
    const _maxLines = Math.max(beforeLines.length, afterLines.length);

    return (
      <Box flexDirection="row" marginLeft={2}>
        <Box flexDirection="column" width="50%">
          <Text color="red" bold>
            Before:
          </Text>
          {beforeLines.map((line, idx) => (
            <Text key={idx} color="red">
              - {line.slice(0, 40)}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" width="50%">
          <Text color="green" bold>
            After:
          </Text>
          {afterLines.map((line, idx) => (
            <Text key={idx} color="green">
              + {line.slice(0, 40)}
            </Text>
          ))}
        </Box>
      </Box>
    );
  };

  const renderIssues = () => {
    if (issues.length === 0) {
      return null;
    }

    const errorCount = issues.filter((i) => i.severity === "error").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    return (
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="yellow">
          Lint Issues Found:
        </Text>
        <Box marginLeft={2}>
          <Text>
            {errorCount > 0 && <Text color="red">{errorCount} errors </Text>}
            {warningCount > 0 && <Text color="yellow">{warningCount} warnings </Text>}
            {infoCount > 0 && <Text color="cyan">{infoCount} info</Text>}
          </Text>
        </Box>
        <Box marginLeft={2} flexDirection="column">
          {issues.slice(0, 5).map((issue, idx) => {
            const severityColor =
              issue.severity === "error" ? "red" : issue.severity === "warning" ? "yellow" : "cyan";

            return (
              <Text key={idx}>
                <Text color={severityColor}>[{issue.severity.toUpperCase()}]</Text> Line{" "}
                {issue.line}: {issue.message}
              </Text>
            );
          })}
          {issues.length > 5 && <Text color="gray">... and {issues.length - 5} more</Text>}
        </Box>
      </Box>
    );
  };

  if (changes.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="green">No formatting changes needed!</Text>
        {renderIssues()}
        <Box marginTop={1}>
          <Text color="gray">Press q to exit</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Format Changes Preview
        </Text>
      </Box>

      {renderIssues()}

      <Box marginBottom={1}>
        <Text>
          {selectedChanges.size} of {changes.length} changes selected
        </Text>
      </Box>

      <Box flexDirection="column">
        {changes.map((change, idx) => {
          const isSelected = selectedChanges.has(idx);
          const isCurrent = idx === currentIndex;

          return (
            <Box key={idx} flexDirection="column" marginBottom={1}>
              <Box>
                <Text inverse={isCurrent}>
                  {isSelected ? "[x] " : "[ ] "}
                  {change.description}
                  {change.line !== undefined && ` (line ${change.line})`}
                </Text>
              </Box>
              {isCurrent && renderDiff(change)}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          ↑/k: up | ↓/j: down | Space: toggle | a: select all | s: skip all | Enter: apply | q/Esc:
          cancel
        </Text>
      </Box>
    </Box>
  );
};
