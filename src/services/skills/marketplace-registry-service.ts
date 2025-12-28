/**
 * Marketplace Registry Service
 *
 * Manages the marketplace registry stored at ~/.grimoire/marketplaces.json.
 * Syncs with Claude Code's installed marketplaces when available.
 */

import { Context, Effect, Layer, Data } from "effect";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import type {
  Marketplace,
  MarketplaceRegistry,
  MarketplaceType,
  MutableMarketplace,
  MutableMarketplaceRegistry,
} from "../../models/marketplace";
import type { GitHubSource } from "./skill-cache-service";

// ============================================================================
// Error Types
// ============================================================================

export class MarketplaceRegistryError extends Data.TaggedError("MarketplaceRegistryError")<{
  message: string;
  cause?: unknown;
}> {}

export class ClaudeCliNotFoundError extends Data.TaggedError("ClaudeCliNotFoundError")<{
  message: string;
}> {}

// ============================================================================
// Paths
// ============================================================================

const getRegistryPath = (): string => {
  return join(homedir(), ".grimoire", "marketplaces.json");
};

const getGrimoireDir = (): string => {
  return join(homedir(), ".grimoire");
};

// ============================================================================
// Default Registry
// ============================================================================

const getDefaultRegistry = (): MutableMarketplaceRegistry => ({
  version: 1,
  marketplaces: [],
});

// ============================================================================
// File Operations
// ============================================================================

const readRegistry = (): Effect.Effect<MutableMarketplaceRegistry, MarketplaceRegistryError> =>
  Effect.gen(function* () {
    const registryPath = getRegistryPath();

    if (!existsSync(registryPath)) {
      return getDefaultRegistry();
    }

    try {
      const content = yield* Effect.promise(() => readFile(registryPath, "utf-8"));
      const parsed = JSON.parse(content) as MutableMarketplaceRegistry;

      // Ensure valid structure - copy to make mutable
      return {
        version: parsed.version || 1,
        lastSync: parsed.lastSync,
        marketplaces: (parsed.marketplaces || []).map(m => ({ ...m })),
      };
    } catch {
      // Return default on parse error
      return getDefaultRegistry();
    }
  });

