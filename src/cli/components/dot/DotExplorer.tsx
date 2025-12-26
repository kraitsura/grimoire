/**
 * DotExplorer - Interactive TUI for browsing dotfiles
 *
 * Lazygit-style two-panel layout with file list and preview.
 */

import React, { useState, useEffect, useLayoutEffect } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { safeBorderStyle, statusColors, selectionStyle } from "../theme";
import type { EditorConfig } from "../../../services/config-service";

interface DotFile {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
}

interface DotExplorerProps {
  initialPath?: string;
  editorConfig: EditorConfig;
  onExit?: () => void;
}

type Panel = "list" | "preview";
type Modal = "none" | "help" | "editor";

const EDITOR_PRESETS: Record<string, { command: string; args: string[]; wait?: boolean }> = {
  vim: { command: "vim", args: [], wait: true },
  nvim: { command: "nvim", args: [], wait: true },
  nano: { command: "nano", args: [], wait: true },
  code: { command: "code", args: ["--wait"] },
  "code-insiders": { command: "code-insiders", args: ["--wait"] },
  zed: { command: "zed", args: ["--wait"] },
  subl: { command: "subl", args: ["--wait"] },
  emacs: { command: "emacs", args: [], wait: true },
  micro: { command: "micro", args: [], wait: true },
  hx: { command: "hx", args: [], wait: true },
  helix: { command: "helix", args: [], wait: true },
};

