/**
 * ImportWizard Component - Interactive import wizard with conflict resolution
 *
 * Features:
 * - Source input (file/URL)
 * - Validation status
 * - Conflict list with diffs
 * - Strategy selection per-conflict
 * - Summary before import
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useEffectCallback } from "../../context";
import { ImportService, type ConflictStrategy, type ImportPreview } from "../../../services";
import { TextInput } from "../input/text-input";
import { ScrollableBox } from "../input/scrollable-box";
import { getSelectionProps } from "../theme";

export interface ImportWizardProps {
  onExit?: () => void;
  onComplete?: (imported: number) => void;
}

type Step = "source" | "validating" | "conflicts" | "strategy" | "confirm" | "importing";

export const ImportWizard: React.FC<ImportWizardProps> = ({ onExit, onComplete }) => {
  const [step, setStep] = useState<Step>("source");
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<ConflictStrategy>("skip");
  const [selectedConflictIndex, setSelectedConflictIndex] = useState(0);

  // Preview import mutation
  const { execute: previewImport, loading: _previewing } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!source.trim()) {
        return null;
      }
      const importService = yield* ImportService;
      return yield* importService.preview(source.trim());
    })
  );

  // Perform import mutation
  const { execute: performImport, loading: _importing } = useEffectCallback(() =>
    Effect.gen(function* () {
      const importService = yield* ImportService;
      return yield* importService.import(source.trim(), strategy);
    })
  );

  // Validate source when entering validation step
  useEffect(() => {
    if (step === "validating") {
      setValidationError(null);
      previewImport()
        .then((previewResult) => {
          if (previewResult) {
            setPreview(previewResult);
            if (previewResult.conflicts.length > 0) {
              setStep("conflicts");
            } else if (previewResult.errors.length > 0) {
              setValidationError(previewResult.errors.join("\n"));
              setStep("source");
            } else {
              setStep("confirm");
            }
          }
        })
        .catch((error) => {
          setValidationError(String(error));
          setStep("source");
        });
    }
  }, [step]);

  useInput(
    (input, key) => {
      if (key.escape || input === "q") {
        if (step === "source" || step === "importing") {
          onExit?.();
        } else {
          setStep("source");
        }
        return;
      }

      if (step === "source") {
        if (key.return && source.trim()) {
          setStep("validating");
        }
        // Source editing handled by TextInput
      } else if (step === "conflicts") {
        if (key.upArrow || input === "k") {
          setSelectedConflictIndex((prev) => Math.max(0, prev - 1));
        } else if (key.downArrow || input === "j") {
          setSelectedConflictIndex((prev) =>
            Math.min((preview?.conflicts.length ?? 1) - 1, prev + 1)
          );
        } else if (key.return) {
          setStep("strategy");
        }
      } else if (step === "strategy") {
        if (key.upArrow || key.downArrow || input === " ") {
          setStrategy((prev) => {
            if (prev === "skip") return "rename";
            if (prev === "rename") return "overwrite";
            return "skip";
          });
        } else if (key.return) {
          setStep("confirm");
        }
      } else if (step === "confirm") {
        if (input === "y" || input === "Y") {
          setStep("importing");
          performImport()
            .then((result) => {
              onComplete?.(result.imported);
            })
            .catch((error) => {
              setValidationError(String(error));
              setStep("source");
            });
        } else if (input === "n" || input === "N") {
          setStep("source");
        }
      }
    },
    { isActive: step !== "validating" && step !== "importing" }
  );

  const strategyDescriptions: Record<ConflictStrategy, string> = {
    skip: "Skip conflicting prompts (keep existing)",
    rename: "Rename incoming prompts (import as new)",
    overwrite: "Overwrite existing prompts (replace)",
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Import Wizard</Text>
      </Box>

      {/* Source Input */}
      {step === "source" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Enter import source (file path or URL):</Text>
          </Box>
          <Box marginBottom={1}>
            <TextInput
              value={source}
              onChange={setSource}
              placeholder="~/exports/prompts.json or https://..."
              focused={true}
            />
          </Box>
          {validationError && (
            <Box marginBottom={1}>
              <Text color="red">Error: {validationError}</Text>
            </Box>
          )}
          <Box marginBottom={1}>
            <Text color="gray">Supports JSON and YAML formats</Text>
          </Box>
          <Text color="gray">Enter validate | Esc/q quit</Text>
        </Box>
      )}

      {/* Validating */}
      {step === "validating" && (
        <Box flexDirection="column">
          <Text>Validating import source...</Text>
        </Box>
      )}

      {/* Conflicts */}
      {step === "conflicts" && preview && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="yellow">
              Found {preview.conflicts.length} conflict{preview.conflicts.length !== 1 ? "s" : ""}
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text>
              New prompts: {preview.newPrompts} | Total: {preview.total}
            </Text>
          </Box>
          <ScrollableBox height={10} focused={true}>
            {preview.conflicts.map((conflict, index) => {
              const isSelected = index === selectedConflictIndex;
              return (
                <Box key={conflict.incomingId} flexDirection="column" marginBottom={1}>
                  <Text {...getSelectionProps(isSelected)}>
                    {isSelected ? "> " : "  "}
                    {conflict.name}
                  </Text>
                  <Box paddingLeft={2}>
                    <Text color="gray">Existing ID: {conflict.existingId}</Text>
                  </Box>
                  <Box paddingLeft={2}>
                    <Text color="gray">Incoming ID: {conflict.incomingId}</Text>
                  </Box>
                  <Box paddingLeft={2}>
                    <Text color={conflict.contentDiffers ? "yellow" : "gray"}>
                      Content: {conflict.contentDiffers ? "Different" : "Same"}
                    </Text>
                  </Box>
                </Box>
              );
            })}
          </ScrollableBox>
          <Text color="gray">k/j navigate | Enter choose strategy</Text>
        </Box>
      )}

      {/* Strategy Selection */}
      {step === "strategy" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Select conflict resolution strategy:</Text>
          </Box>
          <Box flexDirection="column" marginBottom={1}>
            {(["skip", "rename", "overwrite"] as ConflictStrategy[]).map((s) => (
              <Box key={s} marginBottom={1}>
                <Text color={strategy === s ? "green" : undefined} bold={strategy === s}>
                  {strategy === s ? "> " : "  "}
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
                <Text color="gray"> - {strategyDescriptions[s]}</Text>
              </Box>
            ))}
          </Box>
          <Text color="gray">j/k/Space toggle | Enter confirm</Text>
        </Box>
      )}

      {/* Confirmation */}
      {step === "confirm" && preview && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Import Summary:</Text>
          </Box>
          <Box marginBottom={1}>
            <Text>Source: {source}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text>Total prompts: {preview.total}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text>New prompts: {preview.newPrompts}</Text>
          </Box>
          {preview.conflicts.length > 0 && (
            <>
              <Box marginBottom={1}>
                <Text color="yellow">Conflicts: {preview.conflicts.length}</Text>
              </Box>
              <Box marginBottom={1}>
                <Text>Strategy: {strategy}</Text>
              </Box>
            </>
          )}
          {preview.errors.length > 0 && (
            <Box marginBottom={1}>
              <Text color="red">Errors: {preview.errors.length}</Text>
            </Box>
          )}
          <Text color="gray">Press y to import, n to cancel</Text>
        </Box>
      )}

      {/* Importing */}
      {step === "importing" && (
        <Box flexDirection="column">
          <Text>Importing prompts...</Text>
        </Box>
      )}
    </Box>
  );
};
