/**
 * plugins marketplace list command
 *
 * List tracked marketplaces.
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

/**
 * Format ISO date string to human-readable format
 */
const formatDate = (isoDate: string): string => {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoDate;
  }
};

export const pluginsMarketplaceList = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const jsonFlag = args.flags.json === true;
    const allFlag = args.flags.all === true;

    const marketplaceService = yield* MarketplaceService;
    const claudeCliService = yield* ClaudeCliService;

    // Get Grimoire-tracked marketplaces
    const trackedMarketplaces = yield* marketplaceService.list().pipe(
      Effect.catchAll((error) => {
        console.log(`${colors.yellow}Warning:${colors.reset} Could not read tracked marketplaces: ${error.message}`);
        return Effect.succeed([]);
      })
    );

    // Optionally get Claude CLI marketplaces too
    let claudeMarketplaces: { name: string; url?: string; scope: "user" | "project" }[] = [];
    if (allFlag) {
      claudeMarketplaces = yield* claudeCliService.marketplaceList().pipe(
        Effect.catchAll(() => Effect.succeed([]))
      );
    }

    if (jsonFlag) {
      const output = {
        tracked: trackedMarketplaces,
        ...(allFlag ? { claude: claudeMarketplaces } : {}),
      };
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // Print tracked marketplaces
    console.log(`\n${colors.bold}Tracked Marketplaces${colors.reset}\n`);

    if (trackedMarketplaces.length === 0) {
      console.log(`${colors.gray}No marketplaces tracked${colors.reset}`);
      console.log(`\nAdd a marketplace:`);
      console.log(`  grimoire plugins add github:owner/repo`);
    } else {
      console.log(`${"Name".padEnd(25)} ${"Source".padEnd(35)} ${"Scope".padEnd(10)} ${"Added"}`);
      console.log(`${"-".repeat(25)} ${"-".repeat(35)} ${"-".repeat(10)} ${"-".repeat(12)}`);

      for (const marketplace of trackedMarketplaces) {
        const scopeColor = marketplace.scope === "user" ? colors.cyan : colors.yellow;
        const source = marketplace.source.length > 35
          ? marketplace.source.slice(0, 32) + "..."
          : marketplace.source;

        console.log(
          `${marketplace.name.padEnd(25)} ${source.padEnd(35)} ${scopeColor}${marketplace.scope.padEnd(10)}${colors.reset} ${formatDate(marketplace.addedAt)}`
        );
      }

      console.log(`\n${colors.dim}${trackedMarketplaces.length} marketplace(s) tracked${colors.reset}`);
    }

    // Print Claude CLI marketplaces if requested
    if (allFlag && claudeMarketplaces.length > 0) {
      console.log(`\n${colors.bold}Claude CLI Marketplaces${colors.reset}\n`);

      console.log(`${"Name".padEnd(25)} ${"Scope"}`);
      console.log(`${"-".repeat(25)} ${"-".repeat(10)}`);

      for (const marketplace of claudeMarketplaces) {
        const scopeColor = marketplace.scope === "user" ? colors.cyan : colors.yellow;
        console.log(
          `${marketplace.name.padEnd(25)} ${scopeColor}${marketplace.scope}${colors.reset}`
        );
      }
    }
  });
