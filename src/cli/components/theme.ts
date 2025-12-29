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
    backgroundColor: "cyan" as const,
    color: "black" as const,
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
 * Border style configuration
 *
 * Options:
 * - 'single': Unicode box-drawing (┌─┐│└┘) - cleaner but may not work everywhere
 * - 'round': Rounded corners (╭─╮│╰╯) - modern look, requires Unicode support
 * - 'double': Double lines (╔═╗║╚╝) - bold appearance
 * - 'classic': ASCII (+--+||) - works everywhere
 *
 * Using 'classic' for maximum terminal compatibility.
 */
export const safeBorderStyle = "classic" as const;

/**
 * Selection props type for consistent usage
 */
export interface SelectionProps {
  backgroundColor?: "cyan" | undefined;
  color?: "black" | "cyan" | "yellow" | undefined;
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
