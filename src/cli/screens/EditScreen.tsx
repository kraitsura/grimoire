/**
 * Edit Screen - Create or edit prompts in terminal
 *
 * Features:
 * - VIM-like modes: INSERT (typing), NORMAL (navigation), COMMAND (:w, :q, etc.)
 * - Name input field with Tab navigation
 * - Multi-line content editor with cursor and line numbers
 * - Tag editor (comma-separated or chips)
 * - VIM commands: :w (save), :q (quit), :wq (save+quit), :q! (force quit)
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
import { safeBorderStyle } from "../components/theme.js";

export interface EditScreenProps {
  promptId?: string; // undefined = new prompt
}

type FocusedField = "name" | "content" | "tags";
type VimMode = "insert" | "normal" | "command";

export const EditScreen: React.FC<EditScreenProps> = ({ promptId }) => {
  const { actions } = useAppState();

  // Field values
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // Original values for change detection
  const [originalName, setOriginalName] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [originalTags, setOriginalTags] = useState<string[]>([]);

  // UI state
  const [focusedField, setFocusedField] = useState<FocusedField>("name");
  const [isDirty, setIsDirty] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // VIM mode state
  const [vimMode, setVimMode] = useState<VimMode>("insert");
  const [commandBuffer, setCommandBuffer] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  // Load existing prompt if editing
  const {
    result: existingPrompt,
    loading,
    error,
  } = useEffectRun(
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
      // Store original values for change detection
      setOriginalName(existingPrompt.name);
      setOriginalContent(existingPrompt.content);
      setOriginalTags([...(existingPrompt.tags ?? [])]);
    }
  }, [existingPrompt]);

  // Set editing mode on mount, clear on unmount
  useEffect(() => {
    actions.setEditing(true);
    return () => {
      actions.setEditing(false);
    };
  }, [actions]);

  // Clear status message after delay
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(""), 2000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

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

  // Check if there are actual changes compared to original values
  const hasActualChanges = (): boolean => {
    // For new prompts, always consider it as having changes if there's content
    if (!promptId) {
      return name.trim() !== "" || content !== "" || tags.length > 0;
    }
    // For existing prompts, compare to original values
    const nameChanged = name.trim() !== originalName;
    const contentChanged = content !== originalContent;
    const tagsChanged =
      JSON.stringify([...tags].sort()) !== JSON.stringify([...originalTags].sort());
    return nameChanged || contentChanged || tagsChanged;
  };

  // Handle save
  const handleSave = async (andQuit = false): Promise<boolean> => {
    if (!name.trim()) {
      setStatusMessage("E: Name is required");
      actions.showNotification({
        type: "error",
        message: "Name is required",
      });
      return false;
    }

    // Skip save if no actual changes (for existing prompts)
    if (promptId && !hasActualChanges()) {
      setStatusMessage("No changes");
      setIsDirty(false);
      actions.setDirty(false);
      if (andQuit) {
        actions.goBack();
      }
      return true;
    }

    setIsSaving(true);
    try {
      await savePrompt();
      setIsDirty(false);
      actions.setDirty(false);
      // Update original values after successful save
      setOriginalName(name.trim());
      setOriginalContent(content);
      setOriginalTags([...tags]);
      setStatusMessage("Written");
      actions.showNotification({
        type: "success",
        message: promptId ? "Prompt updated" : "Prompt created",
      });
      if (andQuit) {
        actions.goBack();
      }
      return true;
    } catch (err) {
      setStatusMessage(`E: ${String(err)}`);
      actions.showNotification({
        type: "error",
        message: `Failed to save: ${String(err)}`,
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Handle quit
  const handleQuit = (force = false) => {
    // Use actual change detection instead of isDirty flag
    if (hasActualChanges() && !force) {
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

  // Execute VIM command
  const executeCommand = async (cmd: string) => {
    const trimmed = cmd.trim();

    switch (trimmed) {
      case "w":
        await handleSave(false);
        setVimMode("normal");
        break;
      case "q":
        handleQuit(false);
        break;
      case "wq":
      case "x":
        await handleSave(true);
        break;
      case "q!":
        handleQuit(true);
        break;
      default:
        setStatusMessage(`E: Unknown command: ${trimmed}`);
        setVimMode("normal");
    }
    setCommandBuffer("");
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
          setVimMode("normal");
        }
        return;
      }

      // COMMAND mode
      if (vimMode === "command") {
        if (key.escape) {
          setCommandBuffer("");
          setVimMode("normal");
          return;
        }
        if (key.return) {
          void executeCommand(commandBuffer);
          return;
        }
        if (key.backspace || key.delete) {
          if (commandBuffer.length > 0) {
            setCommandBuffer(commandBuffer.slice(0, -1));
          } else {
            setVimMode("normal");
          }
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setCommandBuffer(commandBuffer + input);
          return;
        }
        return;
      }

      // NORMAL mode
      if (vimMode === "normal") {
        // : starts command mode
        if (input === ":") {
          setVimMode("command");
          setCommandBuffer("");
          return;
        }
        // i enters insert mode
        if (input === "i") {
          setVimMode("insert");
          return;
        }
        // a enters insert mode (append)
        if (input === "a") {
          setVimMode("insert");
          return;
        }
        // Esc in normal mode with dirty = show exit warning
        if (key.escape) {
          handleQuit(false);
          return;
        }
        // j/k for field navigation in normal mode
        if (input === "j" || key.downArrow) {
          if (focusedField === "name") {
            setFocusedField("content");
          } else if (focusedField === "content") {
            setFocusedField("tags");
          }
          return;
        }
        if (input === "k" || key.upArrow) {
          if (focusedField === "tags") {
            setFocusedField("content");
          } else if (focusedField === "content") {
            setFocusedField("name");
          }
          return;
        }
        return;
      }

      // INSERT mode
      if (vimMode === "insert") {
        // Esc exits insert mode
        if (key.escape) {
          setVimMode("normal");
          return;
        }
        // Ctrl+S or Ctrl+Enter to save
        if (key.ctrl && (input === "s" || key.return)) {
          void handleSave(false);
          return;
        }
        // Tab for field navigation in insert mode
        if (key.tab) {
          if (key.shift) {
            if (focusedField === "name") {
              setFocusedField("tags");
            } else if (focusedField === "content") {
              setFocusedField("name");
            } else {
              setFocusedField("content");
            }
          } else {
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
        // Let the focused field handle other input
      }
    },
    { isActive: !loading }
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
      <Box flexDirection="column" padding={1} borderStyle={safeBorderStyle} borderColor="yellow">
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
        <Box marginTop={1}>
          <Text dimColor>Tip: Use :q! to force quit, :wq to save and quit</Text>
        </Box>
      </Box>
    );
  }

  // Mode indicator color
  const modeColor = vimMode === "insert" ? "green" : vimMode === "command" ? "yellow" : "blue";
  const modeLabel = vimMode.toUpperCase();

  // Main editor UI
  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {promptId ? "Edit Prompt" : "Create New Prompt"}
        </Text>
        {isDirty && (
          <Box marginLeft={1}>
            <Text color="yellow">[+]</Text>
          </Box>
        )}
        <Box marginLeft={2}>
          <Text color={modeColor} bold>
            -- {modeLabel} --
          </Text>
        </Box>
      </Box>

      {/* Name field */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={focusedField === "name" ? "green" : "gray"} bold={focusedField === "name"}>
          Name:
        </Text>
        <Box marginLeft={2}>
          <TextInput
            value={name}
            onChange={handleNameChange}
            placeholder="Enter prompt name..."
            focused={focusedField === "name" && vimMode === "insert"}
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
            focused={focusedField === "content" && vimMode === "insert"}
          />
        </Box>
      </Box>

      {/* Tags field */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={focusedField === "tags" ? "green" : "gray"} bold={focusedField === "tags"}>
          Tags:
        </Text>
        <Box marginLeft={2}>
          <TagEditor
            tags={tags}
            onChange={handleTagsChange}
            focused={focusedField === "tags" && vimMode === "insert"}
          />
        </Box>
      </Box>

      {/* Command line / Status */}
      <Box marginTop={1} borderStyle={safeBorderStyle} borderColor="gray" paddingX={1}>
        {vimMode === "command" ? (
          <Text>
            <Text color="yellow">:</Text>
            <Text>{commandBuffer}</Text>
            <Text inverse> </Text>
          </Text>
        ) : isSaving ? (
          <Text color="yellow">Saving...</Text>
        ) : statusMessage ? (
          <Text color={statusMessage.startsWith("E:") ? "red" : "green"}>{statusMessage}</Text>
        ) : (
          <Text dimColor>
            {vimMode === "insert"
              ? "INSERT: Type to edit | Esc: normal mode | Tab: next field | :w save | :q quit"
              : "NORMAL: i: insert | j/k: navigate | :w save | :q quit | :wq save+quit"}
          </Text>
        )}
      </Box>

      {/* Action bar */}
      <Box marginTop={1}>
        <ActionBar
          actions={[
            { key: ":w", label: "Save" },
            { key: ":q", label: "Quit" },
            { key: ":wq", label: "Save+Quit" },
            { key: "Esc", label: vimMode === "insert" ? "Normal" : "Quit" },
            { key: "i", label: "Insert" },
          ]}
        />
      </Box>
    </Box>
  );
};
