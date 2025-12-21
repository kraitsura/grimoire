/**
 * Shared theme configuration for CLI components
 *
 * This provides consistent styling that works well across different terminal themes
 * (dark mode, light mode, green text on black, etc.)
 */

/**
 * Selection/highlight styles
 * Using explicit colors instead of `inverse` for better cross-terminal compatibility
 */
export const selectionStyle = {
  // Primary selection (focused item)
  primary: {
    backgroundColor: "blue" as const,
    color: "white" as const,
    bold: true,
  },
  // Secondary selection (current but not focused)
  secondary: {
    color: "cyan" as const,
    bold: true,
  },
  // Hover/highlight without selection
  highlight: {
    color: "yellow" as const,
    bold: true,
  },
} as const;

/**
 * Status colors that work well on most terminals
 */
export const statusColors = {
  success: "green" as const,
  error: "red" as const,
  warning: "yellow" as const,
  info: "cyan" as const,
  muted: "gray" as const,
} as const;

/**
 * Border style that works on all terminals
 * 'single' uses Unicode box-drawing characters that may not render properly
 * 'classic' uses ASCII characters (+, -, |) that work everywhere
 */
export const safeBorderStyle = "classic" as const;

/**
 * Selection props type for consistent usage
 */
export interface SelectionProps {
  backgroundColor?: "blue" | undefined;
  color?: "white" | "cyan" | "yellow" | undefined;
  bold?: boolean | undefined;
}

/**
 * Get selection text props based on selection state
 */
export function getSelectionProps(isSelected: boolean, isFocused = true): SelectionProps {
  if (isSelected && isFocused) {
    return selectionStyle.primary;
  }
  if (isSelected) {
    return selectionStyle.secondary;
  }
  return {
    backgroundColor: undefined,
    color: undefined,
    bold: undefined,
  };
}

/**
 * Selection indicator character
 */
export const selectionIndicator = {
  selected: "> ",
  unselected: "  ",
} as const;
