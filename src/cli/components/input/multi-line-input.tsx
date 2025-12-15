import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { useInput } from "ink";

export interface MultiLineInputProps {
  value: string;
  onChange: (value: string) => void;
  height?: number;
  showLineNumbers?: boolean;
  focused?: boolean;
}

export const MultiLineInput: React.FC<MultiLineInputProps> = ({
  value,
  onChange,
  height = 10,
  showLineNumbers = false,
  focused = false,
}) => {
  const [cursorLine, setCursorLine] = useState(0);
  const [cursorColumn, setCursorColumn] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const lines = value.split("\n");

  // Ensure cursor is within bounds when value changes
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: adjusting cursor/scroll when value changes externally */
  useEffect(() => {
    if (cursorLine >= lines.length) {
      setCursorLine(Math.max(0, lines.length - 1));
    }
    const currentLineLength = lines[cursorLine]?.length ?? 0;
    if (cursorColumn > currentLineLength) {
      setCursorColumn(currentLineLength);
    }
  }, [value, cursorLine, cursorColumn, lines]);

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    if (cursorLine < scrollOffset) {
      setScrollOffset(cursorLine);
    } else if (cursorLine >= scrollOffset + height) {
      setScrollOffset(cursorLine - height + 1);
    }
  }, [cursorLine, height, scrollOffset]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useInput(
    (input, key) => {
      const currentLine = lines[cursorLine] ?? "";

      if (key.upArrow) {
        if (cursorLine > 0) {
          const newLine = cursorLine - 1;
          setCursorLine(newLine);
          setCursorColumn(Math.min(cursorColumn, lines[newLine].length));
        }
      } else if (key.downArrow) {
        if (cursorLine < lines.length - 1) {
          const newLine = cursorLine + 1;
          setCursorLine(newLine);
          setCursorColumn(Math.min(cursorColumn, lines[newLine].length));
        }
      } else if (key.leftArrow) {
        if (cursorColumn > 0) {
          setCursorColumn(cursorColumn - 1);
        } else if (cursorLine > 0) {
          setCursorLine(cursorLine - 1);
          setCursorColumn(lines[cursorLine - 1].length);
        }
      } else if (key.rightArrow) {
        if (cursorColumn < currentLine.length) {
          setCursorColumn(cursorColumn + 1);
        } else if (cursorLine < lines.length - 1) {
          setCursorLine(cursorLine + 1);
          setCursorColumn(0);
        }
      } else if (key.return) {
        const beforeCursor = currentLine.slice(0, cursorColumn);
        const afterCursor = currentLine.slice(cursorColumn);
        const newLines = [...lines];
        newLines[cursorLine] = beforeCursor;
        newLines.splice(cursorLine + 1, 0, afterCursor);
        onChange(newLines.join("\n"));
        setCursorLine(cursorLine + 1);
        setCursorColumn(0);
      } else if (key.backspace || key.delete) {
        if (cursorColumn > 0) {
          const newLine = currentLine.slice(0, cursorColumn - 1) + currentLine.slice(cursorColumn);
          const newLines = [...lines];
          newLines[cursorLine] = newLine;
          onChange(newLines.join("\n"));
          setCursorColumn(cursorColumn - 1);
        } else if (cursorLine > 0) {
          const prevLine = lines[cursorLine - 1];
          const newLine = prevLine + currentLine;
          const newLines = [...lines];
          newLines[cursorLine - 1] = newLine;
          newLines.splice(cursorLine, 1);
          onChange(newLines.join("\n"));
          setCursorLine(cursorLine - 1);
          setCursorColumn(prevLine.length);
        }
      } else if (input && !key.ctrl && !key.meta) {
        const newLine =
          currentLine.slice(0, cursorColumn) + input + currentLine.slice(cursorColumn);
        const newLines = [...lines];
        newLines[cursorLine] = newLine;
        onChange(newLines.join("\n"));
        setCursorColumn(cursorColumn + input.length);
      }
    },
    { isActive: focused }
  );

  const visibleLines = lines.slice(scrollOffset, scrollOffset + height);
  const lineNumberWidth = showLineNumbers ? String(lines.length).length + 1 : 0;

  return (
    <Box flexDirection="column">
      {visibleLines.map((line, index) => {
        const actualLineNum = scrollOffset + index;
        const isCursorLine = actualLineNum === cursorLine;
        const lineNum = String(actualLineNum + 1).padStart(lineNumberWidth);

        return (
          <Box key={actualLineNum}>
            {showLineNumbers && (
              <Box marginRight={1}>
                <Text color="gray">{lineNum}</Text>
              </Box>
            )}
            <Box>
              {isCursorLine && focused ? (
                <>
                  <Text>{line.slice(0, cursorColumn)}</Text>
                  <Text inverse>{line[cursorColumn] || " "}</Text>
                  <Text>{line.slice(cursorColumn + 1)}</Text>
                </>
              ) : (
                <Text>{line}</Text>
              )}
            </Box>
          </Box>
        );
      })}
      {scrollOffset + height < lines.length && (
        <Box>
          <Text color="gray">... ({lines.length - (scrollOffset + height)} more lines)</Text>
        </Box>
      )}
    </Box>
  );
};
