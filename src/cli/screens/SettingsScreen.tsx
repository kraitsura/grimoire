/**
 * Settings Screen - Configuration management for Grimoire
 *
 * Provides an interactive interface for managing:
 * - API Keys (OpenAI, Anthropic)
 * - Default settings (model, editor)
 * - Storage information
 * - Versioning configuration
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Effect, Either } from "effect";
import { useAppState } from "../context/app-context.js";
import { useRuntime } from "../context/runtime-context.js";
import { StorageService, ApiKeyService } from "../../services/index.js";
import { TextInput } from "../components/input/text-input.js";
import { ActionBar } from "../components/layout/action-bar.js";

/**
 * Setting sections available in the settings screen
 */
type SettingSection = "api-keys" | "defaults" | "storage" | "versioning";

/**
 * API key provider names
 */
type ApiProvider = "openai" | "anthropic";

/**
 * Editing state for inline input
 */
interface EditingState {
  section: SettingSection;
  field: string;
  value: string;
}

/**
 * Storage statistics
 */
interface StorageStats {
  path: string;
  promptCount: number;
  databaseSize: string;
}

/**
 * Settings data structure
 */
interface SettingsData {
  apiKeys: {
    openai: string | null;
    anthropic: string | null;
  };
  defaults: {
    model: string;
    editor: string;
  };
  versioning: {
    maxVersions: number;
  };
  storage: StorageStats | null;
}

