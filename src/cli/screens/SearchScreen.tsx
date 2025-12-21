/**
 * Search Screen - Interactive full-text search with live results
 *
 * Features:
 * - Live search with debounced query (200ms)
 * - Results update as you type
 * - Highlighted matches in results
 * - Tag filter chips (toggle on/off)
 * - Navigate results with arrows
 * - Enter to view selected result
 */

import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useAppState } from "../context/app-context.js";
import { useEffectCallback } from "../context/runtime-context.js";
import { SearchService, TagService } from "../../services";
import type { SearchResult, TagWithCount, Range } from "../../services";
import { TextInput } from "../components/input/text-input.js";
import { ActionBar } from "../components/layout/action-bar.js";

/**
 * Input mode enumeration
 */
type InputMode = "search" | "results" | "tags";

/**
 * SearchScreen Component
 *
 * Provides a full-featured search interface with:
 * - Real-time search as you type
 * - Tag filtering
 * - Result highlighting
 * - Navigation and selection
 */
export const SearchScreen: React.FC = () => {
  const { actions } = useAppState();

  // State management
  const [inputMode, setInputMode] = useState<InputMode>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [availableTags, setAvailableTags] = useState<TagWithCount[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedTagIndex, setSelectedTagIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  // Refs for debouncing
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load available tags on mount
  const { execute: loadTags } = useEffectCallback(() =>
    Effect.gen(function* () {
      const tagService = yield* TagService;
      return yield* tagService.listTags();
    })
  );

  // Perform search
  const { execute: performSearch } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!query.trim()) {
        return [];
      }

      const searchService = yield* SearchService;
      return yield* searchService.search({
        query: query.trim(),
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        fuzzy: true,
        limit: 50,
      });
    })
  );

  // Load tags on mount
  useEffect(() => {
    void loadTags().then((tags) => {
      setAvailableTags(tags);
    });
  }, []);

  // Debounced search effect
  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // If query is empty, clear results immediately
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    // Set searching state
    setIsSearching(true);

    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      performSearch()
        .then((searchResults) => {
          setResults(searchResults);
          setSelectedResultIndex(0);
        })
        .catch((error) => {
          console.error("Search error:", error);
          setResults([]);
        })
        .finally(() => {
          setIsSearching(false);
        });
    }, 200); // 200ms debounce

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, selectedTags]);

  // Reset selected result index when results change
  useEffect(() => {
    setSelectedResultIndex(0);
  }, [results]);

  // Keyboard input handling
  useInput(
    (input, key) => {
      // Global escape handler
      if (key.escape) {
        if (inputMode === "tags") {
          setInputMode("search");
        } else if (inputMode === "results" && results.length > 0) {
          setInputMode("search");
        } else {
          actions.goBack();
        }
        return;
      }

      // Mode-specific handlers
      if (inputMode === "search") {
        // Tab to switch to tag filtering
        if (key.tab) {
          if (availableTags.length > 0) {
            setInputMode("tags");
          }
        }
        // Down arrow to navigate to results
        else if (key.downArrow && results.length > 0) {
          setInputMode("results");
        }
      } else if (inputMode === "results") {
        // Navigate results
        if (key.upArrow) {
          if (selectedResultIndex === 0) {
            setInputMode("search");
          } else {
            setSelectedResultIndex((prev) => Math.max(0, prev - 1));
          }
        } else if (key.downArrow) {
          setSelectedResultIndex((prev) => Math.min(results.length - 1, prev + 1));
        }
        // Enter to view selected result
        else if (key.return) {
          const selectedResult = results[selectedResultIndex];
          if (selectedResult) {
            actions.navigate({
              name: "view",
              promptId: selectedResult.prompt.id,
            });
          }
        }
        // Tab to switch to tag filtering
        else if (key.tab) {
          if (availableTags.length > 0) {
            setInputMode("tags");
          }
        }
        // Slash to return to search
        else if (input === "/") {
          setInputMode("search");
        }
      } else if (inputMode === "tags") {
        // Navigate tag chips
        if (key.leftArrow) {
          setSelectedTagIndex((prev) => Math.max(0, prev - 1));
        } else if (key.rightArrow) {
          setSelectedTagIndex((prev) => Math.min(availableTags.length - 1, prev + 1));
        }
        // Space or Enter to toggle tag
        else if (key.return || input === " ") {
          const selectedTag = availableTags[selectedTagIndex];
          if (selectedTag) {
            setSelectedTags((prev) => {
              if (prev.includes(selectedTag.name)) {
                return prev.filter((t) => t !== selectedTag.name);
              } else {
                return [...prev, selectedTag.name];
              }
            });
          }
        }
        // Tab to return to search
        else if (key.tab) {
          setInputMode("search");
        }
      }
    },
    { isActive: true }
  );

  /**
   * Highlight text using Range array
   */
  const highlightText = (text: string, highlights: Range[]): React.ReactNode => {
    if (highlights.length === 0) {
      return <Text>{text}</Text>;
    }

    const segments: React.ReactNode[] = [];
    let lastEnd = 0;

    highlights.forEach((range, index) => {
      // Add text before highlight
      if (range.start > lastEnd) {
        segments.push(<Text key={`before-${index}`}>{text.slice(lastEnd, range.start)}</Text>);
      }
      // Add highlighted text
      segments.push(
        <Text key={`highlight-${index}`} color="yellow" bold>
          {text.slice(range.start, range.end)}
        </Text>
      );
      lastEnd = range.end;
    });

    // Add remaining text
    if (lastEnd < text.length) {
      segments.push(<Text key="after">{text.slice(lastEnd)}</Text>);
    }

    return <>{segments}</>;
  };

  /**
   * Render tag chips
   */
  const renderTagChips = (): React.ReactNode => {
    if (availableTags.length === 0) {
      return null;
    }

    return (
      <Box marginBottom={1} flexWrap="wrap" gap={1}>
        <Text color="gray">Tags: </Text>
        {availableTags.slice(0, 10).map((tag, index) => {
          const isActive = selectedTags.includes(tag.name);
          const isSelected = inputMode === "tags" && index === selectedTagIndex;

          return (
            <Box key={tag.name} marginRight={1}>
              <Text
                color={isActive ? "green" : "gray"}
                backgroundColor={isSelected ? "white" : undefined}
                inverse={isSelected}
                bold={isActive}
              >
                {isActive ? "[x " : "[ "}
                {tag.name}
                {"]"}
              </Text>
            </Box>
          );
        })}
      </Box>
    );
  };

  /**
   * Render search results
   */
  const renderResults = (): React.ReactNode => {
    if (!query) {
      return (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Type to search prompts...
          </Text>
        </Box>
      );
    }

    if (isSearching) {
      return (
        <Box marginTop={1}>
          <Text color="cyan">Searching...</Text>
        </Box>
      );
    }

    if (results.length === 0) {
      return (
        <Box marginTop={1}>
          <Text color="yellow">No results found.</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" marginTop={1}>
        <Box marginBottom={1}>
          <Text color="gray">
            Found {results.length} result{results.length !== 1 ? "s" : ""}
          </Text>
        </Box>

        {results.map((result, index) => {
          const isSelected = index === selectedResultIndex;
          const marker = isSelected ? "> " : "  ";

          return (
            <Box key={result.prompt.id} flexDirection="column" marginBottom={1}>
              <Text
                color={isSelected ? "green" : undefined}
                bold={isSelected}
                inverse={isSelected && inputMode === "results"}
              >
                {marker}
                {index + 1}. {result.prompt.name}
              </Text>
              <Box paddingLeft={4}>
                <Text color="gray" dimColor>
                  {highlightText(result.snippet, result.highlights)}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    );
  };

  /**
   * Render action bar
   */
  const renderActionBar = (): React.ReactNode => {
    const actions = [];

    if (inputMode === "search") {
      actions.push({ key: "j", label: "Results" });
      if (availableTags.length > 0) {
        actions.push({ key: "Tab", label: "Filter Tags" });
      }
      actions.push({ key: "Esc", label: "Back" });
    } else if (inputMode === "results") {
      actions.push({ key: "j/k", label: "Navigate" });
      actions.push({ key: "Enter", label: "View" });
      if (availableTags.length > 0) {
        actions.push({ key: "Tab", label: "Filter Tags" });
      }
      actions.push({ key: "/", label: "Search" });
      actions.push({ key: "Esc", label: "Back" });
    } else if (inputMode === "tags") {
      actions.push({ key: "h/l", label: "Navigate" });
      actions.push({ key: "Space", label: "Toggle" });
      actions.push({ key: "Tab", label: "Search" });
      actions.push({ key: "Esc", label: "Back" });
    }

    return <ActionBar actions={actions} />;
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Search Prompts
        </Text>
      </Box>

      {/* Search Input */}
      <Box marginBottom={1}>
        <Text>Search: </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder="type to search..."
          focused={inputMode === "search"}
        />
        {isSearching && (
          <Text color="gray" dimColor>
            {" "}
            (searching...)
          </Text>
        )}
      </Box>

      {/* Tag Filter Chips */}
      {renderTagChips()}

      {/* Search Results */}
      {renderResults()}

      {/* Action Bar */}
      <Box marginTop={1}>{renderActionBar()}</Box>
    </Box>
  );
};
