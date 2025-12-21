import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { safeBorderStyle } from "../theme";

export interface ModelPricing {
  name: string;
  inputCostPerMToken: number; // Cost per 1M input tokens
  outputCostPerMToken: number; // Cost per 1M output tokens
}

export interface CostCalculatorProps {
  models: ModelPricing[];
  initialModelIndex?: number;
  initialInputTokens?: number;
  initialOutputTokens?: number;
  initialBatchCount?: number;
}

export const CostCalculator: React.FC<CostCalculatorProps> = ({
  models,
  initialModelIndex = 0,
  initialInputTokens = 1000,
  initialOutputTokens = 500,
  initialBatchCount = 1,
}) => {
  const [selectedModelIndex, setSelectedModelIndex] = useState(initialModelIndex);
  const [inputTokens, setInputTokens] = useState(initialInputTokens);
  const [outputTokens, setOutputTokens] = useState(initialOutputTokens);
  const [batchCount, setBatchCount] = useState(initialBatchCount);
  const [activeField, setActiveField] = useState<"model" | "input" | "output" | "batch">("model");

  useInput((input, key) => {
    // Tab to switch fields
    if (key.tab) {
      const fields: ("model" | "input" | "output" | "batch")[] = [
        "model",
        "input",
        "output",
        "batch",
      ];
      const currentIndex = fields.indexOf(activeField);
      const nextIndex = (currentIndex + 1) % fields.length;
      setActiveField(fields[nextIndex]);
      return;
    }

    switch (activeField) {
      case "model":
        if (key.upArrow) {
          setSelectedModelIndex((prev) => Math.max(0, prev - 1));
        } else if (key.downArrow) {
          setSelectedModelIndex((prev) => Math.min(models.length - 1, prev + 1));
        }
        break;

      case "input":
        if (key.upArrow) {
          setInputTokens((prev) => prev + 100);
        } else if (key.downArrow) {
          setInputTokens((prev) => Math.max(0, prev - 100));
        }
        break;

      case "output":
        if (key.upArrow) {
          setOutputTokens((prev) => prev + 100);
        } else if (key.downArrow) {
          setOutputTokens((prev) => Math.max(0, prev - 100));
        }
        break;

      case "batch":
        if (key.upArrow) {
          setBatchCount((prev) => prev + 1);
        } else if (key.downArrow) {
          setBatchCount((prev) => Math.max(1, prev - 1));
        }
        break;
    }
  });

  const selectedModel = models[selectedModelIndex];

  const calculateCost = (): number => {
    const inputCost = (inputTokens / 1_000_000) * selectedModel.inputCostPerMToken;
    const outputCost = (outputTokens / 1_000_000) * selectedModel.outputCostPerMToken;
    return (inputCost + outputCost) * batchCount;
  };

  const totalCost = calculateCost();

  const renderSlider = (value: number, max: number, width = 30): string => {
    const filled = Math.round((value / max) * width);
    return "█".repeat(filled) + "░".repeat(width - filled);
  };

  return (
    <Box flexDirection="column" borderStyle={safeBorderStyle} paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold>Cost Calculator</Text>
      </Box>

      {/* Model Selector */}
      <Box flexDirection="column" marginBottom={1}>
        <Text>Model: {activeField === "model" && <Text color="cyan">(use j/k)</Text>}</Text>
        {models.map((model, index) => (
          <Box key={index} marginLeft={2}>
            <Text color={selectedModelIndex === index ? "green" : undefined}>
              {selectedModelIndex === index ? "> " : "  "}
              {model.name}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Input Tokens */}
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          Input Tokens: {inputTokens.toLocaleString()}{" "}
          {activeField === "input" && <Text color="cyan">(use j/k)</Text>}
        </Text>
        <Box marginLeft={2}>
          <Text dimColor>{renderSlider(inputTokens, 10000)}</Text>
        </Box>
      </Box>

      {/* Output Tokens */}
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          Output Tokens: {outputTokens.toLocaleString()}{" "}
          {activeField === "output" && <Text color="cyan">(use j/k)</Text>}
        </Text>
        <Box marginLeft={2}>
          <Text dimColor>{renderSlider(outputTokens, 5000)}</Text>
        </Box>
      </Box>

      {/* Batch Count */}
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          Batch Count: {batchCount}{" "}
          {activeField === "batch" && <Text color="cyan">(use j/k)</Text>}
        </Text>
      </Box>

      {/* Cost Breakdown */}
      <Box flexDirection="column" borderStyle={safeBorderStyle} paddingX={1} marginTop={1}>
        <Text bold>Cost Breakdown:</Text>
        <Text dimColor>
          Input: ${((inputTokens / 1_000_000) * selectedModel.inputCostPerMToken).toFixed(6)}
        </Text>
        <Text dimColor>
          Output: ${((outputTokens / 1_000_000) * selectedModel.outputCostPerMToken).toFixed(6)}
        </Text>
        <Text dimColor>Per Request: ${(totalCost / batchCount).toFixed(6)}</Text>
        <Box marginTop={1}>
          <Text bold color="green">
            Total Cost: ${totalCost.toFixed(4)}
          </Text>
        </Box>
      </Box>

      {/* Controls Help */}
      <Box marginTop={1}>
        <Text dimColor>Tab: Switch field | j/k: Adjust value</Text>
      </Box>
    </Box>
  );
};
