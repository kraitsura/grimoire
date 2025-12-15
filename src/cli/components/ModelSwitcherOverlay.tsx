import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { useAppState } from "../context/app-context";

interface ModelOption {
  provider: string;
  providerLabel: string;
  model: string;
  modelLabel: string;
}

// Available models per provider
const PROVIDER_MODELS: Record<
  string,
  { label: string; models: { value: string; label: string }[] }
> = {
  openai: {
    label: "OpenAI",
    models: [
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { value: "o1", label: "o1" },
      { value: "o1-mini", label: "o1 Mini" },
    ],
  },
  anthropic: {
    label: "Anthropic",
    models: [
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
    ],
  },
  google: {
    label: "Google Gemini",
    models: [
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
    ],
  },
  ollama: {
    label: "Ollama (Local)",
    models: [
      { value: "llama3.2", label: "Llama 3.2" },
      { value: "llama3.1", label: "Llama 3.1" },
      { value: "mistral", label: "Mistral" },
      { value: "mixtral", label: "Mixtral" },
    ],
  },
};

export interface ModelSwitcherOverlayProps {
  visible: boolean;
  onClose: () => void;
}

export const ModelSwitcherOverlay: React.FC<ModelSwitcherOverlayProps> = ({ visible, onClose }) => {
  const { state, actions } = useAppState();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Flatten all models into a single list
  const allModels = useMemo<ModelOption[]>(() => {
    const options: ModelOption[] = [];
    for (const [provider, info] of Object.entries(PROVIDER_MODELS)) {
      for (const model of info.models) {
        options.push({
          provider,
          providerLabel: info.label,
          model: model.value,
          modelLabel: model.label,
        });
      }
    }
    return options;
  }, []);

  // Find current model index
  const currentIndex = useMemo(() => {
    return allModels.findIndex(
      (m) =>
        m.provider === state.llmConfig.currentProvider && m.model === state.llmConfig.currentModel
    );
  }, [allModels, state.llmConfig]);

  useInput(
    (input, key) => {
      if (!visible) return;

      if (key.escape || input === "m") {
        onClose();
        return;
      }

      if (key.upArrow || input === "k") {
        setSelectedIndex((i) => (i <= 0 ? allModels.length - 1 : i - 1));
        return;
      }

      if (key.downArrow || input === "j") {
        setSelectedIndex((i) => (i >= allModels.length - 1 ? 0 : i + 1));
        return;
      }

      if (key.return) {
        const selected = allModels[selectedIndex];
        if (selected) {
          actions.setLLMConfig(selected.provider, selected.model);
          actions.showNotification({
            type: "success",
            message: `Switched to ${selected.providerLabel} - ${selected.modelLabel}`,
          });
          onClose();
        }
        return;
      }
    },
    { isActive: visible }
  );

  if (!visible) return null;

  // Group by provider for display
  let currentProvider = "";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Switch Model
        </Text>
        <Text color="gray"> (j/k to navigate, Enter to select, Esc to close)</Text>
      </Box>

      {allModels.map((option, index) => {
        const isSelected = index === selectedIndex;
        const isCurrent = index === currentIndex;
        const showProvider = option.provider !== currentProvider;
        currentProvider = option.provider;

        return (
          <Box key={`${option.provider}-${option.model}`} flexDirection="column">
            {showProvider && (
              <Box marginTop={index === 0 ? 0 : 1}>
                <Text color="yellow" bold>
                  {option.providerLabel}
                </Text>
              </Box>
            )}
            <Box>
              <Text
                color={isSelected ? "green" : isCurrent ? "cyan" : undefined}
                bold={isSelected}
                inverse={isSelected}
              >
                {isSelected ? " > " : "   "}
                {option.modelLabel}
                {isCurrent ? " (current)" : ""}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
