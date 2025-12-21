import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { useInput } from "ink";
import { getSelectionProps } from "../theme";

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  focused?: boolean;
}

export const Select: React.FC<SelectProps> = ({ options, value, onChange, focused = false }) => {
  const [filterText, setFilterText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(filterText.toLowerCase())
  );

  /* eslint-disable react-hooks/set-state-in-effect -- intentional: boundary adjustment and sync with controlled value */
  // Update selected index when filter changes
  useEffect(() => {
    if (selectedIndex >= filteredOptions.length) {
      setSelectedIndex(Math.max(0, filteredOptions.length - 1));
    }
  }, [filteredOptions.length, selectedIndex]);

  // Find index of current value
  useEffect(() => {
    if (value) {
      const index = filteredOptions.findIndex((opt) => opt.value === value);
      if (index >= 0) {
        setSelectedIndex(index);
      }
    }
  }, [value, filteredOptions]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useInput(
    (input, key) => {
      if (key.upArrow) {
        setSelectedIndex(selectedIndex <= 0 ? filteredOptions.length - 1 : selectedIndex - 1);
      } else if (key.downArrow) {
        setSelectedIndex(selectedIndex >= filteredOptions.length - 1 ? 0 : selectedIndex + 1);
      } else if (key.return) {
        if (filteredOptions[selectedIndex]) {
          onChange(filteredOptions[selectedIndex].value);
        }
      } else if (key.backspace || key.delete) {
        setFilterText(filterText.slice(0, -1));
      } else if (key.escape) {
        setFilterText("");
      } else if (input && !key.ctrl && !key.meta) {
        setFilterText(filterText + input);
      }
    },
    { isActive: focused }
  );

  return (
    <Box flexDirection="column">
      {filterText && (
        <Box marginBottom={1}>
          <Text color="gray">Filter: </Text>
          <Text>{filterText}</Text>
        </Box>
      )}
      {filteredOptions.length === 0 ? (
        <Text color="gray">No matches found</Text>
      ) : (
        filteredOptions.map((option, index) => {
          const isSelected = index === selectedIndex;
          const isCurrent = option.value === value;
          const selectionProps = getSelectionProps(isSelected, focused);

          // Determine color: focused selection uses theme, otherwise fallback to simpler colors
          const textColor = isSelected && focused
            ? selectionProps.color
            : isSelected
              ? "green"
              : isCurrent
                ? "cyan"
                : undefined;

          return (
            <Box key={option.value}>
              <Text
                backgroundColor={selectionProps.backgroundColor}
                bold={selectionProps.bold}
                color={textColor}
              >
                {isSelected ? "> " : "  "}
                {option.label}
                {isCurrent && !isSelected ? " *" : ""}
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
};
