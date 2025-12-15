import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type {
  SyncStatus,
  SyncResult,
  Resolution,
} from "../../../services/remote-sync-service";

export interface SyncManagerProps {
  status: SyncStatus;
  pendingChanges?: string[];
  onPush?: () => void;
  onPull?: () => void;
  onConfigure?: () => void;
  onResolveConflicts?: (resolutions: Resolution[]) => void;
  onRefresh?: () => void;
  onExit?: () => void;
}

export const SyncManager: React.FC<SyncManagerProps> = ({
  status,
  pendingChanges = [],
  onPush,
  onPull,
  onConfigure,
  onResolveConflicts,
  onRefresh,
  onExit,
}) => {
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  useInput((input, key) => {
    if (syncing) return; // Ignore input while syncing

    // Push
    if (input === "p" && onPush && status.isConfigured) {
      setSyncing(true);
      onPush();
      setLastSync(new Date());
      setTimeout(() => setSyncing(false), 1000);
    }

    // Pull
    if (input === "P" && onPull && status.isConfigured) {
      setSyncing(true);
      onPull();
      setLastSync(new Date());
      setTimeout(() => setSyncing(false), 1000);
    }

    // Configure
    if (input === "c" && onConfigure) {
      onConfigure();
    }

    // Refresh
    if (input === "r" && onRefresh) {
      onRefresh();
    }

    // Resolve conflicts
    if (input === "x" && status.hasConflicts && onResolveConflicts) {
      // For now, just trigger the callback - actual resolution UI would be more complex
      onResolveConflicts([]);
    }

    // Exit
    if (input === "q" && onExit) {
      onExit();
    }
  });

  const renderConnectionStatus = () => {
    if (!status.isConfigured) {
      return (
        <Box flexDirection="column">
          <Text color="red">✗ Not Configured</Text>
          <Box marginLeft={2}>
            <Text color="gray">Press 'c' to configure sync</Text>
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Text color="green">✓ Configured</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text color="gray">
            Remote: <Text color="cyan">{status.remote}</Text>
          </Text>
          <Text color="gray">
            Branch: <Text color="cyan">{status.branch || "main"}</Text>
          </Text>
        </Box>
      </Box>
    );
  };

  const renderSyncStatus = () => {
    if (!status.isConfigured) {
      return null;
    }

    const isAhead = status.ahead > 0;
    const isBehind = status.behind > 0;

    return (
      <Box flexDirection="column">
        <Text bold color="green">
          Sync Status
        </Text>
        <Box marginLeft={2} flexDirection="column">
          {isAhead && (
            <Text color="yellow">
              ↑ {status.ahead} commit{status.ahead > 1 ? "s" : ""} ahead
            </Text>
          )}
          {isBehind && (
            <Text color="yellow">
              ↓ {status.behind} commit{status.behind > 1 ? "s" : ""} behind
            </Text>
          )}
          {!isAhead && !isBehind && (
            <Text color="green">✓ In sync with remote</Text>
          )}
          {lastSync && (
            <Text color="gray">
              Last sync: {lastSync.toLocaleTimeString()}
            </Text>
          )}
        </Box>
      </Box>
    );
  };

  const renderPendingChanges = () => {
    if (!status.isConfigured || pendingChanges.length === 0) {
      return null;
    }

    return (
      <Box flexDirection="column">
        <Text bold color="green">
          Pending Changes ({pendingChanges.length})
        </Text>
        <Box marginLeft={2} flexDirection="column">
          {pendingChanges.slice(0, 10).map((file, idx) => (
            <Text key={idx} color="yellow">
              • {file}
            </Text>
          ))}
          {pendingChanges.length > 10 && (
            <Text color="gray">
              ... and {pendingChanges.length - 10} more
            </Text>
          )}
        </Box>
      </Box>
    );
  };

  const renderConflicts = () => {
    if (!status.hasConflicts) {
      return null;
    }

    return (
      <Box
        marginTop={1}
        marginBottom={1}
        borderStyle="single"
        borderColor="red"
        paddingX={1}
        flexDirection="column"
      >
        <Text bold color="red">
          ⚠ Merge Conflicts Detected
        </Text>
        <Text color="gray">
          Press 'x' to resolve conflicts or use 'p' to force push
        </Text>
      </Box>
    );
  };

  const renderProgress = () => {
    if (!syncing) {
      return null;
    }

    return (
      <Box
        marginTop={1}
        marginBottom={1}
        borderStyle="single"
        borderColor="cyan"
        paddingX={1}
      >
        <Text color="cyan">Syncing...</Text>
      </Box>
    );
  };

  const renderLastResult = () => {
    if (!lastResult) {
      return null;
    }

    const resultColor = lastResult.success ? "green" : "red";
    const resultIcon = lastResult.success ? "✓" : "✗";

    return (
      <Box marginBottom={1} flexDirection="column">
        <Text color={resultColor}>
          {resultIcon} Last Operation
        </Text>
        <Box marginLeft={2} flexDirection="column">
          <Text color="gray">
            Files changed: {lastResult.filesChanged}
          </Text>
          {lastResult.conflicts.length > 0 && (
            <Text color="red">
              Conflicts: {lastResult.conflicts.length}
            </Text>
          )}
        </Box>
      </Box>
    );
  };

  const renderHelp = () => {
    if (!status.isConfigured) {
      return (
        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">c: configure | q: quit</Text>
        </Box>
      );
    }

    return (
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          p: push | P: pull | c: configure | r: refresh{" "}
          {status.hasConflicts && "| x: resolve conflicts "} | q: quit
        </Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Remote Sync Manager
        </Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text bold color="green">
          Connection
        </Text>
        <Box marginLeft={2}>{renderConnectionStatus()}</Box>
      </Box>

      {renderProgress()}
      {renderConflicts()}
      {renderLastResult()}

      {status.isConfigured && (
        <>
          <Box marginBottom={1} flexDirection="column">
            {renderSyncStatus()}
          </Box>

          <Box marginBottom={1} flexDirection="column">
            {renderPendingChanges()}
          </Box>
        </>
      )}

      {renderHelp()}
    </Box>
  );
};
