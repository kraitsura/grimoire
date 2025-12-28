/**
 * Enhance Screen - AI-powered prompt enhancement TUI
 *
 * Features:
 * - Template selection (built-in + custom)
 * - Model selection with default from config
 * - Custom instruction input
 * - Cost estimation before running
 * - Real-time streaming preview
 * - Side-by-side comparison (original vs enhanced)
 * - Auto mode shortcut ('a')
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Effect, Stream, pipe } from "effect";
import { useAppState } from "../context/app-context.js";
import { useEffectRun, useEffectCallback } from "../context/runtime-context.js";
import {
  StorageService,
  EnhancementService,
  TokenCounterService,
  ConfigService,
} from "../../services/index.js";
import {
  BUILTIN_TEMPLATES,
  getDefaultTemplate,
  type EnhancementTemplate,
} from "../../models/enhancement-template.js";
import { ActionBar } from "../components/layout/action-bar.js";
import { TextInput } from "../components/input/text-input.js";
import { ScrollableBox } from "../components/input/scrollable-box.js";
import { safeBorderStyle, getSelectionProps } from "../components/theme.js";

export interface EnhanceScreenProps {
  promptId: string;
  content?: string; // Optional content override (for edit screen integration)
}

type EnhanceMode =
  | "selectTemplate"
  | "customInput"
  | "confirm"
  | "enhancing"
  | "preview";

interface EnhanceConfig {
  template: EnhancementTemplate;
  customInstruction: string;
  model: string;
}

interface EnhanceStats {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  duration: number;
}

export const EnhanceScreen: React.FC<EnhanceScreenProps> = ({ promptId, content }) => {
  const { actions } = useAppState();
  const [mode, setMode] = useState<EnhanceMode>("selectTemplate");
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const [config, setConfig] = useState<EnhanceConfig>({
    template: getDefaultTemplate(),
    customInstruction: "",
    model: "",
  });
  const [original, setOriginal] = useState("");
  const [enhanced, setEnhanced] = useState("");
  const [stats, setStats] = useState<EnhanceStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{
    inputTokens: number;
    estimatedCost: string;
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Fetch prompt
  const { result: prompt, loading: loadingPrompt } = useEffectRun(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.getById(promptId);
    }),
    [promptId]
  );

  // Fetch config (default model)
  const { result: grimoireConfig } = useEffectRun(
    Effect.gen(function* () {
      const configService = yield* ConfigService;
      return yield* configService.get();
    }),
    []
  );

  // Initialize original content and default model
  useEffect(() => {
    if (prompt) {
      setOriginal(content || prompt.content);
    }
    if (grimoireConfig?.defaultModel && !config.model) {
      setConfig((c) => ({ ...c, model: grimoireConfig.defaultModel || "" }));
    }
  }, [prompt, grimoireConfig, content, config.model]);

  // Helper to get error message
  const getErrorMessage = (e: unknown): string => {
    if (e && typeof e === "object" && "message" in e && typeof e.message === "string") {
      return e.message;
    }
    if (e instanceof Error) {
      return e.message;
    }
    return String(e);
  };

  // Get estimate
  const { execute: getEstimate } = useEffectCallback(() =>
    Effect.gen(function* () {
      const enhancementService = yield* EnhancementService;
      const est = yield* enhancementService.estimate({
        promptContent: original,
        template: config.customInstruction ? undefined : config.template,
        customInstruction: config.customInstruction || undefined,
        model: config.model || undefined,
      });
      setEstimate({
        inputTokens: est.inputTokens,
        estimatedCost: est.formattedCost,
      });
      setMode("confirm");
    }).pipe(
      Effect.catchAll((e) =>
        Effect.sync(() => {
          // Continue anyway with unknown estimate
          setEstimate({ inputTokens: 0, estimatedCost: "Unknown" });
          setMode("confirm");
        })
      )
    )
  );

  // Run enhancement
  const { execute: runEnhancement } = useEffectCallback(() =>
    Effect.gen(function* () {
      const startTime = Date.now();
      setEnhanced("");
      setError(null);
      setMode("enhancing");

      const enhancementService = yield* EnhancementService;
      const tokenCounter = yield* TokenCounterService;

      const stream = enhancementService.enhance({
        promptContent: original,
        template: config.customInstruction ? undefined : config.template,
        customInstruction: config.customInstruction || undefined,
        model: config.model || undefined,
      });

      let fullOutput = "";

      yield* pipe(
        stream,
        Stream.runForEach((chunk) =>
          Effect.sync(() => {
            if (!chunk.done && chunk.content) {
              fullOutput += chunk.content;
              setEnhanced(fullOutput);
            }
          })
        )
      );

      const duration = (Date.now() - startTime) / 1000;
      const outputTokens = yield* tokenCounter
        .count(fullOutput, config.model)
        .pipe(Effect.catchAll(() => Effect.succeed(Math.ceil(fullOutput.length / 4))));

      const cost = yield* tokenCounter
        .estimateCost(estimate?.inputTokens || 0, outputTokens, config.model)
        .pipe(Effect.catchAll(() => Effect.succeed(0)));

      setStats({
        inputTokens: estimate?.inputTokens || 0,
        outputTokens,
        cost,
        duration,
      });

      setMode("preview");
    }).pipe(
      Effect.catchAll((e) =>
        Effect.sync(() => {
          setError(getErrorMessage(e));
          setMode("preview");
        })
      )
    )
  );

  // Save enhanced prompt (update existing)
  const { execute: applyEnhancement } = useEffectCallback(() =>
    Effect.gen(function* () {
      const storage = yield* StorageService;
      yield* storage.update(promptId, {
        content: enhanced.trim(),
      });
      actions.showNotification({
        type: "success",
        message: `Enhanced: ${prompt?.name} (version incremented)`,
      });
      actions.goBack();
    }).pipe(
      Effect.catchAll((e) =>
        Effect.sync(() => {
          setError(getErrorMessage(e));
        })
      )
    )
  );

  // Keyboard handling
  useInput((input, key) => {
    // Skip if in text input mode
    if (isEditing) {
      if (key.escape) {
        setIsEditing(false);
      }
      return;
    }

    if (key.escape) {
      if (mode === "customInput") {
        setMode("selectTemplate");
      } else if (mode === "confirm") {
        setMode("selectTemplate");
      } else if (mode === "preview") {
        setMode("selectTemplate");
      } else {
        actions.goBack();
      }
      return;
    }

    // Auto mode shortcut
    if (input === "a" && mode === "selectTemplate") {
      // Use default template and model, skip to confirm
      setConfig((c) => ({ ...c, template: getDefaultTemplate(), customInstruction: "" }));
      getEstimate();
      return;
    }

    if (mode === "selectTemplate") {
      if (key.upArrow || input === "k") {
        setSelectedTemplateIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === "j") {
        setSelectedTemplateIndex((prev) =>
          Math.min(BUILTIN_TEMPLATES.length - 1, prev + 1)
        );
      } else if (key.return) {
        setConfig((c) => ({ ...c, template: BUILTIN_TEMPLATES[selectedTemplateIndex] }));
        getEstimate();
      } else if (input === "c") {
        setMode("customInput");
      } else if (input >= "1" && input <= "5") {
        const idx = parseInt(input) - 1;
        if (idx < BUILTIN_TEMPLATES.length) {
          setConfig((c) => ({ ...c, template: BUILTIN_TEMPLATES[idx] }));
          getEstimate();
        }
      }
      return;
    }

    if (mode === "customInput") {
      if (key.return && config.customInstruction.trim()) {
        getEstimate();
      }
      return;
    }

    if (mode === "confirm") {
      if (key.return) {
        runEnhancement();
      }
      return;
    }

    if (mode === "preview") {
      if (key.return && enhanced && !error) {
        applyEnhancement();
      } else if (input === "r") {
        runEnhancement();
      }
      return;
    }
  });

  // Loading state
  if (loadingPrompt) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  // Template selection mode
  if (mode === "selectTemplate") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle={safeBorderStyle} paddingX={2} paddingY={1}>
          <Text bold color="cyan">
            Enhance: {prompt?.name}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text bold>Select Enhancement Template:</Text>
        </Box>

        <Box flexDirection="column">
          {BUILTIN_TEMPLATES.map((template, index) => {
            const isSelected = index === selectedTemplateIndex;
            return (
              <Box key={template.id}>
                <Text {...getSelectionProps(isSelected)}>
                  {isSelected ? "> " : "  "}
                  {index + 1}. {template.name.padEnd(22)} {template.description}
                </Text>
              </Box>
            );
          })}
        </Box>

        <Box marginTop={2} flexDirection="column">
          <Text dimColor>Model: {config.model || "default"}</Text>
        </Box>

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "a", label: "Auto" },
              { key: "1-5", label: "Quick select" },
              { key: "c", label: "Custom" },
              { key: "Enter", label: "Confirm" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Custom instruction mode
  if (mode === "customInput") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle={safeBorderStyle} paddingX={2} paddingY={1}>
          <Text bold color="cyan">
            Custom Enhancement
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text>Enter your enhancement instruction:</Text>
        </Box>

        <Box borderStyle={safeBorderStyle} paddingX={1}>
          <TextInput
            value={config.customInstruction}
            onChange={(v) => {
              setConfig((c) => ({ ...c, customInstruction: v }));
              setIsEditing(true);
            }}
            focused={true}
            placeholder="e.g., Make it more concise and add examples"
          />
        </Box>

        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "Enter", label: "Confirm" },
              { key: "Esc", label: "Back" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Confirm mode (cost estimate)
  if (mode === "confirm") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1} borderStyle={safeBorderStyle} paddingX={2} paddingY={1}>
          <Text bold color="cyan">
            Confirm Enhancement
          </Text>
        </Box>

        <Box flexDirection="column" gap={1}>
          <Text>
            <Text bold>Prompt:</Text> {prompt?.name}
          </Text>
          <Text>
            <Text bold>Template:</Text>{" "}
            {config.customInstruction ? "Custom" : config.template.name}
          </Text>
          <Text>
            <Text bold>Model:</Text> {config.model || "default"}
          </Text>
          {estimate && (
            <>
              <Text>
                <Text bold>Input tokens:</Text> ~{estimate.inputTokens}
              </Text>
              <Text>
                <Text bold>Estimated cost:</Text> {estimate.estimatedCost}
              </Text>
            </>
          )}
        </Box>

        <Box marginTop={2} gap={2}>
          <Box borderStyle={safeBorderStyle} borderColor="green" paddingX={2}>
            <Text color="green" bold>
              [Enter] Run Enhancement
            </Text>
          </Box>
          <Box borderStyle={safeBorderStyle} paddingX={2}>
            <Text dimColor>[Esc] Cancel</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // Enhancing mode (streaming)
  if (mode === "enhancing") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>Enhancing: </Text>
          <Text color="cyan">{prompt?.name}</Text>
        </Box>
        <Box gap={2}>
          <Text dimColor>
            Template: {config.customInstruction ? "Custom" : config.template.name}
          </Text>
          <Text dimColor>Model: {config.model}</Text>
        </Box>

        <Box marginY={1}>
          <Text dimColor>{"─".repeat(60)}</Text>
        </Box>

        <ScrollableBox height={15} focused={false}>
          <Text>{enhanced}</Text>
          <Text color="cyan">|</Text>
        </ScrollableBox>

        <Box marginY={1}>
          <Text dimColor>{"─".repeat(60)}</Text>
        </Box>

        <Text dimColor>Streaming enhancement...</Text>
      </Box>
    );
  }

  // Preview mode (side-by-side)
  if (mode === "preview") {
    const termWidth = process.stdout.columns || 80;
    const panelWidth = Math.floor((termWidth - 6) / 2);

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color={error ? "red" : "green"}>
            {error ? "Enhancement Failed" : "Enhancement Complete"}: {prompt?.name}
          </Text>
        </Box>

        {error && (
          <Box marginBottom={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}

        {/* Side-by-side comparison */}
        <Box>
          <Box
            flexDirection="column"
            width={panelWidth}
            borderStyle={safeBorderStyle}
            borderColor="gray"
            paddingX={1}
          >
            <Text bold dimColor>
              Original
            </Text>
            <ScrollableBox height={10} focused={false}>
              <Text>{original.slice(0, 1000)}</Text>
            </ScrollableBox>
          </Box>

          <Box width={2} />

          <Box
            flexDirection="column"
            width={panelWidth}
            borderStyle={safeBorderStyle}
            borderColor="green"
            paddingX={1}
          >
            <Text bold color="green">
              Enhanced
            </Text>
            <ScrollableBox height={10} focused={true}>
              <Text>{enhanced.slice(0, 1000)}</Text>
            </ScrollableBox>
          </Box>
        </Box>

        {stats && (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>
              Tokens: {stats.inputTokens} in / {stats.outputTokens} out | Cost: $
              {stats.cost.toFixed(4)} | Time: {stats.duration.toFixed(1)}s
            </Text>
          </Box>
        )}

        <Box marginTop={1}>
          <ActionBar
            actions={
              error
                ? [
                    { key: "r", label: "Retry" },
                    { key: "Esc", label: "Back" },
                  ]
                : [
                    { key: "Enter", label: "Apply" },
                    { key: "r", label: "Retry" },
                    { key: "Esc", label: "Discard" },
                  ]
            }
          />
        </Box>
      </Box>
    );
  }

  return null;
};
