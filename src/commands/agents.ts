import { Effect } from "effect";
import type { ParsedArgs } from "../cli/parser";
import { agentsCreate } from "./agents/create";
import { agentsList } from "./agents/list";
import { agentsEnable } from "./agents/enable";
import { agentsDisable } from "./agents/disable";
import { agentsInfo } from "./agents/info";
import { agentsValidate } from "./agents/validate";

function printAgentsHelp() {
  console.log(`
grimoire agents - CLI tool subagent management

Agents wrap CLI tools (bd, gh, npm, etc.) as subagents for AI coding tools.
They can be enabled across multiple platforms (Claude Code, OpenCode, etc.).

COMMANDS:
  create <name>           Scaffold a new agent definition
  list                    List available and enabled agents
  enable <name>           Enable agent in current project
  disable <name>          Disable agent from current project
  info <name>             Show agent details
  validate <name|path>    Validate agent definition

FLAGS:
  -h, --help              Show this help
  -v, --verbose           Verbose output

EXAMPLES:
  grimoire agents create my-agent          # Interactive agent creation
  grimoire agents create bd --cli bd       # Wrap the 'bd' CLI tool
  grimoire agents list                     # List all cached agents
  grimoire agents enable beads             # Enable beads agent in project
  grimoire agents info beads               # Show agent details
`);
}

export const agentsCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0];

    if (!subcommand || args.flags["help"] || args.flags["h"]) {
      printAgentsHelp();
      return;
    }

    switch (subcommand) {
      case "create":
        return yield* agentsCreate(args);
      case "list":
        return yield* agentsList(args);
      case "enable":
        return yield* agentsEnable(args);
      case "disable":
        return yield* agentsDisable(args);
      case "info":
        return yield* agentsInfo(args);
      case "validate":
        return yield* agentsValidate(args);
      default:
        console.log(`Unknown agents command: ${subcommand}`);
        printAgentsHelp();
        process.exit(1);
    }
  });
