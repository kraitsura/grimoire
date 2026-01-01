/**
 * Prompt Library Command - Entry point for all prompt operations
 *
 * Usage:
 *   grim pl                  Launch interactive TUI
 *   grim pl <prompt-name>    Create/edit a prompt
 *   grim pl list             List all prompts
 *   grim pl show <name>      Show prompt details
 *   grim pl rm <name>        Delete a prompt
 *   ... and more subcommands
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../cli/parser";
import { runInteractive } from "../cli/app";
import {
  aliasCommand,
  archiveCommand,
  benchmarkCommand,
  branchCommand,
  compareCommand,
  copyCommand,
  costCommand,
  enhanceCommand,
  exportCommand,
  favoriteCommand,
  formatCommand,
  historyCommand,
  importCommand,
  listCommand,
  promptCommand,
  pinCommand,
  popCommand,
  reindexCommand,
  rmCommand,
  rollbackCommand,
  searchCommand,
  showCommand,
  stashCommand,
  statsCommand,
  syncCommand,
  tagCommand,
  templatesCommand,
  testCommand,
  versionsCommand,
} from "./pl/index";

/**
 * Reserved subcommands - anything else is treated as a prompt name
 */
const PL_SUBCOMMANDS = new Set([
  "list",
  "show",
  "rm",
  "delete",
  "copy",
  "search",
  "tag",
  "history",
  "versions",
  "rollback",
  "archive",
  "branch",
  "alias",
  "favorite",
  "pin",
  "format",
  "export",
  "import",
  "reindex",
  "stats",
  "templates",
  "test",
  "cost",
  "compare",
  "benchmark",
  "enhance",
  "sync",
  "stash",
  "pop",
]);

/**
 * Print help for pl command
 */
function printPlHelp() {
  console.log(`
Prompt Library - Manage your prompts

USAGE:
  grim pl                      Launch interactive TUI
  grim pl <name> [OPTIONS]     Create or edit a prompt

PROMPT OPTIONS:
  -c, --content <text>    Set content directly (no editor)
  -p, --paste             Paste clipboard content
  -t, --tags <tags>       Set tags (comma-separated)
  --name <new-name>       Rename prompt (edit mode only)

SUBCOMMANDS:
  list              List all prompts
  show <name>       Show prompt details
  rm <name>         Delete a prompt
  copy <name>       Copy prompt to clipboard
  search <query>    Search prompts
  tag <name>        Manage tags
  history <name>    Show edit history
  versions <name>   List versions
  rollback <name>   Rollback to version
  archive           Manage archived prompts
  branch            Manage prompt branches
  alias             Manage aliases
  favorite          Manage favorites
  pin               Manage pinned prompts
  format            Format prompt content
  export            Export prompts
  import            Import prompts
  reindex           Rebuild search index
  stats             Show statistics
  templates         Manage templates
  test <name>       Test prompt with LLM
  cost <name>       Estimate token costs
  compare           A/B test prompts
  benchmark         Run test suite
  enhance <name>    AI-powered enhancement
  sync              Sync with remote
  stash             Stash clipboard content
  pop               Pop from stash

EXAMPLES:
  grim pl my-prompt              # Open editor to create/edit 'my-prompt'
  grim pl my-prompt -c "Hello"   # Create with content directly
  grim pl list                   # List all prompts
  grim pl show my-prompt         # Show prompt details
`);
}

/**
 * Prompt Library command handler
 */
export const plCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0];

    // No args or help flag: show help or launch TUI
    if (!subcommand) {
      if (args.flags.help || args.flags.h) {
        printPlHelp();
        return;
      }
      // Launch interactive TUI
      yield* runInteractive();
      return;
    }

    // Help flag with subcommand
    if (args.flags.help || args.flags.h) {
      printPlHelp();
      return;
    }

    // Route to subcommands
    switch (subcommand) {
      case "list":
        return yield* listCommand(args);
      case "show":
        return yield* showCommand(args);
      case "rm":
      case "delete":
        return yield* rmCommand(args);
      case "copy":
        return yield* copyCommand(args);
      case "search":
        return yield* searchCommand(args);
      case "tag":
        return yield* tagCommand(args);
      case "history":
        return yield* historyCommand(args);
      case "versions":
        return yield* versionsCommand(args);
      case "rollback":
        return yield* rollbackCommand(args);
      case "archive":
        return yield* archiveCommand(args);
      case "branch":
        return yield* branchCommand(args);
      case "alias":
        return yield* aliasCommand(args);
      case "favorite":
        return yield* favoriteCommand(args);
      case "pin":
        return yield* pinCommand(args);
      case "format":
        return yield* formatCommand(args);
      case "export":
        return yield* exportCommand(args);
      case "import":
        return yield* importCommand(args);
      case "reindex":
        return yield* reindexCommand(args);
      case "stats":
        return yield* statsCommand(args);
      case "templates":
        return yield* templatesCommand(args);
      case "test":
        return yield* testCommand(args);
      case "cost":
        return yield* costCommand(args);
      case "compare":
        return yield* compareCommand(args);
      case "benchmark":
        return yield* benchmarkCommand(args);
      case "enhance":
        return yield* enhanceCommand(args);
      case "sync":
        return yield* syncCommand(args);
      case "stash":
        return yield* stashCommand(args);
      case "pop":
        return yield* popCommand(args);
      default:
        // Not a subcommand - treat as prompt name
        if (!PL_SUBCOMMANDS.has(subcommand)) {
          return yield* promptCommand(args);
        }
        console.log(`Unknown pl command: ${subcommand}`);
        printPlHelp();
        process.exit(1);
    }
  });
