/**
 * Example usage of testing components
 * These examples demonstrate how to use each component in your CLI
 */

import React from "react";
import {
  StreamingOutput,
  CompareView,
  BenchmarkProgress,
  CostCalculator,
  type CompareResult,
  type BenchmarkTest,
  type ModelPricing,
} from "./index";

// Example 1: StreamingOutput
// Simulates streaming text from an LLM
async function* exampleStream() {
  const text = "This is a simulated streaming response from an LLM.";
  for (const char of text) {
    yield char;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export const StreamingExample = () => {
  const stream = exampleStream();
  return (
    <StreamingOutput
      stream={stream}
      onComplete={(text) => console.log("Complete:", text)}
      showCursor={true}
    />
  );
};

// Example 2: CompareView
// Compare multiple prompt outputs side by side
export const CompareExample = () => {
  const results: CompareResult[] = [
    {
      name: "prompt-a",
      content: "This is the response from prompt A.\nIt has multiple lines.\nAnd provides detailed output.",
      tokens: 423,
      duration: 2.3,
      cost: 0.0051,
    },
    {
      name: "prompt-b",
      content: "This is the response from prompt B.\nIt's slightly different.\nBut covers the same topic.",
      tokens: 398,
      duration: 2.1,
      cost: 0.0048,
    },
  ];

  return (
    <CompareView
      results={results}
      onVote={(index) => console.log("Voted for:", results[index].name)}
      onSkip={() => console.log("Skipped voting")}
      showVoting={true}
    />
  );
};

// Example 3: BenchmarkProgress
// Show progress of running benchmark tests
export const BenchmarkExample = () => {
  const tests: BenchmarkTest[] = [
    {
      id: "test-1",
      name: "Python Hello World",
      status: "passed",
      duration: 1.2,
    },
    {
      id: "test-2",
      name: "TypeScript Type",
      status: "passed",
      duration: 1.5,
    },
    {
      id: "test-3",
      name: "Complex Algorithm",
      status: "running",
    },
    {
      id: "test-4",
      name: "Error Handling",
      status: "pending",
    },
    {
      id: "test-5",
      name: "Documentation",
      status: "pending",
    },
  ];

  return (
    <BenchmarkProgress
      title="Code Generation Benchmark"
      tests={tests}
      currentTestId="test-3"
      currentTestMessage="Waiting for response..."
    />
  );
};

// Example 4: CostCalculator
// Interactive cost estimation tool
export const CostExample = () => {
  const models: ModelPricing[] = [
    {
      name: "gpt-4",
      inputCostPerMToken: 30,
      outputCostPerMToken: 60,
    },
    {
      name: "gpt-3.5-turbo",
      inputCostPerMToken: 0.5,
      outputCostPerMToken: 1.5,
    },
    {
      name: "claude-opus",
      inputCostPerMToken: 15,
      outputCostPerMToken: 75,
    },
  ];

  return (
    <CostCalculator
      models={models}
      initialModelIndex={0}
      initialInputTokens={1000}
      initialOutputTokens={500}
      initialBatchCount={10}
    />
  );
};
