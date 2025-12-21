/**
 * plugins info command
 *
 * Show details about a specific plugin.
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

export const pluginsInfo = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];

    if (!name) {
      console.log(`${colors.red}Error:${colors.reset} Missing plugin name\n`);
      console.log("Usage: grimoire plugins info <name>");
      console.log("Example: grimoire plugins info beads");
      return;
    }

    const claudeCliService = yield* ClaudeCliService;

    // Check if Claude CLI is available
    const isAvailable = yield* claudeCliService.isAvailable();
    if (!isAvailable) {
      console.log(`${colors.red}Error:${colors.reset} Claude CLI not found`);
      return;
    }

    // Get list of plugins to find the one we want
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

    // Display plugin info
    console.log(`\n${colors.bold}${plugin.name}${colors.reset}\n`);

    console.log(`${colors.cyan}Marketplace:${colors.reset}  ${plugin.marketplace}`);
    console.log(`${colors.cyan}Scope:${colors.reset}        ${plugin.scope}`);
    console.log(`${colors.cyan}Enabled:${colors.reset}      ${plugin.enabled ? "yes" : "no"}`);

    if (plugin.version) {
      console.log(`${colors.cyan}Version:${colors.reset}      ${plugin.version}`);
    }

    console.log();

    // Show management commands
    console.log(`${colors.dim}Management commands:${colors.reset}`);
    if (plugin.enabled) {
      console.log(`  grimoire plugins disable ${name}  # Disable plugin`);
    } else {
      console.log(`  grimoire plugins enable ${name}   # Enable plugin`);
    }
    console.log(`  grimoire plugins uninstall ${name} # Uninstall plugin`);
  });