export function DotExplorer({ initialPath, editorConfig, onExit }: DotExplorerProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [currentPath, setCurrentPath] = useState(initialPath ?? process.cwd());
  const [files, setFiles] = useState<DotFile[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusedPanel, setFocusedPanel] = useState<Panel>("list");
  const [modal, setModal] = useState<Modal>("none");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [previewScroll, setPreviewScroll] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pathHistory, setPathHistory] = useState<string[]>([]);

  // Enter alternate screen buffer on mount
  useLayoutEffect(() => {
    stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
    return () => {
      stdout.write("\x1b[?1049l\x1b[?25h");
    };
  }, [stdout]);

  // Load dotfiles from current path
  const loadFiles = () => {
    setLoading(true);
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      const dotFiles: DotFile[] = entries
        .filter((entry) => entry.name.startsWith("."))
        .map((entry) => {
          const fullPath = path.join(currentPath, entry.name);
          let stats: fs.Stats | null = null;
          try {
            stats = fs.statSync(fullPath);
          } catch {
            // Skip files we can't stat
          }
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size: stats?.size ?? 0,
            modified: stats?.mtime ?? new Date(),
          };
        })
        .sort((a, b) => {
          // Directories first, then alphabetically
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

      setFiles(dotFiles);
      setSelectedIndex(0);
      setPreviewScroll(0);
    } catch (error) {
      setStatusMessage(`Error loading files: ${error}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadFiles();
  }, [currentPath]);

  // Load preview for selected file
  useEffect(() => {
    const selectedFile = files[selectedIndex];
    if (!selectedFile) {
      setPreview([]);
      return;
    }

    if (selectedFile.isDirectory) {
      // Show directory contents
      try {
        const entries = fs.readdirSync(selectedFile.path);
        const lines = entries.slice(0, 50).map((e) => `  ${e}`);
        if (entries.length > 50) {
          lines.push(`  ... and ${entries.length - 50} more`);
        }
        setPreview([`Directory: ${selectedFile.name}`, `${entries.length} items`, "", ...lines]);
      } catch {
        setPreview(["Cannot read directory"]);
      }
    } else {
      // Show file preview
      try {
        const content = fs.readFileSync(selectedFile.path, "utf-8");
        const lines = content.split("\n").slice(0, 100);
        if (content.split("\n").length > 100) {
          lines.push("", `... and ${content.split("\n").length - 100} more lines`);
        }
        setPreview(lines);
      } catch {
        // Try to detect binary
        try {
          const buffer = fs.readFileSync(selectedFile.path);
          const isBinary = buffer.some((byte) => byte === 0);
          if (isBinary) {
            setPreview(["[Binary file]", "", `Size: ${formatSize(selectedFile.size)}`]);
          } else {
            setPreview(["Cannot read file"]);
          }
        } catch {
          setPreview(["Cannot read file"]);
        }
      }
    }
    setPreviewScroll(0);
  }, [selectedIndex, files]);

  // Clear status message after 3 seconds
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  const selectedFile = files[selectedIndex];

  // Open file in editor
  const openInEditor = (filePath: string) => {
    const preset = EDITOR_PRESETS[editorConfig.name];
    const command = editorConfig.command ?? preset?.command ?? editorConfig.name;
    const args = editorConfig.args ?? preset?.args ?? [];
    const needsWait = preset?.wait ?? false;

    // Exit alternate screen before opening editor
    stdout.write("\x1b[?1049l\x1b[?25h");

    if (needsWait) {
      // Terminal editors - run synchronously
      try {
        execSync(`${command} ${args.join(" ")} "${filePath}"`, {
          stdio: "inherit",
        });
      } catch (error) {
        setStatusMessage(`Editor error: ${error}`);
      }
    } else {
      // GUI editors - spawn and wait
      const child = spawn(command, [...args, filePath], {
        stdio: "inherit",
        detached: false,
      });
      child.on("close", () => {
        // Re-enter alternate screen after editor closes
        stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
        loadFiles();
      });
      child.on("error", (error) => {
        stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
        setStatusMessage(`Editor error: ${error.message}`);
      });
      return;
    }

    // Re-enter alternate screen after terminal editor closes
    stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
    loadFiles();
  };

  // Navigate into directory
  const enterDirectory = (dir: DotFile) => {
    if (dir.isDirectory) {
      setPathHistory([...pathHistory, currentPath]);
      setCurrentPath(dir.path);
    }
  };

  // Go back to parent
  const goBack = () => {
    if (pathHistory.length > 0) {
      const prev = pathHistory[pathHistory.length - 1];
      setPathHistory(pathHistory.slice(0, -1));
      setCurrentPath(prev);
    } else {
      const parent = path.dirname(currentPath);
      if (parent !== currentPath) {
        setCurrentPath(parent);
      }
    }
  };

  // Keyboard handler
  useInput((input, key) => {
    if (modal !== "none") {
      if (key.escape || input === "q") {
        setModal("none");
      }
      return;
    }

    // Global shortcuts
    if (input === "q") {
      if (onExit) {
        onExit();
      } else {
        exit();
      }
      return;
    }

    if (input === "?") {
      setModal("help");
      return;
    }

    if (key.tab) {
      setFocusedPanel(focusedPanel === "list" ? "preview" : "list");
      return;
    }

    if (input === "R") {
      loadFiles();
      setStatusMessage("Refreshed");
      return;
    }

    // Panel-specific shortcuts
    if (focusedPanel === "list") {
      // Navigation
      if (input === "j" || key.downArrow) {
        setSelectedIndex((i) => Math.min(i + 1, files.length - 1));
        return;
      }
      if (input === "k" || key.upArrow) {
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (input === "g") {
        setSelectedIndex(0);
        return;
      }
      if (input === "G") {
        setSelectedIndex(files.length - 1);
        return;
      }

      // Enter directory or open file
      if (key.return) {
        if (selectedFile?.isDirectory) {
          enterDirectory(selectedFile);
        } else if (selectedFile) {
          openInEditor(selectedFile.path);
        }
        return;
      }

      // Open in editor (even if directory, opens the dir in editor)
      if (input === "e" && selectedFile) {
        openInEditor(selectedFile.path);
        return;
      }

      // Go back
      if (input === "h" || key.leftArrow || key.backspace) {
        goBack();
        return;
      }

      // Enter directory with right arrow or l
      if ((input === "l" || key.rightArrow) && selectedFile?.isDirectory) {
        enterDirectory(selectedFile);
        return;
      }
    } else if (focusedPanel === "preview") {
      // Preview scroll
      if (input === "j" || key.downArrow) {
        setPreviewScroll((s) => Math.min(s + 1, Math.max(0, preview.length - 20)));
        return;
      }
      if (input === "k" || key.upArrow) {
        setPreviewScroll((s) => Math.max(s - 1, 0));
        return;
      }
      if (input === "g") {
        setPreviewScroll(0);
        return;
      }
      if (input === "G") {
        setPreviewScroll(Math.max(0, preview.length - 20));
        return;
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Loading dotfiles...</Text>
      </Box>
    );
  }

  const terminalHeight = stdout.rows ?? 24;
  const listHeight = terminalHeight - 6; // Leave room for header, footer, status

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box paddingX={1}>
        <Text bold color="cyan">
          DOTFILES
        </Text>
        <Text dimColor> - </Text>
        <Text>{currentPath}</Text>
      </Box>

      {/* Main panels */}
      <Box flexGrow={1} flexDirection="row">
        {/* Left panel: File list */}
        <Box
          width="40%"
          flexDirection="column"
          borderStyle={safeBorderStyle}
          borderColor={focusedPanel === "list" ? "cyan" : undefined}
        >
          <Box paddingX={1}>
            <Text bold color={focusedPanel === "list" ? "cyan" : undefined}>
              FILES ({files.length})
            </Text>
          </Box>
          <Box flexDirection="column" paddingX={1} height={listHeight}>
            {files.length === 0 ? (
              <Text dimColor>No dotfiles found</Text>
            ) : (
              files.slice(0, listHeight).map((file, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <Box key={file.name}>
                    <Text
                      {...(isSelected ? selectionStyle.primary : {})}
                      color={
                        isSelected
                          ? selectionStyle.primary.color
                          : file.isDirectory
                            ? "blue"
                            : undefined
                      }
                    >
                      {isSelected ? "> " : "  "}
                      {file.isDirectory ? `${file.name}/` : file.name}
                    </Text>
                  </Box>
                );
              })
            )}
          </Box>
        </Box>

        {/* Right panel: Preview */}
        <Box
          flexGrow={1}
          flexDirection="column"
          borderStyle={safeBorderStyle}
          borderColor={focusedPanel === "preview" ? "cyan" : undefined}
        >
          <Box paddingX={1}>
            <Text bold color={focusedPanel === "preview" ? "cyan" : undefined}>
              PREVIEW
            </Text>
            {selectedFile && (
              <Text dimColor> - {selectedFile.name}</Text>
            )}
          </Box>
          <Box flexDirection="column" paddingX={1} height={listHeight} overflow="hidden">
            {preview.slice(previewScroll, previewScroll + listHeight).map((line, index) => (
              <Text key={index} wrap="truncate">
                {line}
              </Text>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Action bar */}
      <Box paddingX={1} gap={2}>
        <Text dimColor>[j/k]</Text>
        <Text>nav</Text>
        <Text dimColor>[Enter]</Text>
        <Text>open</Text>
        <Text dimColor>[e]</Text>
        <Text>edit</Text>
        <Text dimColor>[h/l]</Text>
        <Text>back/into</Text>
        <Text dimColor>[Tab]</Text>
        <Text>switch</Text>
        <Text dimColor>[?]</Text>
        <Text>help</Text>
        <Text dimColor>[q]</Text>
        <Text>quit</Text>
      </Box>

      {/* Status bar */}
      {statusMessage && (
        <Box paddingX={1}>
          <Text color="yellow">{statusMessage}</Text>
        </Box>
      )}

      {/* Editor info */}
      <Box paddingX={1}>
        <Text dimColor>Editor: {editorConfig.name}</Text>
      </Box>

      {/* Help modal */}
      {modal === "help" && (
        <Box
          position="absolute"
          marginLeft={10}
          marginTop={5}
          flexDirection="column"
          borderStyle={safeBorderStyle}
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
        >
          <Text bold>Keyboard Shortcuts</Text>
          <Text> </Text>
          <Text>
            <Text bold>Navigation</Text>
          </Text>
          <Text>  j/k or arrows  Move up/down</Text>
          <Text>  h/l or arrows  Go back/into directory</Text>
          <Text>  g/G            Go to top/bottom</Text>
          <Text>  Tab            Switch panels</Text>
          <Text> </Text>
          <Text>
            <Text bold>Actions</Text>
          </Text>
          <Text>  Enter          Open file in editor / Enter directory</Text>
          <Text>  e              Open in editor (even directories)</Text>
          <Text>  R              Refresh list</Text>
          <Text> </Text>
          <Text>
            <Text bold>General</Text>
          </Text>
          <Text>  ?              Show this help</Text>
          <Text>  q              Quit</Text>
          <Text> </Text>
          <Text dimColor>Press Escape or q to close</Text>
        </Box>
      )}
    </Box>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}
