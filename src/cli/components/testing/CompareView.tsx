import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface CompareResult {
  name: string;
  content: string;
  tokens: number;
  duration: number;
  cost: number;
}

export interface CompareViewProps {
  results: CompareResult[];
  onVote?: (winnerIndex: number) => void;
  onSkip?: () => void;
  showVoting?: boolean;
}

export const CompareView: React.FC<CompareViewProps> = ({
  results,
  onVote,
  onSkip,
  showVoting = true,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useInput((input, _key) => {
    if (!showVoting) return;

    // Number keys for voting (1-9)
    const num = parseInt(input);
    if (!isNaN(num) && num >= 1 && num <= results.length) {
      setSelectedIndex(num - 1);
      onVote?.(num - 1);
    }

    // 's' key to skip
    if (input === "s" || input === "S") {
      onSkip?.();
    }
  });

  const columnWidth = Math.floor((process.stdout.columns || 80) / results.length) - 2;

  const truncateText = (text: string, maxLines = 10): string => {
    const lines = text.split("\n");
    if (lines.length <= maxLines) return text;
    return lines.slice(0, maxLines).join("\n") + "\n...";
  };

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        {results.map((result, index) => (
          <Box
            key={index}
            width={columnWidth}
            borderStyle="single"
            borderColor={selectedIndex === index ? "green" : undefined}
            paddingX={1}
          >
            <Text bold color={selectedIndex === index ? "green" : undefined}>
              {result.name}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Content */}
      <Box>
        {results.map((result, index) => (
          <Box
            key={index}
            width={columnWidth}
            borderStyle="single"
            borderColor={selectedIndex === index ? "green" : undefined}
            paddingX={1}
            flexDirection="column"
          >
            <Text wrap="truncate">{truncateText(result.content)}</Text>
          </Box>
        ))}
      </Box>

      {/* Stats Footer */}
      <Box>
        {results.map((result, index) => (
          <Box
            key={index}
            width={columnWidth}
            borderStyle="single"
            borderColor={selectedIndex === index ? "green" : undefined}
            paddingX={1}
            flexDirection="column"
          >
            <Text dimColor>
              {result.tokens} tokens / {result.duration.toFixed(1)}s
            </Text>
            <Text dimColor>${result.cost.toFixed(4)}</Text>
          </Box>
        ))}
      </Box>

      {/* Voting Controls */}
      {showVoting && (
        <Box marginTop={1}>
          <Text>Vote: </Text>
          {results.map((result, index) => (
            <Text key={index}>
              {" "}
              <Text bold>[{index + 1}]</Text> {result.name}
            </Text>
          ))}
          <Text>
            {" "}
            <Text bold>[s]</Text> Skip
          </Text>
        </Box>
      )}

      {selectedIndex !== null && (
        <Box marginTop={1}>
          <Text color="green">✓ Voted for: {results[selectedIndex].name}</Text>
        </Box>
      )}
    </Box>
  );
};
