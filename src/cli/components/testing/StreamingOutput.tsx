import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

export interface StreamingOutputProps {
  stream: AsyncIterable<string> | null;
  onComplete?: (fullText: string) => void;
  showCursor?: boolean;
}

export const StreamingOutput: React.FC<StreamingOutputProps> = ({
  stream,
  onComplete,
  showCursor = true,
}) => {
  const [text, setText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stream) return;

    let fullText = "";
    let isCancelled = false;

    (async () => {
      try {
        for await (const chunk of stream) {
          if (isCancelled) break;
          fullText += chunk;
          setText(fullText);
        }
        if (!isCancelled) {
          setIsComplete(true);
          onComplete?.(fullText);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Stream error");
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [stream, onComplete]);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>{text}</Text>
      {!isComplete && showCursor && <Text dimColor>▌</Text>}
      {isComplete && (
        <Box marginTop={1}>
          <Text dimColor>Complete</Text>
        </Box>
      )}
    </Box>
  );
};
