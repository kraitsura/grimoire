/**
 * Unified Add Command
 *
 * Adds skills/plugins from various sources:
 * - GitHub repositories (github:owner/repo, https://github.com/...)
 * - Marketplaces (collections with .claude-plugin/marketplace.json)
 * - Local paths
 *
 * Features:
 * - TUI for skill selection
 * - Agent-aware installation (plugin install for Claude Code, SKILL.md copy for others)
 * - Auto-converts to MDC for Cursor
 * - Shows missing features warning for non-Claude agents
 * - Supports --yes flag for CI/scripting
 *
 * Usage:
 *   grimoire add github:anthropics/skills
 *   grimoire add https://github.com/anthropics/skills
 *   grimoire add github:owner/repo --yes
 */

import { Effect, Layer } from "effect";
import { render } from "ink";
import React from "react";
import type { ParsedArgs } from "../cli/parser";
import {
  SourceAnalyzerService,
  SourceAnalyzerServiceLive,
  MarketplaceRegistryService,
  MarketplaceRegistryServiceLive,
  SkillCacheService,
  SkillCacheServiceLive,
  SkillEngineService,
  SkillEngineServiceLive,
  SkillStateService,
  SkillStateServiceLive,
  AgentAdapterService,
  AgentAdapterServiceLive,
  CliInstallerService,
  CliInstallerServiceLive,
  detectAgent,
  getAgentAdapter,
} from "../services/skills";
import type { SelectableItem, InstallMethod, SourceType } from "../models/marketplace";
import type { AgentType } from "../models/skill";
import { AddScreen } from "../cli/screens/AddScreen";

// ============================================================================
// ANSI Colors
// ============================================================================

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

// ============================================================================
// Types
// ============================================================================

interface AddOptions {
  source: string;
  yes: boolean;
  method?: InstallMethod;
}

interface InstallContext {
  source: string;
  sourceType: SourceType;
  agentType: AgentType;
  claudeCliAvailable: boolean;
  selectedItems: SelectableItem[];
  method: InstallMethod;
}

// ============================================================================
// Help Text
// ============================================================================

const showHelp = () => {
  console.log(`
${colors.bold}grimoire add${colors.reset} - Add skills/plugins from various sources

${colors.bold}USAGE${colors.reset}
  grimoire add <source> [options]

${colors.bold}SOURCES${colors.reset}
  github:owner/repo           GitHub repository
  github:owner/repo@ref       With specific branch/tag
  github:owner/repo#subdir    With subdirectory
  https://github.com/...      Full GitHub URL

${colors.bold}OPTIONS${colors.reset}
  -y, --yes                   Auto-confirm, select all, use default method
  --method=<plugin|skill>     Force installation method (Claude Code only)
  -h, --help                  Show this help

${colors.bold}EXAMPLES${colors.reset}
  grimoire add github:anthropics/skills
  grimoire add https://github.com/anthropics/skills
  grimoire add github:anthropics/skills --yes
  grimoire add github:owner/repo --method=skill

${colors.bold}AGENT SUPPORT${colors.reset}
  Claude Code   Full plugin support (MCP, commands, hooks)
  OpenCode      Skills only (.opencode/skills/)
  Codex         Skills only (injected into AGENTS.md)
  Cursor        Auto-converts to .cursor/rules/*.mdc
  Amp           Skills only (AGENT.md)
  Aider         Skills only (CONVENTIONS.md)
`);
};

// ============================================================================
// Installation Logic
// ============================================================================

/**
 * Install items based on context
 */
