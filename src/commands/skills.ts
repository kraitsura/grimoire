import { Effect } from "effect";
import type { ParsedArgs } from "../cli/parser";
import { skillsAdd } from "./skills/add";
import { skillsInit } from "./skills/init";
import { skillsList } from "./skills/list";
import { skillsEnable } from "./skills/enable";
import { skillsDisable } from "./skills/disable";
import { skillsInfo } from "./skills/info";
import { skillsSync } from "./skills/sync";
import { skillsSearch } from "./skills/search";
import { skillsDoctor } from "./skills/doctor";

function printSkillsHelp() {
  console.log(`
grimoire skills - Package manager for agent context

COMMANDS:
  init                    Initialize skills in current project
  add <source>            Add a skill to local cache
  enable <name> [names…]  Enable skill(s) in current project
  disable <name> [names…] Disable skill(s) in current project
  list                    List available and enabled skills
  info <name>             Show details about a skill
  search <query>          Search for skills (GitHub)
  sync                    Update enabled skills to latest
  doctor                  Diagnose and fix common issues

FLAGS:
  -h, --help              Show this help
  -v, --verbose           Verbose output
  -q, --quiet             Minimal output

EXAMPLES:
  grimoire skills init
  grimoire skills add github:steveyegge/beads
  grimoire skills enable beads typescript-strict
  grimoire skills list --enabled
`);
}

export const skillsCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0];

    if (!subcommand || args.flags["help"] || args.flags["h"]) {
      printSkillsHelp();
      return;
    }

    switch (subcommand) {
      case "init":
        return yield* skillsInit(args);
      case "add":
        return yield* skillsAdd(args);
      case "enable":
        return yield* skillsEnable(args);
      case "disable":
        return yield* skillsDisable(args);
      case "list":
        return yield* skillsList(args);
      case "info":
        return yield* skillsInfo(args);
      case "search":
        return yield* skillsSearch(args);
      case "sync":
        return yield* skillsSync(args);
      case "doctor":
        return yield* skillsDoctor(args);
      default:
        console.log(`Unknown skills command: ${subcommand}`);
        printSkillsHelp();
        process.exit(1);
    }
  });
