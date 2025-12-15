import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Prompt } from "../../models";

interface Props {
  prompt: Prompt;
  onClose?: () => void;
}

export const PromptViewer: React.FC<Props> = ({ prompt, onClose }) => {
  const lines = prompt.content.split("\n");
  const [scrollOffset, setScrollOffset] = useState(0);
  const visibleLines = 15;

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setScrollOffset((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === "j") {
      setScrollOffset((prev) =>
        Math.min(Math.max(0, lines.length - visibleLines), prev + 1)
      );
    }
    if (input === "q" && onClose) {
      onClose();
    }
  });

  const visibleContent = lines.slice(scrollOffset, scrollOffset + visibleLines);

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>{prompt.name}</Text>
      <Text color="gray">
        ID: {prompt.id.slice(0, 8)}... v{prompt.version ?? 1}
      </Text>
      <Text color="gray">Tags: {prompt.tags?.join(", ") ?? "none"}</Text>
      <Box marginTop={1} flexDirection="column">
        {visibleContent.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
      <Text color="gray" dimColor>
        ↑/k ↓/j scroll q close
      </Text>
    </Box>
  );
};
