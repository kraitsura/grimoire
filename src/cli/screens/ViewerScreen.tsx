/**
 * Viewer Screen - Unified view/edit for prompts
 *
 * Features:
 * - Inline title editing (n) with simple vim: h/l move, i insert, Esc save+exit
 * - Inline tag editing (t) with same vim controls
 * - Content viewing with j/k scroll
 * - Ctrl+G to open content in $EDITOR (vim, nvim, etc.)
 * - Auto-save when exiting inline edit
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { useAppState } from "../context/app-context.js";
import { useEffectRun, useEffectCallback } from "../context/runtime-context.js";
import { StorageService, Clipboard } from "../../services/index.js";
import { ActionBar } from "../components/layout/action-bar.js";
import { safeBorderStyle } from "../components/theme.js";
import type { Prompt } from "../../models/prompt.js";

export interface ViewerScreenProps {
  promptId: string;
}

type ViewMode = "view" | "editName" | "editTags";
type InlineVimMode = "normal" | "insert";

/**
 * Format a date as a relative time string
 */
const formatDate = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/**
 * Open content in external editor
 */
const openInEditor = (content: string, filename: string): string | null => {
  const editor = process.env.EDITOR || process.env.VISUAL || "vim";
  const tempDir = mkdtempSync(join(tmpdir(), "grimoire-"));
  const tempFile = join(tempDir, filename);

  try {
    writeFileSync(tempFile, content, "utf-8");
    const result = spawnSync(editor, [tempFile], {
      stdio: "inherit",
      shell: true,
    });

    if (result.status !== 0) return null;

    const editedContent = readFileSync(tempFile, "utf-8");
    try { unlinkSync(tempFile); } catch { /* ignore */ }
    return editedContent;
  } catch {
    return null;
  }
};

/**
 * ViewerScreen component
 */
