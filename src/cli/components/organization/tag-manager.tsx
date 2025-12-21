/**
 * TagManager Component - Interactive tag management interface
 *
 * Features:
 * - List all tags with usage counts
 * - Select tag to see prompts
 * - Rename/delete tags
 * - Bulk tagging operations
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useEffectRun, useEffectCallback } from "../../context";
import { TagService, type TagWithCount } from "../../../services";
import type { Prompt } from "../../../models";
import { ScrollableBox } from "../input/scrollable-box";
import { getSelectionProps } from "../theme";

export interface TagManagerProps {
  onExit?: () => void;
}

type Mode = "list" | "prompts" | "rename" | "confirm-delete";

export const TagManager: React.FC<TagManagerProps> = ({ onExit }) => {
  const [mode, setMode] = useState<Mode>("list");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedTag, setSelectedTag] = useState<TagWithCount | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [prompts, setPrompts] = useState<Prompt[]>([]);

  // Load all tags
  const {
    result: tags,
    loading,
    error,
  } = useEffectRun(
    Effect.gen(function* () {
      const tagService = yield* TagService;
      return yield* tagService.listTags();
    }),
    []
  );

  // Load prompts for selected tag
  const { execute: loadPrompts, loading: loadingPrompts } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!selectedTag) return [];
      const tagService = yield* TagService;
      return yield* tagService.getPromptsWithTag(selectedTag.name);
    })
  );

  // Rename tag mutation
  const { execute: renameTag, loading: renaming } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!selectedTag || !renameInput.trim()) return;
      const tagService = yield* TagService;
      yield* tagService.renameTag(selectedTag.name, renameInput.trim());
      setMode("list");
      setRenameInput("");
    })
  );

  // Delete tag mutation (via merge to empty)
  const { execute: deleteTag, loading: deleting } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!selectedTag) return;
      const tagService = yield* TagService;
      // Remove tag from all prompts
      const tagPrompts = yield* tagService.getPromptsWithTag(selectedTag.name);
      for (const prompt of tagPrompts) {
        yield* tagService.removeTag(prompt.id, selectedTag.name);
      }
      setMode("list");
    })
  );

  // Update selected tag when index changes
  useEffect(() => {
    if (tags && tags.length > 0 && selectedIndex < tags.length) {
      setSelectedTag(tags[selectedIndex]);
    }
  }, [selectedIndex, tags]);

  // Load prompts when entering prompts mode
  useEffect(() => {
    if (mode === "prompts" && selectedTag) {
      void loadPrompts().then((loadedPrompts) => setPrompts(loadedPrompts));
    }
  }, [mode, selectedTag]);

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
          setSelectedIndex((prev) => Math.min((tags?.length ?? 1) - 1, prev + 1));
        } else if (key.return || input === " ") {
          setMode("prompts");
        } else if (input === "r") {
          setRenameInput(selectedTag?.name ?? "");
          setMode("rename");
        } else if (input === "d") {
          setMode("confirm-delete");
        }
      } else if (mode === "prompts") {
        // Just viewing prompts, escape returns to list
      } else if (mode === "rename") {
        if (key.return) {
          void renameTag();
        } else if (key.backspace || key.delete) {
          setRenameInput((prev) => prev.slice(0, -1));
        } else if (input && !key.ctrl && !key.meta) {
          setRenameInput((prev) => prev + input);
        }
      } else if (mode === "confirm-delete") {
        if (input === "y" || input === "Y") {
          void deleteTag();
        } else {
          setMode("list");
        }
      }
    },
    { isActive: true }
  );

  if (loading) {
    return <Text>Loading tags...</Text>;
  }

  if (error) {
    return <Text color="red">Error loading tags: {String(error)}</Text>;
  }

  if (!tags || tags.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">No tags found.</Text>
        <Text color="gray">Press q to exit</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Tag Manager</Text>
      </Box>

      {mode === "list" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="gray">
              {"TAG".padEnd(30)} {"COUNT".padEnd(10)}
            </Text>
          </Box>
          <ScrollableBox height={15} focused={true}>
            {tags.map((tag, index) => {
              const isSelected = index === selectedIndex;
              return (
                <Box key={tag.name}>
                  <Text {...getSelectionProps(isSelected)}>
                    {isSelected ? "> " : "  "}
                    {tag.name.padEnd(28)} {String(tag.count).padStart(5)}
                  </Text>
                </Box>
              );
            })}
          </ScrollableBox>
          <Box marginTop={1}>
            <Text color="gray">
              k up | j down | Enter/Space view | r rename | d delete | q quit
            </Text>
          </Box>
        </Box>
      )}

      {mode === "prompts" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text>
              Tag:{" "}
              <Text color="cyan" bold>
                {selectedTag?.name}
              </Text>{" "}
              ({selectedTag?.count} prompts)
            </Text>
          </Box>
          {loadingPrompts ? (
            <Text>Loading prompts...</Text>
          ) : (
            <ScrollableBox height={15} focused={false}>
              {prompts.map((prompt) => (
                <Box key={prompt.id} flexDirection="column" marginBottom={1}>
                  <Text bold>{prompt.name}</Text>
                  <Text color="gray" dimColor>
                    {prompt.content.slice(0, 80)}...
                  </Text>
                </Box>
              ))}
            </ScrollableBox>
          )}
          <Box marginTop={1}>
            <Text color="gray">Press Esc to return</Text>
          </Box>
        </Box>
      )}

      {mode === "rename" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text>
              Rename tag: <Text color="yellow">{selectedTag?.name}</Text>
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text>New name: </Text>
            <Text>{renameInput}</Text>
            <Text backgroundColor="white" color="black">_</Text>
          </Box>
          {renaming ? (
            <Text>Renaming...</Text>
          ) : (
            <Text color="gray">Press Enter to confirm, Esc to cancel</Text>
          )}
        </Box>
      )}

      {mode === "confirm-delete" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="red">
              Delete tag <Text bold>{selectedTag?.name}</Text> from {selectedTag?.count} prompts?
            </Text>
          </Box>
          {deleting ? (
            <Text>Deleting...</Text>
          ) : (
            <Text color="gray">Press y to confirm, any other key to cancel</Text>
          )}
        </Box>
      )}
    </Box>
  );
};