const writeRegistry = (
  registry: MutableMarketplaceRegistry
): Effect.Effect<void, MarketplaceRegistryError> =>
  Effect.gen(function* () {
    const registryPath = getRegistryPath();
    const grimoireDir = getGrimoireDir();

    try {
      // Ensure directory exists
      yield* Effect.promise(() => mkdir(grimoireDir, { recursive: true }));

      // Write atomically
      const tempPath = `${registryPath}.tmp`;
      yield* Effect.promise(() =>
        writeFile(tempPath, JSON.stringify(registry, null, 2), "utf-8")
      );

      const fs = yield* Effect.promise(() => import("fs/promises"));
      yield* Effect.promise(() => fs.rename(tempPath, registryPath));
    } catch (error) {
      return yield* Effect.fail(
        new MarketplaceRegistryError({
          message: `Failed to write marketplace registry: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        })
      );
    }
  });

// ============================================================================
// Claude CLI Detection
// ============================================================================

/**
 * Check if claude CLI is available
 */
const isClaudeCliAvailable = (): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    try {
      const { execSync } = yield* Effect.promise(() => import("child_process"));
      execSync("claude --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });

/**
 * Get Claude Code's installed marketplaces
 *
 * Reads from Claude Code's settings to find installed plugin marketplaces.
 * Returns empty array if Claude Code is not configured.
 */
const getClaudeCodeMarketplaces = (): Effect.Effect<Marketplace[]> =>
  Effect.gen(function* () {
    // Claude Code stores settings in different locations based on OS
    const possiblePaths = [
      join(homedir(), ".claude", "settings.json"),
      join(homedir(), ".config", "claude-code", "settings.json"),
    ];

    for (const settingsPath of possiblePaths) {
      if (!existsSync(settingsPath)) continue;

      try {
        const content = yield* Effect.promise(() => readFile(settingsPath, "utf-8"));
        const settings = JSON.parse(content) as {
          pluginMarketplaces?: {
            name?: string;
            repo?: string;
            url?: string;
          }[];
        };

        if (!settings.pluginMarketplaces || !Array.isArray(settings.pluginMarketplaces)) {
          continue;
        }

        const marketplaces: Marketplace[] = [];

        for (const pm of settings.pluginMarketplaces) {
          if (!pm.repo && !pm.url) continue;

          // Parse repo URL to get owner/repo
          const repo = pm.repo || pm.url || "";
          let normalizedRepo = repo;

          // Normalize to github:owner/repo format
          if (repo.startsWith("https://github.com/")) {
            normalizedRepo = repo.replace("https://github.com/", "github:");
          } else if (!repo.startsWith("github:")) {
            normalizedRepo = `github:${repo}`;
          }

          // Extract name from repo if not provided
          const name = pm.name || normalizedRepo.split("/").pop() || "unknown";

          marketplaces.push({
            name,
            repo: normalizedRepo,
            type: "community" as MarketplaceType,
            claudePluginId: name, // Use name as plugin ID
            addedAt: new Date().toISOString(),
          });
        }

        return marketplaces;
      } catch {
        // Continue to next path on error
        continue;
      }
    }

    return [];
  });

// ============================================================================
// Marketplace Detection
// ============================================================================

/**
 * Check if a GitHub source is a marketplace
 *
 * Looks for .claude-plugin/marketplace.json to determine if it's a marketplace.
 */
const detectMarketplaceFromGitHub = (
  source: GitHubSource
): Effect.Effect<Marketplace | null> =>
  Effect.gen(function* () {
    const { owner, repo, ref = "main", subdir } = source;
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
    const path = subdir ? `/${subdir}` : "";

    // Check for .claude-plugin/marketplace.json
    const marketplaceJsonUrl = `${baseUrl}${path}/.claude-plugin/marketplace.json?ref=${ref}`;

    try {
      const response = yield* Effect.promise(() => fetch(marketplaceJsonUrl));

      if (!response.ok) {
        return null;
      }

      const data = (yield* Effect.promise(() => response.json())) as { content: string };
      const content = atob(data.content);
      const marketplaceJson = JSON.parse(content) as {
        name?: string;
        description?: string;
        plugins?: { name: string; path?: string }[];
      };

      // It's a marketplace!
      return {
        name: marketplaceJson.name || repo,
        repo: `github:${owner}/${repo}${subdir ? `#${subdir}` : ""}`,
        type: "community" as MarketplaceType,
        description: marketplaceJson.description,
        claudePluginId: marketplaceJson.name || repo,
        addedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  });

// ============================================================================
// Service Interface
// ============================================================================

interface MarketplaceRegistryServiceImpl {
  // Registry operations
  readonly getRegistry: () => Effect.Effect<MarketplaceRegistry, MarketplaceRegistryError>;
  readonly addMarketplace: (
    marketplace: Marketplace
  ) => Effect.Effect<void, MarketplaceRegistryError>;
  readonly removeMarketplace: (
    name: string
  ) => Effect.Effect<void, MarketplaceRegistryError>;
  readonly getMarketplace: (
    name: string
  ) => Effect.Effect<Marketplace | null, MarketplaceRegistryError>;

  // Claude Code integration
  readonly isClaudeCliAvailable: () => Effect.Effect<boolean>;
  readonly syncWithClaudeCode: () => Effect.Effect<void, MarketplaceRegistryError>;

  // Detection
  readonly isKnownMarketplace: (
    repo: string
  ) => Effect.Effect<Marketplace | null, MarketplaceRegistryError>;
  readonly detectMarketplace: (
    source: GitHubSource
  ) => Effect.Effect<Marketplace | null>;
}

// ============================================================================
// Service Tag
// ============================================================================

export class MarketplaceRegistryService extends Context.Tag("MarketplaceRegistryService")<
  MarketplaceRegistryService,
  MarketplaceRegistryServiceImpl
>() {}

// ============================================================================
// Service Implementation
// ============================================================================

const makeMarketplaceRegistryService = (): MarketplaceRegistryServiceImpl => ({
  getRegistry: () => readRegistry(),

  addMarketplace: (marketplace: Marketplace) =>
    Effect.gen(function* () {
      const registry = yield* readRegistry();

      // Check if already exists
      const existing = registry.marketplaces.findIndex((m) => m.name === marketplace.name);

      if (existing >= 0) {
        // Update existing
        registry.marketplaces[existing] = {
          ...marketplace,
          addedAt: registry.marketplaces[existing].addedAt || marketplace.addedAt,
        };
      } else {
        // Add new
        registry.marketplaces.push({
          ...marketplace,
          addedAt: marketplace.addedAt || new Date().toISOString(),
        });
      }

      yield* writeRegistry(registry);
    }),

  removeMarketplace: (name: string) =>
    Effect.gen(function* () {
      const registry = yield* readRegistry();
      registry.marketplaces = registry.marketplaces.filter((m) => m.name !== name);
      yield* writeRegistry(registry);
    }),

  getMarketplace: (name: string) =>
    Effect.gen(function* () {
      const registry = yield* readRegistry();
      return registry.marketplaces.find((m) => m.name === name) || null;
    }),

  isClaudeCliAvailable: () => isClaudeCliAvailable(),

  syncWithClaudeCode: () =>
    Effect.gen(function* () {
      const claudeAvailable = yield* isClaudeCliAvailable();

      if (!claudeAvailable) {
        // Can't sync if Claude CLI not available
        return;
      }

      const registry = yield* readRegistry();
      const claudeMarketplaces = yield* getClaudeCodeMarketplaces();

      // Merge Claude Code marketplaces into registry
      for (const cm of claudeMarketplaces) {
        const existing = registry.marketplaces.find((m) => m.repo === cm.repo);

        if (!existing) {
          registry.marketplaces.push(cm);
        } else {
          // Update Claude plugin ID if missing
          if (!existing.claudePluginId && cm.claudePluginId) {
            existing.claudePluginId = cm.claudePluginId;
          }
        }
      }

      registry.lastSync = new Date().toISOString();
      yield* writeRegistry(registry);
    }),

  isKnownMarketplace: (repo: string) =>
    Effect.gen(function* () {
      const registry = yield* readRegistry();

      // Normalize repo for comparison
      let normalizedRepo = repo;
      if (repo.startsWith("https://github.com/")) {
        normalizedRepo = repo.replace("https://github.com/", "github:");
      }

      // Check if any marketplace matches
      for (const m of registry.marketplaces) {
        let marketplaceRepo = m.repo;
        if (marketplaceRepo.startsWith("https://github.com/")) {
          marketplaceRepo = marketplaceRepo.replace("https://github.com/", "github:");
        }

        // Match by repo (with or without ref/subdir)
        if (
          marketplaceRepo === normalizedRepo ||
          marketplaceRepo.startsWith(normalizedRepo) ||
          normalizedRepo.startsWith(marketplaceRepo.split("@")[0].split("#")[0])
        ) {
          return m;
        }
      }

      return null;
    }),

  detectMarketplace: (source: GitHubSource) => detectMarketplaceFromGitHub(source),
});

// ============================================================================
// Live Layer
// ============================================================================

export const MarketplaceRegistryServiceLive = Layer.succeed(
  MarketplaceRegistryService,
  makeMarketplaceRegistryService()
);
