/**
 * Templates Screen - Template management dashboard
 *
 * Features:
 * - Dedicated templates view showing all templates
 * - Variables displayed for each template
 * - Interactive form for filling variables
 * - Live preview of output as variables are entered
 * - Can set output prompt name
 * - Created prompt saved to storage
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
import type { Prompt } from "../../models/prompt.js";

type TemplateMode = "list" | "apply" | "preview";

/**
 * Extract variables from template content ({{variable}} syntax)
 */
const extractVariables = (content: string): string[] => {
  const matches = content.match(/\{\{([^}]+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2).trim()))];
};

/**
 * Apply variables to template content
 */
const applyVariables = (
  content: string,
  variables: Record<string, string>
): string => {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
};

export const TemplatesScreen: React.FC = () => {
  const { actions } = useAppState();
  const [mode, setMode] = useState<TemplateMode>("list");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<Prompt | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [outputName, setOutputName] = useState("");
  const [focusedField, setFocusedField] = useState(0);

  // Fetch all templates
  const { result: prompts, loading } = useEffectRun(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.getAll;
    }),
    []
  );

  // Filter to only templates
  const templates = useMemo(() => {
    if (!prompts) return [];
    return prompts.filter((p) => p.isTemplate);
  }, [prompts]);

  // Get variables for selected template
  const templateVariables = useMemo(() => {
    if (!selectedTemplate) return [];
    return extractVariables(selectedTemplate.content);
  }, [selectedTemplate]);

  // Preview content with variables applied
  const previewContent = useMemo(() => {
    if (!selectedTemplate) return "";
    return applyVariables(selectedTemplate.content, variables);
  }, [selectedTemplate, variables]);

  // Save prompt callback
  const { execute: savePrompt } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!selectedTemplate || !outputName) return;

      const storage = yield* StorageService;

      yield* storage.create({
        name: outputName,
        content: previewContent,
        tags: selectedTemplate.tags ? [...selectedTemplate.tags] : undefined,
        isTemplate: false,
      });

      actions.showNotification({
        type: "success",
        message: `Created prompt: ${outputName}`,
      });

      setMode("list");
      setSelectedTemplate(null);
      setVariables({});
      setOutputName("");
    })
  );

  // Keyboard input handling
  useInput((input, key) => {
    if (key.escape) {
      if (mode === "apply" || mode === "preview") {
        setMode("list");
        setSelectedTemplate(null);
        setVariables({});
        setOutputName("");
      } else {
        actions.goBack();
      }
      return;
    }

    if (mode === "list") {
      if (!templates || templates.length === 0) return;

      if (key.upArrow || input === "k") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === "j") {
        setSelectedIndex((prev) => Math.min(templates.length - 1, prev + 1));
      } else if (key.return || input === "a") {
        setSelectedTemplate(templates[selectedIndex]);
        setOutputName(`from-${templates[selectedIndex].name}`);
        setMode("apply");
      } else if (input === "v") {
        actions.navigate({ name: "view", promptId: templates[selectedIndex].id });
      } else if (input === "e") {
        actions.navigate({ name: "edit", promptId: templates[selectedIndex].id });
      } else if (input === "n") {
        actions.navigate({ name: "edit" });
      }
      return;
    }

    if (mode === "apply") {
      const totalFields = templateVariables.length + 1; // variables + output name

      if (key.upArrow) {
        setFocusedField((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || key.tab) {
        setFocusedField((prev) => Math.min(totalFields - 1, prev + 1));
      } else if (input === "p") {
        setMode("preview");
      } else if (key.return && focusedField === totalFields - 1) {
        void savePrompt();
      }
      return;
    }

    if (mode === "preview") {
      if (input === "c") {
        void savePrompt();
      }
      return;
    }
  });

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading templates...</Text>
      </Box>
    );
  }

  // List mode
  if (mode === "list") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle="single" paddingX={2}>
          <Text bold color="cyan">
            Templates
          </Text>
        </Box>

        {templates.length === 0 ? (
          <Box flexDirection="column" marginY={2}>
            <Text color="yellow">No templates found.</Text>
            <Text dimColor>Create a template by setting isTemplate: true</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            {templates.map((template, index) => {
              const isSelected = index === selectedIndex;
              const vars = extractVariables(template.content);

              return (
                <Box key={template.id} flexDirection="column">
                  <Text
                    inverse={isSelected}
                    color={isSelected ? "white" : undefined}
                  >
                    {isSelected ? "> " : "  "}
                    <Text color="yellow">[T] </Text>
                    {template.name}
                  </Text>
                  {vars.length > 0 && (
                    <Text dimColor>
                      {"    "}Variables: {vars.map((v) => `{{${v}}}`).join(", ")}
                    </Text>
                  )}
                </Box>
              );
            })}
          </Box>
        )}

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "Enter/a", label: "Apply" },
              { key: "v", label: "View" },
              { key: "e", label: "Edit" },
              { key: "n", label: "New" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Apply mode
  if (mode === "apply" && selectedTemplate) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle="single" paddingX={2}>
          <Text bold color="cyan">
            Apply Template: {selectedTemplate.name}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text>Fill in template variables:</Text>
        </Box>

        <Box flexDirection="column" gap={1}>
          {templateVariables.map((variable, index) => (
            <Box key={variable}>
              <Text color={focusedField === index ? "cyan" : undefined}>
                {variable}:{" ".repeat(Math.max(1, 15 - variable.length))}[
              </Text>
              {focusedField === index ? (
                <TextInput
                  value={variables[variable] || ""}
                  onChange={(v) =>
                    setVariables((prev) => ({ ...prev, [variable]: v }))
                  }
                  focused={true}
                />
              ) : (
                <Text>{variables[variable] || ""}</Text>
              )}
              <Text color={focusedField === index ? "cyan" : undefined}>]</Text>
            </Box>
          ))}

          {/* Output name field */}
          <Box marginTop={1}>
            <Text
              color={focusedField === templateVariables.length ? "cyan" : undefined}
            >
              Output name:{" ".repeat(4)}[
            </Text>
            {focusedField === templateVariables.length ? (
              <TextInput
                value={outputName}
                onChange={setOutputName}
                focused={true}
              />
            ) : (
              <Text>{outputName}</Text>
            )}
            <Text
              color={focusedField === templateVariables.length ? "cyan" : undefined}
            >
              ]
            </Text>
          </Box>
        </Box>

        {/* Mini preview */}
        <Box marginTop={2} flexDirection="column">
          <Text bold>Preview:</Text>
          <Box borderStyle="single" paddingX={1} marginTop={1}>
            <Text dimColor>
              {previewContent.slice(0, 200)}
              {previewContent.length > 200 ? "..." : ""}
            </Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "Tab", label: "Next" },
              { key: "p", label: "Full Preview" },
              { key: "Enter", label: "Create" },
              { key: "Esc", label: "Cancel" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Preview mode
  if (mode === "preview" && selectedTemplate) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle="single" paddingX={2}>
          <Text bold color="cyan">
            Preview: {outputName}
          </Text>
        </Box>

        <ScrollableBox height={15} focused={true}>
          <Text>{previewContent}</Text>
        </ScrollableBox>

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "c", label: "Create Prompt" },
              { key: "Esc", label: "Back to Edit" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  return null;
};
