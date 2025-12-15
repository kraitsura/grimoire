#!/usr/bin/env bun

/**
 * Grimoire CLI - Entry Point
 * A CLI tool for storing, editing, and managing prompts with clipboard support.
 */

import { Effect } from "effect";
import { join } from "path";
import { homedir } from "os";
import * as fs from "node:fs";
import { parseArgs } from "./cli/parser";
import { runInteractive } from "./cli/app";
import { MainLive } from "./services";

/**
 * Load environment variables from ~/.grimoire/.env
 * This runs synchronously at startup before any services initialize
 */
const loadGrimoireEnv = () => {
  try {
    const envPath = join(homedir(), ".grimoire", ".env");

    // Use sync fs to load before any async code runs
    if (!fs.existsSync(envPath)) return;

    const content = fs.readFileSync(envPath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        // Remove surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        // Only set if not already in environment (env vars take precedence)
        process.env[key] ??= value;
      }
    }
  } catch {
    // Silently ignore - .env file may not exist yet
  }
};

// Load .env file before anything else
loadGrimoireEnv();
import {
  addCommand,
  aliasCommand,
  archiveCommand,
  benchmarkCommand,
  branchCommand,
  chainCommand,
  compareCommand,
  completionCommand,
  configCommand,
  copyCommand,
  costCommand,
  editCommand,
  exportCommand,
  favoriteCommand,
  formatCommand,
  historyCommand,
  importCommand,
  listCommand,
  pinCommand,
  reindexCommand,
  rmCommand,
  rollbackCommand,
  searchCommand,
  showCommand,
  skillsCommand,
  statsCommand,
  syncCommand,
  tagCommand,
  templatesCommand,
  testCommand,
  versionsCommand,
} from "./commands";

/**
 * Main program logic
 *
 * Parses command-line arguments and routes to appropriate handler:
 * - No args or -i/--interactive flag: Launch interactive mode
 * - Command with args: Route to command handler (future implementation)
 * - Help flag: Show help message
 * - Version flag: Show version
 */
const program = Effect.gen(function* () {
  const args = process.argv.slice(2);
  const { command, flags, positional } = parseArgs(args);

  // Handle help flag
  if (flags.help || flags.h) {
    console.log(`
Grimoire - A CLI tool for storing, editing, and managing prompts

USAGE:
  grimoire [OPTIONS] [COMMAND]

OPTIONS:
  -i, --interactive    Launch interactive mode
  -h, --help          Show this help message
  -v, --version       Show version information

COMMANDS:
  list                List all prompts
  add                 Add a new prompt
  show <name>         Show prompt details
  edit <name>         Edit a prompt
  rm <name>           Delete a prompt
  copy <name>         Copy prompt to clipboard
  benchmark <file>    Run automated test suite
  compare <p1> <p2>   A/B test prompts with same input
  cost <name>         Estimate token costs for a prompt
  test <name>         Test a prompt with an LLM
  search <query>      Search prompts
  reindex             Rebuild search index
  stats [name]        Show statistics
  tag <name> [tags]   Manage tags
  templates           List templates
  history <name>      Show edit history
  versions <name>     List versions
  chain               Manage prompt chains (workflows)
  favorite [name]     Manage favorite prompts
  pin [name]          Manage pinned prompts
  format [name]       Format prompt content
  sync                Sync with remote repository
  completion <shell>  Generate shell completions (bash/zsh/fish)
  config llm          Manage LLM provider configuration
  skills              Package manager for agent context

Run 'grimoire' with no arguments to launch interactive mode.
    `);
    return;
  }

  // Handle version flag
  if (flags.version || flags.v) {
    console.log("grimoire version 0.1.0");
    return;
  }

  // Launch interactive mode if no args or explicit -i flag
  if (flags.interactive || args.length === 0) {
    yield* runInteractive();
    return;
  }

  // Route to command handlers
  if (command) {
    const parsedArgs = { command, flags, positional };

    switch (command) {
      case "list":
        yield* listCommand(parsedArgs);
        break;
      case "add":
        yield* addCommand(parsedArgs);
        break;
      case "show":
        yield* showCommand(parsedArgs);
        break;
      case "edit":
        yield* editCommand(parsedArgs);
        break;
      case "rm":
      case "delete":
        yield* rmCommand(parsedArgs);
        break;
      case "copy":
        yield* copyCommand(parsedArgs);
        break;
      case "benchmark":
        yield* benchmarkCommand(parsedArgs);
        break;
      case "cost":
        yield* costCommand(parsedArgs);
        break;
      case "test":
        yield* testCommand(parsedArgs);
        break;
      case "search":
        yield* searchCommand(parsedArgs);
        break;
      case "reindex":
        yield* reindexCommand(parsedArgs);
        break;
      case "stats":
        yield* statsCommand(parsedArgs);
        break;
      case "tag":
        yield* tagCommand(parsedArgs);
        break;
      case "templates":
        yield* templatesCommand(parsedArgs);
        break;
      case "export":
        yield* exportCommand(parsedArgs);
        break;
      case "import":
        yield* importCommand(parsedArgs);
        break;
      case "history":
        yield* historyCommand(parsedArgs);
        break;
      case "versions":
        yield* versionsCommand(parsedArgs);
        break;
      case "rollback":
        yield* rollbackCommand(parsedArgs);
        break;
      case "archive":
        yield* archiveCommand(parsedArgs);
        break;
      case "branch":
        yield* branchCommand(parsedArgs);
        break;
      case "alias":
        yield* aliasCommand(parsedArgs);
        break;
      case "chain":
        yield* chainCommand(parsedArgs);
        break;
      case "compare":
        yield* compareCommand(parsedArgs);
        break;
      case "favorite":
        yield* favoriteCommand(parsedArgs);
        break;
      case "pin":
        yield* pinCommand(parsedArgs);
        break;
      case "format":
        yield* formatCommand(parsedArgs);
        break;
      case "sync":
        yield* syncCommand(parsedArgs);
        break;
      case "completion":
        yield* completionCommand(parsedArgs);
        break;
      case "config":
        yield* configCommand(parsedArgs);
        break;
      case "skills":
        yield* skillsCommand(parsedArgs);
        break;
      default:
        console.log(`Unknown command: ${command}`);
        console.log("Use --help for usage information.");
        process.exit(1);
    }
  } else {
    // Just flags, no command - show help
    console.log("Unknown options. Use --help for usage information.");
    process.exit(1);
  }
});

/**
 * Main entry point with error handling
 *
 * Catches all errors and displays user-friendly messages.
 * Sets appropriate exit codes (0 for success, 1 for error).
 */
const main = Effect.scoped(
  program.pipe(
    Effect.provide(MainLive),
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error("Error:", error);
        process.exit(1);
      })
    )
  )
);

// Run the program
Effect.runPromise(main as Effect.Effect<void, never, never>).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
