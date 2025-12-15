import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

interface Variable {
  name: string;
  defaultValue?: string;
}

interface Props {
  variables: Variable[];
  onComplete?: (values: Record<string, string>) => void;
  onCancel?: () => void;
}

export const VariableFiller: React.FC<Props> = ({
  variables,
  onComplete,
  onCancel,
}) => {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      variables.map((v) => [v.name, v.defaultValue ?? ""])
    )
  );
  const [focusIndex, setFocusIndex] = useState(0);

  useInput((input, key) => {
    if (key.tab || key.downArrow) {
      setFocusIndex((prev) => (prev + 1) % variables.length);
    }
    if (key.upArrow) {
      setFocusIndex((prev) => (prev - 1 + variables.length) % variables.length);
    }
    if (key.escape && onCancel) onCancel();
    if (key.return && focusIndex === variables.length - 1 && onComplete) {
      onComplete(values);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>Fill Template Variables</Text>
      {variables.map((v, i) => (
        <Box key={v.name}>
          <Text color={i === focusIndex ? "cyan" : "white"}>{v.name}: </Text>
          <TextInput
            value={values[v.name] || ""}
            onChange={(val) =>
              setValues((prev) => ({ ...prev, [v.name]: val }))
            }
            focus={i === focusIndex}
          />
        </Box>
      ))}
      <Text color="gray" dimColor>
        Tab/↓ next ↑ prev Enter submit Esc cancel
      </Text>
    </Box>
  );
};
