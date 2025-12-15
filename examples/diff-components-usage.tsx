/**
 * Example usage of diff viewer components
 *
 * This file demonstrates how to use the diff viewer Ink components
 * for displaying diffs, version history, and managing branches.
 */

import React, { useState } from "react";
import { render, Box, Text } from "ink";
import {
  DiffViewer,
  SideBySideDiffViewer,
  HistoryViewer,
  RollbackConfirm,
  BranchManager,
} from "../src/cli/components/diff";
import type { DiffResult, SideBySideDiff } from "../src/services/diff-service";
import type { PromptVersion } from "../src/services/version-service";
import type { Branch } from "../src/services/branch-service";

// Example 1: Basic DiffViewer
const DiffViewerExample: React.FC = () => {
  const exampleDiff: DiffResult = {
    changes: [
      { value: "This is unchanged\n" },
      { value: "This was removed\n", removed: true },
      { value: "This was added\n", added: true },
    ],
    hunks: [
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        lines: [
          " This is unchanged",
          "-This was removed",
          "+This was added",
        ],
      },
    ],
    additions: 1,
    deletions: 1,
    unchanged: 1,
  };

  return (
    <Box flexDirection="column">
      <Text bold>Example 1: DiffViewer</Text>
      <DiffViewer diff={exampleDiff} focused={true} height={10} />
    </Box>
  );
};

// Example 2: Side-by-Side DiffViewer
const SideBySideDiffViewerExample: React.FC = () => {
  const exampleDiff: SideBySideDiff = {
    left: ["Line 1", "Old line 2", "Line 3"],
    right: ["Line 1", "New line 2", "Line 3"],
    lineInfo: [
      { type: "unchanged", leftLine: 1, rightLine: 1 },
      { type: "modified", leftLine: 2, rightLine: 2 },
      { type: "unchanged", leftLine: 3, rightLine: 3 },
    ],
  };

  return (
    <Box flexDirection="column">
      <Text bold>Example 2: SideBySideDiffViewer</Text>
      <SideBySideDiffViewer
        diff={exampleDiff}
        focused={true}
        height={10}
        columnWidth={30}
      />
    </Box>
  );
};

// Example 3: HistoryViewer
const HistoryViewerExample: React.FC = () => {
  const exampleVersions: PromptVersion[] = [
    {
      id: 1,
      promptId: "prompt-1",
      version: 3,
      content: "Latest version content",
      frontmatter: {},
      changeReason: "Updated for clarity",
      branch: "main",
      parentVersion: 2,
      createdAt: new Date("2025-12-13T10:00:00"),
    },
    {
      id: 2,
      promptId: "prompt-1",
      version: 2,
      content: "Previous version content",
      frontmatter: {},
      changeReason: "Fixed typo",
      branch: "main",
      parentVersion: 1,
      createdAt: new Date("2025-12-12T10:00:00"),
    },
    {
      id: 3,
      promptId: "prompt-1",
      version: 1,
      content: "Initial version content",
      frontmatter: {},
      branch: "main",
      createdAt: new Date("2025-12-11T10:00:00"),
    },
  ];

  const exampleDiffs = new Map<number, DiffResult>([
    [
      3,
      {
        changes: [
          { value: "Latest version content\n", added: true },
          { value: "Previous version content\n", removed: true },
        ],
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: ["-Previous version content", "+Latest version content"],
          },
        ],
        additions: 1,
        deletions: 1,
        unchanged: 0,
      },
    ],
  ]);

  return (
    <Box flexDirection="column">
      <Text bold>Example 3: HistoryViewer</Text>
      <HistoryViewer
        versions={exampleVersions}
        diffs={exampleDiffs}
        focused={true}
        height={15}
        onSelect={(version) => console.log("Selected:", version)}
        onRestore={(version) => console.log("Restore:", version)}
      />
    </Box>
  );
};

