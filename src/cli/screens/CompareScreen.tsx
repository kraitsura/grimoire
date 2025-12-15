/**
 * Compare Screen - Interactive A/B comparison dashboard
 *
 * Features:
 * - Multi-select prompts for comparison (2-4)
 * - Configure model and variables
 * - Side-by-side scrollable output panels
 * - Independent scrolling for each panel
 * - Metrics comparison (tokens, cost, time)
 * - Winner selection and recording
 */

import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useAppState } from "../context/app-context.js";
import { useEffectRun } from "../context/runtime-context.js";
import { StorageService } from "../../services/index.js";
import { ActionBar } from "../components/layout/action-bar.js";
import { ScrollableBox } from "../components/input/scrollable-box.js";

type CompareMode = "select" | "configure" | "running" | "results";

interface CompareResult {
  promptId: string;
  promptName: string;
  output: string;
  tokens: number;
  cost: number;
  duration: number;
}

interface CompareConfig {
  model: string;
  temperature: number;
}

const MODELS = ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet", "claude-3-haiku"];

export const CompareScreen: React.FC = () => {
  const { actions } = useAppState();
  const [mode, setMode] = useState<CompareMode>("select");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<CompareConfig>({
    model: "gpt-4o",
    temperature: 0.7,
  });
  const [modelIndex, setModelIndex] = useState(0);
  const [focusedField, setFocusedField] = useState(0);
  const [results, setResults] = useState<CompareResult[]>([]);
  const [focusedPanel, setFocusedPanel] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);

  // Fetch all prompts
  const { result: prompts, loading } = useEffectRun(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.getAll;
    }),
    []
  );

  // Get selected prompts
  const selectedPrompts = useMemo(() => {
    if (!prompts) return [];
    return prompts.filter((p) => selectedPromptIds.has(p.id));
  }, [prompts, selectedPromptIds]);

  // Run comparison simulation
  const runComparison = async (): Promise<void> => {
    setMode("running");
    setResults([]);

    const newResults: CompareResult[] = [];

    for (const prompt of selectedPrompts) {
      // Simulate API call
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 500));

      newResults.push({
        promptId: prompt.id,
        promptName: prompt.name,
        output: `This is the simulated response for "${prompt.name}".\n\nThe prompt was:\n${prompt.content.slice(0, 100)}...\n\nThis response demonstrates how the AI would respond to this particular prompt. Each prompt may produce different outputs based on its content and structure.\n\nKey points:\n1. Response quality\n2. Token efficiency\n3. Cost effectiveness`,
        tokens: 150 + Math.floor(Math.random() * 100),
        cost: 0.002 + Math.random() * 0.002,
        duration: 1.5 + Math.random() * 2,
      });

      setResults([...newResults]);
    }

    setMode("results");
  };

  // Toggle prompt selection
  const togglePrompt = (promptId: string) => {
    setSelectedPromptIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(promptId)) {
        newSet.delete(promptId);
      } else if (newSet.size < 4) {
        newSet.add(promptId);
      }
      return newSet;
    });
  };

  // Keyboard input handling
  useInput((input, key) => {
    if (key.escape) {
      if (mode === "configure") {
        setMode("select");
      } else if (mode === "results") {
        setMode("configure");
        setWinner(null);
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
      } else if (input === " " || key.return) {
        togglePrompt(prompts[selectedIndex].id);
      } else if (input === "c" && selectedPromptIds.size >= 2) {
        setMode("configure");
      }
      return;
    }

    if (mode === "configure") {
      if (key.upArrow) {
        setFocusedField((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || key.tab) {
        setFocusedField((prev) => Math.min(1, prev + 1));
      } else if (key.return) {
        void runComparison();
      }

      // Model selection
      if (focusedField === 0) {
        if (key.leftArrow) {
          const newIndex = Math.max(0, modelIndex - 1);
          setModelIndex(newIndex);
          setConfig((c) => ({ ...c, model: MODELS[newIndex] }));
        } else if (key.rightArrow) {
          const newIndex = Math.min(MODELS.length - 1, modelIndex + 1);
          setModelIndex(newIndex);
          setConfig((c) => ({ ...c, model: MODELS[newIndex] }));
        }
      }

      // Temperature
      if (focusedField === 1) {
        if (key.leftArrow) {
          setConfig((c) => ({ ...c, temperature: Math.max(0, c.temperature - 0.1) }));
        } else if (key.rightArrow) {
          setConfig((c) => ({ ...c, temperature: Math.min(2, c.temperature + 0.1) }));
        }
      }
      return;
    }

    if (mode === "results") {
      // Switch between panels
      if (key.leftArrow || input === "h") {
        setFocusedPanel((prev) => Math.max(0, prev - 1));
      } else if (key.rightArrow || input === "l") {
        setFocusedPanel((prev) => Math.min(results.length - 1, prev + 1));
      }

      // Select winner
      if (input === "1" && results[0]) {
        setWinner(results[0].promptId);
        actions.showNotification({
          type: "success",
          message: `Selected ${results[0].promptName} as winner`,
        });
      } else if (input === "2" && results[1]) {
        setWinner(results[1].promptId);
        actions.showNotification({
          type: "success",
          message: `Selected ${results[1].promptName} as winner`,
        });
      } else if (input === "n") {
        setWinner(null);
        actions.showNotification({
          type: "info",
          message: "No winner selected",
        });
      } else if (input === "r") {
        void runComparison();
      }
      return;
    }
  });

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading prompts...</Text>
      </Box>
    );
  }

  // Select mode
  if (mode === "select") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle="single" paddingX={2}>
          <Text bold color="cyan">
            Compare Prompts
          </Text>
          <Text dimColor> (select 2-4)</Text>
        </Box>

        <Box marginBottom={1}>
          <Text dimColor>Selected: {selectedPromptIds.size}/4</Text>
        </Box>

        {!prompts || prompts.length === 0 ? (
          <Text color="yellow">No prompts available</Text>
        ) : (
          <Box flexDirection="column">
            {prompts.slice(0, 15).map((prompt, index) => {
              const isSelected = selectedPromptIds.has(prompt.id);
              const isFocused = index === selectedIndex;

              return (
                <Text
                  key={prompt.id}
                  inverse={isFocused}
                  color={isFocused ? "white" : isSelected ? "green" : undefined}
                >
                  {isSelected ? "[x] " : "[ ] "}
                  {prompt.name}
                </Text>
              );
            })}
          </Box>
        )}

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "Space", label: "Toggle" },
              { key: "c", label: selectedPromptIds.size >= 2 ? "Compare" : "Select 2+" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Configure mode
  if (mode === "configure") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle="single" paddingX={2}>
          <Text bold color="cyan">
            Configure Comparison
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text>Comparing: </Text>
          <Text color="cyan">{selectedPrompts.map((p) => p.name).join(", ")}</Text>
        </Box>

        <Box flexDirection="column" gap={1}>
          <Box>
            <Text color={focusedField === 0 ? "cyan" : undefined}>
              Model: [{config.model.padEnd(20)}]
            </Text>
            {focusedField === 0 && <Text dimColor> (left/right)</Text>}
          </Box>

          <Box>
            <Text color={focusedField === 1 ? "cyan" : undefined}>
              Temperature: [{config.temperature.toFixed(1).padEnd(20)}]
            </Text>
            {focusedField === 1 && <Text dimColor> (left/right)</Text>}
          </Box>
        </Box>

        <Box marginTop={2} gap={2}>
          <Box borderStyle="round" borderColor="green" paddingX={2}>
            <Text color="green" bold>
              [Enter] Compare
            </Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "Arrow", label: "Adjust" },
              { key: "Enter", label: "Compare" },
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
          <Text bold>Comparing prompts...</Text>
        </Box>

        <Box flexDirection="column">
          {selectedPrompts.map((prompt, index) => {
            const result = results.find((r) => r.promptId === prompt.id);
            const isComplete = !!result;
            const isRunning = !result && index === results.length;

            return (
              <Box key={prompt.id}>
                <Text color={isComplete ? "green" : isRunning ? "yellow" : "gray"}>
                  {isComplete ? "  [done] " : isRunning ? "  [run]  " : "  [    ] "}
                </Text>
                <Text>{prompt.name}</Text>
              </Box>
            );
          })}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>
            Progress: {results.length}/{selectedPrompts.length}
          </Text>
        </Box>
      </Box>
    );
  }

  // Results mode
  if (mode === "results" && results.length > 0) {
    return (
      <Box flexDirection="column" padding={1}>
        {/* Side-by-side panels */}
        <Box>
          {results.map((result, index) => (
            <Box
              key={result.promptId}
              flexDirection="column"
              width="50%"
              borderStyle="single"
              borderColor={
                winner === result.promptId ? "green" : focusedPanel === index ? "cyan" : undefined
              }
              paddingX={1}
            >
              <Box marginBottom={1}>
                <Text bold color={focusedPanel === index ? "cyan" : undefined}>
                  {result.promptName}
                  {winner === result.promptId && <Text color="green"> (winner)</Text>}
                </Text>
              </Box>

              <ScrollableBox height={10} focused={focusedPanel === index}>
                <Text>{result.output}</Text>
              </ScrollableBox>

              <Box marginTop={1} flexDirection="column">
                <Text dimColor>{result.tokens} tokens</Text>
                <Text dimColor>{result.duration.toFixed(1)}s</Text>
                <Text dimColor>${result.cost.toFixed(4)}</Text>
              </Box>
            </Box>
          ))}
        </Box>

        <Box marginTop={1}>
          <Text>
            Winner: [1]{results[0]?.promptName?.slice(0, 10)} [2]
            {results[1]?.promptName?.slice(0, 10)} [n]either
          </Text>
        </Box>

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "h/l", label: "Switch Panel" },
              { key: "1/2", label: "Select Winner" },
              { key: "r", label: "Rerun" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  return null;
};
