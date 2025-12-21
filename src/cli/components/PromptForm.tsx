import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { safeBorderStyle } from "./theme";

interface Props {
  initialName?: string;
  initialTags?: string;
  onSave?: (name: string, tags: string[]) => void;
  onCancel?: () => void;
}

export const PromptForm: React.FC<Props> = ({
  initialName = "",
  initialTags = "",
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(initialName);
  const [tags, setTags] = useState(initialTags);
  const [focus, setFocus] = useState<"name" | "tags">("name");

  useInput((input, key) => {
    if (key.tab) {
      setFocus((prev) => (prev === "name" ? "tags" : "name"));
    }
    if (key.escape && onCancel) {
      onCancel();
    }
    if (key.return && focus === "tags" && onSave) {
      onSave(
        name,
        tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      );
    }
  });

  return (
    <Box flexDirection="column" borderStyle={safeBorderStyle} paddingX={1}>
      <Text bold>Create/Edit Prompt</Text>
      <Box marginTop={1}>
        <Text color={focus === "name" ? "cyan" : "white"}>Name: </Text>
        <TextInput value={name} onChange={setName} focus={focus === "name"} />
      </Box>
      <Box>
        <Text color={focus === "tags" ? "cyan" : "white"}>Tags: </Text>
        <TextInput value={tags} onChange={setTags} focus={focus === "tags"} />
      </Box>
      <Text color="gray" dimColor>
        Tab switch Enter save Esc cancel
      </Text>
    </Box>
  );
};
