import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { useInput } from "ink";

export interface ScrollableBoxProps {
  children: React.ReactNode;
  height: number;
  focused?: boolean;
  showScrollIndicator?: boolean;
}

export const ScrollableBox: React.FC<ScrollableBoxProps> = ({
  children,
  height,
  focused = false,
  showScrollIndicator = true,
}) => {
  const [scrollOffset, setScrollOffset] = useState(0);

  // Convert children to array of lines for scrolling
  const childrenArray = React.Children.toArray(children);
  const totalLines = childrenArray.length;
  const maxScroll = Math.max(0, totalLines - height);

  // Ensure scroll offset is within bounds when content size changes
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: boundary adjustment */
  useEffect(() => {
    if (scrollOffset > maxScroll) {
      setScrollOffset(maxScroll);
    }
  }, [scrollOffset, maxScroll]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useInput(
    (input, key) => {
      if (key.upArrow || input === "k") {
        setScrollOffset(Math.max(0, scrollOffset - 1));
      } else if (key.downArrow || input === "j") {
        setScrollOffset(Math.min(maxScroll, scrollOffset + 1));
      } else if (key.pageUp) {
        setScrollOffset(Math.max(0, scrollOffset - height));
      } else if (key.pageDown) {
        setScrollOffset(Math.min(maxScroll, scrollOffset + height));
      } else if (input === "g") {
        setScrollOffset(0);
      } else if (input === "G") {
        setScrollOffset(maxScroll);
      }
    },
    { isActive: focused }
  );

  const visibleChildren = childrenArray.slice(scrollOffset, scrollOffset + height);

  const scrollPercentage = maxScroll === 0 ? 100 : Math.round((scrollOffset / maxScroll) * 100);

  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset < maxScroll;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">{visibleChildren}</Box>
      {showScrollIndicator && (canScrollUp || canScrollDown) && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {canScrollUp && "↑ "}
            {scrollOffset + 1}-{Math.min(scrollOffset + height, totalLines)} of {totalLines} (
            {scrollPercentage}%)
            {canScrollDown && " ↓"}
          </Text>
        </Box>
      )}
    </Box>
  );
};
