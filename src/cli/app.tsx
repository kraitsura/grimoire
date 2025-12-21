/**
 * Grimoire CLI - Root Ink Application
 */

import React, { useState } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { Effect } from "effect";
import { AppProvider, useAppState } from "./context/app-context.js";
import { RuntimeProvider } from "./context/runtime-context.js";
import { Router } from "./components/Router.js";
import { ModelSwitcherOverlay } from "./components/ModelSwitcherOverlay.js";
import { safeBorderStyle } from "./components/theme.js";

/**
 * Help Overlay Component
 *
 * Displays keyboard shortcuts and navigation help.
 * Can be dismissed by pressing any key.
 */
const HelpOverlay: React.FC<{ onDismiss: () => void }> = ({ onDismiss }) => {
  useInput(() => {
    onDismiss();
  });

  return (
    <Box position="absolute" width="100%" height="100%" alignItems="center" justifyContent="center">
      {/* Semi-transparent background */}
      <Box flexDirection="column" borderStyle={safeBorderStyle} borderColor="cyan" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Keyboard Shortcuts
          </Text>
        </Box>

        <Box flexDirection="column" gap={0}>
          <Text bold>Global:</Text>
          <Text>
            <Text color="green"> q </Text>
            <Text dimColor>Quit</Text>
          </Text>
          <Text>
            <Text color="green"> / </Text>
            <Text dimColor>Search</Text>
          </Text>
          <Text>
            <Text color="green"> m </Text>
            <Text dimColor>Switch model</Text>
          </Text>
          <Text>
            <Text color="green"> Esc </Text>
            <Text dimColor>Back / Cancel</Text>
          </Text>
          <Text>
            <Text color="green"> ? </Text>
            <Text dimColor>Show this help</Text>
          </Text>
        </Box>

        <Box flexDirection="column" gap={0} marginTop={1}>
          <Text bold>Navigation:</Text>
          <Text>
            <Text color="green"> j </Text>
            <Text dimColor>Move down</Text>
          </Text>
          <Text>
            <Text color="green"> k </Text>
            <Text dimColor>Move up</Text>
          </Text>
          <Text>
            <Text color="green"> Enter</Text>
            <Text dimColor>Select / Confirm</Text>
          </Text>
          <Text>
            <Text color="green"> Tab </Text>
            <Text dimColor>Next field</Text>
          </Text>
        </Box>

        <Box marginTop={1} justifyContent="center">
          <Text dimColor italic>
            Press any key to close
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

/**
 * Quit Confirmation Component
 *
 * Warns user about unsaved changes before quitting.
 * Allows cancel or force quit.
 */
const QuitConfirmation: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ onConfirm, onCancel }) => {
  const [selectedAction, setSelectedAction] = useState<"cancel" | "quit">("cancel");

  useInput(
    (input, key) => {
      // Toggle between actions
      if (key.leftArrow || key.rightArrow || input === "h" || input === "l") {
        setSelectedAction((prev) => (prev === "quit" ? "cancel" : "quit"));
      }
      // Execute selected action
      else if (key.return) {
        if (selectedAction === "quit") {
          onConfirm();
        } else {
          onCancel();
        }
      }
      // Quick keys
      else if (input === "y" || input === "q") {
        onConfirm();
      } else if (input === "n" || key.escape) {
        onCancel();
      }
    },
    { isActive: true }
  );

  return (
    <Box position="absolute" width="100%" height="100%" alignItems="center" justifyContent="center">
      <Box
        flexDirection="column"
        borderStyle={safeBorderStyle}
        borderColor="yellow"
        paddingX={2}
        paddingY={1}
      >
        <Box marginBottom={1}>
          <Text bold color="yellow">
            ⚠ Unsaved Changes
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text>You have unsaved changes. Quit anyway?</Text>
        </Box>

        <Box gap={2}>
          <Box
            borderStyle={safeBorderStyle}
            borderColor={selectedAction === "cancel" ? "blue" : undefined}
            paddingX={1}
          >
            <Text
              color={selectedAction === "cancel" ? "blue" : undefined}
              bold={selectedAction === "cancel"}
            >
              {selectedAction === "cancel" ? "> " : "  "}
              Cancel (n)
            </Text>
          </Box>

          <Box
            borderStyle={safeBorderStyle}
            borderColor={selectedAction === "quit" ? "red" : undefined}
            paddingX={1}
          >
            <Text
              color={selectedAction === "quit" ? "red" : undefined}
              bold={selectedAction === "quit"}
            >
              {selectedAction === "quit" ? "> " : "  "}
              Quit (y)
            </Text>
          </Box>
        </Box>

        <Box marginTop={1} justifyContent="center">
          <Text dimColor>h/l: select | Enter: execute | Esc: cancel</Text>
        </Box>
      </Box>
    </Box>
  );
};