export const ViewerScreen: React.FC<ViewerScreenProps> = ({ promptId }) => {
  const { actions } = useAppState();

  // View state
  const [mode, setMode] = useState<ViewMode>("view");
  const [vimMode, setVimMode] = useState<InlineVimMode>("normal");
  const [cursorPos, setCursorPos] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Edited values
  const [editedName, setEditedName] = useState("");
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [editedContent, setEditedContent] = useState("");
  const [tagInput, setTagInput] = useState("");

  // UI state
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Fetch prompt
  const { result: prompt, error, loading } = useEffectRun(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.getById(promptId);
    }),
    [promptId]
  );

  // Initialize values
  useEffect(() => {
    if (prompt) {
      setEditedName(prompt.name);
      setEditedTags([...(prompt.tags ?? [])]);
      setEditedContent(prompt.content);
    }
  }, [prompt]);

  // Set editing mode
  useEffect(() => {
    actions.setEditing(mode !== "view");
    return () => actions.setEditing(false);
  }, [actions, mode]);

  // Clear status
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
      return yield* storage.update(promptId, {
        name: editedName.trim(),
        content: editedContent,
        tags: editedTags,
      });
    })
  );

  // Copy callback
  const { execute: copyToClipboard } = useEffectCallback(() =>
    Effect.gen(function* () {
      const clipboard = yield* Clipboard;
      yield* clipboard.copy(editedContent);
    })
  );

  // Handle save
  const handleSave = async (): Promise<boolean> => {
    if (!editedName.trim()) {
      setStatusMessage("Name required");
      return false;
    }
    setIsSaving(true);
    try {
      await savePrompt();
      setIsDirty(false);
      actions.setDirty(false);
      setStatusMessage("Saved");
      return true;
    } catch (err) {
      setStatusMessage(`Error: ${String(err)}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Exit name/tag edit (auto-save if dirty)
  const exitInlineEdit = async () => {
    if (isDirty) {
      await handleSave();
    }
    setMode("view");
    setVimMode("normal");
    setCursorPos(0);
    setTagInput("");
  };

  // Open external editor
  const handleOpenEditor = () => {
    const result = openInEditor(editedContent, `${editedName.replace(/[^a-zA-Z0-9]/g, "_")}.md`);
    if (result !== null && result !== editedContent) {
      setEditedContent(result);
      setIsDirty(true);
      actions.setDirty(true);
      setStatusMessage("Content updated");
    }
  };

  // Content lines
  const contentLines = editedContent.split("\n");
  const visibleHeight = 15;
  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + visibleHeight);

  // Keyboard handler
  useInput(
    (input, key) => {
      // === EDIT NAME MODE ===
      if (mode === "editName") {
        if (vimMode === "normal") {
          if (key.escape) {
            void exitInlineEdit();
            return;
          }
          if (input === "i") {
            setVimMode("insert");
            return;
          }
          if (input === "a") {
            setVimMode("insert");
            setCursorPos(Math.min(cursorPos + 1, editedName.length));
            return;
          }
          if (input === "h" || key.leftArrow) {
            setCursorPos(Math.max(0, cursorPos - 1));
            return;
          }
          if (input === "l" || key.rightArrow) {
            setCursorPos(Math.min(editedName.length, cursorPos + 1));
            return;
          }
          if (input === "0") {
            setCursorPos(0);
            return;
          }
          if (input === "$") {
            setCursorPos(editedName.length);
            return;
          }
          if (input === "w" || input === "e") {
            // Jump to next word
            const rest = editedName.slice(cursorPos);
            const match = rest.match(/^\s*\S+\s*/);
            if (match) {
              setCursorPos(Math.min(editedName.length, cursorPos + match[0].length));
            }
            return;
          }
          if (input === "b") {
            // Jump to previous word
            const before = editedName.slice(0, cursorPos);
            const match = before.match(/\s*\S+\s*$/);
            if (match) {
              setCursorPos(cursorPos - match[0].length);
            }
            return;
          }
          if (input === "x") {
            // Delete char under cursor
            if (cursorPos < editedName.length) {
              setEditedName(editedName.slice(0, cursorPos) + editedName.slice(cursorPos + 1));
              setIsDirty(true);
              actions.setDirty(true);
            }
            return;
          }
        } else {
          // INSERT mode
          if (key.escape) {
            setVimMode("normal");
            setCursorPos(Math.max(0, cursorPos - 1));
            return;
          }
          if (key.backspace || key.delete) {
            if (cursorPos > 0) {
              setEditedName(editedName.slice(0, cursorPos - 1) + editedName.slice(cursorPos));
              setCursorPos(cursorPos - 1);
              setIsDirty(true);
              actions.setDirty(true);
            }
            return;
          }
          if (input && !key.ctrl && !key.meta && !key.return) {
            setEditedName(editedName.slice(0, cursorPos) + input + editedName.slice(cursorPos));
            setCursorPos(cursorPos + input.length);
            setIsDirty(true);
            actions.setDirty(true);
            return;
          }
        }
        return;
      }

      // === EDIT TAGS MODE ===
      if (mode === "editTags") {
        if (vimMode === "normal") {
          if (key.escape) {
            void exitInlineEdit();
            return;
          }
          if (input === "i") {
            setVimMode("insert");
            return;
          }
          if (input === "x" || input === "d") {
            // Delete last tag
            if (editedTags.length > 0) {
              setEditedTags(editedTags.slice(0, -1));
              setIsDirty(true);
              actions.setDirty(true);
            }
            return;
          }
        } else {
          // INSERT mode for tags
          if (key.escape) {
            // Add current input as tag if not empty
            if (tagInput.trim()) {
              setEditedTags([...editedTags, tagInput.trim()]);
              setTagInput("");
              setIsDirty(true);
              actions.setDirty(true);
            }
            setVimMode("normal");
            return;
          }
          if (key.return || input === " ") {
            // Add tag
            if (tagInput.trim()) {
              setEditedTags([...editedTags, tagInput.trim()]);
              setTagInput("");
              setIsDirty(true);
              actions.setDirty(true);
            }
            return;
          }
          if (key.backspace || key.delete) {
            if (tagInput.length > 0) {
              setTagInput(tagInput.slice(0, -1));
            } else if (editedTags.length > 0) {
              setEditedTags(editedTags.slice(0, -1));
              setIsDirty(true);
              actions.setDirty(true);
            }
            return;
          }
          if (input && !key.ctrl && !key.meta) {
            setTagInput(tagInput + input);
            return;
          }
        }
        return;
      }

      // === VIEW MODE ===
      // n - edit name
      if (input === "n") {
        setMode("editName");
        setVimMode("normal");
        setCursorPos(0);
        return;
      }

      // t - edit tags
      if (input === "t") {
        setMode("editTags");
        setVimMode("normal");
        setTagInput("");
        return;
      }

      // Ctrl+G - open in editor
      if (key.ctrl && input === "g") {
        handleOpenEditor();
        return;
      }

      // c - copy
      if (input === "c") {
        copyToClipboard()
          .then(() => setStatusMessage("Copied"))
          .catch(() => setStatusMessage("Copy failed"));
        return;
      }

      // h - history
      if (input === "h") {
        if (isDirty) {
          void handleSave().then(() => actions.navigate({ name: "history", promptId }));
        } else {
          actions.navigate({ name: "history", promptId });
        }
        return;
      }

      // e - enhance
      if (input === "e") {
        if (isDirty) {
          void handleSave().then(() => actions.navigate({ name: "enhance", promptId }));
        } else {
          actions.navigate({ name: "enhance", promptId });
        }
        return;
      }

      // j/k or arrows - scroll content
      if (input === "j" || key.downArrow) {
        setScrollOffset(Math.min(Math.max(0, contentLines.length - visibleHeight), scrollOffset + 1));
        return;
      }
      if (input === "k" || key.upArrow) {
        setScrollOffset(Math.max(0, scrollOffset - 1));
        return;
      }

      // g/G - top/bottom
      if (input === "g") {
        setScrollOffset(0);
        return;
      }
      if (input === "G") {
        setScrollOffset(Math.max(0, contentLines.length - visibleHeight));
        return;
      }

      // Esc - back
      if (key.escape) {
        if (isDirty) {
          void handleSave().then(() => actions.goBack());
        } else {
          actions.goBack();
        }
        return;
      }
    },
    { isActive: !loading }
  );

  // Loading
  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  // Error
  if (error || !prompt) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error ? String(error) : "Not found"}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Name */}
      <Box marginBottom={1}>
        {mode === "editName" ? (
          <Box>
            <Text color="cyan">Name: </Text>
            <Text>
              {editedName.slice(0, cursorPos)}
              <Text inverse>{editedName[cursorPos] || " "}</Text>
              {editedName.slice(cursorPos + 1)}
            </Text>
            <Text dimColor> [{vimMode === "insert" ? "INSERT" : "NORMAL"}]</Text>
          </Box>
        ) : (
          <Box>
            <Text bold color="cyan">{editedName}</Text>
            {isDirty && <Text color="yellow"> [+]</Text>}
            <Text dimColor> [n]</Text>
          </Box>
        )}
      </Box>

      {/* Tags */}
      <Box marginBottom={1}>
        {mode === "editTags" ? (
          <Box>
            <Text color="magenta">Tags: </Text>
            {editedTags.map((tag, i) => (
              <Text key={i} color="magenta">#{tag} </Text>
            ))}
            {vimMode === "insert" && (
              <Text>
                {tagInput}
                <Text inverse> </Text>
              </Text>
            )}
            <Text dimColor> [{vimMode === "insert" ? "INSERT" : "NORMAL"}]</Text>
          </Box>
        ) : (
          <Box>
            {editedTags.length > 0 ? (
              editedTags.map((tag, i) => (
                <Text key={i} color="magenta">#{tag} </Text>
              ))
            ) : (
              <Text dimColor>No tags</Text>
            )}
            <Text dimColor> [t]</Text>
          </Box>
        )}
      </Box>

      {/* Meta */}
      <Box marginBottom={1}>
        <Text dimColor>
          {formatDate(new Date(prompt.created))} | v{prompt.version ?? 1}
          {prompt.isFavorite && " *"}
          {prompt.isPinned && " #"}
        </Text>
      </Box>

      {/* Separator */}
      <Box marginBottom={1}>
        <Text dimColor>{"=".repeat(60)}</Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" height={visibleHeight}>
        {visibleLines.map((line, idx) => (
          <Text key={scrollOffset + idx}>{line || " "}</Text>
        ))}
      </Box>

      {/* Scroll indicator */}
      {contentLines.length > visibleHeight && (
        <Box>
          <Text dimColor>
            [{scrollOffset + 1}-{Math.min(scrollOffset + visibleHeight, contentLines.length)}/{contentLines.length}]
          </Text>
        </Box>
      )}

      {/* Status */}
      <Box marginTop={1} borderStyle={safeBorderStyle} borderColor="gray" paddingX={1}>
        {isSaving ? (
          <Text color="yellow">Saving...</Text>
        ) : statusMessage ? (
          <Text color={statusMessage.includes("Error") ? "red" : "green"}>{statusMessage}</Text>
        ) : mode === "editName" ? (
          <Text dimColor>h/l:move i:insert x:del Esc:save+exit</Text>
        ) : mode === "editTags" ? (
          <Text dimColor>i:insert x:del-last Enter/Space:add Esc:save+exit</Text>
        ) : (
          <Text dimColor>n:name t:tags ^G:vim c:copy h:hist j/k:scroll Esc:back</Text>
        )}
      </Box>

      {/* Actions */}
      <Box marginTop={1}>
        <ActionBar
          actions={
            mode === "view"
              ? [
                  { key: "n", label: "Name" },
                  { key: "t", label: "Tags" },
                  { key: "^G", label: "Edit" },
                  { key: "c", label: "Copy" },
                  { key: "h", label: "Hist" },
                  { key: "Esc", label: "Back" },
                ]
              : [
                  { key: "i", label: "Insert" },
                  { key: "Esc", label: "Save" },
                ]
          }
        />
      </Box>
    </Box>
  );
};
