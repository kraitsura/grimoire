/**
 * grimoire worktree / grimoire wt - Git worktree management
 */

import { Effect } from "effect";
import { render } from "ink";
import React from "react";
import type { ParsedArgs } from "../cli/parser";
import {
  worktreeNew,
  worktreeList,
  worktreeRm,
  worktreePath,
  worktreeExec,
  worktreeOpen,
  worktreeClean,
  worktreeConfig,
  worktreeEach,
  worktreeLog,
  worktreeClaim,
  worktreeRelease,
  worktreeCheckpoint,
  worktreeFromIssue,
  worktreeStatus,
  worktreeHandoff,
  worktreeAvailable,
  worktreeSpawn,
  worktreePs,
  worktreeChildren,
  worktreeWait,
  worktreeCollect,
  worktreeKill,
  worktreeMerge,
  worktreePr,
} from "./worktree/index";
import { WorktreeDashboard } from "../cli/components/worktree";

function printWorktreeHelp() {
  console.log(`
grimoire wt - Git Worktree Management

Manage isolated workspaces for parallel development and agentic coding sessions.

COMMANDS:
  new <branch>       Create a new worktree from branch
  spawn <name>       Create worktree + launch sandboxed Claude session
  ps                 List running/spawned agents
  kill <name>        Terminate a spawned agent
  children           Show worktrees spawned by current session
  wait               Block until child worktrees complete
  collect            Merge completed children back into current branch
  merge <name>       Merge worktree branch into current branch
  pr <name>          Create GitHub PR from worktree branch
  from-issue <id>    Create worktree from issue ID
  list               List active worktrees
  status             Rich status with claims, logs, stages
  rm <name>          Remove a worktree
  path <name>        Print worktree path (for scripting)
  exec <name> <cmd>  Execute command in worktree context
  open <name>        Open shell in worktree directory
  clean              Remove stale worktrees
  config [key]       View or modify configuration

  each <cmd>         Run command across all worktrees
  log <name> <msg>   Add progress log to worktree
  logs <name>        View logs for worktree
  checkpoint <msg>   Create git checkpoint with metadata
  checkpoints        View checkpoint history
  claim <name>       Claim worktree for exclusive work
  release <name>     Release claim on worktree
  handoff <name>     Release + notify target agent
  available          List unclaimed worktrees

OPTIONS:
  -i, --interactive  Launch TUI dashboard
  -h, --help         Show this help

EXAMPLES:
  grimoire wt new feature-auth
  grimoire wt new feature-auth -b        # Create branch if doesn't exist
  grimoire wt new feature-auth -i GRM-42 # Link to issue
  grimoire wt list
  grimoire wt list --json
  grimoire wt list --stale               # Show only merged worktrees
  grimoire wt rm feature-auth
  grimoire wt rm feature-auth --branch   # Also delete the branch
  grimoire wt path feature-auth          # Print path for scripting
  grimoire wt exec feature-auth bun test # Run command in worktree
  grimoire wt open feature-auth          # Open shell in worktree
  grimoire wt clean                      # Remove stale worktrees
  grimoire wt clean --dry-run            # Preview what would be removed
  grimoire wt config                     # View configuration
  grimoire wt config base-path .wt       # Set base path

  # Agentic workflow (sandboxed Claude sessions)
  grimoire wt spawn auth-feature         # Create + launch Claude
  grimoire wt spawn auth -p "Add OAuth"  # With initial prompt
  grimoire wt spawn fix --no-sandbox     # Skip sandboxing
  grimoire wt ps                         # List running agents
  grimoire wt ps --running               # Only show running
  grimoire wt kill auth-feature          # Terminate spawned agent
  grimoire wt kill auth-feature --force  # Force kill (SIGKILL)
  grimoire wt merge auth-feature         # Merge branch into current
  grimoire wt merge auth-feature --squash  # Squash merge
  grimoire wt pr auth-feature            # Create PR from branch
  grimoire wt pr auth-feature --draft    # Create draft PR
  grimoire wt from-issue grimoire-123    # Create from issue
  grimoire wt status                     # Rich status view
  grimoire wt available                  # Find unclaimed work
  grimoire wt claim feature-auth         # Claim for exclusive work
  grimoire wt checkpoint "OAuth done"    # Save checkpoint
  grimoire wt handoff auth --to agent-2  # Handoff to another agent
  grimoire wt release feature-auth       # Release claim

  # Progress tracking
  grimoire wt log feature-auth "Implemented OAuth"
  grimoire wt logs feature-auth
  grimoire wt checkpoints feature-auth

  # Batch operations
  grimoire wt each "bun test"            # Run in all worktrees
  grimoire wt each "bun test" --parallel # Run concurrently

  # Use in scripts
  cd $(grimoire wt path feature-auth)
  grimoire wt exec feature-auth claude
`);
}

export const worktreeCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0];

    // Launch TUI dashboard with --interactive flag
    if (args.flags.interactive || args.flags.i) {
      const { waitUntilExit } = render(React.createElement(WorktreeDashboard), {
        exitOnCtrlC: true,
      });
      yield* Effect.promise(() => waitUntilExit());
      return;
    }

    if (!subcommand || args.flags.help || args.flags.h) {
      printWorktreeHelp();
      return;
    }

    switch (subcommand) {
      case "new":
        return yield* worktreeNew(args);
      case "list":
      case "ls":
        return yield* worktreeList(args);
      case "rm":
      case "remove":
        return yield* worktreeRm(args);
      case "path":
        return yield* worktreePath(args);
      case "exec":
        return yield* worktreeExec(args);
      case "open":
        return yield* worktreeOpen(args);
      case "clean":
        return yield* worktreeClean(args);
      case "config":
        return yield* worktreeConfig(args);
      case "each":
        return yield* worktreeEach(args);
      case "log":
      case "logs":
        return yield* worktreeLog(args);
      case "claim":
        return yield* worktreeClaim(args);
      case "release":
        return yield* worktreeRelease(args);
      case "checkpoint":
      case "checkpoints":
        return yield* worktreeCheckpoint(args);
      case "from-issue":
        return yield* worktreeFromIssue(args);
      case "status":
        return yield* worktreeStatus(args);
      case "handoff":
        return yield* worktreeHandoff(args);
      case "available":
        return yield* worktreeAvailable(args);
      case "spawn":
        return yield* worktreeSpawn(args);
      case "ps":
        return yield* worktreePs(args);
      case "kill":
        return yield* worktreeKill(args);
      case "children":
        return yield* worktreeChildren(args);
      case "wait":
        return yield* worktreeWait(args);
      case "collect":
        return yield* worktreeCollect(args);
      case "merge":
        return yield* worktreeMerge(args);
      case "pr":
        return yield* worktreePr(args);
      default:
        console.log(`Unknown worktree command: ${subcommand}`);
        printWorktreeHelp();
        process.exit(1);
    }
  });
