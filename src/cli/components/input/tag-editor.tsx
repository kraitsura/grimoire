import React, { useState } from "react";
import { Box, Text } from "ink";
import { useInput } from "ink";

export interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  focused?: boolean;
}

export const TagEditor: React.FC<TagEditorProps> = ({
  tags,
  onChange,
  suggestions = [],
  focused = false,
}) => {
  const [currentInput, setCurrentInput] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const filteredSuggestions = suggestions.filter(
    (suggestion) =>
      !tags.includes(suggestion) &&
      suggestion.toLowerCase().includes(currentInput.toLowerCase())
  );

  useInput(
    (input, key) => {
      if (key.return) {
        const tagToAdd =
          selectedIndex >= 0
            ? filteredSuggestions[selectedIndex]
            : currentInput.trim();

        if (tagToAdd && !tags.includes(tagToAdd)) {
          onChange([...tags, tagToAdd]);
          setCurrentInput("");
          setSelectedIndex(-1);
        }
      } else if (key.backspace || key.delete) {
        if (currentInput.length > 0) {
          setCurrentInput(currentInput.slice(0, -1));
          setSelectedIndex(-1);
        } else if (tags.length > 0) {
          onChange(tags.slice(0, -1));
        }
      } else if (key.upArrow) {
        if (filteredSuggestions.length > 0) {
          setSelectedIndex(
            selectedIndex <= 0
              ? filteredSuggestions.length - 1
              : selectedIndex - 1
          );
        }
      } else if (key.downArrow) {
        if (filteredSuggestions.length > 0) {
          setSelectedIndex(
            selectedIndex >= filteredSuggestions.length - 1
              ? 0
              : selectedIndex + 1
          );
        }
      } else if (key.tab) {
        if (filteredSuggestions.length > 0) {
          setSelectedIndex(
            (selectedIndex + 1) % filteredSuggestions.length
          );
        }
      } else if (input && !key.ctrl && !key.meta) {
        setCurrentInput(currentInput + input);
        setSelectedIndex(-1);
      }
    },
    { isActive: focused }
  );

  const tagColors = [
    "cyan",
    "magenta",
    "yellow",
    "green",
    "blue",
    "red",
  ] as const;

  return (
    <Box flexDirection="column">
      <Box flexWrap="wrap" gap={1}>
        {tags.map((tag, index) => (
          <Box key={index} marginRight={1}>
            <Text
              color={tagColors[index % tagColors.length]}
              backgroundColor="black"
              bold
            >
              {" "}
              {tag}{" "}
            </Text>
          </Box>
        ))}
        {focused && (
          <Box>
            <Text>{currentInput}</Text>
            <Text inverse> </Text>
          </Box>
        )}
      </Box>
      {focused && filteredSuggestions.length > 0 && currentInput && (
        <Box flexDirection="column" marginTop={1} paddingLeft={2}>
          <Text color="gray" dimColor>
            Suggestions:
          </Text>
          {filteredSuggestions.slice(0, 5).map((suggestion, index) => (
            <Box key={suggestion}>
              <Text
                color={index === selectedIndex ? "green" : "gray"}
                bold={index === selectedIndex}
              >
                {index === selectedIndex ? "> " : "  "}
                {suggestion}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
