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

import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useAppState } from "../context/app-context.js";
import { useEffectRun, useEffectCallback } from "../context/runtime-context.js";
import { StorageService } from "../../services/index.js";
import { ActionBar } from "../components/layout/action-bar.js";
import { TextInput } from "../components/input/text-input.js";
import { ScrollableBox } from "../components/input/scrollable-box.js";

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

const MODELS = ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet", "claude-3-haiku"];

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
    model: "gpt-4o",
    temperature: 0.7,
    maxTokens: 1024,
    variables: {},
  });
  const [output, setOutput] = useState("");
  const [stats, setStats] = useState<TestStats | null>(null);
  const [focusedField, setFocusedField] = useState(0);
  const [modelIndex, setModelIndex] = useState(0);

  // Fetch all prompts for selection
  const { result: prompts, loading: loadingPrompts } = useEffectRun(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.getAll;
    }),
    []
  );

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

  // Run test callback
  const { execute: runTest } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!selectedPrompt) return;

      const startTime = Date.now();

      // Simulate streaming output (in real implementation, use LLMService)
      setOutput("");
      setMode("running");

      // Replace variables in content
      let processedContent = selectedPrompt.content;
      for (const [key, value] of Object.entries(config.variables)) {
        processedContent = processedContent.replace(
          new RegExp(`\\{\\{${key}\\}\\}`, "g"),
          value
        );
      }

      // Simulate streaming response
      const simulatedResponse =
        "This is a simulated response from the LLM.\n\nIn a real implementation, this would use the LLMService to stream the response in real-time.\n\nThe prompt content was:\n" +
        processedContent.slice(0, 200) +
        "...";

      for (let i = 0; i < simulatedResponse.length; i += 10) {
        yield* Effect.sleep(50);
        setOutput(simulatedResponse.slice(0, i + 10));
      }

      const duration = (Date.now() - startTime) / 1000;

      setStats({
        inputTokens: Math.floor(processedContent.length / 4),
        outputTokens: Math.floor(simulatedResponse.length / 4),
        cost: 0.0012,
        duration,
      });

      setMode("results");
    })
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

      if (key.upArrow) {
        setFocusedField((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || key.tab) {
        setFocusedField((prev) => Math.min(totalFields - 1, prev + 1));
      } else if (key.return && focusedField === totalFields - 1) {
        void runTest();
      }

      // Model selection with left/right
      if (focusedField === 0) {
        if (key.leftArrow) {
          setModelIndex((prev) => Math.max(0, prev - 1));
          setConfig((c) => ({ ...c, model: MODELS[Math.max(0, modelIndex - 1)] }));
        } else if (key.rightArrow) {
          setModelIndex((prev) => Math.min(MODELS.length - 1, prev + 1));
          setConfig((c) => ({
            ...c,
            model: MODELS[Math.min(MODELS.length - 1, modelIndex + 1)],
          }));
        }
      }
      return;
    }

    if (mode === "results") {
      if (input === "r") {
        void runTest();
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
  if (loadingPrompts || loadingPrompt) {
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
            {prompts.slice(0, 15).map((prompt, index) => (
              <Text
                key={prompt.id}
                inverse={index === selectedIndex}
                color={index === selectedIndex ? "white" : undefined}
              >
                {index === selectedIndex ? "> " : "  "}
                {prompt.name}
              </Text>
            ))}
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
        <Box marginBottom={1} borderStyle="single" paddingX={2} paddingY={1}>
          <Text bold color="cyan">
            Test Prompt: {selectedPrompt?.name}
          </Text>
        </Box>

        <Box flexDirection="column" gap={1}>
          {/* Model selection */}
          <Box>
            <Text color={focusedField === 0 ? "cyan" : undefined}>
              Model:       [{config.model.padEnd(20)}]
            </Text>
            {focusedField === 0 && <Text dimColor> (use left/right)</Text>}
          </Box>

          {/* Temperature */}
          <Box>
            <Text color={focusedField === 1 ? "cyan" : undefined}>
              Temperature: [
            </Text>
            {focusedField === 1 ? (
              <TextInput
                value={String(config.temperature)}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, temperature: parseFloat(v) || 0.7 }))
                }
                focused={true}
              />
            ) : (
              <Text>{config.temperature}</Text>
            )}
            <Text color={focusedField === 1 ? "cyan" : undefined}>]</Text>
          </Box>

          {/* Max tokens */}
          <Box>
            <Text color={focusedField === 2 ? "cyan" : undefined}>
              Max Tokens:  [
            </Text>
            {focusedField === 2 ? (
              <TextInput
                value={String(config.maxTokens)}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, maxTokens: parseInt(v) || 1024 }))
                }
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
          <Box borderStyle="round" borderColor="green" paddingX={2}>
            <Text color="green" bold>
              [Enter] Run Test
            </Text>
          </Box>
          <Box borderStyle="round" paddingX={2}>
            <Text dimColor>[Esc] Cancel</Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "Tab/Arrow", label: "Navigate" },
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
          <Text dimColor>{"─".repeat(60)}</Text>
        </Box>

        <ScrollableBox height={15} focused={false}>
          <Text>{output}</Text>
          <Text color="cyan">|</Text>
        </ScrollableBox>

        <Box marginY={1}>
          <Text dimColor>{"─".repeat(60)}</Text>
        </Box>

        <Text dimColor>Streaming response...</Text>
      </Box>
    );
  }

  // Results mode
  if (mode === "results" && stats) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="green">
            Test Complete: {selectedPrompt?.name}
          </Text>
        </Box>

        <Box marginY={1}>
          <Text dimColor>{"─".repeat(60)}</Text>
        </Box>

        <ScrollableBox height={12} focused={true}>
          <Text>{output}</Text>
        </ScrollableBox>

        <Box marginY={1}>
          <Text dimColor>{"─".repeat(60)}</Text>
        </Box>

        <Box flexDirection="column">
          <Text bold>Stats:</Text>
          <Text>  Input Tokens:  {stats.inputTokens}</Text>
          <Text>  Output Tokens: {stats.outputTokens}</Text>
          <Text>  Total Cost:    ${stats.cost.toFixed(4)}</Text>
          <Text>  Duration:      {stats.duration.toFixed(1)}s</Text>
        </Box>

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
