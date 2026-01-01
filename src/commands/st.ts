/**
 * Skills/Tools Command - Entry point for skills, plugins, and agents
 *
 * Usage:
 *   grim st skills [subcommand]   Manage skills
 *   grim st plugins [subcommand]  Manage plugins
 *   grim st agents [subcommand]   Manage agents
 *   grim st add <source>          Add from GitHub/marketplace
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../cli/parser";
import { skillsCommand } from "./skills";
import { pluginsCommand } from "./plugins";
import { agentsCommand } from "./agents";
import { addCommand } from "./add";

/**
 * Print help for st command
 */
function printStHelp() {
  console.log(`
Skills/Tools - Manage agent capabilities

USAGE:
  grim st <command> [subcommand] [options]

COMMANDS:
  skills      Manage agent skills (context injection)
  plugins     Manage Claude Code plugins
  agents      Manage subagent definitions
  add         Add skills/plugins from GitHub or marketplace

SKILLS SUBCOMMANDS:
  grim st skills init           Initialize skills in project
  grim st skills add <source>   Add skill from GitHub
  grim st skills enable <name>  Enable skill
  grim st skills disable <name> Disable skill
  grim st skills list           List available skills
  grim st skills info <name>    Show skill details
  grim st skills sync           Update enabled skills
  grim st skills doctor         Diagnose issues

PLUGINS SUBCOMMANDS:
  grim st plugins list          List installed plugins
  grim st plugins add <source>  Install plugin
  grim st plugins info <name>   Show plugin details

AGENTS SUBCOMMANDS:
  grim st agents list           List agent definitions
  grim st agents create         Create new agent
  grim st agents info <name>    Show agent details

EXAMPLES:
  grim st skills enable beads       # Enable beads skill
  grim st plugins add foo/bar       # Install plugin from GitHub
  grim st add github:user/skill     # Add skill from GitHub
`);
}

/**
 * Skills/Tools command handler
 */
export const stCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0];

    // No args or help flag
    if (!subcommand || args.flags.help || args.flags.h) {
      printStHelp();
      return;
    }

    // Route to subcommands
    switch (subcommand) {
      case "skills":
        // Remove 'skills' from positional and pass to skillsCommand
        const skillsArgs = {
          ...args,
          positional: args.positional.slice(1),
        };
        return yield* skillsCommand(skillsArgs);

      case "plugins":
        // Remove 'plugins' from positional and pass to pluginsCommand
        const pluginsArgs = {
          ...args,
          positional: args.positional.slice(1),
        };
        return yield* pluginsCommand(pluginsArgs);

      case "agents":
        // Remove 'agents' from positional and pass to agentsCommand
        const agentsArgs = {
          ...args,
          positional: args.positional.slice(1),
        };
        return yield* agentsCommand(agentsArgs);

      case "add":
        // Pass through to addCommand (it handles positional[0] as source)
        const addArgs = {
          ...args,
          positional: args.positional.slice(1),
        };
        return yield* Effect.promise(() => addCommand(addArgs));

      default:
        console.log(`Unknown st command: ${subcommand}`);
        console.log("Use 'grim st --help' for usage.");
        process.exit(1);
    }
  });
