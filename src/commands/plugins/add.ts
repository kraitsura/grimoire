/**
 * plugins add command
 *
 * Main flow for adding a marketplace and selecting plugins/skills to install.
 *
 * Flow:
 * 1. Parse GitHub source
 * 2. Detect marketplace type + fetch content
 * 3. Show ScopeSelector -> get scope
 * 4. Run `claude marketplace add <source> --scope`
 * 5. Show ItemSelector -> get selected items
 * 6. For each plugin: `claude plugin install <name>@<marketplace>`
 * 7. For each skill: cache + enable via existing flow
 * 8. Display summary
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import type { Scope, SelectableItem } from "../../models/plugin";
import {
  MarketplaceDetectionService,
  MarketplaceService,
  ClaudeCliService,
} from "../../services/plugins";
import { SkillCacheService, SkillStateService, SkillEngineService } from "../../services";
import { pluginToSelectable, skillToSelectable } from "../../models/plugin";

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
 * Print items for selection (non-interactive fallback)
 */
const printItems = (items: SelectableItem[]): void => {
  console.log(`\n${colors.bold}Available items:${colors.reset}\n`);
  items.forEach((item, index) => {
    const num = `${index + 1}`.padStart(2);
    const badge = item.type === "plugin" ? `${colors.cyan}[plugin]${colors.reset}` : `${colors.green}[skill]${colors.reset}`;
    console.log(`  ${num}) ${badge} ${colors.bold}${item.name}${colors.reset}`);
    if (item.description) {
      console.log(`      ${colors.gray}${item.description}${colors.reset}`);
    }
  });
  console.log();
};

