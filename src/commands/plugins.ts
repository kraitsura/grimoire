import { Effect } from "effect";
import type { ParsedArgs } from "../cli/parser";
import { pluginsAdd } from "./plugins/add";
import { pluginsInstall } from "./plugins/install";
import { pluginsList } from "./plugins/list";
import { pluginsInfo } from "./plugins/info";
import { pluginsUninstall } from "./plugins/uninstall";
import { pluginsMarketplaceList } from "./plugins/marketplace/list";
import { pluginsMarketplaceRemove } from "./plugins/marketplace/remove";

function printPluginsHelp() {
  console.log(`
grimoire plugins - Claude Code plugin management

COMMANDS:
  add <source>            Add marketplace and select plugins/skills to install
  install <name>          Install a specific plugin directly
  list                    List installed plugins
  info <name>             Show details about a plugin
  uninstall <name>        Uninstall a plugin
  marketplace list        List added marketplaces
  marketplace remove      Remove a marketplace

FLAGS:
  -h, --help              Show this help
  -v, --verbose           Verbose output
  --user                  Install at user scope (~/.claude/)
  --project               Install at project scope (.claude/)

EXAMPLES:
  grimoire plugins add github:owner/repo
  grimoire plugins add github:owner/repo --user
  grimoire plugins install beads --marketplace beads-marketplace
  grimoire plugins list
  grimoire plugins marketplace list
`);
}

export const pluginsCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0];

    if (!subcommand || args.flags.help || args.flags.h) {
      printPluginsHelp();
      return;
    }

    // Handle marketplace subcommand
    if (subcommand === "marketplace") {
      const marketplaceCmd = args.positional[1];

      switch (marketplaceCmd) {
        case "list":
          return yield* pluginsMarketplaceList(args);
        case "remove":
          return yield* pluginsMarketplaceRemove(args);
        default:
          console.log(`Unknown marketplace command: ${marketplaceCmd}`);
          console.log("Use 'grimoire plugins marketplace list' or 'grimoire plugins marketplace remove'");
          process.exit(1);
      }
    }

    switch (subcommand) {
      case "add":
        return yield* pluginsAdd(args);
      case "install":
        return yield* pluginsInstall(args);
      case "list":
        return yield* pluginsList(args);
      case "info":
        return yield* pluginsInfo(args);
      case "uninstall":
        return yield* pluginsUninstall(args);
      default:
        console.log(`Unknown plugins command: ${subcommand}`);
        printPluginsHelp();
        process.exit(1);
    }
  });
