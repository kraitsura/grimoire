/**
 * Test Screen - Interactive prompt testing dashboard
 *
 * Features:
 * - Configure model, temperature, max tokens
 * - Set template variables before running
 * - Real-time streaming output during test
 * - Shows token usage and cost after completion
 * - Can save test result to history
 */

import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Effect, Stream, pipe, Duration } from "effect";
import { useAppState } from "../context/app-context.js";
import { useEffectRun, useEffectCallback } from "../context/runtime-context.js";
import {
  StorageService,
  LLMService,
  ConfigService,
  TokenCounterService,
  LLMAuthError,
  LLMTimeoutError,
  LLMRateLimitError,
  LLMModelError,
  LLMContentFilterError,
} from "../../services/index.js";
import type { StreamChunk, LLMErrors } from "../../services/llm-service.js";
import { ActionBar } from "../components/layout/action-bar.js";
import { TextInput } from "../components/input/text-input.js";
import { ScrollableBox } from "../components/input/scrollable-box.js";
import { safeBorderStyle, getSelectionProps } from "../components/theme.js";

export interface TestScreenProps {
  promptId?: string;
}

type TestMode = "select" | "setup" | "running" | "results";

interface TestConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  variables: Record<string, string>;
}

interface TestStats {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  duration: number;
}

/**
 * Extract variables from prompt content ({{variable}} syntax)
 */
const extractVariables = (content: string): string[] => {
  const matches = content.match(/\{\{([^}]+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2).trim()))];
};

