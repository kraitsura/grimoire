/**
 * ArchiveManager Component - Manage archived prompts
 *
 * Features:
 * - List archived prompts
 * - Select to restore
 * - Bulk operations
 * - View archive details
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useEffectRun, useEffectCallback } from "../../context";
import { ArchiveService } from "../../../services";
import { ScrollableBox } from "../input/scrollable-box";
import { getSelectionProps } from "../theme";

export interface ArchiveManagerProps {
  onExit?: () => void;
  onRestore?: (count: number) => void;
}

type Mode = "list" | "confirm-restore" | "confirm-purge";

export const ArchiveManager: React.FC<ArchiveManagerProps> = ({ onExit, onRestore }) => {
  const [mode, setMode] = useState<Mode>("list");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set());

  // Load archived prompts
  const {
    result: archivedPrompts,
    loading,
    error,
  } = useEffectRun(
    Effect.gen(function* () {
      const archiveService = yield* ArchiveService;
      return yield* archiveService.list();
    }),
    []
  );

  // Restore mutation
  const { execute: restorePrompts, loading: restoring } = useEffectCallback(() =>
    Effect.gen(function* () {
      const archiveService = yield* ArchiveService;
      const promptsToRestore = Array.from(selectedPrompts);

      if (promptsToRestore.length === 0) {
        const selected = archivedPrompts?.[selectedIndex];
        if (selected) {
          return yield* archiveService.restore([selected.name]);
        }
        return 0;
      }

      return yield* archiveService.restore(promptsToRestore);
    })
  );

  // Purge mutation
  const { execute: purgeArchive, loading: purging } = useEffectCallback(() =>
    Effect.gen(function* () {
      const archiveService = yield* ArchiveService;
      return yield* archiveService.purge();
    })
  );

  const toggleSelection = (promptName: string) => {
    setSelectedPrompts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(promptName)) {
        newSet.delete(promptName);
      } else {
        newSet.add(promptName);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (archivedPrompts) {
      setSelectedPrompts(new Set(archivedPrompts.map((p) => p.name)));
    }
  };

  const selectNone = () => {
    setSelectedPrompts(new Set());
  };

  useInput(
    (input, key) => {
      if (key.escape || input === "q") {
        if (mode === "list") {
          onExit?.();
        } else {
          setMode("list");
        }
        return;
      }

      if (mode === "list") {
        if (key.upArrow || input === "k") {
          setSelectedIndex((prev) => Math.max(0, prev - 1));
        } else if (key.downArrow || input === "j") {
          setSelectedIndex((prev) => Math.min((archivedPrompts?.length ?? 1) - 1, prev + 1));
        } else if (input === " ") {
          const selected = archivedPrompts?.[selectedIndex];
          if (selected) {
            toggleSelection(selected.name);
          }
        } else if (input === "r" || key.return) {
          setMode("confirm-restore");
        } else if (input === "a") {
          selectAll();
        } else if (input === "n") {
          selectNone();
        } else if (input === "p") {
          setMode("confirm-purge");
        }
      } else if (mode === "confirm-restore") {
        if (input === "y" || input === "Y") {
          restorePrompts()
            .then((count) => {
              onRestore?.(count);
            })
            .catch((error) => {
              console.error("Restore failed:", error);
              setMode("list");
            });
        } else {
          setMode("list");
        }
      } else if (mode === "confirm-purge") {
        if (input === "y" || input === "Y") {
          purgeArchive()
            .then(() => {
              onExit?.();
            })
            .catch((error) => {
              console.error("Purge failed:", error);
              setMode("list");
            });
        } else {
          setMode("list");
        }
      }
    },
    { isActive: true }
  );

  if (loading) {
    return <Text>Loading archived prompts...</Text>;
  }

  if (error) {
    return <Text color="red">Error loading archives: {String(error)}</Text>;
  }

  if (!archivedPrompts || archivedPrompts.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="gray">No archived prompts found.</Text>
        <Text color="gray">Press q to exit</Text>
      </Box>
    );
  }

  const selectedCount = selectedPrompts.size;
  const toRestore = selectedCount > 0 ? selectedCount : 1;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Archive Manager</Text>
      </Box>

      {mode === "list" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="gray">
              {archivedPrompts.length} archived prompt{archivedPrompts.length !== 1 ? "s" : ""}
              {selectedCount > 0 && ` | ${selectedCount} selected`}
            </Text>
          </Box>

          <Box marginBottom={1}>
            <Text color="gray">
              {"NAME".padEnd(30)} {"ARCHIVED".padEnd(12)} {"ORIGINAL PATH"}
            </Text>
          </Box>

          <ScrollableBox height={12} focused={true}>
            {archivedPrompts.map((prompt, index) => {
              const isSelected = index === selectedIndex;
              const isChecked = selectedPrompts.has(prompt.name);
              const archivedDate = prompt.archivedAt.toISOString().split("T")[0];

              return (
                <Box key={prompt.id}>
                  <Text {...getSelectionProps(isSelected)}>
                    {isSelected ? "> " : "  "}[{isChecked ? "x" : " "}]{" "}
                    {prompt.name.slice(0, 26).padEnd(28)}
                    {archivedDate.padEnd(12)}
                    {prompt.originalPath.slice(0, 40)}
                  </Text>
                </Box>
              );
            })}
          </ScrollableBox>

          <Box marginTop={1}>
            <Text color="gray">
              k up | j down | Space toggle | r/Enter restore | a all | n none | p purge | q quit
            </Text>
          </Box>
        </Box>
      )}

      {mode === "confirm-restore" && (
        <Box flexDirection="column">
          {restoring ? (
            <Text>Restoring prompts...</Text>
          ) : (
            <>
              <Box marginBottom={1}>
                <Text color="yellow">
                  Restore {toRestore} prompt{toRestore !== 1 ? "s" : ""}?
                </Text>
              </Box>
              {selectedCount > 0 ? (
                <Box marginBottom={1} flexDirection="column">
                  <Text color="gray">Selected prompts:</Text>
                  {Array.from(selectedPrompts).map((name) => (
                    <Text key={name} color="gray">
                      {" "}
                      - {name}
                    </Text>
                  ))}
                </Box>
              ) : (
                <Box marginBottom={1}>
                  <Text color="gray">Will restore: {archivedPrompts[selectedIndex]?.name}</Text>
                </Box>
              )}
              <Text color="gray">Press y to confirm, any other key to cancel</Text>
            </>
          )}
        </Box>
      )}

      {mode === "confirm-purge" && (
        <Box flexDirection="column">
          {purging ? (
            <Text>Purging archive...</Text>
          ) : (
            <>
              <Box marginBottom={1}>
                <Text color="red" bold>
                  Permanently delete ALL archived prompts?
                </Text>
              </Box>
              <Box marginBottom={1}>
                <Text color="red">
                  This will delete {archivedPrompts.length} archived prompt
                  {archivedPrompts.length !== 1 ? "s" : ""}.
                </Text>
              </Box>
              <Box marginBottom={1}>
                <Text color="red" bold>
                  This action cannot be undone!
                </Text>
              </Box>
              <Text color="gray">Press y to confirm, any other key to cancel</Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
};
