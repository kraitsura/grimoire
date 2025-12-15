import React from "react";
import { Box, Text } from "ink";

export interface BenchmarkTest {
  id: string;
  name: string;
  status: "pending" | "running" | "passed" | "failed";
  duration?: number;
  error?: string;
}

export interface BenchmarkProgressProps {
  title: string;
  tests: BenchmarkTest[];
  currentTestId?: string;
  currentTestMessage?: string;
}

export const BenchmarkProgress: React.FC<BenchmarkProgressProps> = ({
  title,
  tests,
  currentTestId,
  currentTestMessage,
}) => {
  const completed = tests.filter((t) => t.status === "passed" || t.status === "failed").length;
  const total = tests.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  const getStatusIcon = (status: BenchmarkTest["status"]): string => {
    switch (status) {
      case "passed":
        return "✓";
      case "failed":
        return "✗";
      case "running":
        return "▶";
      case "pending":
        return "○";
    }
  };

  const getStatusColor = (status: BenchmarkTest["status"]): "green" | "red" | "yellow" | "gray" => {
    switch (status) {
      case "passed":
        return "green";
      case "failed":
        return "red";
      case "running":
        return "yellow";
      case "pending":
        return "gray";
    }
  };

  const renderProgressBar = (): string => {
    const barWidth = 40;
    const filled = Math.round((percentage / 100) * barWidth);
    const empty = barWidth - filled;
    return "━".repeat(filled) + "─".repeat(empty);
  };

  const currentTest = tests.find((t) => t.id === currentTestId);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold>Running: {title}</Text>
      </Box>

      {/* Progress Bar */}
      <Box marginBottom={1}>
        <Text color="cyan">{renderProgressBar()}</Text>
        <Text>
          {" "}
          {percentage}% ({completed}/{total})
        </Text>
      </Box>

      {/* Test List */}
      <Box flexDirection="column" marginBottom={1}>
        {tests.map((test) => (
          <Box key={test.id}>
            <Text color={getStatusColor(test.status)}>{getStatusIcon(test.status)} </Text>
            <Text
              bold={test.status === "running"}
              color={test.status === "running" ? "yellow" : undefined}
            >
              {test.name}
            </Text>
            {test.duration && <Text dimColor> ({test.duration.toFixed(1)}s)</Text>}
            {test.error && <Text color="red"> - {test.error}</Text>}
          </Box>
        ))}
      </Box>

      {/* Current Test Details */}
      {currentTest && (
        <Box flexDirection="column" borderStyle="single" paddingX={1}>
          <Text bold>Current: {currentTest.name}</Text>
          {currentTestMessage && <Text dimColor> &gt; {currentTestMessage}</Text>}
        </Box>
      )}

      {/* Summary */}
      {completed === total && (
        <Box marginTop={1}>
          <Text bold color="green">
            All tests complete!
          </Text>
        </Box>
      )}
    </Box>
  );
};
