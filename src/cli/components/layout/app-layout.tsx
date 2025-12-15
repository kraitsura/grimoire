import React from "react"
import { Box } from "ink"
import { Breadcrumb } from "./breadcrumb.js"
import { StatusBar } from "./status-bar.js"
import { ActionBar } from "./action-bar.js"

interface Action {
  key: string
  label: string
}

interface AppLayoutProps {
  breadcrumbs: string[]
  actions: Action[]
  statusMessage?: string
  statusHints?: string[]
  children: React.ReactNode
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  breadcrumbs,
  actions,
  statusMessage,
  statusHints = [],
  children,
}) => (
  <Box flexDirection="column" paddingX={1} paddingY={1}>
    {/* Header */}
    <Box marginBottom={1}>
      <Breadcrumb items={breadcrumbs} />
    </Box>

    {/* Main Content */}
    <Box flexDirection="column" flexGrow={1}>
      {children}
    </Box>

    {/* Footer */}
    <Box flexDirection="column" marginTop={1} gap={1}>
      <ActionBar actions={actions} />
      <StatusBar message={statusMessage} hints={statusHints} />
    </Box>
  </Box>
)
