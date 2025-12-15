/**
 * Router Usage Examples
 *
 * This file demonstrates how to use the Router component with the AppProvider
 * to navigate between different screens in the Grimoire CLI.
 */

import React from "react";
import { AppProvider, useAppState } from "../src/cli/context/app-context.js";
import { Router } from "../src/cli/components/Router.js";
import { useInput } from "ink";

/**
 * Example: Simple navigation between screens
 */
const NavigationExample: React.FC = () => {
  const { state, actions } = useAppState();

  // Handle keyboard navigation
  useInput((input, key) => {
    if (key.escape) {
      // Go back to previous screen
      actions.goBack();
    } else if (input === "v") {
      // Navigate to view screen
      actions.navigate({ name: "view", promptId: "example-123" });
    } else if (input === "e") {
      // Navigate to edit screen
      actions.navigate({ name: "edit", promptId: "example-456" });
    } else if (input === "s") {
      // Navigate to search screen
      actions.navigate({ name: "search" });
    } else if (input === "l") {
      // Navigate to list screen
      actions.navigate({ name: "list" });
    }
  });

  return <Router screen={state.currentScreen} />;
};

/**
 * Example: Complete app with navigation
 */
export const ExampleApp: React.FC = () => {
  return (
    <AppProvider>
      <NavigationExample />
    </AppProvider>
  );
};

/**
 * Example: Programmatic navigation
 */
export const ProgrammaticNavigationExample = () => {
  const { actions } = useAppState();

  // Navigate to different screens programmatically
  const examples = {
    viewPrompt: (promptId: string) => {
      actions.navigate({ name: "view", promptId });
    },

    editPrompt: (promptId: string) => {
      actions.navigate({ name: "edit", promptId });
    },

    createNewPrompt: () => {
      actions.navigate({ name: "edit" }); // No promptId = new prompt
    },

    viewHistory: (promptId: string) => {
      actions.navigate({ name: "history", promptId });
    },

    openSettings: () => {
      actions.navigate({ name: "settings" });
    },

    goBackToPreviousScreen: () => {
      actions.goBack();
    },

    returnToList: () => {
      actions.navigate({ name: "list" });
    },
  };

  return examples;
};

/**
 * Example: Router with loading states
 */
export const LoadingStateExample: React.FC = () => {
  const { state } = useAppState();
  const [isLoading, setIsLoading] = React.useState(false);

  // Simulate loading state during navigation
  React.useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, [state.currentScreen]);

  return <Router screen={state.currentScreen} loading={isLoading} />;
};
