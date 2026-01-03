#!/usr/bin/env bun

/**
 * Grimoire CLI - Entry Point
 * A CLI tool for storing, editing, and managing prompts with clipboard support.
 */

// Fix UTF-8 encoding for Unicode symbols (must be first!)
if (process.stdout.setEncoding) {
  process.stdout.setEncoding("utf8");
}

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
  plCommand,
  agCommand,
  stCommand,
  worktreeCommand,
  configCommand,
  completionCommand,
  listPromptNamesForCompletion,
  listWorktreeNamesForCompletion,
} from "./commands";
import { profileCommand } from "./commands/profile";

/**
 * Reserved command names - 6 namespaces + completion utility
 */
const RESERVED_COMMANDS = new Set([
  "pl",        // Prompt Library
  "ag",        // Agents (current directory)
  "wt",        // Worktree (alias)
  "worktree",  // Worktree
  "st",        // Skills/Tools
  "config",    // Configuration
  "profile",   // Profile management
  "completion", // Shell completions
]);

/**
 * Main program logic
 *
 * Parses command-line arguments and routes to appropriate handler:
 * - No args: Launch interactive mode
 * - Help flag: Show help message
 * - Version flag: Show version
 */
const program = Effect.gen(function* () {
  const args = process.argv.slice(2);
  const { command, flags, positional } = parseArgs(args);

  // Handle help flag (only show global help if no command specified)
  if ((flags.help || flags.h) && !command) {
    console.log(`
Grimoire - A CLI tool for storing, editing, and managing prompts

USAGE:
  grim [COMMAND] [OPTIONS]

  (Also available as 'grimoire')

COMMANDS:
  pl          Prompt Library - manage prompts
  ag          Agents - spawn agents in current directory
  wt          Worktree - isolated workspaces + agents
  st          Skills/Tools - manage skills, plugins, agents
  config      Configuration and settings
  completion  Generate shell completions (bash/zsh/fish)

PROMPTS (grim pl):
  grim pl                     Launch interactive TUI
  grim pl <name>              Create or edit a prompt
  grim pl list                List all prompts
  grim pl --help              See all subcommands

AGENTS (grim ag):
  grim ag spawn "task"        Spawn worker agent (current dir)
  grim ag scout "question"    Spawn exploration agent
  grim ag ps                  Show running agents
  grim ag --help              See all subcommands

WORKTREES (grim wt):
  grim wt spawn <name> "task" Create worktree + spawn agent
  grim wt scout <name> "q"    Scout in worktree context
  grim wt ps                  Show worktree status
  grim wt --help              See all subcommands

SKILLS/TOOLS (grim st):
  grim st skills [cmd]        Manage agent skills
  grim st plugins [cmd]       Manage Claude plugins
  grim st add <source>        Add from GitHub/marketplace

GLOBAL OPTIONS:
  -h, --help              Show this help message
  -v, --version           Show version information

EXAMPLES:
  grim ag spawn -bg "Implement auth"   # Background agent
  grim ag scout "How does X work?"     # Explore codebase
  grim wt spawn fix-bug "Fix the bug"  # Isolated worktree + agent
  grim pl my-prompt                    # Create/edit prompt

Run 'grim' with no arguments to launch interactive mode.
    `);
    return;
  }

  // Handle version flag
  if (flags.version || flags.v) {
    console.log("grim (grimoire) version 0.2.0");
    return;
  }

  // Handle completion helper flags (hidden, for shell tab completion)
  // These must be fast and fail silently - run directly without MainLive
  if (flags["cmplt-prompts"]) {
    yield* Effect.promise(() => Effect.runPromise(listPromptNamesForCompletion));
    return;
  }

  if (flags["cmplt-worktrees"]) {
    yield* Effect.promise(() => Effect.runPromise(listWorktreeNamesForCompletion));
    return;
  }

  // Launch interactive mode if no args
  if (args.length === 0) {
    yield* runInteractive();
    return;
  }

  // Route to command handlers
  if (command) {
    const parsedArgs = { command, flags, positional };

    // Unknown command - show help
    if (!RESERVED_COMMANDS.has(command)) {
      console.log(`Unknown command: ${command}`);
      console.log("");
      console.log("Available commands: pl, ag, wt, st, config, completion");
      console.log("Use 'grim --help' for usage information.");
      process.exit(1);
    }

    switch (command) {
      case "pl":
        yield* plCommand(parsedArgs);
        break;
      case "ag":
        yield* agCommand(parsedArgs);
        break;
      case "worktree":
      case "wt":
        yield* worktreeCommand(parsedArgs);
        break;
      case "st":
        yield* stCommand(parsedArgs);
        break;
      case "config":
        yield* configCommand(parsedArgs);
        break;
      case "profile":
        yield* profileCommand(parsedArgs);
        break;
      case "completion":
        yield* completionCommand(parsedArgs);
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
Effect.runPromise(main).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
