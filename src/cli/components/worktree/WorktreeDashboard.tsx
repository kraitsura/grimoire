/**
 * WorktreeDashboard - Main TUI dashboard for worktree management
 *
 * Lazygit-style two-panel layout with worktree list and detail view.
 */

import React, { useState, useEffect, useLayoutEffect } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { Effect } from "effect";
import { execSync } from "child_process";
import { WorktreeList } from "./WorktreeList";
import { WorktreeDetail } from "./WorktreeDetail";
import { safeBorderStyle, statusColors } from "../theme";
import {
  WorktreeService,
  WorktreeServiceLive,
  WorktreeStateService,
  WorktreeStateServiceLive,
} from "../../../services/worktree";
import type { WorktreeListItem, WorktreeEntry } from "../../../models/worktree";

type Panel = "list" | "detail";
type Modal = "none" | "help" | "log" | "newWorktree" | "confirmDelete";

interface RichWorktree extends WorktreeListItem {
  claimedBy?: string;
  claimedAt?: string;
  logs: Array<{ time: string; message: string; author?: string; type?: string }>;
  checkpoints: Array<{ hash: string; message: string; time: string }>;
  currentStage?: string;
}

export function WorktreeDashboard() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [focusedPanel, setFocusedPanel] = useState<Panel>("list");
  const [worktrees, setWorktrees] = useState<RichWorktree[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modal, setModal] = useState<Modal>("none");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Enter alternate screen buffer on mount, exit on unmount
  useLayoutEffect(() => {
    // Enter alternate screen buffer, clear screen, move to top, hide cursor
    stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");

    return () => {
      // Exit alternate screen buffer and show cursor
      stdout.write("\x1b[?1049l\x1b[?25h");
    };
  }, [stdout]);

  // Load worktrees
  const loadWorktrees = async () => {
    setLoading(true);
    try {
      const cwd = process.cwd();
      const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

      const program = Effect.gen(function* () {
        const service = yield* WorktreeService;
        const stateService = yield* WorktreeStateService;

        const wts = yield* service.list(cwd);
        const state = yield* stateService.getState(repoRoot);

        return wts.map((wt) => {
          const entry = state.worktrees.find((w) => w.name === wt.name);
          return {
            ...wt,
            claimedBy: entry?.claimedBy,
            claimedAt: entry?.claimedAt,
            logs: entry?.logs || [],
            checkpoints: entry?.checkpoints || [],
            currentStage: entry?.currentStage,
          } as RichWorktree;
        });
      }).pipe(
        Effect.provide(WorktreeServiceLive),
        Effect.provide(WorktreeStateServiceLive)
      );

      const result = await Effect.runPromise(program);
      setWorktrees(result);
    } catch (e) {
      setStatusMessage(`Error loading worktrees: ${e}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadWorktrees();
  }, []);

  // Clear status message after 3 seconds
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  const selectedWorktree = worktrees[selectedIndex];

  // Action handlers
  const handleClaim = async () => {
    if (!selectedWorktree) return;
    try {
      const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
      const program = Effect.gen(function* () {
        const stateService = yield* WorktreeStateService;
        yield* stateService.updateWorktree(repoRoot, selectedWorktree.name, {
          claimedBy: "human",
          claimedAt: new Date().toISOString(),
        });
      }).pipe(Effect.provide(WorktreeStateServiceLive));
      await Effect.runPromise(program);
      setStatusMessage(`Claimed ${selectedWorktree.name}`);
      loadWorktrees();
    } catch (e) {
      setStatusMessage(`Error: ${e}`);
    }
  };

  const handleRelease = async () => {
    if (!selectedWorktree) return;
    try {
      const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
      const program = Effect.gen(function* () {
        const stateService = yield* WorktreeStateService;
        yield* stateService.updateWorktree(repoRoot, selectedWorktree.name, {
          claimedBy: undefined,
          claimedAt: undefined,
        });
      }).pipe(Effect.provide(WorktreeStateServiceLive));
      await Effect.runPromise(program);
      setStatusMessage(`Released ${selectedWorktree.name}`);
      loadWorktrees();
    } catch (e) {
      setStatusMessage(`Error: ${e}`);
    }
  };

  // Global keyboard handler
  useInput((input, key) => {
    if (modal !== "none") {
      if (key.escape || input === "q") {
        setModal("none");
      }
      return;
    }

    // Global shortcuts
    if (input === "q") {
      exit();
      return;
    }
    if (input === "?") {
      setModal("help");
      return;
    }
    if (key.tab) {
      setFocusedPanel(focusedPanel === "list" ? "detail" : "list");
      return;
    }
    if (input === "R") {
      loadWorktrees();
      setStatusMessage("Refreshed");
      return;
    }

    // Panel-specific shortcuts
    if (focusedPanel === "list") {
      if (input === "c" && selectedWorktree && !selectedWorktree.claimedBy) {
        handleClaim();
      }
      if (input === "r" && selectedWorktree?.claimedBy) {
        handleRelease();
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Loading worktrees...</Text>
      </Box>
    );
  }

  if (worktrees.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>No worktrees found.</Text>
        <Text dimColor>Create one with: grimoire wt new {"<branch>"}</Text>
        <Text dimColor>Press q to quit</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* Main panels */}
      <Box flexGrow={1} flexDirection="row">
        {/* Left panel: Worktree list */}
        <Box
          width="30%"
          flexDirection="column"
          borderStyle={safeBorderStyle}
          borderColor={focusedPanel === "list" ? "cyan" : undefined}
        >
          <Box paddingX={1}>
            <Text bold color={focusedPanel === "list" ? "cyan" : undefined}>
              WORKTREES
            </Text>
          </Box>
          <WorktreeList
            worktrees={worktrees}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            focused={focusedPanel === "list"}
          />
        </Box>

        {/* Right panel: Detail view */}
        <Box
          flexGrow={1}
          flexDirection="column"
          borderStyle={safeBorderStyle}
          borderColor={focusedPanel === "detail" ? "cyan" : undefined}
        >
          <WorktreeDetail
            worktree={selectedWorktree}
            focused={focusedPanel === "detail"}
          />
        </Box>
      </Box>

      {/* Action bar */}
      <Box paddingX={1} gap={2}>
        <Text dimColor>[j/k]</Text>
        <Text>nav</Text>
        <Text dimColor>[Tab]</Text>
        <Text>switch</Text>
        <Text dimColor>[c]</Text>
        <Text>claim</Text>
        <Text dimColor>[r]</Text>
        <Text>release</Text>
        <Text dimColor>[R]</Text>
        <Text>refresh</Text>
        <Text dimColor>[?]</Text>
        <Text>help</Text>
        <Text dimColor>[q]</Text>
        <Text>quit</Text>
      </Box>

      {/* Status bar */}
      {statusMessage && (
        <Box paddingX={1}>
          <Text color="yellow">{statusMessage}</Text>
        </Box>
      )}

      {/* Help modal */}
      {modal === "help" && (
        <Box
          position="absolute"
          marginLeft={10}
          marginTop={5}
          flexDirection="column"
          borderStyle={safeBorderStyle}
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
        >
          <Text bold>Keyboard Shortcuts</Text>
          <Text> </Text>
          <Text><Text bold>Navigation</Text></Text>
          <Text>  j/k or arrows  Move up/down</Text>
          <Text>  Tab            Switch panels</Text>
          <Text>  Enter          Select worktree</Text>
          <Text> </Text>
          <Text><Text bold>Actions</Text></Text>
          <Text>  c              Claim worktree</Text>
          <Text>  r              Release claim</Text>
          <Text>  R              Refresh list</Text>
          <Text> </Text>
          <Text><Text bold>General</Text></Text>
          <Text>  ?              Show this help</Text>
          <Text>  q              Quit</Text>
          <Text> </Text>
          <Text dimColor>Press any key to close</Text>
        </Box>
      )}
    </Box>
  );
}
