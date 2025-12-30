import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { SourceType, SelectableItem, InstallMethod, MissingFeatures } from "../../models/marketplace";
import type { AgentType } from "../../models/skill";
import { getMissingFeatures, formatMissingFeatures, skillToSelectable, pluginToSelectable } from "../../models/marketplace";

// ============================================================================
// Types
// ============================================================================

type Screen = "loading" | "method" | "select" | "installing" | "done" | "error";

interface AddScreenProps {
  /** Source URL being added */
  source: string;

  /** Analyzed source type */
  sourceType: SourceType;

  /** Detected agent type */
  agentType: AgentType;

  /** Whether Claude CLI is available */
  claudeCliAvailable: boolean;

  /** Callback when user confirms selection */
  onConfirm: (items: SelectableItem[], method: InstallMethod) => void;

  /** Callback when user cancels */
  onCancel: () => void;

  /** Whether to auto-confirm (--yes flag) */
  autoConfirm?: boolean;
}

// ============================================================================
// Installation Method Selector
// ============================================================================

interface MethodSelectorProps {
  agentType: AgentType;
  claudeCliAvailable: boolean;
  onSelect: (method: InstallMethod) => void;
  onCancel: () => void;
}

const MethodSelector: React.FC<MethodSelectorProps> = ({
  agentType,
  claudeCliAvailable,
  onSelect,
  onCancel,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const canUsePlugin = agentType === "claude_code" && claudeCliAvailable;

  const options: { method: InstallMethod; label: string; description: string }[] = [
    ...(canUsePlugin
      ? [
          {
            method: "plugin" as InstallMethod,
            label: "Plugin marketplace (recommended)",
            description: "Full features: MCP, commands, hooks, agents",
          },
        ]
      : []),
    {
      method: "skill" as InstallMethod,
      label: "Skills only (portable)",
      description: "Works with all agents, SKILL.md instructions only",
    },
  ];

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(options.length - 1, prev + 1));
    }
    if (key.return) {
      onSelect(options[selectedIndex].method);
    }
    if (key.escape || input === "q") {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Installation Method:</Text>
      </Box>

      {options.map((option, i) => {
        const isSelected = i === selectedIndex;
        const radio = isSelected ? "●" : "○";

        return (
          <Box key={option.method} flexDirection="column">
            <Box>
              <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                {isSelected ? "> " : "  "}
                {radio} {option.label}
              </Text>
            </Box>
            <Box marginLeft={5}>
              <Text color="gray" dimColor>
                {option.description}
              </Text>
            </Box>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          up/down navigate  enter select  q cancel
        </Text>
      </Box>
    </Box>
  );
};

// ============================================================================
// Item Selector
// ============================================================================

interface ItemSelectorProps {
  items: SelectableItem[];
  onConfirm: (selected: SelectableItem[]) => void;
  onCancel: () => void;
}

const ItemSelector: React.FC<ItemSelectorProps> = ({ items, onConfirm, onCancel }) => {
  const [cursorIndex, setCursorIndex] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  useInput((input, key) => {
    // Navigation
    if (key.upArrow || input === "k") {
      setCursorIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === "j") {
      setCursorIndex((prev) => Math.min(items.length - 1, prev + 1));
    }

    // Toggle selection
    if (input === " ") {
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        if (next.has(cursorIndex)) {
          next.delete(cursorIndex);
        } else {
          next.add(cursorIndex);
        }
        return next;
      });
    }

    // Select all / deselect all
    if (input === "a") {
      if (selectedIndices.size === items.length) {
        setSelectedIndices(new Set());
      } else {
        setSelectedIndices(new Set(items.map((_, i) => i)));
      }
    }

    // Confirm selection
    if (key.return) {
      if (selectedIndices.size > 0) {
        const selected = Array.from(selectedIndices).map((i) => items[i]);
        onConfirm(selected);
      }
    }

    // Cancel
    if (key.escape || input === "q") {
      onCancel();
    }
  });

  if (items.length === 0) {
    return <Text color="gray">No items found.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Select items to install:</Text>
        <Text color="gray" dimColor>
          {" "}
          ({items.length} available)
        </Text>
      </Box>

      {items.map((item, i) => {
        const isCursor = i === cursorIndex;
        const isSelected = selectedIndices.has(i);
        const checkbox = isSelected ? "[x]" : "[ ]";
        const indicator = isCursor ? ">" : " ";

        // Type badge with color
        const typeBadge = item.type === "plugin" ? "[plugin]" : "[skill]";
        const badgeColor = item.type === "plugin" ? "cyan" : "green";

        // Truncate description
        const maxDescLen = 45;
        const desc = item.description
          ? item.description.length > maxDescLen
            ? item.description.slice(0, maxDescLen - 3) + "..."
            : item.description
          : "";

        return (
          <Box key={`${item.type}-${item.name}`}>
            <Text color={isCursor ? "cyan" : undefined} bold={isCursor}>
              {indicator} {checkbox}{" "}
            </Text>
            <Text color={badgeColor}>{typeBadge}</Text>
            <Text color={isCursor ? "cyan" : undefined} bold={isCursor}>
              {" "}
              {item.name}
            </Text>
            {desc && (
              <Text color="gray" dimColor>
                {" "}
                - {desc}
              </Text>
            )}
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          up/down navigate  space toggle  a all  enter confirm  q cancel
        </Text>
      </Box>

      {selectedIndices.size > 0 && (
        <Box marginTop={1}>
          <Text color="green">
            {selectedIndices.size} item{selectedIndices.size !== 1 ? "s" : ""} selected
          </Text>
        </Box>
      )}
    </Box>
  );
};

// ============================================================================
// Missing Features Warning
// ============================================================================

interface MissingFeaturesWarningProps {
  agentType: AgentType;
  features: MissingFeatures;
}

const MissingFeaturesWarning: React.FC<MissingFeaturesWarningProps> = ({
  agentType,
  features,
}) => {
  const missingList = formatMissingFeatures(features);

  if (missingList.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="yellow">Warning: Installing as skills ({agentType} detected)</Text>
      </Box>
      <Box marginLeft={3} flexDirection="column">
        <Text color="gray" dimColor>
          Missing plugin features:
        </Text>
        {missingList.map((feature) => (
          <Text key={feature} color="gray" dimColor>
            • {feature}
          </Text>
        ))}
      </Box>
    </Box>
  );
};

// ============================================================================
// Main Add Screen
// ============================================================================

export const AddScreen: React.FC<AddScreenProps> = ({
  source,
  sourceType,
  agentType,
  claudeCliAvailable,
  onConfirm,
  onCancel,
  autoConfirm = false,
}) => {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>("method");
  const [selectedMethod, setSelectedMethod] = useState<InstallMethod>("skill");
  const [items, setItems] = useState<SelectableItem[]>([]);

  // Convert sourceType to selectable items
  useEffect(() => {
    let selectableItems: SelectableItem[] = [];

    if (sourceType.type === "single-skill") {
      selectableItems = [skillToSelectable(sourceType.skill)];
    } else if (sourceType.type === "collection") {
      selectableItems = [
        ...sourceType.skills.map((s) => skillToSelectable(s)),
        ...sourceType.plugins.map((p) => pluginToSelectable(p)),
      ];
    } else if (sourceType.type === "marketplace") {
      selectableItems = [
        ...sourceType.skills.map((s) => skillToSelectable(s, sourceType.marketplace)),
        ...sourceType.plugins.map((p) => pluginToSelectable(p, sourceType.marketplace)),
      ];
    }

    setItems(selectableItems);

    // Handle auto-confirm
    if (autoConfirm && selectableItems.length > 0) {
      // Use default method based on agent
      const method: InstallMethod =
        agentType === "claude_code" && claudeCliAvailable ? "plugin" : "skill";
      onConfirm(selectableItems, method);
    }

    // Skip method selection for non-marketplace or non-Claude
    if (
      sourceType.type !== "marketplace" ||
      agentType !== "claude_code" ||
      !claudeCliAvailable
    ) {
      setSelectedMethod("skill");
      setScreen("select");
    }
  }, [sourceType, agentType, claudeCliAvailable, autoConfirm, onConfirm]);

  // Handle cancel
  const handleCancel = () => {
    onCancel();
    exit();
  };

  // Handle method selection
  const handleMethodSelect = (method: InstallMethod) => {
    setSelectedMethod(method);
    setScreen("select");
  };

  // Handle item selection confirmation
  const handleItemConfirm = (selected: SelectableItem[]) => {
    onConfirm(selected, selectedMethod);
  };

  // Get missing features for warning
  const missingFeatures = getMissingFeatures(agentType);
  const showWarning =
    sourceType.type === "marketplace" &&
    agentType !== "claude_code" &&
    formatMissingFeatures(missingFeatures).length > 0;

  // Determine source label
  const getSourceLabel = (): string => {
    if (sourceType.type === "marketplace") {
      return `${source} (Marketplace)`;
    } else if (sourceType.type === "collection") {
      return `${source} (Collection)`;
    } else if (sourceType.type === "single-skill") {
      return `${source} (Single Skill)`;
    }
    return source;
  };

  if (sourceType.type === "empty") {
    return (
      <Box flexDirection="column">
        <Text color="red">No skills or plugins found in: {source}</Text>
        <Text color="gray" dimColor>
          Make sure the repository contains SKILL.md or .claude-plugin/
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} flexDirection="column">
        <Box>
          <Text bold>Source: </Text>
          <Text color="cyan">{getSourceLabel()}</Text>
        </Box>
        <Box>
          <Text bold>Agent: </Text>
          <Text>{agentType}</Text>
        </Box>
      </Box>

      {/* Warning for non-Claude agents on marketplace */}
      {showWarning && (
        <MissingFeaturesWarning agentType={agentType} features={missingFeatures} />
      )}

      {/* Method selection (only for Claude + marketplace) */}
      {screen === "method" && (
        <MethodSelector
          agentType={agentType}
          claudeCliAvailable={claudeCliAvailable}
          onSelect={handleMethodSelect}
          onCancel={handleCancel}
        />
      )}

      {/* Item selection */}
      {screen === "select" && (
        <ItemSelector
          items={items}
          onConfirm={handleItemConfirm}
          onCancel={handleCancel}
        />
      )}
    </Box>
  );
};

export default AddScreen;
