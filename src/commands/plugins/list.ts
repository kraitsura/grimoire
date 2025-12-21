/**
 * plugins list command
 *
 * List installed plugins from Claude Code.
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

export const pluginsList = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const jsonFlag = args.flags.json === true;

    const claudeCliService = yield* ClaudeCliService;

    // Check if Claude CLI is available
    const isAvailable = yield* claudeCliService.isAvailable();
    if (!isAvailable) {
      console.log(`${colors.red}Error:${colors.reset} Claude CLI not found`);
      console.log(`\nInstall Claude Code first: https://claude.ai/code`);
      return;
    }

    console.log(`${colors.dim}Fetching installed plugins...${colors.reset}\n`);

    const plugins = yield* claudeCliService.pluginList().pipe(
      Effect.catchAll((error) => {
        console.log(`${colors.red}Error:${colors.reset} ${error.message}`);
        return Effect.succeed([]);
      })
    );

    if (jsonFlag) {
      console.log(JSON.stringify(plugins, null, 2));
      return;
    }

    if (plugins.length === 0) {
      console.log(`${colors.gray}No plugins installed${colors.reset}`);
      console.log(`\nInstall a plugin:`);
      console.log(`  grimoire plugins add github:owner/repo`);
      return;
    }

    // Print table header
    console.log(`${colors.bold}Installed Plugins${colors.reset}\n`);
    console.log(`${"Name".padEnd(25)} ${"Marketplace".padEnd(25)} ${"Scope".padEnd(10)} ${"Enabled"}`);
    console.log(`${"-".repeat(25)} ${"-".repeat(25)} ${"-".repeat(10)} ${"-".repeat(7)}`);

    // Print each plugin
    for (const plugin of plugins) {
      const enabledIndicator = plugin.enabled
        ? `${colors.green}yes${colors.reset}`
        : `${colors.gray}no${colors.reset}`;
      const scopeColor = plugin.scope === "user" ? colors.cyan : colors.yellow;

      console.log(
        `${plugin.name.padEnd(25)} ${plugin.marketplace.padEnd(25)} ${scopeColor}${plugin.scope.padEnd(10)}${colors.reset} ${enabledIndicator}`
      );
    }

    console.log(`\n${colors.dim}${plugins.length} plugin(s) installed${colors.reset}`);
  });
