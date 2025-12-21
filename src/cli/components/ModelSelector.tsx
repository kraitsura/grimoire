/**
 * ModelSelector Component
 *
 * Interactive model selection for a specific provider.
 * Used during provider setup to select the default model.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

// Model definitions by provider
export const PROVIDER_MODELS: Record<
  string,
  { label: string; models: { value: string; label: string }[] }
> = {
  openai: {
    label: "OpenAI",
    models: [
      { value: "gpt-4o", label: "GPT-4o (Recommended)" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { value: "o1", label: "o1" },
      { value: "o1-mini", label: "o1 Mini" },
    ],
  },
  anthropic: {
    label: "Anthropic",
    models: [
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (Recommended)" },
      { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
    ],
  },
  google: {
    label: "Google Gemini",
    models: [
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Recommended)" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
    ],
  },
  ollama: {
    label: "Ollama (Local)",
    models: [
      { value: "llama3.2", label: "Llama 3.2 (Recommended)" },
      { value: "llama3.1", label: "Llama 3.1" },
      { value: "mistral", label: "Mistral" },
      { value: "mixtral", label: "Mixtral" },
    ],
  },
};

export interface ModelSelectorProps {
  provider: string;
  title?: string;
  onSelect: (model: string) => void;
  onCancel?: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  provider,
  title,
  onSelect,
  onCancel,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const providerInfo = PROVIDER_MODELS[provider.toLowerCase()];
  const models = providerInfo?.models ?? [];
  const providerLabel = providerInfo?.label ?? provider;

  useInput((input, key) => {
    if (key.escape && onCancel) {
      onCancel();
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => (i <= 0 ? models.length - 1 : i - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((i) => (i >= models.length - 1 ? 0 : i + 1));
      return;
    }

    if (key.return) {
      const selected = models[selectedIndex];
      if (selected) {
        onSelect(selected.value);
      }
      return;
    }
  });

  if (models.length === 0) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="red">No models available for provider: {provider}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {title ?? `Select default model for ${providerLabel}`}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">(j/k to navigate, Enter to select{onCancel ? ", Esc to cancel" : ""})</Text>
      </Box>

      {models.map((model, index) => {
        const isSelected = index === selectedIndex;

        return (
          <Box key={model.value}>
            <Text color={isSelected ? "green" : undefined} bold={isSelected} inverse={isSelected}>
              {isSelected ? " > " : "   "}
              {model.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

/**
 * Get the default/recommended model for a provider
 */
export const getDefaultModelForProvider = (provider: string): string | undefined => {
  const providerInfo = PROVIDER_MODELS[provider.toLowerCase()];
  return providerInfo?.models[0]?.value;
};

/**
 * Get all models for a provider
 */
export const getModelsForProvider = (provider: string): string[] => {
  const providerInfo = PROVIDER_MODELS[provider.toLowerCase()];
  return providerInfo?.models.map((m) => m.value) ?? [];
};