export const pluginsAdd = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const source = args.positional[1];
    const yesFlag = args.flags.yes === true || args.flags.y === true;
    const scopeFlag = args.flags.scope as string | undefined;
    const noSkillsFlag = args.flags["no-skills"] === true;
    const noPluginsFlag = args.flags["no-plugins"] === true;

    if (!source) {
      console.log(`${colors.red}Error:${colors.reset} Missing source argument\n`);
      console.log("Usage: grimoire plugins add <source> [options]\n");
      console.log("Examples:");
      console.log("  grimoire plugins add github:owner/repo");
      console.log("  grimoire plugins add github:owner/repo --scope=user");
      console.log("  grimoire plugins add github:owner/repo -y\n");
      console.log("Flags:");
      console.log("  --scope=user|project  Installation scope");
      console.log("  --no-skills           Only install plugins");
      console.log("  --no-plugins          Only install skills");
      console.log("  -y, --yes             Auto-confirm, install all");
      return;
    }

    // Get services
    const detectionService = yield* MarketplaceDetectionService;
    const marketplaceService = yield* MarketplaceService;
    const claudeCliService = yield* ClaudeCliService;
    const cacheService = yield* SkillCacheService;
    const stateService = yield* SkillStateService;
    const engineService = yield* SkillEngineService;

    // Step 1: Parse and detect
    console.log(`${colors.dim}Detecting content in ${source}...${colors.reset}`);

    const marketplaceType = yield* detectionService.detectFromSource(source).pipe(
      Effect.catchAll((error) => {
        console.log(`${colors.red}Error:${colors.reset} ${error.message}`);
        return Effect.fail(error);
      })
    );

    // Handle different marketplace types
    if (marketplaceType.type === "empty") {
      console.log(`${colors.red}Error:${colors.reset} No plugins or skills found in repository`);
      return;
    }

    // Collect items to show
    let plugins: SelectableItem[] = [];
    let skills: SelectableItem[] = [];

    if (marketplaceType.type === "single-plugin") {
      plugins = [pluginToSelectable(marketplaceType.plugin)];
    } else if (marketplaceType.type === "single-skill") {
      skills = [skillToSelectable(marketplaceType.skill)];
    } else if (marketplaceType.type === "explicit" || marketplaceType.type === "implicit") {
      plugins = marketplaceType.content.plugins.map(pluginToSelectable);
      skills = marketplaceType.content.skills.map(skillToSelectable);
    }

    // Apply filters
    if (noSkillsFlag) skills = [];
    if (noPluginsFlag) plugins = [];

    const allItems = [...plugins, ...skills];

    if (allItems.length === 0) {
      console.log(`${colors.yellow}Warning:${colors.reset} No items to install after applying filters`);
      return;
    }

    console.log(`${colors.cyan}Found:${colors.reset} ${plugins.length} plugin(s), ${skills.length} skill(s)`);

    // Step 2: Determine scope
    let scope: Scope = "project";

    if (scopeFlag) {
      scope = scopeFlag === "user" ? "user" : "project";
    } else if (!yesFlag) {
      // Non-interactive mode, default to project
      console.log(`${colors.dim}Using project scope (use --scope=user for user scope)${colors.reset}`);
    }

    // Step 3: Add marketplace if we have plugins
    if (plugins.length > 0) {
      const parsed = yield* detectionService.parseSource(source);
      const marketplaceName = parsed.repo;

      console.log(`${colors.dim}Adding marketplace: ${marketplaceName}...${colors.reset}`);

      // Add to Claude CLI
      yield* claudeCliService.marketplaceAdd(source, scope).pipe(
        Effect.catchAll((error) => {
          // Might already exist, continue anyway
          console.log(`${colors.yellow}Warning:${colors.reset} ${error.message}`);
          return Effect.void;
        })
      );

      // Track in Grimoire
      const tracked = marketplaceService.createMarketplace(marketplaceName, source, scope);
      yield* marketplaceService.add(tracked).pipe(
        Effect.catchAll(() => Effect.void) // Might already exist
      );

      console.log(`${colors.green}+${colors.reset} Marketplace added: ${marketplaceName}`);
    }

    // Step 4: Select items
    let selectedItems = allItems;

    if (!yesFlag && allItems.length > 1) {
      // Non-interactive fallback - show items and install all
      printItems(allItems);
      console.log(`${colors.yellow}Note:${colors.reset} Non-interactive mode, installing all items`);
      console.log(`${colors.dim}Use interactive mode for selection${colors.reset}\n`);
    }

    // Step 5: Install selected items
    let installedPlugins = 0;
    let installedSkills = 0;

    for (const item of selectedItems) {
      if (item.type === "plugin") {
        // Install plugin via Claude CLI
        const parsed = yield* detectionService.parseSource(source);
        const marketplaceName = parsed.repo;

        console.log(`${colors.dim}Installing plugin: ${item.name}...${colors.reset}`);

        yield* claudeCliService.pluginInstall(item.name, marketplaceName, scope).pipe(
          Effect.catchAll((error) => {
            console.log(`${colors.red}Error:${colors.reset} Failed to install ${item.name}: ${error.message}`);
            return Effect.void;
          }),
          Effect.tap(() => {
            console.log(`${colors.green}+${colors.reset} Installed plugin: ${item.name}`);
            installedPlugins++;
            return Effect.void;
          })
        );
      } else {
        // Install skill via existing flow
        const parsed = yield* detectionService.parseSource(source);

        console.log(`${colors.dim}Installing skill: ${item.name}...${colors.reset}`);

        // Fetch to cache
        const skillSource = {
          owner: parsed.owner,
          repo: parsed.repo,
          ref: parsed.ref,
          subdir: item.path || undefined,
        };

        const cachedSkill = yield* cacheService.fetchFromGitHub(skillSource).pipe(
          Effect.catchAll((error) => {
            console.log(`${colors.red}Error:${colors.reset} Failed to cache ${item.name}: ${error.message}`);
            return Effect.fail(error);
          })
        );

        // Initialize project if needed
        const projectPath = process.cwd();
        const isInitialized = yield* stateService.isInitialized(projectPath);

        if (!isInitialized) {
          yield* stateService.initProject(projectPath, "claude_code");
        }

        // Enable skill
        yield* engineService.enable(projectPath, cachedSkill.manifest.name, { yes: true }).pipe(
          Effect.catchAll((error) => {
            if (error && typeof error === "object" && "_tag" in error && error._tag === "SkillAlreadyEnabledError") {
              console.log(`${colors.gray}o${colors.reset} Skill already enabled: ${item.name}`);
              return Effect.void;
            }
            console.log(`${colors.red}Error:${colors.reset} Failed to enable ${item.name}: ${error.message}`);
            return Effect.void;
          }),
          Effect.tap(() => {
            console.log(`${colors.green}+${colors.reset} Enabled skill: ${item.name}`);
            installedSkills++;
            return Effect.void;
          })
        );
      }
    }

    // Step 6: Summary
    console.log(`\n${colors.green}Done!${colors.reset}`);
    if (installedPlugins > 0) {
      console.log(`  ${colors.cyan}Plugins:${colors.reset} ${installedPlugins} installed`);
    }
    if (installedSkills > 0) {
      console.log(`  ${colors.green}Skills:${colors.reset} ${installedSkills} enabled`);
    }
  });
