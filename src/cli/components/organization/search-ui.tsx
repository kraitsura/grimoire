/**
 * SearchUI Component - Interactive full-text search interface
 *
 * Features:
 * - Search input with debounce
 * - Results list with highlights
 * - Tag filter chips
 * - Preview pane for selected result
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Effect } from "effect";
import { useEffectCallback } from "../../context";
import { SearchService, type SearchResult } from "../../../services";
import { ScrollableBox } from "../input/scrollable-box";

export interface SearchUIProps {
  onExit?: () => void;
  onSelect?: (result: SearchResult) => void;
}

type Mode = "input" | "results" | "preview";

export const SearchUI: React.FC<SearchUIProps> = ({ onExit, onSelect }) => {
  const [mode, setMode] = useState<Mode>("input");
  const [query, setQuery] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searching, setSearching] = useState(false);

  // Search mutation with debounce
  const { execute: performSearch } = useEffectCallback(() =>
    Effect.gen(function* () {
      if (!query.trim()) {
        return [];
      }
      const searchService = yield* SearchService;
      return yield* searchService.search({
        query: query.trim(),
        tags: tagFilters.length > 0 ? tagFilters : undefined,
        fuzzy: true,
        limit: 50,
      });
    })
  );

  // Debounced search effect
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setSearching(true);
    const timer = setTimeout(() => {
      performSearch()
        .then((searchResults) => {
          setResults(searchResults);
          setSelectedIndex(0);
        })
        .finally(() => {
          setSearching(false);
        });
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query, tagFilters]);

  const selectedResult = results[selectedIndex];

  useInput(
    (input, key) => {
      if (key.escape || input === "q") {
        if (mode === "preview") {
          setMode("results");
        } else if (mode === "results" && results.length > 0) {
          setMode("input");
        } else {
          onExit?.();
        }
        return;
      }

      if (mode === "input") {
        if (key.backspace || key.delete) {
          setQuery((prev) => prev.slice(0, -1));
        } else if (key.downArrow && results.length > 0) {
          setMode("results");
        } else if (input && !key.ctrl && !key.meta) {
          setQuery((prev) => prev + input);
        }
      } else if (mode === "results") {
        if (key.upArrow || input === "k") {
          if (selectedIndex === 0) {
            setMode("input");
          } else {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
          }
        } else if (key.downArrow || input === "j") {
          setSelectedIndex((prev) => Math.min(results.length - 1, prev + 1));
        } else if (key.return || input === " ") {
          setMode("preview");
        } else if (input === "s") {
          if (selectedResult) {
            onSelect?.(selectedResult);
          }
        } else if (input === "/") {
          setMode("input");
        }
      } else if (mode === "preview") {
        // In preview mode, most navigation returns to results
        if (key.upArrow || key.downArrow || input === "k" || input === "j") {
          setMode("results");
        }
      }
    },
    { isActive: true }
  );

  // Highlight text function
  const highlightText = (text: string, highlights: Array<{ start: number; end: number }>) => {
    if (highlights.length === 0) {
      return <Text>{text}</Text>;
    }

    const segments: React.ReactNode[] = [];
    let lastEnd = 0;

    highlights.forEach((range, index) => {
      // Add text before highlight
      if (range.start > lastEnd) {
        segments.push(
          <Text key={`before-${index}`}>{text.slice(lastEnd, range.start)}</Text>
        );
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

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Search Prompts</Text>
      </Box>

      {/* Search Input */}
      <Box marginBottom={1}>
        <Text>Search: </Text>
        <Text>{query}</Text>
        {mode === "input" && <Text inverse> </Text>}
        {searching && <Text color="gray"> (searching...)</Text>}
      </Box>

      {/* Tag Filters */}
      {tagFilters.length > 0 && (
        <Box marginBottom={1} flexWrap="wrap">
          <Text color="gray">Filters: </Text>
          {tagFilters.map((tag, index) => (
            <Box key={index} marginRight={1}>
              <Text color="cyan" backgroundColor="black" bold>
                {" "}
                {tag}{" "}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Results count */}
      {query && (
        <Box marginBottom={1}>
          <Text color="gray">
            Found {results.length} result{results.length !== 1 ? "s" : ""}
          </Text>
        </Box>
      )}

      {/* Results List */}
      {mode !== "preview" && results.length > 0 && (
        <Box flexDirection="column">
          <ScrollableBox height={12} focused={mode === "results"}>
            {results.map((result, index) => {
              const isSelected = index === selectedIndex;
              return (
                <Box key={result.prompt.id} flexDirection="column" marginBottom={1}>
                  <Text
                    color={isSelected ? "green" : undefined}
                    bold={isSelected}
                    inverse={isSelected && mode === "results"}
                  >
                    {isSelected ? "> " : "  "}
                    {result.prompt.name}
                  </Text>
                  <Box paddingLeft={2}>
                    <Text color="gray" dimColor>
                      {highlightText(result.snippet, result.highlights)}
                    </Text>
                  </Box>
                </Box>
              );
            })}
          </ScrollableBox>
        </Box>
      )}

      {/* Preview Pane */}
      {mode === "preview" && selectedResult && (
        <Box flexDirection="column">
          <Box marginBottom={1} paddingX={1} borderStyle="single">
            <Box flexDirection="column" width="100%">
              <Text bold color="cyan">
                {selectedResult.prompt.name}
              </Text>
              <Box marginTop={1}>
                <Text color="gray">Tags: </Text>
                <Text>{selectedResult.prompt.tags?.join(", ") || "none"}</Text>
              </Box>
              <Box marginTop={1}>
                <Text color="gray">Updated: </Text>
                <Text>{selectedResult.prompt.updated.toISOString().split("T")[0]}</Text>
              </Box>
            </Box>
          </Box>
          <ScrollableBox height={10} focused={false}>
            {selectedResult.prompt.content.split("\n").map((line, index) => (
              <Text key={index}>{line}</Text>
            ))}
          </ScrollableBox>
        </Box>
      )}

      {/* Help Text */}
      <Box marginTop={1}>
        <Text color="gray">
          {mode === "input" && "↓ results | Type to search | Esc/q quit"}
          {mode === "results" &&
            "↑/k up | ↓/j down | Enter/Space preview | s select | / search | Esc back | q quit"}
          {mode === "preview" && "Esc back | q quit"}
        </Text>
      </Box>
    </Box>
  );
};
