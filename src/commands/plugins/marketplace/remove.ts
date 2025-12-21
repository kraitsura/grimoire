/**
 * plugins marketplace remove command
 *
 * Remove a marketplace.
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../../cli/parser";
import { MarketplaceService, ClaudeCliService } from "../../../services/plugins";

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

export const pluginsMarketplaceRemove = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[2]; // After "marketplace" "remove"
    const yesFlag = args.flags.yes === true || args.flags.y === true;

    if (!name) {
      console.log(`${colors.red}Error:${colors.reset} Missing marketplace name\n`);
      console.log("Usage: grimoire plugins marketplace remove <name>");
      console.log("Example: grimoire plugins marketplace remove claude-code-plugins");
      return;
    }

    const marketplaceService = yield* MarketplaceService;
    const claudeCliService = yield* ClaudeCliService;

    // Check if marketplace exists in our tracking
    const marketplace = yield* marketplaceService.get(name).pipe(
      Effect.catchAll(() => Effect.succeed(null))
    );

    if (!marketplace) {
      console.log(`${colors.red}Error:${colors.reset} Marketplace "${name}" not found`);

      // Show available marketplaces
      const tracked = yield* marketplaceService.list().pipe(
        Effect.catchAll(() => Effect.succeed([]))
      );

      if (tracked.length > 0) {
        console.log(`\nTracked marketplaces:`);
        tracked.forEach((m) => console.log(`  - ${m.name}`));
      }
      return;
    }

    // Confirm removal
    if (!yesFlag) {
      console.log(`${colors.yellow}Warning:${colors.reset} This will remove marketplace "${name}"`);
      console.log(`${colors.dim}Plugins from this marketplace will remain installed${colors.reset}`);
      console.log(`${colors.dim}Use -y to skip this confirmation${colors.reset}\n`);
      // Non-interactive mode, proceed anyway
    }

    console.log(`${colors.dim}Removing marketplace: ${name}...${colors.reset}`);

    // Remove from Claude CLI
    yield* claudeCliService.marketplaceRemove(name).pipe(
      Effect.catchAll((error) => {
        console.log(`${colors.yellow}Warning:${colors.reset} Could not remove from Claude CLI: ${error.message}`);
        return Effect.void;
      })
    );

    // Remove from Grimoire tracking
    yield* marketplaceService.remove(name).pipe(
      Effect.catchAll((error) => {
        console.log(`${colors.red}Error:${colors.reset} ${error.message}`);
        return Effect.fail(error);
      })
    );

    console.log(`${colors.green}-${colors.reset} Removed: ${name}`);
    console.log(`\n${colors.green}Done!${colors.reset} Marketplace "${name}" has been removed.`);
  });