// Example 4: RollbackConfirm
const RollbackConfirmExample: React.FC = () => {
  const currentVersion: PromptVersion = {
    id: 1,
    promptId: "prompt-1",
    version: 3,
    content: "Latest version content",
    frontmatter: {},
    changeReason: "Updated for clarity",
    branch: "main",
    parentVersion: 2,
    createdAt: new Date("2025-12-13T10:00:00"),
  };

  const targetVersion: PromptVersion = {
    id: 2,
    promptId: "prompt-1",
    version: 1,
    content: "Initial version content",
    frontmatter: {},
    branch: "main",
    createdAt: new Date("2025-12-11T10:00:00"),
  };

  const diff: DiffResult = {
    changes: [
      { value: "Latest version content\n", removed: true },
      { value: "Initial version content\n", added: true },
    ],
    hunks: [
      {
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 1,
        lines: ["-Latest version content", "+Initial version content"],
      },
    ],
    additions: 1,
    deletions: 1,
    unchanged: 0,
  };

  return (
    <Box flexDirection="column">
      <Text bold>Example 4: RollbackConfirm</Text>
      <RollbackConfirm
        currentVersion={currentVersion}
        targetVersion={targetVersion}
        diff={diff}
        focused={true}
        onConfirm={() => console.log("Confirmed rollback")}
        onCancel={() => console.log("Cancelled rollback")}
      />
    </Box>
  );
};

// Example 5: BranchManager
const BranchManagerExample: React.FC = () => {
  const exampleBranches: Branch[] = [
    {
      id: "1",
      promptId: "prompt-1",
      name: "main",
      createdAt: new Date("2025-12-10T10:00:00"),
      isActive: true,
    },
    {
      id: "2",
      promptId: "prompt-1",
      name: "experiment-1",
      createdAt: new Date("2025-12-12T10:00:00"),
      createdFromVersion: 2,
      isActive: false,
    },
    {
      id: "3",
      promptId: "prompt-1",
      name: "feature/new-approach",
      createdAt: new Date("2025-12-13T10:00:00"),
      createdFromVersion: 3,
      isActive: false,
    },
  ];

  const activeBranch = exampleBranches[0];

  const comparisons = new Map([
    ["experiment-1", { ahead: 2, behind: 1, canMerge: true }],
    ["feature/new-approach", { ahead: 1, behind: 0, canMerge: true }],
  ]);

  return (
    <Box flexDirection="column">
      <Text bold>Example 5: BranchManager</Text>
      <BranchManager
        branches={exampleBranches}
        activeBranch={activeBranch}
        comparisons={comparisons}
        focused={true}
        height={15}
        onCreate={(name) => console.log("Create branch:", name)}
        onSwitch={(branch) => console.log("Switch to:", branch.name)}
        onDelete={(branch) => console.log("Delete:", branch.name)}
        onMerge={(source, target) =>
          console.log(`Merge ${source.name} into ${target.name}`)
        }
      />
    </Box>
  );
};

// Main demo component with tab navigation
type Tab = "diff" | "sideBySide" | "history" | "rollback" | "branches";

const DiffComponentsDemo: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("diff");

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "diff", label: "Diff Viewer" },
    { key: "sideBySide", label: "Side-by-Side" },
    { key: "history", label: "History" },
    { key: "rollback", label: "Rollback" },
    { key: "branches", label: "Branches" },
  ];

  return (
    <Box flexDirection="column">
      {/* Tab navigation */}
      <Box marginBottom={1} gap={1}>
        {tabs.map((tab) => (
          <Text
            key={tab.key}
            bold={activeTab === tab.key}
            color={activeTab === tab.key ? "blue" : undefined}
          >
            [{tab.key[0]}] {tab.label}
          </Text>
        ))}
      </Box>

      {/* Active component */}
      {activeTab === "diff" && <DiffViewerExample />}
      {activeTab === "sideBySide" && <SideBySideDiffViewerExample />}
      {activeTab === "history" && <HistoryViewerExample />}
      {activeTab === "rollback" && <RollbackConfirmExample />}
      {activeTab === "branches" && <BranchManagerExample />}

      {/* Instructions */}
      <Box marginTop={1}>
        <Text dimColor>
          Press 'd', 's', 'h', 'r', or 'b' to switch tabs | Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  );
};

// Run the demo if this file is executed directly
if (require.main === module) {
  render(<DiffComponentsDemo />);
}

export {
  DiffViewerExample,
  SideBySideDiffViewerExample,
  HistoryViewerExample,
  RollbackConfirmExample,
  BranchManagerExample,
  DiffComponentsDemo,
};
