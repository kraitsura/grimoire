import React from "react"
import { Box, Text } from "ink"

interface StatusBarProps {
  message?: string
  hints?: string[]
}

export const StatusBar: React.FC<StatusBarProps> = ({ message, hints = [] }) => (
  <Box borderStyle="single" paddingX={1}>
    <Text>{message || "Ready"}</Text>
    {hints.length > 0 && (
      <Text dimColor> | {hints.join(" | ")}</Text>
    )}
  </Box>
)
