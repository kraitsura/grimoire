import React from "react"
import { Box, Text } from "ink"

export interface Action {
  key: string
  label: string
}

interface ActionBarProps {
  actions: Action[]
}

export const ActionBar: React.FC<ActionBarProps> = ({ actions }) => (
  <Box gap={2}>
    {actions.map((a) => (
      <Text key={a.key}>
        <Text color="blue">[{a.key}]</Text>
        <Text>:{a.label}</Text>
      </Text>
    ))}
  </Box>
)
