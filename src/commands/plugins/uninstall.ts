/**
 * plugins uninstall command
 *
 * Uninstall a plugin.
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { ClaudeCliService } from "../../services/plugins";

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

export const pluginsUninstall = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    const yesFlag = args.flags.yes === true || args.flags.y === true;

    if (!name) {
      console.log(`${colors.red}Error:${colors.reset} Missing plugin name\n`);
      console.log("Usage: grimoire plugins uninstall <name>");
      console.log("Example: grimoire plugins uninstall beads");
      return;
    }

    const claudeCliService = yield* ClaudeCliService;

    // Check if Claude CLI is available
    const isAvailable = yield* claudeCliService.isAvailable();
    if (!isAvailable) {
      console.log(`${colors.red}Error:${colors.reset} Claude CLI not found`);
      return;
    }

    // Verify plugin exists
    const plugins = yield* claudeCliService.pluginList().pipe(
      Effect.catchAll((error) => {
        console.log(`${colors.red}Error:${colors.reset} ${error.message}`);
        return Effect.succeed([]);
      })
    );

    const plugin = plugins.find((p) => p.name === name);

    if (!plugin) {
      console.log(`${colors.red}Error:${colors.reset} Plugin "${name}" not found`);
      console.log(`\nInstalled plugins:`);
      plugins.forEach((p) => console.log(`  - ${p.name}`));
      return;
    }

    // Confirm uninstall
    if (!yesFlag) {
      console.log(`${colors.yellow}Warning:${colors.reset} This will uninstall plugin "${name}"`);
      console.log(`${colors.dim}Use -y to skip this confirmation${colors.reset}\n`);
      // Non-interactive mode, proceed anyway
    }

    console.log(`${colors.dim}Uninstalling plugin: ${name}...${colors.reset}`);

    yield* claudeCliService.pluginUninstall(name).pipe(
      Effect.catchAll((error) => {
        console.log(`${colors.red}Error:${colors.reset} ${error.message}`);
        return Effect.fail(error);
      })
    );

    console.log(`${colors.green}-${colors.reset} Uninstalled: ${name}`);
    console.log(`\n${colors.green}Done!${colors.reset} Plugin "${name}" has been removed.`);
  });
