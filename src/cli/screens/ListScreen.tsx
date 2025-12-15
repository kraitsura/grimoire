/**
 * List Screen - Main screen displaying all prompts in a navigable table
 *
 * Features:
 * - Table with columns: Name, Tags, Updated
 * - Keyboard navigation (j/k or arrows)
 * - Selected row highlighting
 * - Quick actions: Enter=view, e=edit, c=copy, d=delete, a=add
 * - Pagination for large lists
 * - Tag filter toggle (press 't')
 * - Search shortcut (press '/')
 */

import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useAppState } from "../context/app-context.js";
import { useEffectRun, useEffectCallback } from "../context/runtime-context.js";
import { StorageService, Clipboard } from "../../services/index.js";
import { ActionBar } from "../components/layout/action-bar.js";
import { TextInput } from "../components/input/text-input.js";

/**
 * Input mode for keyboard focus management
 */
type InputMode = "list" | "tagFilter";

const ITEMS_PER_PAGE = 15;

interface FilterState {
  tags: string[];
  searchQuery: string;
}

export const ListScreen: React.FC = () => {
  const { actions } = useAppState();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("list");
  const [tagFilterQuery, setTagFilterQuery] = useState("");
  const [selectedTagIndex, setSelectedTagIndex] = useState(0);
  const [filter, setFilter] = useState<FilterState>({
    tags: [],
    searchQuery: "",
  });

  // Fetch all prompts
  const {
    result: prompts,
    error,
    loading,
  } = useEffectRun(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.getAll;
    }),
    []
  );

  // Setup clipboard callback
  const { execute: copyToClipboard } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!filteredPrompts || filteredPrompts.length === 0) return;
      const selectedPrompt = filteredPrompts[selectedIndex];
      if (!selectedPrompt) return;

      const clipboard = yield* Clipboard;
      yield* clipboard.copy(selectedPrompt.content);
    })
  );

  // Setup delete callback
  const { execute: deletePrompt } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!filteredPrompts || filteredPrompts.length === 0) return;
      const selectedPrompt = filteredPrompts[selectedIndex];
      if (!selectedPrompt) return;

      const storage = yield* StorageService;
      yield* storage.delete(selectedPrompt.id);
    })
  );

  // Filter and sort prompts
  const filteredPrompts = useMemo(() => {
    if (!prompts) return [];

    let filtered = [...prompts];

    // Apply tag filter
    if (filter.tags.length > 0) {
      filtered = filtered.filter((prompt) =>
        filter.tags.every((tag) => prompt.tags?.includes(tag))
      );
    }

    // Apply search filter (simple name/content search)
    if (filter.searchQuery.trim()) {
      const query = filter.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (prompt) =>
          prompt.name.toLowerCase().includes(query) ||
          prompt.content.toLowerCase().includes(query) ||
          prompt.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Sort: pinned first, then by updated date
    return filtered.sort((a, b) => {
      // Pinned items first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      // Then by pin order if both pinned
      if (a.isPinned && b.isPinned) {
        const orderA = a.pinOrder ?? 0;
        const orderB = b.pinOrder ?? 0;
        if (orderA !== orderB) return orderA - orderB;
      }

      // Then favorites
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;

      // Finally by updated date (most recent first)
      return b.updated.getTime() - a.updated.getTime();
    });
  }, [prompts, filter]);

  // Pagination
  const totalPages = Math.ceil(filteredPrompts.length / ITEMS_PER_PAGE);
  const paginatedPrompts = useMemo(() => {
    const start = currentPage * ITEMS_PER_PAGE;
    return filteredPrompts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPrompts, currentPage]);

  // Reset to first page when filter changes
  useEffect(() => {
    setCurrentPage(0);
    setSelectedIndex(0);
  }, [filter]);

  // Ensure selected index is valid
  useEffect(() => {
    if (selectedIndex >= paginatedPrompts.length && paginatedPrompts.length > 0) {
      setSelectedIndex(paginatedPrompts.length - 1);
    }
  }, [selectedIndex, paginatedPrompts.length]);

  // Extract unique tags for filter
  const availableTags = useMemo(() => {
    if (!prompts) return [];
    const tagSet = new Set<string>();
    prompts.forEach((p) => p.tags?.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [prompts]);

  // Filter available tags based on search query
  const filteredTags = useMemo(() => {
    if (!tagFilterQuery.trim()) {
      return availableTags;
    }
    const query = tagFilterQuery.toLowerCase();
    return availableTags.filter((tag) => tag.toLowerCase().includes(query));
  }, [availableTags, tagFilterQuery]);

  // Reset tag selection when filtered tags change
  useEffect(() => {
    if (selectedTagIndex >= filteredTags.length && filteredTags.length > 0) {
      setSelectedTagIndex(filteredTags.length - 1);
    }
  }, [filteredTags.length, selectedTagIndex]);

  // Keyboard input handling
  useInput((input, key) => {
    // Global escape handler - exits tag filter mode or quits
    if (key.escape) {
      if (inputMode === "tagFilter") {
        setInputMode("list");
        setShowTagFilter(false);
        setTagFilterQuery("");
        return;
      }
    }

    // Tag filter mode - capture all input for tag navigation
    if (inputMode === "tagFilter") {
      // Navigate tags with arrows
      if (key.upArrow || key.leftArrow) {
        setSelectedTagIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || key.rightArrow) {
        setSelectedTagIndex((prev) => Math.min(filteredTags.length - 1, prev + 1));
        return;
      }

      // Toggle tag with Space or Enter
      if (key.return || input === " ") {
        const selectedTag = filteredTags[selectedTagIndex];
        if (selectedTag) {
          setFilter((prev) => {
            const newTags = prev.tags.includes(selectedTag)
              ? prev.tags.filter((t) => t !== selectedTag)
              : [...prev.tags, selectedTag];
            return { ...prev, tags: newTags };
          });
        }
        return;
      }

      // Tab exits tag filter mode
      if (key.tab) {
        setInputMode("list");
        setShowTagFilter(false);
        setTagFilterQuery("");
        return;
      }

      // All other input goes to tag filter search (handled by TextInput)
      return;
    }

    // List mode - normal keybinds
    // Navigation
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => {
        const newIndex = Math.max(0, prev - 1);
        // Auto-scroll to previous page if needed
        if (newIndex < 0 && currentPage > 0) {
          setCurrentPage(currentPage - 1);
          return ITEMS_PER_PAGE - 1;
        }
        return newIndex;
      });
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => {
        const newIndex = Math.min(paginatedPrompts.length - 1, prev + 1);
        // Auto-scroll to next page if needed
        if (newIndex >= paginatedPrompts.length && currentPage < totalPages - 1) {
          setCurrentPage(currentPage + 1);
          return 0;
        }
        return newIndex;
      });
    }

    // Page navigation
    else if (key.pageUp || input === "u") {
      if (currentPage > 0) {
        setCurrentPage(currentPage - 1);
        setSelectedIndex(0);
      }
    } else if (key.pageDown || input === "d") {
      if (currentPage < totalPages - 1) {
        setCurrentPage(currentPage + 1);
        setSelectedIndex(0);
      }
    }

    // Jump to first/last
    else if (input === "g") {
      setCurrentPage(0);
      setSelectedIndex(0);
    } else if (input === "G") {
      setCurrentPage(totalPages - 1);
      setSelectedIndex(Math.min(paginatedPrompts.length - 1, ITEMS_PER_PAGE - 1));
    }

    // Actions
    else if (key.return) {
      // View selected prompt
      const prompt = paginatedPrompts[selectedIndex];
      if (prompt) {
        actions.navigate({ name: "view", promptId: prompt.id });
      }
    } else if (input === "e") {
      // Edit selected prompt
      const prompt = paginatedPrompts[selectedIndex];
      if (prompt) {
        actions.navigate({ name: "edit", promptId: prompt.id });
      }
    } else if (input === "c") {
      // Copy to clipboard
      copyToClipboard()
        .then(() => {
          actions.showNotification({
            type: "success",
            message: "Copied to clipboard",
          });
        })
        .catch((err) => {
          actions.showNotification({
            type: "error",
            message: `Failed to copy: ${err}`,
          });
        });
    } else if (input === "D") {
      // Delete (capital D to avoid accidental deletion)
      deletePrompt()
        .then(() => {
          actions.showNotification({
            type: "success",
            message: "Prompt deleted",
          });
          // Reload would happen via Effect's reactivity
        })
        .catch((err) => {
          actions.showNotification({
            type: "error",
            message: `Failed to delete: ${err}`,
          });
        });
    } else if (input === "a") {
      // Add new prompt
      actions.navigate({ name: "edit" });
    } else if (input === "/") {
      // Search
      actions.navigate({ name: "search" });
    } else if (input === "t") {
      // Enter tag filter mode
      setInputMode("tagFilter");
      setShowTagFilter(true);
      setTagFilterQuery("");
      setSelectedTagIndex(0);
    }

    // Dashboard shortcuts
    else if (input === "T") {
      // Test Dashboard - test selected prompt or pick one
      const prompt = paginatedPrompts[selectedIndex];
      actions.navigate({ name: "test", promptId: prompt?.id });
    } else if (input === "C") {
      // Chain Dashboard
      actions.navigate({ name: "chain" });
    } else if (input === "B") {
      // Benchmark Dashboard
      actions.navigate({ name: "benchmark" });
    } else if (input === "M") {
      // Compare Dashboard
      actions.navigate({ name: "compare" });
    } else if (input === "L") {
      // LLM Config Dashboard
      actions.navigate({ name: "llmconfig" });
    } else if (input === "P") {
      // Pinned Prompts Dashboard
      actions.navigate({ name: "pinned" });
    } else if (input === "m") {
      // Templates Dashboard
      actions.navigate({ name: "templates" });
    } else if (input === "h") {
      // History for selected prompt
      const prompt = paginatedPrompts[selectedIndex];
      if (prompt) {
        actions.navigate({ name: "history", promptId: prompt.id });
      }
    } else if (input === "s") {
      // Settings
      actions.navigate({ name: "settings" });
    }

    // Quick exit
    else if (input === "q") {
      process.exit(0);
    }
  });

  // Render loading state
  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Loading prompts...</Text>
      </Box>
    );
  }

  // Render error state
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error loading prompts:</Text>
        <Text color="red">{String(error)}</Text>
      </Box>
    );
  }

  // Render empty state
  if (!prompts || prompts.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">No prompts found.</Text>
        <Text dimColor>Press [a] to add a new prompt</Text>
        <Box marginTop={1}>
          <ActionBar
            actions={[
              { key: "a", label: "Add" },
              { key: "q", label: "Quit" },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Format date for display
  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toISOString().split("T")[0];
  };

  // Truncate and pad text
  const truncate = (text: string, length: number): string => {
    if (text.length <= length) return text.padEnd(length);
    return text.slice(0, length - 1) + "…";
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Prompts ({filteredPrompts.length})
        </Text>
        {filter.tags.length > 0 && (
          <Text color="yellow"> [Filtered by: {filter.tags.join(", ")}]</Text>
        )}
        {totalPages > 1 && (
          <Text color="gray">
            {" "}
            - Page {currentPage + 1}/{totalPages}
          </Text>
        )}
      </Box>

      {/* Table Header */}
      <Box>
        <Text bold color="blue">
          {"  "}
          {truncate("NAME", 30)} {truncate("TAGS", 25)} {truncate("UPDATED", 12)}
        </Text>
      </Box>

      {/* Table Rows */}
      {paginatedPrompts.length === 0 ? (
        <Box marginY={1}>
          <Text color="yellow">No prompts match the current filter.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {paginatedPrompts.map((prompt, index) => {
            const isSelected = index === selectedIndex;
            const prefix = prompt.isPinned ? "📌" : prompt.isFavorite ? "⭐" : "  ";
            const tags = prompt.tags?.join(", ") ?? "";

            return (
              <Box key={prompt.id}>
                <Text
                  inverse={isSelected}
                  color={isSelected ? "white" : undefined}
                  backgroundColor={isSelected ? "blue" : undefined}
                >
                  {prefix}
                  {truncate(prompt.name, 30)} <Text color="gray">{truncate(tags, 25)}</Text>{" "}
                  <Text dimColor>{truncate(formatDate(prompt.updated), 12)}</Text>
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Tag Filter (if shown) */}
      {showTagFilter && (
        <Box marginTop={1} borderStyle="single" paddingX={1} flexDirection="column">
          <Box marginBottom={1}>
            <Text color="cyan">Filter tags: </Text>
            <TextInput
              value={tagFilterQuery}
              onChange={setTagFilterQuery}
              placeholder="type to filter..."
              focused={inputMode === "tagFilter"}
            />
          </Box>
          <Box flexWrap="wrap" gap={1}>
            {filteredTags.length === 0 ? (
              <Text color="gray" dimColor>
                No matching tags
              </Text>
            ) : (
              filteredTags.map((tag, index) => {
                const isActive = filter.tags.includes(tag);
                const isSelected = inputMode === "tagFilter" && index === selectedTagIndex;
                return (
                  <Text
                    key={tag}
                    color={isActive ? "green" : "gray"}
                    backgroundColor={isSelected ? "white" : undefined}
                    inverse={isSelected}
                    bold={isActive}
                  >
                    {isActive ? "[x] " : "[ ] "}
                    {tag}
                  </Text>
                );
              })
            )}
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>
              ←/→ navigate | Space/Enter toggle | Tab/Esc exit
            </Text>
          </Box>
        </Box>
      )}

      {/* Action Bar */}
      <Box marginTop={1}>
        <ActionBar
          actions={[
            { key: "↑↓", label: "Nav" },
            { key: "Enter", label: "View" },
            { key: "e", label: "Edit" },
            { key: "c", label: "Copy" },
            { key: "a", label: "Add" },
            { key: "/", label: "Search" },
            { key: "t", label: "Tags" },
            { key: "h", label: "History" },
            { key: "?", label: "More" },
          ]}
        />
      </Box>

      {/* Dashboard shortcuts hint */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Dashboards: [T]est [C]hains [B]enchmark co[M]pare [L]LM [P]inned te[m]plates [s]ettings
        </Text>
      </Box>

      {/* Pagination hint */}
      {totalPages > 1 && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Pages: u/d (prev/next) | g/G (first/last)
          </Text>
        </Box>
      )}
    </Box>
  );
};