export const SettingsScreen: React.FC = () => {
  const { actions } = useAppState();
  const runtime = useRuntime();

  // State management
  const [selectedSection, setSelectedSection] = useState<SettingSection>("api-keys");
  const [expandedSections, setExpandedSections] = useState<Set<SettingSection>>(
    new Set(["api-keys"])
  );
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [settings, setSettings] = useState<SettingsData>({
    apiKeys: {
      openai: null,
      anthropic: null,
    },
    defaults: {
      model: "gpt-4o",
      editor: process.env.EDITOR || "vim",
    },
    versioning: {
      maxVersions: 10,
    },
    storage: null,
  });
  const [loading, setLoading] = useState(true);
  const [showMasked, setShowMasked] = useState(true);

  // Load settings data on mount
  useEffect(() => {
    loadSettings();
  }, []);

  /**
   * Load all settings from services
   */
  const loadSettings = async () => {
    setLoading(true);
    try {
      const effect = Effect.gen(function* () {
        const apiKeyService = yield* ApiKeyService;
        const storageService = yield* StorageService;

        // Load API keys
        const openaiKey = yield* Effect.either(apiKeyService.get("openai"));
        const anthropicKey = yield* Effect.either(apiKeyService.get("anthropic"));

        // Load storage stats
        const prompts = yield* storageService.getAll;

        return {
          apiKeys: {
            openai: Either.isRight(openaiKey) ? openaiKey.right : null,
            anthropic: Either.isRight(anthropicKey) ? anthropicKey.right : null,
          },
          storage: {
            path: "~/.grimoire",
            promptCount: prompts.length,
            databaseSize: "N/A", // Will be calculated
          },
        };
      });

      const result = await runtime.runPromise(effect);

      setSettings((prev) => ({
        ...prev,
        apiKeys: result.apiKeys,
        storage: result.storage,
      }));
    } catch (error) {
      // Handle error silently, keep default values
    } finally {
      setLoading(false);
    }
  };

  /**
   * Toggle section expansion
   */
  const toggleSection = (section: SettingSection) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  /**
   * Start editing a field
   */
  const startEditing = (section: SettingSection, field: string, currentValue: string) => {
    setEditing({
      section,
      field,
      value: currentValue,
    });
  };

  /**
   * Save the edited value
   */
  const saveEdit = async () => {
    if (!editing) return;

    try {
      // Handle API key updates
      if (editing.section === "api-keys") {
        const provider = editing.field as ApiProvider;
        const effect = Effect.gen(function* () {
          const apiKeyService = yield* ApiKeyService;
          if (editing.value.trim()) {
            yield* apiKeyService.set(provider, editing.value);
          } else {
            yield* apiKeyService.remove(provider);
          }
        });

        await runtime.runPromise(effect);

        // Update local state
        setSettings((prev) => ({
          ...prev,
          apiKeys: {
            ...prev.apiKeys,
            [provider]: editing.value.trim() || null,
          },
        }));

        actions.showNotification({
          type: "success",
          message: `${editing.field.toUpperCase()} API key ${editing.value.trim() ? "saved" : "removed"}`,
        });
      }

      // Handle defaults updates
      if (editing.section === "defaults") {
        setSettings((prev) => ({
          ...prev,
          defaults: {
            ...prev.defaults,
            [editing.field]: editing.value,
          },
        }));

        actions.showNotification({
          type: "success",
          message: `Default ${editing.field} updated`,
        });
      }

      // Handle versioning updates
      if (editing.section === "versioning") {
        const numValue = parseInt(editing.value, 10);
        if (!isNaN(numValue) && numValue > 0) {
          setSettings((prev) => ({
            ...prev,
            versioning: {
              maxVersions: numValue,
            },
          }));

          actions.showNotification({
            type: "success",
            message: "Max versions updated",
          });
        }
      }
    } catch (error) {
      actions.showNotification({
        type: "error",
        message: `Failed to save: ${error}`,
      });
    } finally {
      setEditing(null);
    }
  };

  /**
   * Cancel editing
   */
  const cancelEdit = () => {
    setEditing(null);
  };

  /**
   * Mask API key for display
   */
  const maskKey = (key: string | null): string => {
    if (!key) return "Not set";
    if (!showMasked) return key;

    if (key.length <= 8) return "•••";
    return `${"•".repeat(10)}${key.slice(-8)}`;
  };

  // Keyboard input handling
  useInput(
    (input, key) => {
      // If editing, handle input in TextInput component
      if (editing) {
        if (key.return) {
          saveEdit();
        } else if (key.escape) {
          cancelEdit();
        }
        return;
      }

      // Navigation
      if (key.tab) {
        // Cycle through sections
        const sections: SettingSection[] = ["api-keys", "defaults", "storage", "versioning"];
        const currentIndex = sections.indexOf(selectedSection);
        const nextIndex = (currentIndex + 1) % sections.length;
        setSelectedSection(sections[nextIndex]);
      } else if (key.upArrow) {
        const sections: SettingSection[] = ["api-keys", "defaults", "storage", "versioning"];
        const currentIndex = sections.indexOf(selectedSection);
        const prevIndex = currentIndex === 0 ? sections.length - 1 : currentIndex - 1;
        setSelectedSection(sections[prevIndex]);
      } else if (key.downArrow) {
        const sections: SettingSection[] = ["api-keys", "defaults", "storage", "versioning"];
        const currentIndex = sections.indexOf(selectedSection);
        const nextIndex = (currentIndex + 1) % sections.length;
        setSelectedSection(sections[nextIndex]);
      } else if (key.return || input === " ") {
        // Toggle section expansion
        toggleSection(selectedSection);
      } else if (input === "e" && selectedSection !== "storage") {
        // Start editing first editable field in selected section
        if (selectedSection === "api-keys") {
          startEditing("api-keys", "openai", settings.apiKeys.openai || "");
        } else if (selectedSection === "defaults") {
          startEditing("defaults", "model", settings.defaults.model);
        } else if (selectedSection === "versioning") {
          startEditing("versioning", "maxVersions", settings.versioning.maxVersions.toString());
        }
      } else if (input === "m" && selectedSection === "api-keys") {
        // Toggle mask/unmask
        setShowMasked(!showMasked);
      } else if (key.escape) {
        // Go back
        actions.goBack();
      }
    },
    { isActive: true }
  );

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Settings
        </Text>
        <Text dimColor>Loading settings...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Settings
      </Text>
      <Box marginTop={1} />

      {/* API Keys Section */}
      <Box flexDirection="column">
        <Box>
          <Text color={selectedSection === "api-keys" ? "yellow" : undefined}>
            {expandedSections.has("api-keys") ? "▾" : "▸"} API Keys
          </Text>
        </Box>
        {expandedSections.has("api-keys") && (
          <Box flexDirection="column" marginLeft={2}>
            <Box>
              <Text>OpenAI: </Text>
              {editing?.section === "api-keys" && editing.field === "openai" ? (
                <TextInput
                  value={editing.value}
                  onChange={(value) => setEditing({ ...editing, value })}
                  focused={true}
                  placeholder="sk-..."
                />
              ) : (
                <Text color={settings.apiKeys.openai ? "green" : "gray"}>
                  {maskKey(settings.apiKeys.openai)}
                </Text>
              )}
            </Box>
            <Box>
              <Text>Anthropic: </Text>
              {editing?.section === "api-keys" && editing.field === "anthropic" ? (
                <TextInput
                  value={editing.value}
                  onChange={(value) => setEditing({ ...editing, value })}
                  focused={true}
                  placeholder="sk-ant-..."
                />
              ) : (
                <Text color={settings.apiKeys.anthropic ? "green" : "gray"}>
                  {maskKey(settings.apiKeys.anthropic)}
                </Text>
              )}
            </Box>
          </Box>
        )}
      </Box>

      <Box marginTop={1} />

      {/* Defaults Section */}
      <Box flexDirection="column">
        <Box>
          <Text color={selectedSection === "defaults" ? "yellow" : undefined}>
            {expandedSections.has("defaults") ? "▾" : "▸"} Defaults
          </Text>
        </Box>
        {expandedSections.has("defaults") && (
          <Box flexDirection="column" marginLeft={2}>
            <Box>
              <Text>Model: </Text>
              {editing?.section === "defaults" && editing.field === "model" ? (
                <TextInput
                  value={editing.value}
                  onChange={(value) => setEditing({ ...editing, value })}
                  focused={true}
                />
              ) : (
                <Text>{settings.defaults.model}</Text>
              )}
            </Box>
            <Box>
              <Text>Editor: </Text>
              {editing?.section === "defaults" && editing.field === "editor" ? (
                <TextInput
                  value={editing.value}
                  onChange={(value) => setEditing({ ...editing, value })}
                  focused={true}
                />
              ) : (
                <Text>
                  {process.env.EDITOR ? `$EDITOR (${settings.defaults.editor})` : settings.defaults.editor}
                </Text>
              )}
            </Box>
          </Box>
        )}
      </Box>

      <Box marginTop={1} />

      {/* Storage Section */}
      <Box flexDirection="column">
        <Box>
          <Text color={selectedSection === "storage" ? "yellow" : undefined}>
            {expandedSections.has("storage") ? "▾" : "▸"} Storage
          </Text>
        </Box>
        {expandedSections.has("storage") && settings.storage && (
          <Box flexDirection="column" marginLeft={2}>
            <Box>
              <Text>Path: </Text>
              <Text dimColor>{settings.storage.path}</Text>
            </Box>
            <Box>
              <Text>Prompts: </Text>
              <Text color="cyan">{settings.storage.promptCount}</Text>
            </Box>
            <Box>
              <Text>Database: </Text>
              <Text dimColor>{settings.storage.databaseSize}</Text>
            </Box>
          </Box>
        )}
      </Box>

      <Box marginTop={1} />

      {/* Versioning Section */}
      <Box flexDirection="column">
        <Box>
          <Text color={selectedSection === "versioning" ? "yellow" : undefined}>
            {expandedSections.has("versioning") ? "▾" : "▸"} Versioning
          </Text>
        </Box>
        {expandedSections.has("versioning") && (
          <Box flexDirection="column" marginLeft={2}>
            <Box>
              <Text>Max versions to keep: </Text>
              {editing?.section === "versioning" && editing.field === "maxVersions" ? (
                <TextInput
                  value={editing.value}
                  onChange={(value) => setEditing({ ...editing, value })}
                  focused={true}
                />
              ) : (
                <Text>{settings.versioning.maxVersions}</Text>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* Action Bar */}
      <Box marginTop={1} />
      <ActionBar
        actions={
          editing
            ? [
                { key: "Enter", label: "Save" },
                { key: "Esc", label: "Cancel" },
              ]
            : [
                { key: "Enter", label: "Toggle" },
                { key: "Tab", label: "Section" },
                { key: "E", label: "Edit" },
                ...(selectedSection === "api-keys"
                  ? [{ key: "M", label: showMasked ? "Unmask" : "Mask" }]
                  : []),
                { key: "Esc", label: "Back" },
              ]
        }
      />
    </Box>
  );
};
