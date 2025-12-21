/**
 * Benchmark Screen - Interactive benchmark testing dashboard
 *
 * Features:
 * - Browse and select benchmark YAML files
 * - Configure model and concurrency before run
 * - Real-time progress with pass/fail indicators
 * - Summary view with all test results
 * - Per-test timing and cost breakdown
 */

import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { useAppState } from "../context/app-context.js";
import { ActionBar } from "../components/layout/action-bar.js";
import { ScrollableBox } from "../components/input/scrollable-box.js";
import { safeBorderStyle } from "../components/theme.js";

type BenchmarkMode = "select" | "configure" | "running" | "results";

interface BenchmarkFile {
  name: string;
  path: string;
  testCount: number;
}

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  cost: number;
  error?: string;
}

interface BenchmarkConfig {
  model: string;
  parallel: number;
}

const MODELS = ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet", "claude-3-haiku"];

// Simulated benchmark files
const SAMPLE_BENCHMARKS: BenchmarkFile[] = [
  { name: "coding.yaml", path: "tests/coding.yaml", testCount: 5 },
  { name: "analysis.yaml", path: "tests/analysis.yaml", testCount: 3 },
  { name: "creative.yaml", path: "tests/creative.yaml", testCount: 8 },
];

export const BenchmarkScreen: React.FC = () => {
  const { actions } = useAppState();
  const [mode, setMode] = useState<BenchmarkMode>("select");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedBenchmark, setSelectedBenchmark] = useState<BenchmarkFile | null>(null);
  const [config, setConfig] = useState<BenchmarkConfig>({
    model: "gpt-4o",
    parallel: 3,
  });
  const [modelIndex, setModelIndex] = useState(0);
  const [focusedField, setFocusedField] = useState(0);
  const [results, setResults] = useState<TestResult[]>([]);
  const [runningTest, setRunningTest] = useState<string | null>(null);

  // Generate simulated test names for selected benchmark
  const testNames = useMemo(() => {
    if (!selectedBenchmark) return [];
    return Array.from({ length: selectedBenchmark.testCount }, (_, i) => `test-${i + 1}`);
  }, [selectedBenchmark]);

  // Run benchmark simulation
  const runBenchmark = async () => {
    if (!selectedBenchmark) return;

    setMode("running");
    setResults([]);

    const newResults: TestResult[] = [];

    for (const testName of testNames) {
      setRunningTest(testName);

      // Simulate test execution
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));

      const passed = Math.random() > 0.2; // 80% pass rate
      const duration = 1 + Math.random() * 3;
      const cost = 0.001 + Math.random() * 0.003;

      newResults.push({
        name: testName,
        passed,
        duration,
        cost,
        error: passed ? undefined : "Assertion failed: missing expected output",
      });

      setResults([...newResults]);
    }

    setRunningTest(null);
    setMode("results");
  };

  // Calculate totals
  const totals = useMemo(() => {
    return {
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      duration: results.reduce((acc, r) => acc + r.duration, 0),
      cost: results.reduce((acc, r) => acc + r.cost, 0),
    };
  }, [results]);

  // Keyboard input handling
  useInput((input, key) => {
    if (key.escape) {
      if (mode === "configure") {
        setMode("select");
      } else if (mode === "results") {
        setMode("configure");
      } else {
        actions.goBack();
      }
      return;
    }

    if (mode === "select") {
      if (key.upArrow || input === "k") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === "j") {
        setSelectedIndex((prev) => Math.min(SAMPLE_BENCHMARKS.length - 1, prev + 1));
      } else if (key.return) {
        setSelectedBenchmark(SAMPLE_BENCHMARKS[selectedIndex]);
        setMode("configure");
      } else if (input === "v") {
        actions.showNotification({
          type: "info",
          message: "Viewing benchmark tests",
        });
      }
      return;
    }

    if (mode === "configure") {
      if (key.upArrow) {
        setFocusedField((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || key.tab) {
        setFocusedField((prev) => Math.min(1, prev + 1));
      } else if (key.return) {
        void runBenchmark();
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

      // Parallel count
      if (focusedField === 1) {
        if (key.leftArrow) {
          setConfig((c) => ({ ...c, parallel: Math.max(1, c.parallel - 1) }));
        } else if (key.rightArrow) {
          setConfig((c) => ({ ...c, parallel: Math.min(10, c.parallel + 1) }));
        }
      }
      return;
    }

    if (mode === "results") {
      if (input === "r") {
        void runBenchmark();
      } else if (input === "s") {
        actions.showNotification({
          type: "success",
          message: "Results saved",
        });
      } else if (input === "c") {
        actions.showNotification({
          type: "info",
          message: "Compare with previous run",
        });
      }
      return;
    }
  });

  // Select mode
  if (mode === "select") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle={safeBorderStyle} paddingX={2}>
          <Text bold color="cyan">
            Benchmark Suites
          </Text>
        </Box>

        <Box flexDirection="column">
          {SAMPLE_BENCHMARKS.map((benchmark, index) => (
            <Text
              key={benchmark.path}
              inverse={index === selectedIndex}
              color={index === selectedIndex ? "white" : undefined}
            >
              {index === selectedIndex ? "> " : "  "}
              {benchmark.name.padEnd(25)}
              {benchmark.testCount} tests
            </Text>
          ))}
        </Box>

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "Enter", label: "Run" },
              { key: "v", label: "View Tests" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Configure mode
  if (mode === "configure" && selectedBenchmark) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle={safeBorderStyle} paddingX={2}>
          <Text bold color="cyan">
            Configure: {selectedBenchmark.name}
          </Text>
        </Box>

        <Box flexDirection="column" gap={1}>
          <Box>
            <Text color={focusedField === 0 ? "cyan" : undefined}>
              Model: [{config.model.padEnd(20)}]
            </Text>
            {focusedField === 0 && <Text dimColor> (left/right to change)</Text>}
          </Box>

          <Box>
            <Text color={focusedField === 1 ? "cyan" : undefined}>
              Parallel: [{String(config.parallel).padEnd(20)}]
            </Text>
            {focusedField === 1 && <Text dimColor> (left/right to change)</Text>}
          </Box>
        </Box>

        <Box marginTop={2} gap={2}>
          <Box borderStyle={safeBorderStyle} borderColor="green" paddingX={2}>
            <Text color="green" bold>
              [Enter] Run Benchmark
            </Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "Arrow", label: "Adjust" },
              { key: "Enter", label: "Run" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Running mode
  if (mode === "running" && selectedBenchmark) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>Running: </Text>
          <Text color="cyan">
            {selectedBenchmark.name} ({config.model})
          </Text>
        </Box>

        <Box marginY={1}>
          <Text dimColor>{"-".repeat(60)}</Text>
        </Box>

        <Box flexDirection="column">
          {testNames.map((name, index) => {
            const result = results[index];
            const isRunning = name === runningTest;
            const _isPending = !result && !isRunning;

            let icon = "  ";
            let color: string | undefined = "gray";

            if (result) {
              icon = result.passed ? "  [pass] " : "  [fail] ";
              color = result.passed ? "green" : "red";
            } else if (isRunning) {
              icon = "  [run]  ";
              color = "yellow";
            } else {
              icon = "  [    ] ";
            }

            return (
              <Box key={name}>
                <Text color={color}>{icon}</Text>
                <Text color={isRunning ? "cyan" : undefined}>
                  {name}
                  {result && (
                    <Text dimColor>
                      {"  "}
                      {result.duration.toFixed(1)}s
                    </Text>
                  )}
                </Text>
              </Box>
            );
          })}
        </Box>

        <Box marginY={1}>
          <Text dimColor>{"-".repeat(60)}</Text>
        </Box>

        <Box gap={3}>
          <Text>
            Progress: {results.length}/{testNames.length} passed
          </Text>
          <Text>Cost: ${totals.cost.toFixed(4)}</Text>
        </Box>
      </Box>
    );
  }

  // Results mode
  if (mode === "results" && selectedBenchmark) {
    const passRate = Math.round((totals.passed / results.length) * 100);

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color={totals.failed === 0 ? "green" : "yellow"}>
            Benchmark Complete: {selectedBenchmark.name}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text>
            Results: {totals.passed}/{results.length} passed ({passRate}%)
          </Text>
        </Box>

        <Box marginY={1}>
          <Text dimColor>{"═".repeat(60)}</Text>
        </Box>

        <ScrollableBox height={10} focused={true}>
          {results.map((result) => (
            <Box key={result.name} flexDirection="column">
              <Box>
                <Text color={result.passed ? "green" : "red"}>
                  {result.passed ? "  [pass] " : "  [fail] "}
                </Text>
                <Text>{result.name}</Text>
                <Text dimColor>
                  {"  "}
                  {result.duration.toFixed(1)}s {"  "}${result.cost.toFixed(4)}
                </Text>
              </Box>
              {result.error && (
                <Text color="red" dimColor>
                  {"         "}
                  {result.error}
                </Text>
              )}
            </Box>
          ))}
        </ScrollableBox>

        <Box marginY={1}>
          <Text dimColor>{"-".repeat(60)}</Text>
        </Box>

        <Box gap={3}>
          <Text>Total: {totals.duration.toFixed(1)}s</Text>
          <Text>${totals.cost.toFixed(4)}</Text>
        </Box>

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "s", label: "Save" },
              { key: "c", label: "Compare" },
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