/**
 * App Component (inner)
 *
 * Renders the Router with the current screen from app state.
 * Handles global keyboard shortcuts and overlays.
 * Must be wrapped in AppProvider to access context.
 */
const AppInner: React.FC = () => {
  const { state, actions } = useAppState();
  const { exit } = useApp();
  const [showHelp, setShowHelp] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showModelSwitcher, setShowModelSwitcher] = useState(false);

  // Global keyboard shortcuts
  useInput(
    (input, key) => {
      // Don't handle global shortcuts when overlays are shown or when editing text
      if (showHelp || showQuitConfirm || showModelSwitcher || state.isEditing) {
        return;
      }

      // q - Quit (with confirmation if dirty)
      if (input === "q") {
        if (state.isDirty) {
          setShowQuitConfirm(true);
        } else {
          exit();
        }
        return;
      }

      // / - Go to search screen
      if (input === "/") {
        actions.navigate({ name: "search" });
        return;
      }

      // m - Quick model switch
      if (input === "m") {
        setShowModelSwitcher(true);
        return;
      }

      // Esc - Go back
      if (key.escape) {
        // Only go back if there's history
        if (state.history.length > 0) {
          actions.goBack();
        }
        return;
      }

      // ? - Show help overlay
      if (input === "?") {
        setShowHelp(true);
        return;
      }
    },
    { isActive: !showHelp && !showQuitConfirm && !showModelSwitcher && !state.isEditing }
  );

  const handleQuitConfirm = () => {
    exit();
  };

  const handleQuitCancel = () => {
    setShowQuitConfirm(false);
  };

  const handleHelpDismiss = () => {
    setShowHelp(false);
  };

  return (
    <Box flexDirection="column" width="100%">
      {/* Main router */}
      <Router screen={state.currentScreen} />

      {/* Help overlay */}
      {showHelp && <HelpOverlay onDismiss={handleHelpDismiss} />}

      {/* Model switcher overlay */}
      <ModelSwitcherOverlay
        visible={showModelSwitcher}
        onClose={() => setShowModelSwitcher(false)}
      />

      {/* Quit confirmation */}
      {showQuitConfirm && (
        <QuitConfirmation onConfirm={handleQuitConfirm} onCancel={handleQuitCancel} />
      )}
    </Box>
  );
};

/**
 * App Component (outer)
 *
 * Root component that wraps the application in AppProvider.
 */
export const App: React.FC = () => {
  return (
    <RuntimeProvider>
      <AppProvider>
        <AppInner />
      </AppProvider>
    </RuntimeProvider>
  );
};

/**
 * Run the interactive Ink UI
 *
 * Launches the full-screen terminal UI for browsing and managing prompts.
 * Returns an Effect that completes when the UI exits.
 */
export const runInteractive = (): Effect.Effect<void, never> => {
  return Effect.sync(() => {
    // Move cursor to home position (top-left) without clearing terminal
    process.stdout.write("\x1b[H");
    const { waitUntilExit } = render(<App />);
    return waitUntilExit();
  }).pipe(Effect.flatMap((promise) => Effect.promise(() => promise)));
};
