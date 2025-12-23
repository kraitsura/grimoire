/**
 * grimoire worktree / grimoire wt - Git worktree management
 */

import { Effect } from "effect";
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
} from "./worktree/index";

function printWorktreeHelp() {
  console.log(`
grimoire wt - Git Worktree Management

Manage isolated workspaces for parallel development and agentic coding sessions.

COMMANDS:
  new <branch>     Create a new worktree from branch
  list             List active worktrees
  rm <name>        Remove a worktree
  path <name>      Print worktree path (for scripting)
  exec <name> <cmd>  Execute command in worktree context
  open <name>      Open shell in worktree directory
  clean            Remove stale worktrees
  config [key]     View or modify configuration

OPTIONS:
  -h, --help       Show this help

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

  # Use in scripts
  cd $(grimoire wt path feature-auth)
  code $(grimoire wt path feature-auth)

  # Run Claude in a worktree
  grimoire wt exec feature-auth claude
`);
}

export const worktreeCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0];

    if (!subcommand || args.flags["help"] || args.flags["h"]) {
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
      default:
        console.log(`Unknown worktree command: ${subcommand}`);
        printWorktreeHelp();
        process.exit(1);
    }
  });