export const TestScreen: React.FC<TestScreenProps> = ({ promptId }) => {
  const { actions } = useAppState();
  const [mode, setMode] = useState<TestMode>(promptId ? "setup" : "select");
  const [selectedPromptId, setSelectedPromptId] = useState<string | undefined>(promptId);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [config, setConfig] = useState<TestConfig>({
    model: "",
    temperature: 0.7,
    maxTokens: 1024,
    variables: {},
  });
  const [output, setOutput] = useState("");
  const [stats, setStats] = useState<TestStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState(0);
  const [modelIndex, setModelIndex] = useState(0);
  const [actualModel, setActualModel] = useState<string | null>(null);

  // Fetch all prompts for selection
  const { result: prompts, loading: loadingPrompts } = useEffectRun(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.getAll;
    }),
    []
  );

  // Fetch config (providers and default model)
  const { result: grimoireConfig } = useEffectRun(
    Effect.gen(function* () {
      const configService = yield* ConfigService;
      return yield* configService.get();
    }),
    []
  );

  // Fetch available models from configured providers only
  const { result: availableModels, loading: loadingModels } = useEffectRun(
    Effect.gen(function* () {
      const llm = yield* LLMService;
      const configService = yield* ConfigService;
      const config = yield* configService.get();

      // Only get models from configured providers
      if (config.providers.length === 0) {
        return [];
      }

      const modelLists = yield* Effect.all(
        config.providers.map((provider) => llm.listModels(provider)),
        { concurrency: "unbounded" }
      );

      return modelLists.flat();
    }),
    []
  );

  // Extract default model config
  const defaultModelConfig = grimoireConfig
    ? { provider: grimoireConfig.defaultProvider, model: grimoireConfig.defaultModel }
    : null;

  // Initialize model from config when available
  useEffect(() => {
    if (availableModels && availableModels.length > 0 && config.model === "") {
      // Try to use default from config, otherwise use first available model
      let defaultModel = availableModels[0];
      let defaultIndex = 0;

      if (defaultModelConfig?.model) {
        const configModel = defaultModelConfig.model;

        // Try exact match first
        let configIndex = availableModels.indexOf(configModel);

        // If no exact match, try finding a model that the config model starts with
        // e.g., "claude-3-5-haiku-20241022" matches "claude-3-5-haiku"
        if (configIndex < 0) {
          configIndex = availableModels.findIndex((m) => configModel.startsWith(m));
        }

        // Also try finding a model that starts with the config model
        // e.g., "claude-3-5-haiku" matches "claude-3-5-haiku-20241022"
        if (configIndex < 0) {
          configIndex = availableModels.findIndex((m) => m.startsWith(configModel));
        }

        if (configIndex >= 0) {
          defaultModel = availableModels[configIndex];
          defaultIndex = configIndex;
        }
      }

      setModelIndex(defaultIndex);
      setConfig((c) => ({ ...c, model: defaultModel }));
    }
  }, [availableModels, defaultModelConfig, config.model]);

  // Models to use (fallback to empty array if not loaded)
  const models = availableModels ?? [];

  // Fetch selected prompt
  const { result: selectedPrompt, loading: loadingPrompt } = useEffectRun(
    Effect.gen(function* () {
      if (!selectedPromptId) return null;
      const storage = yield* StorageService;
      return yield* storage.getById(selectedPromptId);
    }),
    [selectedPromptId]
  );

  // Extract variables from selected prompt
  const variables = useMemo(() => {
    if (!selectedPrompt) return [];
    return extractVariables(selectedPrompt.content);
  }, [selectedPrompt]);

  // Helper to extract error message from various error types with helpful context
  const getErrorMessage = (e: unknown): string => {
    if (e && typeof e === "object" && "_tag" in e) {
      const tag = e._tag as string;

      // Provide helpful messages for known error types
      switch (tag) {
        case "LLMAuthError":
          return (e as LLMAuthError).message;
        case "LLMTimeoutError":
          return `Request timed out. The model may be overloaded or the prompt is too long.`;
        case "LLMRateLimitError": {
          const rateErr = e as LLMRateLimitError;
          const retryInfo = rateErr.retryAfterMs
            ? ` Try again in ${Math.ceil(rateErr.retryAfterMs / 1000)} seconds.`
            : "";
          return `Rate limit exceeded.${retryInfo}`;
        }
        case "LLMModelError":
          return (e as LLMModelError).message;
        case "LLMContentFilterError":
          return `Content blocked by safety filters. Try rephrasing your prompt.`;
        case "LLMError":
          if ("message" in e && typeof e.message === "string") {
            return e.message;
          }
          break;
      }
    }

    // Fallback for other error types
    if (e && typeof e === "object" && "message" in e && typeof e.message === "string") {
      return e.message;
    }
    if (e instanceof Error) {
      return e.message;
    }
    return String(e);
  };

  // Run test callback with real LLM streaming
  const { execute: runTest } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!selectedPrompt) {
        setError("No prompt selected");
        setMode("results");
        return;
      }
      if (!config.model) {
        setError("No model selected");
        setMode("results");
        return;
      }

      const startTime = Date.now();

      // Reset state immediately for user feedback
      setOutput("");
      setError(null);
      setActualModel(null);
      setMode("running");

      const llm = yield* LLMService;
      const tokenCounter = yield* TokenCounterService;

      // Replace variables in content
      let processedContent = selectedPrompt.content;
      for (const [key, value] of Object.entries(config.variables)) {
        processedContent = processedContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
      }

      // Stream response from LLM
      const stream = llm.stream({
        model: config.model,
        messages: [{ role: "user", content: processedContent }],
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      let fullOutput = "";
      let usage: { inputTokens: number; outputTokens: number } | undefined;
      let resolvedModel: string | undefined;

      yield* pipe(
        stream,
        Stream.timeout(Duration.minutes(4)), // Secondary timeout (provider has 3 min)
        Stream.runForEach((chunk: StreamChunk) =>
          Effect.sync(() => {
            if (!chunk.done && chunk.content) {
              fullOutput += chunk.content;
              setOutput(fullOutput);
            }
            if (chunk.done) {
              usage = chunk.usage;
              resolvedModel = chunk.model;
            }
          })
        )
      );

      const duration = (Date.now() - startTime) / 1000;

      // Set actual model used (for fallback tracking)
      setActualModel(resolvedModel ?? config.model);

      // Get token counts from API response, fallback to estimation
      const inputTokens = usage?.inputTokens ?? Math.floor(processedContent.length / 4);
      const outputTokens = usage?.outputTokens ?? Math.floor(fullOutput.length / 4);

      // Calculate cost using the actual model used
      const modelForCost = resolvedModel ?? config.model;
      const cost = yield* tokenCounter.estimateCost(inputTokens, outputTokens, modelForCost).pipe(
        Effect.catchAll(() => Effect.succeed(0)) // Fallback if no pricing info
      );

      setStats({
        inputTokens,
        outputTokens,
        cost,
        duration,
      });

      setMode("results");
    }).pipe(
      Effect.catchAll((e: unknown) =>
        Effect.sync(() => {
          const errorMsg = getErrorMessage(e);
          setError(errorMsg);
          setMode("results");
        })
      )
    )
  );

  // Keyboard input handling
  useInput((input, key) => {
    if (key.escape) {
      if (mode === "setup" && !promptId) {
        setMode("select");
      } else if (mode === "running") {
        // Cancel not supported during streaming
      } else {
        actions.goBack();
      }
      return;
    }

    if (mode === "select") {
      if (!prompts || prompts.length === 0) return;

      if (key.upArrow || input === "k") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === "j") {
        setSelectedIndex((prev) => Math.min(prompts.length - 1, prev + 1));
      } else if (key.return) {
        setSelectedPromptId(prompts[selectedIndex].id);
        setMode("setup");
      }
      return;
    }

    if (mode === "setup") {
      const totalFields = 3 + variables.length; // model, temp, tokens + vars

      // Vertical navigation with j/k or arrow keys
      if (key.upArrow || input === "k") {
        setFocusedField((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || key.tab || input === "j") {
        setFocusedField((prev) => Math.min(totalFields - 1, prev + 1));
      } else if (key.return) {
        // Enter runs the test from any field
        runTest().catch((err) => {
          setError(getErrorMessage(err));
          setMode("results");
        });
      }

      // Model selection with h/l or left/right arrows
      if (focusedField === 0 && models.length > 0) {
        if (key.leftArrow || input === "h") {
          const newIndex = Math.max(0, modelIndex - 1);
          setModelIndex(newIndex);
          setConfig((c) => ({ ...c, model: models[newIndex] }));
        } else if (key.rightArrow || input === "l") {
          const newIndex = Math.min(models.length - 1, modelIndex + 1);
          setModelIndex(newIndex);
          setConfig((c) => ({ ...c, model: models[newIndex] }));
        }
      }
      return;
    }

    if (mode === "results") {
      if (input === "r") {
        runTest().catch((err) => {
          setError(getErrorMessage(err));
          setMode("results");
        });
      } else if (input === "s") {
        actions.showNotification({
          type: "success",
          message: "Test result saved to history",
        });
      }
      return;
    }
  });

  // Loading state
  if (loadingPrompts || loadingPrompt || loadingModels) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  // Select prompt mode
  if (mode === "select") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Select Prompt to Test
          </Text>
        </Box>

        {!prompts || prompts.length === 0 ? (
          <Text color="yellow">No prompts available</Text>
        ) : (
          <Box flexDirection="column">
            {prompts.slice(0, 15).map((prompt, index) => {
              const isSelected = index === selectedIndex;
              return (
                <Text
                  key={prompt.id}
                  {...getSelectionProps(isSelected)}
                >
                  {isSelected ? "> " : "  "}
                  {prompt.name}
                </Text>
              );
            })}
          </Box>
        )}

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "j/k", label: "Navigate" },
              { key: "Enter", label: "Select" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Setup mode
  if (mode === "setup") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle={safeBorderStyle} paddingX={2} paddingY={1}>
          <Text bold color="cyan">
            Test Prompt: {selectedPrompt?.name}
          </Text>
        </Box>

        <Box flexDirection="column" gap={1}>
          {/* Model selection */}
          <Box>
            <Text color={focusedField === 0 ? "cyan" : undefined}>
              Model: [{(config.model || "loading...").padEnd(20)}]
            </Text>
            {focusedField === 0 && <Text dimColor> (use h/l)</Text>}
          </Box>

          {/* Temperature */}
          <Box>
            <Text color={focusedField === 1 ? "cyan" : undefined}>Temperature: [</Text>
            {focusedField === 1 ? (
              <TextInput
                value={String(config.temperature)}
                onChange={(v) => setConfig((c) => ({ ...c, temperature: parseFloat(v) || 0.7 }))}
                focused={true}
              />
            ) : (
              <Text>{config.temperature}</Text>
            )}
            <Text color={focusedField === 1 ? "cyan" : undefined}>]</Text>
          </Box>

          {/* Max tokens */}
          <Box>
            <Text color={focusedField === 2 ? "cyan" : undefined}>Max Tokens: [</Text>
            {focusedField === 2 ? (
              <TextInput
                value={String(config.maxTokens)}
                onChange={(v) => setConfig((c) => ({ ...c, maxTokens: parseInt(v) || 1024 }))}
                focused={true}
              />
            ) : (
              <Text>{config.maxTokens}</Text>
            )}
            <Text color={focusedField === 2 ? "cyan" : undefined}>]</Text>
          </Box>

          {/* Variables */}
          {variables.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Variables:</Text>
              {variables.map((variable, index) => (
                <Box key={variable}>
                  <Text color={focusedField === 3 + index ? "cyan" : undefined}>
                    {"  "}
                    {variable}:{" ".repeat(Math.max(1, 12 - variable.length))}[
                  </Text>
                  {focusedField === 3 + index ? (
                    <TextInput
                      value={config.variables[variable] || ""}
                      onChange={(v) =>
                        setConfig((c) => ({
                          ...c,
                          variables: { ...c.variables, [variable]: v },
                        }))
                      }
                      focused={true}
                    />
                  ) : (
                    <Text>{config.variables[variable] || ""}</Text>
                  )}
                  <Text color={focusedField === 3 + index ? "cyan" : undefined}>]</Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box marginTop={2} gap={2}>
          <Box borderStyle={safeBorderStyle} borderColor="green" paddingX={2}>
            <Text color="green" bold>
              [Enter] Run Test
            </Text>
          </Box>
          <Box borderStyle={safeBorderStyle} paddingX={2}>
            <Text dimColor>[Esc] Cancel</Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "j/k", label: "Navigate" },
              { key: "h/l", label: "Model" },
              { key: "Enter", label: "Run" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Running mode
  if (mode === "running") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>Testing: </Text>
          <Text color="cyan">{selectedPrompt?.name}</Text>
        </Box>
        <Box gap={2}>
          <Text dimColor>Model: {config.model}</Text>
          <Text dimColor>Temp: {config.temperature}</Text>
        </Box>

        <Box marginY={1}>
          <Text dimColor>{"-".repeat(60)}</Text>
        </Box>

        <ScrollableBox height={15} focused={false}>
          <Text>{output}</Text>
          <Text color="cyan">|</Text>
        </ScrollableBox>

        <Box marginY={1}>
          <Text dimColor>{"-".repeat(60)}</Text>
        </Box>

        <Text dimColor>Streaming response...</Text>
      </Box>
    );
  }

  // Results mode
  if (mode === "results") {
    const isFallback = actualModel && actualModel !== config.model;

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color={error ? "red" : "green"}>
            {error ? "Test Failed" : "Test Complete"}: {selectedPrompt?.name}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text dimColor>Model: {actualModel ?? config.model}</Text>
          {isFallback && (
            <Text color="yellow"> (fallback from {config.model})</Text>
          )}
        </Box>

        {error && (
          <Box marginBottom={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}

        <Box marginY={1}>
          <Text dimColor>{"-".repeat(60)}</Text>
        </Box>

        <ScrollableBox height={12} focused={true}>
          <Text>{output || (error ? "No output due to error" : "")}</Text>
        </ScrollableBox>

        <Box marginY={1}>
          <Text dimColor>{"-".repeat(60)}</Text>
        </Box>

        {stats && (
          <Box flexDirection="column">
            <Text bold>Stats:</Text>
            <Text> Input Tokens: {stats.inputTokens}</Text>
            <Text> Output Tokens: {stats.outputTokens}</Text>
            <Text> Total Cost: ${stats.cost.toFixed(4)}</Text>
            <Text> Duration: {stats.duration.toFixed(1)}s</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "s", label: "Save" },
              { key: "r", label: "Run Again" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  return null;
};
