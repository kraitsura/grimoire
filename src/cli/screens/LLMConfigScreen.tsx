/**
 * LLM Configuration Screen - Provider management dashboard
 *
 * Features:
 * - List all providers with connection status
 * - Visual indicator for default provider
 * - Edit provider settings in TUI form
 * - Test API key without leaving TUI
 * - Set default model globally
 * - Secure API key entry (masked input)
 */

import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useAppState } from "../context/app-context.js";
import { useEffectRun, useEffectCallback } from "../context/runtime-context.js";
import { ApiKeyService } from "../../services/api-key-service.js";
import { ActionBar } from "../components/layout/action-bar.js";
import { TextInput } from "../components/input/text-input.js";
import { safeBorderStyle } from "../components/theme.js";

type ConfigMode = "list" | "edit" | "add";

interface Provider {
  name: string;
  status: "connected" | "invalid" | "not_configured";
  isDefault: boolean;
  hasApiKey: boolean;
  maskedKey?: string;
}

const KNOWN_PROVIDERS = ["openai", "anthropic", "ollama", "google"];

export const LLMConfigScreen: React.FC = () => {
  const { state, actions } = useAppState();
  const [mode, setMode] = useState<ConfigMode>("list");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [focusedField, setFocusedField] = useState(0);
  const [testResult, setTestResult] = useState<"success" | "failed" | null>(null);

  // Use llmConfig from app state
  const { currentProvider, currentModel } = state.llmConfig;

  // Fetch configured providers
  const { result: configuredProviders, loading } = useEffectRun(
    Effect.gen(function* () {
      const apiKeyService = yield* ApiKeyService;
      const providers = yield* apiKeyService.list();
      return providers;
    }),
    []
  );

  // Build provider list
  const providers = useMemo<Provider[]>(() => {
    const configured = configuredProviders ?? [];

    return KNOWN_PROVIDERS.map((name) => {
      const isConfigured = configured.includes(name);
      return {
        name,
        status: isConfigured ? "connected" : "not_configured",
        isDefault: name === currentProvider,
        hasApiKey: isConfigured,
        maskedKey: isConfigured ? "sk-...xxxx" : undefined,
      };
    });
  }, [configuredProviders, currentProvider]);

  // Test connection callback
  const { execute: testConnection, loading: testing } = useEffectCallback(() =>
    Effect.gen(function* () {
      const apiKeyService = yield* ApiKeyService;
      if (!editingProvider) return false;

      const isValid = yield* apiKeyService.validate(editingProvider);
      setTestResult(isValid ? "success" : "failed");
      return isValid;
    })
  );

  // Save API key callback
  const { execute: saveApiKey, loading: saving } = useEffectCallback(() =>
    Effect.gen(function* () {
      const apiKeyService = yield* ApiKeyService;
      if (!editingProvider || !apiKeyInput) return;

      yield* apiKeyService.set(editingProvider, apiKeyInput);

      actions.showNotification({
        type: "success",
        message: `API key saved for ${editingProvider}`,
      });

      setMode("list");
      setEditingProvider(null);
      setApiKeyInput("");
    })
  );

  // Keyboard input handling
  useInput((input, key) => {
    if (key.escape) {
      if (mode === "edit" || mode === "add") {
        setMode("list");
        setEditingProvider(null);
        setApiKeyInput("");
        setTestResult(null);
      } else {
        actions.goBack();
      }
      return;
    }

    if (mode === "list") {
      if (key.upArrow || input === "k") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === "j") {
        setSelectedIndex((prev) => Math.min(providers.length - 1, prev + 1));
      } else if (key.return || input === "e") {
        setEditingProvider(providers[selectedIndex].name);
        setMode("edit");
      } else if (input === "t") {
        setEditingProvider(providers[selectedIndex].name);
        void testConnection();
      } else if (input === "d") {
        // Set as default provider with a default model
        const selectedProvider = providers[selectedIndex].name;
        const defaultModels: Record<string, string> = {
          openai: "gpt-4o",
          anthropic: "claude-sonnet-4-20250514",
          google: "gemini-2.0-flash",
          ollama: "llama3.2",
        };
        actions.setLLMConfig(selectedProvider, defaultModels[selectedProvider] ?? "");
        actions.showNotification({
          type: "success",
          message: `Set ${selectedProvider} as default provider`,
        });
      } else if (input === "a") {
        setMode("add");
      }
      return;
    }

    if (mode === "edit" || mode === "add") {
      if (key.upArrow) {
        setFocusedField((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || key.tab) {
        setFocusedField((prev) => Math.min(1, prev + 1));
      } else if (key.return && focusedField === 1) {
        void saveApiKey();
      } else if (input === "t") {
        void testConnection();
      }
      return;
    }
  });

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading providers...</Text>
      </Box>
    );
  }

  // List mode
  if (mode === "list") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle={safeBorderStyle} paddingX={2}>
          <Text bold color="cyan">
            LLM Providers
          </Text>
        </Box>

        <Box flexDirection="column">
          {providers.map((provider, index) => {
            const isFocused = index === selectedIndex;
            const statusIcon =
              provider.status === "connected"
                ? "[ok]"
                : provider.status === "invalid"
                  ? "[!!]"
                  : "[  ]";
            const statusColor =
              provider.status === "connected"
                ? "green"
                : provider.status === "invalid"
                  ? "red"
                  : "gray";

            return (
              <Box key={provider.name}>
                <Text inverse={isFocused} color={isFocused ? "white" : undefined}>
                  {isFocused ? "> " : "  "}
                  <Text color={statusColor}>{statusIcon}</Text> {provider.name.padEnd(15)}
                  {provider.isDefault && <Text color="yellow">[default]</Text>}
                </Text>
              </Box>
            );
          })}
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text bold color="cyan">
            Current:{" "}
          </Text>
          <Text>
            {currentProvider} / {currentModel}
          </Text>
          <Text dimColor> (Press {`'m'`} anywhere to switch models quickly)</Text>
        </Box>

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "Enter/e", label: "Edit" },
              { key: "t", label: "Test" },
              { key: "d", label: "Default" },
              { key: "a", label: "Add" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Edit/Add mode
  if (mode === "edit" || mode === "add") {
    const providerName = editingProvider ?? "New Provider";
    const currentProvider = providers.find((p) => p.name === editingProvider);

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle={safeBorderStyle} paddingX={2}>
          <Text bold color="cyan">
            Configure: {providerName}
          </Text>
        </Box>

        <Box flexDirection="column" gap={1}>
          {/* API Key */}
          <Box>
            <Text color={focusedField === 0 ? "cyan" : undefined}>API Key: [</Text>
            {focusedField === 0 ? (
              <TextInput
                value={apiKeyInput}
                onChange={setApiKeyInput}
                placeholder={currentProvider?.maskedKey ?? "Enter API key..."}
                focused={true}
              />
            ) : (
              <Text>
                {apiKeyInput
                  ? "*".repeat(Math.min(apiKeyInput.length, 20))
                  : (currentProvider?.maskedKey ?? "Not set")}
              </Text>
            )}
            <Text color={focusedField === 0 ? "cyan" : undefined}>]</Text>
          </Box>

          {/* Default Model */}
          <Box>
            <Text color={focusedField === 1 ? "cyan" : undefined}>
              Current Model: [{currentModel.padEnd(20)}]
            </Text>
          </Box>

          {/* Enabled checkbox */}
          <Box>
            <Text>[x] Enabled</Text>
          </Box>
        </Box>

        {/* Test result */}
        {testResult && (
          <Box marginTop={1}>
            <Text color={testResult === "success" ? "green" : "red"}>
              {testResult === "success"
                ? "Connection successful"
                : "Connection failed - check API key"}
            </Text>
          </Box>
        )}

        <Box marginTop={2} gap={2}>
          <Box borderStyle={safeBorderStyle} paddingX={2}>
            <Text color="blue">[t] Test Connection</Text>
          </Box>
          <Box borderStyle={safeBorderStyle} borderColor="green" paddingX={2}>
            <Text color="green" bold>
              [Enter] Save
            </Text>
          </Box>
          <Box borderStyle={safeBorderStyle} paddingX={2}>
            <Text dimColor>[Esc] Cancel</Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "Tab", label: "Next Field" },
              { key: "t", label: testing ? "Testing..." : "Test" },
              { key: "Enter", label: saving ? "Saving..." : "Save" },
              { key: "Esc", label: "Cancel" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  return null;
};
