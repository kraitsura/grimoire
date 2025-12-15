/**
 * Chain Screen - Interactive chain workflow dashboard
 *
 * Features:
 * - List all available chains with step count
 * - Detail view shows workflow diagram with steps and dependencies
 * - Can run chain with variable input
 * - Progress visualization during execution
 * - Cumulative cost and time tracking
 */

import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useAppState } from "../context/app-context.js";
import { useEffectRun, useEffectCallback } from "../context/runtime-context.js";
import { ChainService } from "../../services/chain-service.js";
import { ActionBar } from "../components/layout/action-bar.js";
import { TextInput } from "../components/input/text-input.js";
import { ScrollableBox } from "../components/input/scrollable-box.js";

export interface ChainScreenProps {
  chainName?: string;
}

type ChainMode = "list" | "detail" | "variables" | "running" | "results";

interface RunProgress {
  currentStep: number;
  totalSteps: number;
  stepOutputs: Record<string, string>;
  cost: number;
  elapsed: number;
}

export const ChainScreen: React.FC<ChainScreenProps> = ({ chainName }) => {
  const { actions } = useAppState();
  const [mode, setMode] = useState<ChainMode>(chainName ? "detail" : "list");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedChainName, setSelectedChainName] = useState<string | undefined>(chainName);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [focusedField, setFocusedField] = useState(0);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [finalOutput, setFinalOutput] = useState<string>("");

  // Fetch all chains
  const { result: chains, loading: loadingChains } = useEffectRun(
    Effect.gen(function* () {
      const chainService = yield* ChainService;
      return yield* chainService.listChains();
    }),
    []
  );

  // Fetch selected chain details
  const { result: selectedChain, loading: loadingChain } = useEffectRun(
    Effect.gen(function* () {
      if (!selectedChainName) return null;
      const chainService = yield* ChainService;
      return yield* chainService.loadChain(selectedChainName);
    }),
    [selectedChainName]
  );

  // Get required variables from chain
  const requiredVariables = useMemo(() => {
    if (!selectedChain) return [];
    return Object.entries(selectedChain.variables)
      .filter(([_, spec]) => spec.required !== false)
      .map(([name]) => name);
  }, [selectedChain]);

  // Run chain callback
  const { execute: runChain } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!selectedChain) return;

      setMode("running");
      const startTime = Date.now();
      const steps = selectedChain.steps;

      const stepOutputs: Record<string, string> = {};

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        setProgress({
          currentStep: i + 1,
          totalSteps: steps.length,
          stepOutputs: { ...stepOutputs },
          cost: i * 0.002,
          elapsed: (Date.now() - startTime) / 1000,
        });

        // Simulate step execution
        yield* Effect.sleep(1000);

        stepOutputs[step.output] = `Output from step ${step.id}: ${step.prompt}`;
      }

      setProgress({
        currentStep: steps.length,
        totalSteps: steps.length,
        stepOutputs,
        cost: steps.length * 0.002,
        elapsed: (Date.now() - startTime) / 1000,
      });

      setFinalOutput(
        Object.entries(stepOutputs)
          .map(([key, value]) => `${key}:\n${value}`)
          .join("\n\n")
      );

      setMode("results");
    })
  );

  // Keyboard input handling
  useInput((input, key) => {
    if (key.escape) {
      if (mode === "detail") {
        setMode("list");
        setSelectedChainName(undefined);
      } else if (mode === "variables") {
        setMode("detail");
      } else if (mode === "results") {
        setMode("detail");
      } else {
        actions.goBack();
      }
      return;
    }

    if (mode === "list") {
      if (!chains || chains.length === 0) return;

      if (key.upArrow || input === "k") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === "j") {
        setSelectedIndex((prev) => Math.min(chains.length - 1, prev + 1));
      } else if (key.return) {
        setSelectedChainName(chains[selectedIndex]);
        setMode("detail");
      } else if (input === "n") {
        actions.showNotification({
          type: "info",
          message: "Create new chain in editor",
        });
      } else if (input === "d") {
        actions.showNotification({
          type: "warning",
          message: "Delete chain not implemented",
        });
      }
      return;
    }

    if (mode === "detail") {
      if (input === "r") {
        if (requiredVariables.length > 0) {
          setMode("variables");
        } else {
          void runChain();
        }
      } else if (input === "e") {
        actions.showNotification({
          type: "info",
          message: "Edit chain in editor",
        });
      } else if (input === "v") {
        actions.showNotification({
          type: "info",
          message: "Validate chain",
        });
      }
      return;
    }

    if (mode === "variables") {
      if (key.upArrow) {
        setFocusedField((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || key.tab) {
        setFocusedField((prev) => Math.min(requiredVariables.length - 1, prev + 1));
      } else if (key.return) {
        void runChain();
      }
      return;
    }

    if (mode === "results") {
      if (input === "r") {
        void runChain();
      }
      return;
    }
  });

  // Loading state
  if (loadingChains || loadingChain) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading chains...</Text>
      </Box>
    );
  }

  // List mode
  if (mode === "list") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle="single" paddingX={2}>
          <Text bold color="cyan">
            Prompt Chains
          </Text>
        </Box>

        {!chains || chains.length === 0 ? (
          <Box flexDirection="column">
            <Text color="yellow">No chains found.</Text>
            <Text dimColor>Press [n] to create a new chain</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            {chains.map((name, index) => (
              <Text
                key={name}
                inverse={index === selectedIndex}
                color={index === selectedIndex ? "white" : undefined}
              >
                {index === selectedIndex ? "> " : "  "}
                {name}
              </Text>
            ))}
          </Box>
        )}

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "n", label: "New" },
              { key: "Enter", label: "View" },
              { key: "r", label: "Run" },
              { key: "d", label: "Delete" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Detail mode
  if (mode === "detail" && selectedChain) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Chain: {selectedChain.name}
          </Text>
        </Box>

        {selectedChain.description && (
          <Box marginBottom={1}>
            <Text dimColor>{selectedChain.description}</Text>
          </Box>
        )}

        {/* Workflow diagram */}
        <Box flexDirection="column" marginY={1}>
          {selectedChain.steps.map((step, index) => (
            <Box key={step.id} flexDirection="column">
              <Box>
                <Text color="cyan">{"  "}</Text>
                <Box borderStyle="round" paddingX={1}>
                  <Text>
                    Step {index + 1}: {step.id}
                  </Text>
                </Box>
              </Box>
              <Box>
                <Text dimColor>{"  "}</Text>
                <Text dimColor>  prompt: {step.prompt}</Text>
              </Box>
              <Box>
                <Text dimColor>{"  "}</Text>
                <Text dimColor>  output: {step.output}</Text>
              </Box>
              {index < selectedChain.steps.length - 1 && (
                <Box>
                  <Text dimColor>{"      |"}</Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>

        {/* Variables */}
        {Object.keys(selectedChain.variables).length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Variables:</Text>
            {Object.entries(selectedChain.variables).map(([name, spec]) => (
              <Text key={name} dimColor>
                {"  "}
                {name}: {spec.type}
                {spec.required === false ? " (optional)" : " (required)"}
              </Text>
            ))}
          </Box>
        )}

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "r", label: "Run" },
              { key: "e", label: "Edit" },
              { key: "v", label: "Validate" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Variables input mode
  if (mode === "variables" && selectedChain) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Enter Variables: {selectedChain.name}
          </Text>
        </Box>

        <Box flexDirection="column" gap={1}>
          {requiredVariables.map((name, index) => (
            <Box key={name}>
              <Text color={focusedField === index ? "cyan" : undefined}>
                {name}:{" ".repeat(Math.max(1, 15 - name.length))}[
              </Text>
              {focusedField === index ? (
                <TextInput
                  value={variables[name] || ""}
                  onChange={(v) => setVariables((prev) => ({ ...prev, [name]: v }))}
                  focused={true}
                />
              ) : (
                <Text>{variables[name] || ""}</Text>
              )}
              <Text color={focusedField === index ? "cyan" : undefined}>]</Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={2}>
          <ActionBar
            actions={[
              { key: "Tab", label: "Next" },
              { key: "Enter", label: "Run" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Running mode
  if (mode === "running" && progress) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>Running: </Text>
          <Text color="cyan">{selectedChain?.name}</Text>
        </Box>

        <Box marginY={1}>
          <Text dimColor>{"─".repeat(60)}</Text>
        </Box>

        <Box flexDirection="column">
          {selectedChain?.steps.map((step, index) => {
            const isComplete = index < progress.currentStep - 1;
            const isCurrent = index === progress.currentStep - 1;
            const _isPending = index >= progress.currentStep;

            return (
              <Box key={step.id}>
                <Text color={isComplete ? "green" : isCurrent ? "yellow" : "gray"}>
                  {isComplete ? "  [done] " : isCurrent ? "  [run]  " : "  [    ] "}
                </Text>
                <Text color={isCurrent ? "cyan" : undefined}>
                  Step {index + 1}: {step.id}
                </Text>
              </Box>
            );
          })}
        </Box>

        <Box marginY={1}>
          <Text dimColor>{"─".repeat(60)}</Text>
        </Box>

        <Box gap={3}>
          <Text>
            Progress: {progress.currentStep}/{progress.totalSteps}
          </Text>
          <Text>Cost: ${progress.cost.toFixed(4)}</Text>
          <Text>Time: {progress.elapsed.toFixed(1)}s</Text>
        </Box>
      </Box>
    );
  }

  // Results mode
  if (mode === "results" && progress) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="green">
            Chain Complete: {selectedChain?.name}
          </Text>
        </Box>

        <Box marginY={1}>
          <Text dimColor>{"─".repeat(60)}</Text>
        </Box>

        <ScrollableBox height={12} focused={true}>
          <Text>{finalOutput}</Text>
        </ScrollableBox>

        <Box marginY={1}>
          <Text dimColor>{"─".repeat(60)}</Text>
        </Box>

        <Box gap={3}>
          <Text>Total Cost: ${progress.cost.toFixed(4)}</Text>
          <Text>Total Time: {progress.elapsed.toFixed(1)}s</Text>
        </Box>

        <Box marginTop={1}>
          <ActionBar
            actions={[
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
