import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ChainDefinition, ChainStep, ValidationResult } from "../../../services/chain-service";
import { ScrollableBox } from "../input/scrollable-box";

export interface ChainEditorProps {
  chain: ChainDefinition;
  validation?: ValidationResult;
  onAddStep?: () => void;
  onRemoveStep?: (stepId: string) => void;
  onEditStep?: (stepId: string) => void;
  onRunPreview?: () => void;
  onSave?: () => void;
  onExit?: () => void;
  height?: number;
}

export const ChainEditor: React.FC<ChainEditorProps> = ({
  chain,
  validation,
  onAddStep,
  onRemoveStep,
  onEditStep,
  onRunPreview,
  onSave,
  onExit,
  height = 15,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [view, setView] = useState<"steps" | "variables" | "validation">("steps");

  useInput((input, key) => {
    // Navigation
    if (input === "j" || key.downArrow) {
      setCurrentIndex((prev) =>
        Math.min(view === "steps" ? chain.steps.length - 1 : chain.steps.length, prev + 1)
      );
    }
    if (input === "k" || key.upArrow) {
      setCurrentIndex((prev) => Math.max(0, prev - 1));
    }

    // Add step
    if (input === "a" && onAddStep) {
      onAddStep();
    }

    // Delete step
    if (input === "d" && onRemoveStep && chain.steps[currentIndex]) {
      onRemoveStep(chain.steps[currentIndex].id);
      setCurrentIndex((prev) => Math.max(0, prev - 1));
    }

    // Edit step
    if (key.return && onEditStep && chain.steps[currentIndex]) {
      onEditStep(chain.steps[currentIndex].id);
    }

    // Run preview
    if (input === "p" && onRunPreview) {
      onRunPreview();
    }

    // Save
    if (input === "s" && onSave) {
      onSave();
    }

    // Switch views
    if (input === "1") {
      setView("steps");
      setCurrentIndex(0);
    }
    if (input === "2") {
      setView("variables");
      setCurrentIndex(0);
    }
    if (input === "3") {
      setView("validation");
      setCurrentIndex(0);
    }

    // Exit
    if (input === "q" && onExit) {
      onExit();
    }
  });

  const renderStep = (step: ChainStep, index: number) => {
    const isCurrent = index === currentIndex;
    const hasErrors = validation?.errors.some((err) => err.includes(step.id)) ?? false;

    return (
      <Box key={step.id} flexDirection="column" marginBottom={1}>
        <Box>
          <Text inverse={isCurrent} color={hasErrors ? "red" : undefined}>
            {index + 1}. {step.id} → {step.prompt}
          </Text>
        </Box>
        {isCurrent && (
          <Box marginLeft={3} flexDirection="column">
            <Text color="gray">
              Output: <Text color="cyan">{step.output}</Text>
            </Text>
            {step.dependsOn && step.dependsOn.length > 0 && (
              <Text color="gray">
                Depends on: <Text color="yellow">{step.dependsOn.join(", ")}</Text>
              </Text>
            )}
            {step.model && (
              <Text color="gray">
                Model: <Text color="magenta">{step.model}</Text>
              </Text>
            )}
            <Text color="gray">Variables:</Text>
            <Box marginLeft={2} flexDirection="column">
              {Object.entries(step.variables).map(([key, value]) => (
                <Text key={key} color="gray">
                  {key}: <Text color="green">{value.slice(0, 50)}</Text>
                </Text>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    );
  };

  const renderVariables = () => {
    const vars = Object.entries(chain.variables);

    if (vars.length === 0) {
      return <Text color="gray">No input variables defined</Text>;
    }

    return (
      <Box flexDirection="column">
        {vars.map(([name, spec]) => (
          <Box key={name} flexDirection="column" marginBottom={1}>
            <Text bold>
              {name}
              {spec.required && <Text color="red"> *</Text>}
            </Text>
            <Box marginLeft={2} flexDirection="column">
              <Text color="gray">
                Type: <Text color="cyan">{spec.type}</Text>
              </Text>
              {spec.default !== undefined && (
                <Text color="gray">
                  Default:{" "}
                  <Text color="green">{JSON.stringify(spec.default)}</Text>
                </Text>
              )}
              {spec.description && <Text color="gray">Description: {spec.description}</Text>}
            </Box>
          </Box>
        ))}
      </Box>
    );
  };

  const renderValidation = () => {
    if (!validation) {
      return <Text color="gray">No validation results available</Text>;
    }

    return (
      <Box flexDirection="column">
        <Text bold color={validation.isValid ? "green" : "red"}>
          {validation.isValid ? "✓ Chain is valid" : "✗ Chain has errors"}
        </Text>

        {validation.errors.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color="red">
              Errors:
            </Text>
            {validation.errors.map((error, idx) => (
              <Text key={idx} color="red">
                • {error}
              </Text>
            ))}
          </Box>
        )}

        {validation.warnings.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">
              Warnings:
            </Text>
            {validation.warnings.map((warning, idx) => (
              <Text key={idx} color="yellow">
                • {warning}
              </Text>
            ))}
          </Box>
        )}

        {validation.isValid && (
          <Box marginTop={1}>
            <Text color="green">All checks passed! Chain is ready to execute.</Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderHeader = () => {
    return (
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="cyan">
          Chain Editor: {chain.name}
        </Text>
        {chain.description && <Text color="gray">{chain.description}</Text>}
        <Box marginTop={1}>
          <Text inverse={view === "steps"} color={view === "steps" ? "cyan" : "gray"}>
            {" "}
            1. Steps ({chain.steps.length}){" "}
          </Text>
          <Text> </Text>
          <Text inverse={view === "variables"} color={view === "variables" ? "cyan" : "gray"}>
            {" "}
            2. Variables ({Object.keys(chain.variables).length}){" "}
          </Text>
          <Text> </Text>
          <Text inverse={view === "validation"} color={view === "validation" ? "cyan" : "gray"}>
            {" "}
            3. Validation{" "}
          </Text>
        </Box>
      </Box>
    );
  };

  const renderHelp = () => {
    return (
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          1/2/3: switch view | j/k: navigate | a: add step | d: delete step | Enter: edit | p:
          preview | s: save | q: quit
        </Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {renderHeader()}

      <ScrollableBox height={height} focused={true} showScrollIndicator={true}>
        {view === "steps" &&
          (chain.steps.length === 0 ? (
            <Text color="gray">No steps defined. Press {`'a'`} to add one.</Text>
          ) : (
            <Box flexDirection="column">
              {chain.steps.map((step, idx) => renderStep(step, idx))}
            </Box>
          ))}
        {view === "variables" && renderVariables()}
        {view === "validation" && renderValidation()}
      </ScrollableBox>

      {renderHelp()}
    </Box>
  );
};
