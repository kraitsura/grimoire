/**
 * App Context Provider - Application State Management
 *
 * Provides global application state including screen navigation,
 * status messages, dirty state tracking, and notifications.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

/**
 * Screen types for navigation
 */
export type Screen =
  | { name: "list" }
  | { name: "view"; promptId: string }
  | { name: "edit"; promptId?: string } // undefined = new prompt
  | { name: "search" }
  | { name: "settings" }
  | { name: "history"; promptId: string }
  | { name: "test"; promptId?: string }
  | { name: "chain"; chainName?: string }
  | { name: "benchmark" }
  | { name: "compare" }
  | { name: "llmconfig" }
  | { name: "pinned" }
  | { name: "templates" }
  | { name: "stash" };

/**
 * Notification types
 */
export interface Notification {
  type: "info" | "success" | "warning" | "error";
  message: string;
}

/**
 * LLM configuration for model hotswapping
 */
export interface LLMConfig {
  currentProvider: string;
  currentModel: string;
}

/**
 * Application state structure
 */
export interface AppState {
  currentScreen: Screen;
  history: Screen[];
  statusMessage: string | null;
  isDirty: boolean;
  notification: Notification | null;
  llmConfig: LLMConfig;
}

/**
 * Application actions
 */
export interface AppActions {
  navigate: (screen: Screen) => void;
  goBack: () => void;
  setStatus: (message: string | null) => void;
  setDirty: (dirty: boolean) => void;
  showNotification: (notification: Notification) => void;
  dismissNotification: () => void;
  setLLMConfig: (provider: string, model: string) => void;
}

/**
 * Combined context type
 */
export interface AppContextType {
  state: AppState;
  actions: AppActions;
}

/**
 * App context
 */
const AppContext = createContext<AppContextType | null>(null);

/**
 * Default notification timeout (3 seconds)
 */
const NOTIFICATION_TIMEOUT = 3000;

/**
 * App Provider Component
 *
 * Manages global application state including navigation, status messages,
 * and notifications. Provides a history stack for back navigation.
 *
 * @example
 * ```tsx
 * <AppProvider>
 *   <App />
 * </AppProvider>
 * ```
 */
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize state with list screen
  const [currentScreen, setCurrentScreen] = useState<Screen>({ name: "list" });
  const [history, setHistory] = useState<Screen[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [llmConfig, setLLMConfigState] = useState<LLMConfig>({
    currentProvider: "openai",
    currentModel: "gpt-4o",
  });

  // Auto-dismiss notification after timeout
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, NOTIFICATION_TIMEOUT);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  /**
   * Navigate to a new screen, pushing current screen to history
   */
  const navigate = useCallback((screen: Screen) => {
    setCurrentScreen((current) => {
      setHistory((prev) => [...prev, current]);
      return screen;
    });
  }, []);

  /**
   * Go back to previous screen in history
   */
  const goBack = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;

      const newHistory = [...prev];
      const previousScreen = newHistory.pop()!;
      setCurrentScreen(previousScreen);

      return newHistory;
    });
  }, []);

  /**
   * Set status bar message
   */
  const setStatus = useCallback((message: string | null) => {
    setStatusMessage(message);
  }, []);

  /**
   * Set dirty state (unsaved changes)
   */
  const setDirty = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  /**
   * Show a notification (auto-dismisses after timeout)
   */
  const showNotification = useCallback((notif: Notification) => {
    setNotification(notif);
  }, []);

  /**
   * Manually dismiss current notification
   */
  const dismissNotification = useCallback(() => {
    setNotification(null);
  }, []);

  /**
   * Set LLM provider and model for hotswapping
   */
  const setLLMConfig = useCallback((provider: string, model: string) => {
    setLLMConfigState({ currentProvider: provider, currentModel: model });
  }, []);

  const state: AppState = {
    currentScreen,
    history,
    statusMessage,
    isDirty,
    notification,
    llmConfig,
  };

  const actions: AppActions = {
    navigate,
    goBack,
    setStatus,
    setDirty,
    showNotification,
    dismissNotification,
    setLLMConfig,
  };

  return <AppContext.Provider value={{ state, actions }}>{children}</AppContext.Provider>;
};

/**
 * Hook to access application state and actions
 *
 * @throws Error if called outside of AppProvider
 * @returns Application state and actions
 *
 * @example
 * ```tsx
 * const { state, actions } = useAppState();
 *
 * // Navigate to view screen
 * actions.navigate({ name: 'view', promptId: '123' });
 *
 * // Go back
 * actions.goBack();
 *
 * // Show notification
 * actions.showNotification({
 *   type: 'success',
 *   message: 'Prompt saved successfully'
 * });
 *
 * // Access current screen
 * if (state.currentScreen.name === 'list') {
 *   // Render list screen
 * }
 * ```
 */
export const useAppState = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppProvider");
  }
  return context;
};
