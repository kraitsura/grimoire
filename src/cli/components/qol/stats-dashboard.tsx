import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { CollectionStats } from "../../../services/stats-service";

export interface StatsDashboardProps {
  stats: CollectionStats;
  onRefresh?: () => void;
  onExit?: () => void;
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ stats, onRefresh, onExit }) => {
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useInput((input, _key) => {
    if (input === "r" && onRefresh) {
      onRefresh();
      setLastRefresh(new Date());
    }
    if (input === "q" && onExit) {
      onExit();
    }
  });

  // Create a simple text-based bar chart for most used prompts
  const renderBarChart = (items: { name: string; count: number }[]) => {
    if (items.length === 0) {
      return <Text color="gray">No usage data yet</Text>;
    }

    const maxCount = Math.max(...items.map((item) => item.count));
    const maxBarWidth = 30;

    return (
      <Box flexDirection="column">
        {items.slice(0, 10).map((item, idx) => {
          const barWidth = Math.max(1, Math.round((item.count / maxCount) * maxBarWidth));
          const bar = "█".repeat(barWidth);

          return (
            <Box key={idx} flexDirection="column">
              <Text>
                {(idx + 1).toString().padStart(2)}. {item.name.slice(0, 40)}
              </Text>
              <Text color="cyan">
                {"    "}
                {bar} {item.count}
              </Text>
            </Box>
          );
        })}
      </Box>
    );
  };

  // Render tag distribution
  const renderTagDistribution = () => {
    const tags = Object.entries(stats.tagDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (tags.length === 0) {
      return <Text color="gray">No tags defined</Text>;
    }

    return (
      <Box flexDirection="column">
        {tags.map(([tag, count]) => (
          <Text key={tag}>
            <Text color="blue">{tag.padEnd(20)}</Text>
            <Text color="gray">{count} prompts</Text>
          </Text>
        ))}
      </Box>
    );
  };

  // Render recent activity
  const renderRecentActivity = () => {
    if (stats.recentlyEdited.length === 0) {
      return <Text color="gray">No recent edits</Text>;
    }

    return (
      <Box flexDirection="column">
        {stats.recentlyEdited.slice(0, 5).map((item) => {
          const dateStr = item.editedAt.toISOString().split("T")[0];
          const timeStr = item.editedAt.toTimeString().slice(0, 8);

          return (
            <Text key={item.promptId}>
              <Text>{item.name.slice(0, 30).padEnd(32)}</Text>
              <Text color="gray">
                {dateStr} {timeStr}
              </Text>
            </Text>
          );
        })}
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Collection Statistics
        </Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text bold color="green">
          Overview
        </Text>
        <Box marginLeft={2} flexDirection="column">
          <Text>
            Total Prompts: <Text color="cyan">{stats.totalPrompts}</Text>
          </Text>
          <Text>
            Templates: <Text color="cyan">{stats.totalTemplates}</Text>
          </Text>
          <Text>
            Regular Prompts: <Text color="cyan">{stats.totalPrompts - stats.totalTemplates}</Text>
          </Text>
          <Text>
            Last Refreshed: <Text color="gray">{lastRefresh.toLocaleTimeString()}</Text>
          </Text>
        </Box>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text bold color="green">
          Most Used Prompts
        </Text>
        <Box marginLeft={2} flexDirection="column">
          {renderBarChart(stats.mostUsed)}
        </Box>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text bold color="green">
          Tag Distribution (Top 10)
        </Text>
        <Box marginLeft={2} flexDirection="column">
          {renderTagDistribution()}
        </Box>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text bold color="green">
          Recent Activity
        </Text>
        <Box marginLeft={2} flexDirection="column">
          {renderRecentActivity()}
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">r: refresh | q: quit</Text>
      </Box>
    </Box>
  );
};
