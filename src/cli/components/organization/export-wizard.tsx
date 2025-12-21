/**
 * ExportWizard Component - Interactive export configuration wizard
 *
 * Features:
 * - Format selection (JSON/YAML)
 * - Tag filter (multi-select)
 * - Include history toggle
 * - Output path input
 * - Preview of what will be exported
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useEffectRun, useEffectCallback } from "../../context";
import { ExportService, TagService, type ExportOptions } from "../../../services";
import { TextInput } from "../input/text-input";
import { homedir } from "node:os";
import { join } from "node:path";
import { safeBorderStyle } from "../theme";

export interface ExportWizardProps {
  onExit?: () => void;
  onComplete?: (path: string) => void;
}

type Step = "format" | "tags" | "history" | "path" | "preview" | "confirm";

export const ExportWizard: React.FC<ExportWizardProps> = ({ onExit, onComplete }) => {
  const [step, setStep] = useState<Step>("format");
  const [format, setFormat] = useState<"json" | "yaml">("json");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [outputPath, setOutputPath] = useState(join(homedir(), "grimoire-export.json"));
  const [tagSelectionIndex, setTagSelectionIndex] = useState(0);
  const [previewData, setPreviewData] = useState("");
  const [exporting, setExporting] = useState(false);

  // Load available tags
  const { result: availableTags, loading: loadingTags } = useEffectRun(
    Effect.gen(function* () {
      const tagService = yield* TagService;
      return yield* tagService.listTags();
    }),
    []
  );

  // Generate preview
  const { execute: generatePreview } = useEffectCallback(() =>
    Effect.gen(function* () {
      const exportService = yield* ExportService;
      const options: ExportOptions = {
        format,
        includeHistory,
        prettyPrint: true,
      };

      let content: string;
      if (selectedTags.length > 0) {
        content = yield* exportService.exportByTags(selectedTags, options);
      } else {
        content = yield* exportService.exportAll(options);
      }

      return content;
    })
  );

  // Perform export
  const { execute: performExport } = useEffectCallback(() =>
    Effect.gen(function* () {
      const exportService = yield* ExportService;
      const options: ExportOptions = {
        format,
        includeHistory,
        prettyPrint: true,
      };

      let content: string;
      if (selectedTags.length > 0) {
        content = yield* exportService.exportByTags(selectedTags, options);
      } else {
        content = yield* exportService.exportAll(options);
      }

      yield* exportService.writeToFile(content, outputPath);
      return outputPath;
    })
  );

  // Update output path extension when format changes
  useEffect(() => {
    const extension = format === "json" ? ".json" : ".yaml";
    setOutputPath((prev) => {
      const withoutExt = prev.replace(/\.(json|yaml|yml)$/, "");
      return withoutExt + extension;
    });
  }, [format]);

  // Generate preview when entering preview step
  useEffect(() => {
    if (step === "preview") {
      void generatePreview().then((content) => {
        // Show first 500 characters of preview
        setPreviewData(content.slice(0, 500));
      });
    }
  }, [step]);

  const toggleTag = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]
    );
  };

  useInput(
    (input, key) => {
      if (key.escape || input === "q") {
        onExit?.();
        return;
      }

      if (step === "format") {
        if (key.upArrow || key.downArrow || input === " ") {
          setFormat((prev) => (prev === "json" ? "yaml" : "json"));
        } else if (key.return) {
          setStep("tags");
        }
      } else if (step === "tags") {
        if (key.upArrow || input === "k") {
          setTagSelectionIndex((prev) => Math.max(0, prev - 1));
        } else if (key.downArrow || input === "j") {
          setTagSelectionIndex((prev) => Math.min((availableTags?.length ?? 1) - 1, prev + 1));
        } else if (input === " ") {
          const tag = availableTags?.[tagSelectionIndex];
          if (tag) {
            toggleTag(tag.name);
          }
        } else if (key.return) {
          setStep("history");
        } else if (input === "a") {
          // Select all
          setSelectedTags(availableTags?.map((t) => t.name) ?? []);
        } else if (input === "n") {
          // Select none
          setSelectedTags([]);
        }
      } else if (step === "history") {
        if (input === " " || key.upArrow || key.downArrow) {
          setIncludeHistory((prev) => !prev);
        } else if (key.return) {
          setStep("path");
        }
      } else if (step === "path") {
        if (key.return) {
          setStep("preview");
        }
        // Path editing handled by TextInput
      } else if (step === "preview") {
        if (key.return) {
          setStep("confirm");
        } else if (input === "b") {
          setStep("path");
        }
      } else if (step === "confirm") {
        if (input === "y" || input === "Y") {
          setExporting(true);
          performExport()
            .then((path) => {
              onComplete?.(path);
            })
            .catch((error) => {
              console.error("Export failed:", error);
              setExporting(false);
            });
        } else if (input === "n" || input === "N") {
          setStep("format");
        }
      }
    },
    { isActive: true }
  );

  if (loadingTags) {
    return <Text>Loading tags...</Text>;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Export Wizard</Text>
      </Box>

      {/* Progress indicator */}
      <Box marginBottom={1}>
        <Text color="gray">
          Step {["format", "tags", "history", "path", "preview", "confirm"].indexOf(step) + 1} of 6
        </Text>
      </Box>

      {/* Format Selection */}
      {step === "format" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Select export format:</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color={format === "json" ? "green" : undefined} bold={format === "json"}>
              {format === "json" ? "> " : "  "}
              JSON
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text color={format === "yaml" ? "green" : undefined} bold={format === "yaml"}>
              {format === "yaml" ? "> " : "  "}
              YAML
            </Text>
          </Box>
          <Text color="gray">j/k/Space toggle | Enter next</Text>
        </Box>
      )}

      {/* Tag Selection */}
      {step === "tags" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Filter by tags (optional):</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="gray">
              Selected: {selectedTags.length === 0 ? "All prompts" : selectedTags.join(", ")}
            </Text>
          </Box>
          <Box flexDirection="column" marginBottom={1}>
            {availableTags?.map((tag, index) => {
              const isSelected = selectedTags.includes(tag.name);
              const isCursor = index === tagSelectionIndex;
              return (
                <Box key={tag.name}>
                  <Text color={isCursor ? "green" : undefined} bold={isCursor}>
                    {isCursor ? "> " : "  "}[{isSelected ? "x" : " "}] {tag.name} ({tag.count})
                  </Text>
                </Box>
              );
            })}
          </Box>
          <Text color="gray">k/j navigate | Space toggle | a all | n none | Enter next</Text>
        </Box>
      )}

      {/* History Option */}
      {step === "history" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Include version history?</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color={includeHistory ? "green" : undefined}>
              [{includeHistory ? "x" : " "}] Include version history
            </Text>
          </Box>
          <Text color="gray">Space toggle | Enter next</Text>
        </Box>
      )}

      {/* Output Path */}
      {step === "path" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Output file path:</Text>
          </Box>
          <Box marginBottom={1}>
            <TextInput value={outputPath} onChange={setOutputPath} focused={true} />
          </Box>
          <Text color="gray">Enter next</Text>
        </Box>
      )}

      {/* Preview */}
      {step === "preview" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>Export Preview:</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="gray">Format: </Text>
            <Text>{format.toUpperCase()}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="gray">Tags: </Text>
            <Text>{selectedTags.length === 0 ? "All" : selectedTags.join(", ")}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="gray">History: </Text>
            <Text>{includeHistory ? "Yes" : "No"}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="gray">Output: </Text>
            <Text>{outputPath}</Text>
          </Box>
          <Box marginBottom={1} paddingX={1} borderStyle={safeBorderStyle}>
            <Text color="gray" dimColor>
              {previewData}
              {previewData.length >= 500 && "\n..."}
            </Text>
          </Box>
          <Text color="gray">Enter continue | b back</Text>
        </Box>
      )}

      {/* Confirmation */}
      {step === "confirm" && (
        <Box flexDirection="column">
          {exporting ? (
            <Text>Exporting...</Text>
          ) : (
            <>
              <Box marginBottom={1}>
                <Text color="yellow">Ready to export to: {outputPath}</Text>
              </Box>
              <Text color="gray">Press y to confirm, n to restart</Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
};
