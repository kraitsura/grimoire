import React from "react"
import { Box, Text } from "ink"

interface BreadcrumbProps {
  items: string[]
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => (
  <Box>
    {items.map((item, i) => (
      <React.Fragment key={i}>
        {i > 0 && <Text dimColor> › </Text>}
        <Text bold={i === items.length - 1}>{item}</Text>
      </React.Fragment>
    ))}
  </Box>
)
