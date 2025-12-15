/**
 * Edit Screen - Create or edit prompts in terminal
 *
 * Features:
 * - Name input field with Tab navigation
 * - Multi-line content editor with cursor and line numbers
 * - Tag editor (comma-separated or chips)
 * - Save (Ctrl+S) / Cancel (Esc)
 * - Unsaved changes warning on exit
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useAppState } from "../context/app-context.js";
import { useEffectRun, useEffectCallback } from "../context/runtime-context.js";
import { StorageService } from "../../services/index.js";
import { MultiLineInput } from "../components/input/multi-line-input.js";
import { TagEditor } from "../components/input/tag-editor.js";
import { TextInput } from "../components/input/text-input.js";
import { ActionBar } from "../components/layout/action-bar.js";

export interface EditScreenProps {
  promptId?: string; // undefined = new prompt
}

type FocusedField = "name" | "content" | "tags";

export const EditScreen: React.FC<EditScreenProps> = ({ promptId }) => {
  const { state, actions } = useAppState();

  // Field values
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // UI state
  const [focusedField, setFocusedField] = useState<FocusedField>("name");
  const [isDirty, setIsDirty] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load existing prompt if editing
  const { result: existingPrompt, loading, error } = useEffectRun(
    promptId
      ? Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.getById(promptId);
        })
      : Effect.succeed(null),
    [promptId]
  );

  // Populate form when prompt loads
  useEffect(() => {
    if (existingPrompt) {
      setName(existingPrompt.name);
      setContent(existingPrompt.content);
      setTags([...(existingPrompt.tags ?? [])]);
    }
  }, [existingPrompt]);

  // Save callback
  const { execute: savePrompt } = useEffectCallback(() =>
    Effect.gen(function* () {
      const storage = yield* StorageService;

      if (promptId) {
        // Update existing prompt
        return yield* storage.update(promptId, {
          name: name.trim(),
          content,
          tags,
        });
      } else {
        // Create new prompt
        return yield* storage.create({
          name: name.trim(),
          content,
          tags,
        });
      }
    })
  );

  // Handle field value changes
  const handleNameChange = (value: string) => {
    setName(value);
    if (!isDirty) {
      setIsDirty(true);
      actions.setDirty(true);
    }
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    if (!isDirty) {
      setIsDirty(true);
      actions.setDirty(true);
    }
  };

  const handleTagsChange = (newTags: string[]) => {
    setTags(newTags);
    if (!isDirty) {
      setIsDirty(true);
      actions.setDirty(true);
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!name.trim()) {
      actions.showNotification({
        type: "error",
        message: "Name is required",
      });
      return;
    }

    setIsSaving(true);
    try {
      await savePrompt();
      setIsDirty(false);
      actions.setDirty(false);
      actions.showNotification({
        type: "success",
        message: promptId ? "Prompt updated" : "Prompt created",
      });
      actions.goBack();
    } catch (err) {
      actions.showNotification({
        type: "error",
        message: `Failed to save: ${String(err)}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (isDirty) {
      setShowExitWarning(true);
    } else {
      actions.setDirty(false);
      actions.goBack();
    }
  };

  // Handle confirmed exit (discard changes)
  const handleConfirmExit = () => {
    setIsDirty(false);
    actions.setDirty(false);
    actions.goBack();
  };

  // Keyboard input handler
  useInput(
    (input, key) => {
      // Exit warning screen handlers
      if (showExitWarning) {
        if (input === "y" || input === "Y") {
          handleConfirmExit();
        } else if (input === "n" || input === "N" || key.escape) {
          setShowExitWarning(false);
        }
        return;
      }

      // Global shortcuts
      if (key.ctrl && input === "s") {
        handleSave();
        return;
      }

      if (key.escape) {
        handleCancel();
        return;
      }

      // Field navigation with Tab
      if (key.tab) {
        if (key.shift) {
          // Shift+Tab: cycle backward
          if (focusedField === "name") {
            setFocusedField("tags");
          } else if (focusedField === "content") {
            setFocusedField("name");
          } else {
            setFocusedField("content");
          }
        } else {
          // Tab: cycle forward
          if (focusedField === "name") {
            setFocusedField("content");
          } else if (focusedField === "content") {
            setFocusedField("tags");
          } else {
            setFocusedField("name");
          }
        }
        return;
      }
    },
    { isActive: !loading && !showExitWarning }
  );

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Loading prompt...</Text>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error loading prompt: {String(error)}</Text>
        <Text dimColor>Press Esc to go back</Text>
      </Box>
    );
  }

  // Exit warning modal
  if (showExitWarning) {
    return (
      <Box
        flexDirection="column"
        padding={1}
        borderStyle="round"
        borderColor="yellow"
      >
        <Text bold color="yellow">
          Unsaved Changes
        </Text>
        <Box marginTop={1}>
          <Text>You have unsaved changes. Are you sure you want to exit?</Text>
        </Box>
        <Box marginTop={1} gap={2}>
          <Text>
            <Text color="green">[Y]</Text> Yes, discard changes
          </Text>
          <Text>
            <Text color="red">[N]</Text> No, go back
          </Text>
        </Box>
      </Box>
    );
  }

  // Main editor UI
  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {promptId ? "Edit Prompt" : "Create New Prompt"}
        </Text>
        {isDirty && (
          <Box marginLeft={2}>
            <Text color="yellow">*</Text>
          </Box>
        )}
      </Box>

      {/* Name field */}
      <Box flexDirection="column" marginBottom={1}>
        <Text
          color={focusedField === "name" ? "green" : "gray"}
          bold={focusedField === "name"}
        >
          Name:
        </Text>
        <Box marginLeft={2}>
          <TextInput
            value={name}
            onChange={handleNameChange}
            placeholder="Enter prompt name..."
            focused={focusedField === "name"}
          />
        </Box>
      </Box>

      {/* Content field */}
      <Box flexDirection="column" marginBottom={1}>
        <Text
          color={focusedField === "content" ? "green" : "gray"}
          bold={focusedField === "content"}
        >
          Content:
        </Text>
        <Box marginLeft={2}>
          <MultiLineInput
            value={content}
            onChange={handleContentChange}
            height={15}
            showLineNumbers={true}
            focused={focusedField === "content"}
          />
        </Box>
      </Box>

      {/* Tags field */}
      <Box flexDirection="column" marginBottom={1}>
        <Text
          color={focusedField === "tags" ? "green" : "gray"}
          bold={focusedField === "tags"}
        >
          Tags:
        </Text>
        <Box marginLeft={2}>
          <TagEditor
            tags={tags}
            onChange={handleTagsChange}
            focused={focusedField === "tags"}
          />
        </Box>
      </Box>

      {/* Status message */}
      {isSaving && (
        <Box marginTop={1}>
          <Text color="yellow">Saving...</Text>
        </Box>
      )}

      {/* Action bar */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
        <ActionBar
          actions={[
            { key: "Ctrl+S", label: "Save" },
            { key: "Esc", label: "Cancel" },
            { key: "Tab", label: "Next Field" },
            { key: "Shift+Tab", label: "Previous Field" },
          ]}
        />
      </Box>

      {/* Field indicator */}
      <Box marginTop={1}>
        <Text dimColor>
          Editing: <Text color="green">{focusedField}</Text>
        </Text>
      </Box>
    </Box>
  );
};
