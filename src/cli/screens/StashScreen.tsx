/**
 * Stash Screen - View and manage stashed clipboard content
 *
 * Features:
 * - Two-panel layout: list (40%) + preview (60%)
 * - Keyboard navigation (j/k or arrows)
 * - Quick actions: Enter/p=pop, D=delete, Esc=back
 * - Pagination for large stash lists
 */

import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useAppState } from "../context/app-context.js";
import { useEffectRun, useEffectCallback } from "../context/runtime-context.js";
import { StashService, Clipboard } from "../../services/index.js";
import { ActionBar } from "../components/layout/action-bar.js";
import type { StashItem } from "../../models/stash.js";
import { safeBorderStyle } from "../components/theme.js";

const ITEMS_PER_PAGE = 10;

export const StashScreen: React.FC = () => {
  const { actions } = useAppState();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // Trigger refetch by incrementing refresh key
  const refetch = () => setRefreshKey((k) => k + 1);

  // Fetch stash items
  const {
    result: items,
    error,
    loading,
  } = useEffectRun(
    Effect.gen(function* () {
      const stash = yield* StashService;
      return yield* stash.list();
    }),
    [refreshKey]
  );

  // Pop item callback
  const { execute: popItem } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!paginatedItems || paginatedItems.length === 0) return null;
      const selected = paginatedItems[selectedIndex];
      if (!selected) return null;

      const stash = yield* StashService;
      const clipboard = yield* Clipboard;

      const item = selected.name
        ? yield* stash.popByName(selected.name)
        : yield* stash.pop();

      yield* clipboard.copy(item.content);
      return item;
    })
  );

  // Delete item callback
  const { execute: deleteItem } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!paginatedItems || paginatedItems.length === 0) return;
      const selected = paginatedItems[selectedIndex];
      if (!selected) return;

      const stash = yield* StashService;
      yield* stash.delete(selected.id);
    })
  );

  // Pagination
  const totalPages = Math.ceil((items?.length ?? 0) / ITEMS_PER_PAGE);
  const paginatedItems = useMemo(() => {
    if (!items) return [];
    const start = currentPage * ITEMS_PER_PAGE;
    return items.slice(start, start + ITEMS_PER_PAGE);
  }, [items, currentPage]);

  // Selected item for preview
  const selectedItem: StashItem | null = paginatedItems[selectedIndex] ?? null;

  // Keyboard handling
  useInput((input, key) => {
    if (key.escape) {
      actions.goBack();
      return;
    }

    // Navigation
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(paginatedItems.length - 1, prev + 1));
    } else if (key.pageUp || input === "u") {
      if (currentPage > 0) {
        setCurrentPage(currentPage - 1);
        setSelectedIndex(0);
      }
    } else if (key.pageDown || input === "d") {
      if (currentPage < totalPages - 1) {
        setCurrentPage(currentPage + 1);
        setSelectedIndex(0);
      }
    } else if (input === "g") {
      // Go to first item
      setCurrentPage(0);
      setSelectedIndex(0);
    } else if (input === "G") {
      // Go to last item
      setCurrentPage(totalPages - 1);
      setSelectedIndex(Math.min(ITEMS_PER_PAGE - 1, (items?.length ?? 0) % ITEMS_PER_PAGE || ITEMS_PER_PAGE) - 1);
    }

    // Actions
    else if (key.return || input === "p") {
      // Pop selected item to clipboard
      popItem()
        .then((result) => {
          if (result) {
            actions.showNotification({ type: "success", message: "Popped to clipboard" });
            refetch();
            // Adjust selection if needed
            if (selectedIndex >= (paginatedItems.length - 1) && selectedIndex > 0) {
              setSelectedIndex(selectedIndex - 1);
            }
          }
        })
        .catch((err) => {
          actions.showNotification({ type: "error", message: String(err) });
        });
    } else if (input === "D") {
      // Delete without copying
      deleteItem()
        .then(() => {
          actions.showNotification({ type: "success", message: "Item deleted" });
          refetch();
          // Adjust selection if needed
          if (selectedIndex >= (paginatedItems.length - 1) && selectedIndex > 0) {
            setSelectedIndex(selectedIndex - 1);
          }
        })
        .catch((err) => {
          actions.showNotification({ type: "error", message: String(err) });
        });
    } else if (input === "q") {
      process.exit(0);
    }
  });

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Loading stash...</Text>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {String(error)}</Text>
        <ActionBar actions={[{ key: "Esc", label: "Back" }]} />
      </Box>
    );
  }

  // Empty state
  if (!items || items.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Stash
        </Text>
        <Box marginTop={1}>
          <Text color="yellow">Stash is empty.</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Use "grimoire stash" to save clipboard content.</Text>
        </Box>
        <Box marginTop={1}>
          <ActionBar actions={[{ key: "Esc", label: "Back" }, { key: "q", label: "Quit" }]} />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Stash ({items.length} items)
        </Text>
        {totalPages > 1 && <Text dimColor> - Page {currentPage + 1}/{totalPages}</Text>}
      </Box>

      {/* Two-panel layout */}
      <Box flexDirection="row" height={16}>
        {/* Left panel: List */}
        <Box flexDirection="column" width="40%" borderStyle={safeBorderStyle} paddingX={1}>
          <Box marginBottom={1}>
            <Text bold dimColor>Items</Text>
          </Box>
          {paginatedItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            const displayName = item.name ?? `#${item.stackOrder}`;
            const preview = item.content.slice(0, 25).replace(/\n/g, " ");

            return (
              <Box key={item.id}>
                <Text
                  inverse={isSelected}
                  color={isSelected ? "white" : undefined}
                  backgroundColor={isSelected ? "blue" : undefined}
                >
                  {isSelected ? ">" : " "} {displayName.padEnd(12).slice(0, 12)} {preview.slice(0, 20)}...
                </Text>
              </Box>
            );
          })}
        </Box>

        {/* Right panel: Preview */}
        <Box flexDirection="column" width="60%" borderStyle={safeBorderStyle} paddingX={1}>
          {selectedItem ? (
            <>
              <Box marginBottom={1}>
                <Text bold color="cyan">
                  {selectedItem.name ?? `Item #${selectedItem.stackOrder}`}
                </Text>
                <Text dimColor> ({selectedItem.content.length} chars)</Text>
              </Box>
              <Box flexDirection="column" height={12} overflow="hidden">
                {selectedItem.content.split("\n").slice(0, 12).map((line, i) => (
                  <Text key={i} wrap="truncate">
                    {line}
                  </Text>
                ))}
                {selectedItem.content.split("\n").length > 12 && (
                  <Text dimColor>... ({selectedItem.content.split("\n").length - 12} more lines)</Text>
                )}
              </Box>
            </>
          ) : (
            <Text dimColor>No item selected</Text>
          )}
        </Box>
      </Box>

      {/* Action Bar */}
      <Box marginTop={1}>
        <ActionBar
          actions={[
            { key: "j/k", label: "Navigate" },
            { key: "Enter/p", label: "Pop" },
            { key: "D", label: "Delete" },
            { key: "Esc", label: "Back" },
            { key: "q", label: "Quit" },
          ]}
        />
      </Box>
    </Box>
  );
};
