import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Prompt } from "../../models";

interface Props {
  prompts: Prompt[];
  onSelect?: (prompt: Prompt) => void;
}

export const PromptList: React.FC<Props> = ({ prompts, onSelect }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(prompts.length - 1, prev + 1));
    }
    if (key.return && onSelect && prompts[selectedIndex]) {
      onSelect(prompts[selectedIndex]);
    }
  });

  if (prompts.length === 0) {
    return <Text color="gray">No prompts found.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="gray">
          {"NAME".padEnd(25)}
          {"TAGS".padEnd(20)}UPDATED
        </Text>
      </Box>
      {prompts.map((prompt, i) => (
        <Box key={prompt.id}>
          <Text inverse={i === selectedIndex}>
            {prompt.name.slice(0, 24).padEnd(25)}
            {(prompt.tags?.join(", ") ?? "").slice(0, 19).padEnd(20)}
            {prompt.updated.toISOString().split("T")[0]}
          </Text>
        </Box>
      ))}
      <Text color="gray" dimColor>
        ↑/k up ↓/j down Enter select
      </Text>
    </Box>
  );
};
