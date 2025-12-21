/**
 * plugins install command
 *
 * Directly install a plugin from a marketplace.
 *
 * Usage:
 *   grimoire plugins install beads@claude-code-plugins
 *   grimoire plugins install beads  # if marketplace unambiguous
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import type { Scope } from "../../models/plugin";
import { ClaudeCliService, MarketplaceService } from "../../services/plugins";

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

/**
 * Parse plugin name and optional marketplace from input
 * Format: name@marketplace or just name
 */
const parsePluginSpec = (
  spec: string
): { name: string; marketplace?: string } => {
  const atIndex = spec.indexOf("@");
  if (atIndex === -1) {
    return { name: spec };
  }
  return {
    name: spec.slice(0, atIndex),
    marketplace: spec.slice(atIndex + 1),
  };
};

export const pluginsInstall = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const spec = args.positional[1];
    const marketplaceFlag = args.flags.marketplace as string | undefined;
    const scopeFlag = args.flags.scope as string | undefined;
    const userFlag = args.flags.user === true;
    const projectFlag = args.flags.project === true;

    if (!spec) {
      console.log(`${colors.red}Error:${colors.reset} Missing plugin name\n`);
      console.log("Usage: grimoire plugins install <name[@marketplace]> [options]\n");
      console.log("Examples:");
      console.log("  grimoire plugins install beads@claude-code-plugins");
      console.log("  grimoire plugins install beads --marketplace claude-code-plugins");
      console.log("  grimoire plugins install beads --scope=user\n");
      console.log("Flags:");
      console.log("  --marketplace <name>  Marketplace to install from");
      console.log("  --scope=user|project  Installation scope");
      console.log("  --user                Shorthand for --scope=user");
      console.log("  --project             Shorthand for --scope=project");
      return;
    }

    // Get services
    const claudeCliService = yield* ClaudeCliService;
    const marketplaceService = yield* MarketplaceService;

    // Parse plugin spec
    const { name, marketplace: specMarketplace } = parsePluginSpec(spec);
    let marketplace = marketplaceFlag || specMarketplace;

    // Determine scope
    let scope: Scope = "project";
    if (userFlag || scopeFlag === "user") {
      scope = "user";
    } else if (projectFlag || scopeFlag === "project") {
      scope = "project";
    }

    // If no marketplace specified, try to find one
    if (!marketplace) {
      console.log(`${colors.dim}Looking for plugin "${name}" in tracked marketplaces...${colors.reset}`);

      const trackedMarketplaces = yield* marketplaceService.list();

      if (trackedMarketplaces.length === 0) {
        console.log(`${colors.red}Error:${colors.reset} No marketplaces tracked`);
        console.log(`\nAdd a marketplace first:`);
        console.log(`  grimoire plugins add github:owner/marketplace-repo`);
        return;
      }

      if (trackedMarketplaces.length === 1) {
        marketplace = trackedMarketplaces[0].name;
        console.log(`${colors.dim}Using marketplace: ${marketplace}${colors.reset}`);
      } else {
        console.log(`${colors.red}Error:${colors.reset} Multiple marketplaces found, please specify one:`);
        trackedMarketplaces.forEach((m) => {
          console.log(`  grimoire plugins install ${name}@${m.name}`);
        });
        return;
      }
    }

    // Install plugin
    console.log(`${colors.dim}Installing plugin: ${name} from ${marketplace}...${colors.reset}`);

    yield* claudeCliService.pluginInstall(name, marketplace, scope).pipe(
      Effect.catchAll((error) => {
        console.log(`${colors.red}Error:${colors.reset} ${error.message}`);
        return Effect.fail(error);
      })
    );

    console.log(`${colors.green}+${colors.reset} Installed: ${name}`);
    console.log(`\n${colors.green}Done!${colors.reset} Plugin "${name}" is now available.`);
  });
