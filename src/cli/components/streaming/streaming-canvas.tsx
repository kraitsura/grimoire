/**
 * StreamingCanvas - Main component for displaying streaming LLM responses
 *
 * Features:
 * - Status bar showing streaming state
 * - ThinkingPanel for reasoning tokens (collapsible)
 * - ScrollableBox for response content with cursor indicator
 * - Token usage stats when complete
 */

import React from "react";
import { Box, Text } from "ink";
import { ThinkingPanel } from "./thinking-panel.js";
import { ScrollableBox } from "../input/scrollable-box.js";
import { safeBorderStyle } from "../theme.js";

export interface StreamingCanvasProps {
  thinking: string;
  content: string;
  isStreaming: boolean;
  isDone: boolean;
  error?: string | null;
  usage?: { inputTokens: number; outputTokens: number };
  model?: string;
  showCursor?: boolean;
  height?: number;
  focused?: boolean;
}

export const StreamingCanvas: React.FC<StreamingCanvasProps> = ({
  thinking,
  content,
  isStreaming,
  isDone,
  error,
  usage,
  model,
  showCursor = true,
  height = 15,
  focused = true,
}) => {
  // Determine current phase for status display
  const isConnecting = isStreaming && !thinking && !content;
  const isThinking = isStreaming && thinking && !content;
  const isResponding = isStreaming && content;

  return (
    <Box flexDirection="column">
      {/* Status bar */}
      <Box marginBottom={1} gap={2}>
        {isConnecting && (
          <Text color="yellow" bold>
            Connecting...
          </Text>
        )}
        {isThinking && (
          <Text color="magenta" bold>
            Thinking...
          </Text>
        )}
        {isResponding && (
          <Text color="cyan" bold>
            Streaming...
          </Text>
        )}
        {isDone && !error && (
          <Text color="green" bold>
            Complete
          </Text>
        )}
        {error && (
          <Text color="red" bold>
            Error
          </Text>
        )}
        {model && (
          <Text dimColor>Model: {model}</Text>
        )}
      </Box>

      {/* Error display */}
      {error && (
        <Box
          borderStyle={safeBorderStyle}
          borderColor="red"
          paddingX={1}
          marginBottom={1}
        >
          <Text color="red">{error}</Text>
        </Box>
      )}

      {/* Thinking section (collapsible) */}
      {thinking && (
        <ThinkingPanel
          content={thinking}
          isStreaming={isStreaming && !content}
          focused={focused}
        />
      )}

      {/* Main content area */}
      <Box
        flexDirection="column"
        borderStyle={safeBorderStyle}
        borderColor={isDone && !error ? "green" : isStreaming ? "cyan" : undefined}
        paddingX={1}
      >
        <ScrollableBox height={height} focused={focused}>
          <Text>
            {content || (isConnecting ? "Waiting for response..." : isThinking ? "" : error ? "No output due to error" : "")}
          </Text>
          {(isResponding || isConnecting) && showCursor && (
            <Text color="cyan">|</Text>
          )}
        </ScrollableBox>
      </Box>

      {/* Usage stats */}
      {isDone && usage && (
        <Box marginTop={1} gap={2}>
          <Text dimColor>
            Tokens: {usage.inputTokens.toLocaleString()} in / {usage.outputTokens.toLocaleString()} out
          </Text>
        </Box>
      )}

      {/* Help hint */}
      {thinking && focused && (
        <Box marginTop={1}>
          <Text dimColor>
            [t] toggle thinking | [j/k] scroll
          </Text>
        </Box>
      )}
    </Box>
  );
};
