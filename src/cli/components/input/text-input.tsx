import React, { useState } from "react";
import { Box, Text } from "ink";
import { useInput } from "ink";

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  focused?: boolean;
}

export const TextInput: React.FC<TextInputProps> = ({
  value,
  onChange,
  placeholder = "",
  focused = false,
}) => {
  const [cursorOffset, setCursorOffset] = useState(value.length);

  useInput(
    (input, key) => {
      if (key.leftArrow) {
        setCursorOffset(Math.max(0, cursorOffset - 1));
      } else if (key.rightArrow) {
        setCursorOffset(Math.min(value.length, cursorOffset + 1));
      } else if (key.backspace || key.delete) {
        if (cursorOffset > 0) {
          const newValue =
            value.slice(0, cursorOffset - 1) + value.slice(cursorOffset);
          onChange(newValue);
          setCursorOffset(cursorOffset - 1);
        }
      } else if (input && !key.ctrl && !key.meta) {
        const newValue =
          value.slice(0, cursorOffset) + input + value.slice(cursorOffset);
        onChange(newValue);
        setCursorOffset(cursorOffset + input.length);
      }
    },
    { isActive: focused }
  );

  const displayValue = value || placeholder;
  const showPlaceholder = !value && placeholder;

  return (
    <Box>
      <Text color={showPlaceholder ? "gray" : undefined}>
        {displayValue.slice(0, cursorOffset)}
      </Text>
      {focused && <Text inverse>{displayValue[cursorOffset] || " "}</Text>}
      <Text color={showPlaceholder ? "gray" : undefined}>
        {displayValue.slice(cursorOffset + 1)}
      </Text>
    </Box>
  );
};