const installItems = async (context: InstallContext): Promise<void> => {
  const { source, sourceType, agentType, selectedItems, method } = context;
  const projectPath = process.cwd();

  console.log(`\n${colors.bold}Installing ${selectedItems.length} item(s)...${colors.reset}\n`);

  // Get the adapter for this agent
  const adapter = getAgentAdapter(agentType);

  for (const item of selectedItems) {
    try {
      // For Claude Code with plugin method, use plugin install
      if (agentType === "claude_code" && method === "plugin" && sourceType.type === "marketplace") {
        const marketplace = sourceType.marketplace;

        if (marketplace.claudePluginId && adapter.installPlugin) {
          console.log(`${colors.cyan}>${colors.reset} Installing plugin: ${item.name}@${marketplace.claudePluginId}`);

          // Run plugin install
          await Effect.runPromise(
            adapter.installPlugin(marketplace.repo, `${item.name}@${marketplace.claudePluginId}`)
          );

          console.log(`${colors.green}+${colors.reset} Installed ${colors.bold}${item.name}${colors.reset} via plugin marketplace`);
          continue;
        }
      }

      // For all other cases, cache and copy as skill
      console.log(`${colors.cyan}>${colors.reset} Caching: ${item.name}`);

      // Fetch skill from source and cache it
      const cacheResult = await Effect.runPromise(
        Effect.gen(function* () {
          const cacheService = yield* SkillCacheService;
          const sourceAnalyzer = yield* SourceAnalyzerService;

          // Get the base source (original source or marketplace repo)
          const baseSource =
            sourceType.type === "marketplace"
              ? sourceType.marketplace.repo
              : source; // Use the original source for collections

          // Parse the base source to get GitHub info
          const githubSource = sourceAnalyzer.parseSource(baseSource);

          if (!githubSource) {
            throw new Error(`Invalid source for ${item.name}`);
          }

          // Fetch and cache the skill
          // Use the item's path for subdirectory (relative to repo root)
          const skillSource = {
            ...githubSource,
            subdir: item.path || githubSource.subdir,
          };

          return yield* cacheService.fetchFromGitHub(skillSource);
        }).pipe(
          Effect.provide(
            Layer.mergeAll(SkillCacheServiceLive, SourceAnalyzerServiceLive)
          )
        )
      );

      // Enable the skill for the current agent
      console.log(`${colors.cyan}>${colors.reset} Enabling for ${agentType}: ${item.name}`);

      // Compose layers properly - SkillEngineServiceLive depends on the other services
      const engineDeps = Layer.mergeAll(
        SkillCacheServiceLive,
        SkillStateServiceLive,
        AgentAdapterServiceLive,
        CliInstallerServiceLive
      );
      const engineLayer = Layer.provide(SkillEngineServiceLive, engineDeps);

      await Effect.runPromise(
        Effect.gen(function* () {
          const engineService = yield* SkillEngineService;
          yield* engineService.enable(projectPath, item.name, {
            noInit: true,
            noDeps: true,
            yes: true,
          });
        }).pipe(Effect.provide(engineLayer))
      );

      console.log(`${colors.green}+${colors.reset} Enabled ${colors.bold}${item.name}${colors.reset}`);
    } catch (error) {
      // Extract meaningful error message from Effect errors
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
        // Try to extract cause if present
        if ("cause" in error && error.cause instanceof Error) {
          errorMessage = error.cause.message;
        }
      } else if (typeof error === "object" && error !== null) {
        // Effect errors often have a _tag and message
        const errObj = error as Record<string, unknown>;
        if (errObj.message) {
          errorMessage = String(errObj.message);
        } else if (errObj._tag) {
          errorMessage = `${errObj._tag}: ${JSON.stringify(errObj)}`;
        }
      } else {
        errorMessage = String(error);
      }
      console.log(
        `${colors.red}x${colors.reset} Failed to install ${item.name}: ${errorMessage}`
      );
    }
  }

  console.log(`\n${colors.green}Done!${colors.reset}`);
};

// ============================================================================
// Main Command
// ============================================================================

