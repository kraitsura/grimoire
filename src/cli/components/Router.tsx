/**
 * Router Component - Screen Navigation and Rendering
 *
 * Handles routing between different screens in the Grimoire CLI.
 * Provides error boundaries for graceful failure handling and
 * loading states for smooth transitions.
 */

import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { Screen } from "../context/app-context.js";
import {
  ListScreen,
  ViewerScreen,
  EditScreen,
  SearchScreen,
  SettingsScreen,
  HistoryScreen,
  TestScreen,
  ChainScreen,
  BenchmarkScreen,
  CompareScreen,
  LLMConfigScreen,
  PinnedScreen,
  TemplatesScreen,
  StashScreen,
  EnhanceScreen,
} from "../screens/index.js";

/**
 * Error Boundary Props
 */
interface ErrorBoundaryProps {
  children: React.ReactNode;
  screenName: string;
}

/**
 * Error Boundary State
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary Component
 *
 * Catches errors thrown by screen components and displays
 * a user-friendly error message instead of crashing the app.
 */
class ScreenErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("Screen Error:", error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold color="red">
            Screen Error: {this.props.screenName}
          </Text>
          <Text dimColor>{this.state.error?.message ?? "An unexpected error occurred"}</Text>
          <Box marginTop={1}>
            <Text dimColor>Press ESC to go back or q to quit</Text>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

/**
 * Router Props
 */
export interface RouterProps {
  screen: Screen;
  loading?: boolean;
}

/**
 * Router Component
 *
 * Renders the appropriate screen component based on the current
 * navigation state. Includes error boundaries for crash protection
 * and loading states for smooth transitions.
 *
 * @example
 * ```tsx
 * const { state } = useAppState();
 * <Router screen={state.currentScreen} />
 * ```
 */
export const Router: React.FC<RouterProps> = ({ screen, loading = false }) => {
  const [delayedLoading, setDelayedLoading] = useState(loading);

  // Handle loading state transitions with delay to prevent flashing
  useEffect(() => {
    if (loading) {
      // Immediately show loading state
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDelayedLoading(true);
    } else {
      // Small delay to prevent flashing on fast transitions
      const timer = setTimeout(() => setDelayedLoading(false), 100);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const isTransitioning = delayedLoading;

  // Show loading indicator during transitions
  if (isTransitioning) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  // Render screen based on navigation state
  const renderScreen = (): React.ReactNode => {
    switch (screen.name) {
      case "list":
        return <ListScreen />;

      case "view":
        return <ViewerScreen promptId={screen.promptId} />;

      case "edit":
        return <EditScreen promptId={screen.promptId} />;

      case "search":
        return <SearchScreen />;

      case "settings":
        return <SettingsScreen />;

      case "history":
        return <HistoryScreen promptId={screen.promptId} />;

      case "test":
        return <TestScreen promptId={screen.promptId} />;

      case "chain":
        return <ChainScreen chainName={screen.chainName} />;

      case "benchmark":
        return <BenchmarkScreen />;

      case "compare":
        return <CompareScreen />;

      case "llmconfig":
        return <LLMConfigScreen />;

      case "pinned":
        return <PinnedScreen />;

      case "templates":
        return <TemplatesScreen />;

      case "stash":
        return <StashScreen />;

      case "enhance":
        return <EnhanceScreen promptId={screen.promptId} content={screen.content} />;

      default: {
        // Type-safe exhaustive check
        const _exhaustive: never = screen;
        return (
          <Box flexDirection="column" padding={1}>
            <Text bold color="red">
              Unknown Screen
            </Text>
            <Text dimColor>The requested screen could not be found</Text>
          </Box>
        );
      }
    }
  };

  return <ScreenErrorBoundary screenName={screen.name}>{renderScreen()}</ScreenErrorBoundary>;
};