export const addCommand = async (args: ParsedArgs): Promise<void> => {
  // Parse options
  const source = args.positional[0];
  const showHelpFlag = args.flags.help || args.flags.h;
  const yesFlag = args.flags.yes || args.flags.y;
  const methodFlag = (typeof args.flags.method === "string" ? args.flags.method : undefined) as InstallMethod | undefined;

  if (showHelpFlag || !source) {
    showHelp();
    return;
  }

  console.log(`${colors.bold}Analyzing source:${colors.reset} ${source}\n`);

  try {
    // Analyze the source
    const analysisResult = await Effect.runPromise(
      Effect.gen(function* () {
        const sourceAnalyzer = yield* SourceAnalyzerService;
        const marketplaceRegistry = yield* MarketplaceRegistryService;

        // Analyze the source
        const sourceType = yield* sourceAnalyzer.analyze(source);

        // Check if Claude CLI is available
        const claudeCliAvailable = yield* marketplaceRegistry.isClaudeCliAvailable();

        // If it's a marketplace, register it
        if (sourceType.type === "marketplace") {
          yield* marketplaceRegistry.addMarketplace(sourceType.marketplace);
        }

        return { sourceType, claudeCliAvailable };
      }).pipe(
        Effect.provide(
          Layer.mergeAll(SourceAnalyzerServiceLive, MarketplaceRegistryServiceLive)
        )
      )
    );

    const { sourceType, claudeCliAvailable } = analysisResult;

    // Handle empty source
    if (sourceType.type === "empty") {
      console.log(`${colors.red}No skills or plugins found in: ${source}${colors.reset}`);
      console.log(`${colors.gray}Make sure the repository contains SKILL.md or .claude-plugin/${colors.reset}`);
      process.exit(1);
    }

    // Log what was found
    if (sourceType.type === "single-skill") {
      console.log(`${colors.green}Found:${colors.reset} 1 skill (${sourceType.skill.name})`);
    } else if (sourceType.type === "collection") {
      console.log(
        `${colors.green}Found:${colors.reset} ${sourceType.skills.length} skills, ${sourceType.plugins.length} plugins`
      );
    } else if (sourceType.type === "marketplace") {
      console.log(
        `${colors.green}Found:${colors.reset} Marketplace "${sourceType.marketplace.name}" with ${sourceType.skills.length} skills, ${sourceType.plugins.length} plugins`
      );
    }

    // Detect agent type
    const agentType = await Effect.runPromise(detectAgent(process.cwd()));
    const effectiveAgentType: AgentType = agentType || "generic";

    console.log(`${colors.bold}Agent:${colors.reset} ${effectiveAgentType}`);
    console.log(`${colors.bold}Claude CLI:${colors.reset} ${claudeCliAvailable ? "available" : "not found"}\n`);

    // Handle --yes flag (non-interactive)
    if (yesFlag) {
      // Select all items
      let allItems: SelectableItem[] = [];

      if (sourceType.type === "single-skill") {
        allItems = [
          {
            name: sourceType.skill.name,
            description: sourceType.skill.description || "",
            type: "skill",
            path: sourceType.skill.path,
          },
        ];
      } else if (sourceType.type === "collection") {
        allItems = [
          ...sourceType.skills.map((s) => ({
            name: s.name,
            description: s.description || "",
            type: "skill" as const,
            path: s.path,
          })),
          ...sourceType.plugins.map((p) => ({
            name: p.name,
            description: "",
            type: "plugin" as const,
            path: p.path,
          })),
        ];
      } else if (sourceType.type === "marketplace") {
        allItems = [
          ...sourceType.skills.map((s) => ({
            name: s.name,
            description: s.description || "",
            type: "skill" as const,
            path: s.path,
            fromMarketplace: true,
            marketplaceName: sourceType.marketplace.name,
          })),
          ...sourceType.plugins.map((p) => ({
            name: p.name,
            description: "",
            type: "plugin" as const,
            path: p.path,
            fromMarketplace: true,
            marketplaceName: sourceType.marketplace.name,
          })),
        ];
      }

      // Determine method
      const method: InstallMethod =
        methodFlag ||
        (effectiveAgentType === "claude_code" && claudeCliAvailable ? "plugin" : "skill");

      console.log(`${colors.bold}Mode:${colors.reset} --yes (selecting all ${allItems.length} items)`);
      console.log(`${colors.bold}Method:${colors.reset} ${method}\n`);

      await installItems({
        source,
        sourceType,
        agentType: effectiveAgentType,
        claudeCliAvailable,
        selectedItems: allItems,
        method,
      });

      return;
    }

    // Interactive mode - render TUI
    let selectedItems: SelectableItem[] = [];
    let selectedMethod: InstallMethod = "skill";
    let cancelled = false;

    await new Promise<void>((resolve) => {
      const { unmount, waitUntilExit } = render(
        React.createElement(AddScreen, {
          source,
          sourceType,
          agentType: effectiveAgentType,
          claudeCliAvailable,
          onConfirm: (items: SelectableItem[], method: InstallMethod) => {
            selectedItems = items;
            selectedMethod = method;
            unmount();
            resolve();
          },
          onCancel: () => {
            cancelled = true;
            unmount();
            resolve();
          },
        })
      );

      waitUntilExit().then(() => resolve());
    });

    if (cancelled) {
      console.log(`${colors.yellow}Cancelled${colors.reset}`);
      return;
    }

    if (selectedItems.length === 0) {
      console.log(`${colors.yellow}No items selected${colors.reset}`);
      return;
    }

    // Install selected items
    await installItems({
      source,
      sourceType,
      agentType: effectiveAgentType,
      claudeCliAvailable,
      selectedItems,
      method: selectedMethod,
    });
  } catch (error) {
    console.error(
      `${colors.red}Error:${colors.reset} ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }
};
