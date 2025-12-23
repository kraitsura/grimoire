/**
 * grimoire wt config - View and modify worktree configuration
 */

import { Effect } from "effect";
import { join } from "path";
import type { ParsedArgs } from "../../cli/parser";

interface WorktreeConfig {
  basePath?: string;
  copyPatterns?: string[];
  postCreateHooks?: string[];
  copyDependencies?: boolean;
  issuePrefix?: string;
}

const DEFAULT_CONFIG: Required<WorktreeConfig> = {
  basePath: ".worktrees",
  copyPatterns: [".env*", ".envrc", ".tool-versions", ".nvmrc", ".node-version"],
  postCreateHooks: [],
  copyDependencies: false,
  issuePrefix: "",
};

/**
 * Get git repo root
 */
const getGitRoot = async (cwd: string): Promise<string | null> => {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return exitCode === 0 ? stdout.trim() : null;
};

/**
 * Load config from file
 */
const loadConfig = async (path: string): Promise<WorktreeConfig | null> => {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    return JSON.parse(await file.text()) as WorktreeConfig;
  } catch {
    return null;
  }
};

/**
 * Save config to file
 */
const saveConfig = async (path: string, config: WorktreeConfig): Promise<void> => {
  const { mkdir } = await import("fs/promises");
  const { dirname } = await import("path");
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(config, null, 2));
};

/**
 * Get user config path
 */
const getUserConfigPath = (): string => {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return join(home, ".config", "grimoire", "worktrees.json");
};

/**
 * Get project config path
 */
const getProjectConfigPath = (repoRoot: string): string => {
  return join(repoRoot, ".worktrees", "config.json");
};

/**
 * Get merged config values with source tracking
 */
const getMergedConfig = async (
  repoRoot: string
): Promise<{ config: Required<WorktreeConfig>; sources: Record<string, string> }> => {
  const userConfig = await loadConfig(getUserConfigPath());
  const projectConfig = await loadConfig(getProjectConfigPath(repoRoot));

  const config = { ...DEFAULT_CONFIG };
  const sources: Record<string, string> = {};

  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof WorktreeConfig)[]) {
    sources[key] = "default";

    if (userConfig?.[key] !== undefined) {
      (config as WorktreeConfig)[key] = userConfig[key] as never;
      sources[key] = "user";
    }

    if (projectConfig?.[key] !== undefined) {
      (config as WorktreeConfig)[key] = projectConfig[key] as never;
      sources[key] = "project";
    }
  }

  return { config, sources };
};

export const worktreeConfig = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const cwd = process.cwd();
    const repoRoot = yield* Effect.promise(() => getGitRoot(cwd));

    if (!repoRoot) {
      console.error("Error: Not in a git repository");
      process.exit(1);
    }

    const isGlobal = args.flags["global"] === true;
    const isProject = args.flags["project"] === true || !isGlobal;
    const reset = args.flags["reset"] === true;

    const configPath = isGlobal
      ? getUserConfigPath()
      : getProjectConfigPath(repoRoot);

    // Handle --reset
    if (reset) {
      const { unlink } = yield* Effect.promise(() => import("fs/promises"));
      try {
        yield* Effect.promise(() => unlink(configPath));
        console.log(`Reset ${isGlobal ? "user" : "project"} configuration.`);
      } catch {
        console.log("No configuration to reset.");
      }
      return;
    }

    // Get key and value from positional args
    const key = args.positional[1];
    const value = args.positional[2];

    // If no key, show current config
    if (!key) {
      const { config, sources } = yield* Effect.promise(() =>
        getMergedConfig(repoRoot)
      );

      console.log("Worktree Configuration");
      console.log();
      console.log(`Base path: ${config.basePath} (${sources.basePath})`);
      console.log();
      console.log("Copy patterns:");
      for (const pattern of config.copyPatterns) {
        console.log(`  - ${pattern}`);
      }
      console.log(`  (${sources.copyPatterns})`);
      console.log();
      if (config.postCreateHooks.length > 0) {
        console.log("Post-create hooks:");
        for (const hook of config.postCreateHooks) {
          console.log(`  - ${hook}`);
        }
        console.log(`  (${sources.postCreateHooks})`);
      } else {
        console.log("Post-create hooks: (none)");
      }
      console.log();
      console.log(`Copy dependencies: ${config.copyDependencies} (${sources.copyDependencies})`);
      if (config.issuePrefix) {
        console.log(`Issue prefix: ${config.issuePrefix} (${sources.issuePrefix})`);
      }
      console.log();
      console.log(`Source: ${isGlobal ? "user" : "project"} (${configPath})`);
      return;
    }

    // Load existing config
    let config = (yield* Effect.promise(() => loadConfig(configPath))) || {};

    // Handle array operations
    if (key === "copy.add" && value) {
      const patterns = config.copyPatterns || [...DEFAULT_CONFIG.copyPatterns];
      if (!patterns.includes(value)) {
        patterns.push(value);
        config.copyPatterns = patterns;
        yield* Effect.promise(() => saveConfig(configPath, config));
        console.log(`Added copy pattern: ${value}`);
      } else {
        console.log(`Pattern already exists: ${value}`);
      }
      return;
    }

    if (key === "copy.remove" && value) {
      const patterns = config.copyPatterns || [...DEFAULT_CONFIG.copyPatterns];
      const index = patterns.indexOf(value);
      if (index !== -1) {
        patterns.splice(index, 1);
        config.copyPatterns = patterns;
        yield* Effect.promise(() => saveConfig(configPath, config));
        console.log(`Removed copy pattern: ${value}`);
      } else {
        console.log(`Pattern not found: ${value}`);
      }
      return;
    }

    if (key === "hooks.post-create" && value) {
      config.postCreateHooks = [value];
      yield* Effect.promise(() => saveConfig(configPath, config));
      console.log(`Set post-create hook: ${value}`);
      return;
    }

    if (key === "hooks.post-create.add" && value) {
      const hooks = config.postCreateHooks || [];
      if (!hooks.includes(value)) {
        hooks.push(value);
        config.postCreateHooks = hooks;
        yield* Effect.promise(() => saveConfig(configPath, config));
        console.log(`Added post-create hook: ${value}`);
      } else {
        console.log(`Hook already exists: ${value}`);
      }
      return;
    }

    if (key === "hooks.post-create.remove" && value) {
      const hooks = config.postCreateHooks || [];
      const index = hooks.indexOf(value);
      if (index !== -1) {
        hooks.splice(index, 1);
        config.postCreateHooks = hooks;
        yield* Effect.promise(() => saveConfig(configPath, config));
        console.log(`Removed post-create hook: ${value}`);
      } else {
        console.log(`Hook not found: ${value}`);
      }
      return;
    }

    // Handle simple key-value setting
    if (key === "base-path" && value) {
      config.basePath = value;
      yield* Effect.promise(() => saveConfig(configPath, config));
      console.log(`Set base path: ${value}`);
      return;
    }

    if (key === "issue-prefix" && value) {
      config.issuePrefix = value;
      yield* Effect.promise(() => saveConfig(configPath, config));
      console.log(`Set issue prefix: ${value}`);
      return;
    }

    if (key === "copy-dependencies") {
      const enabled = value === "true" || value === "1";
      config.copyDependencies = enabled;
      yield* Effect.promise(() => saveConfig(configPath, config));
      console.log(`Set copy dependencies: ${enabled}`);
      return;
    }

    // Unknown key
    console.log("Usage: grimoire wt config [key] [value]");
    console.log();
    console.log("Keys:");
    console.log("  base-path <path>                Set worktree base directory");
    console.log("  copy.add <pattern>              Add copy pattern");
    console.log("  copy.remove <pattern>           Remove copy pattern");
    console.log("  hooks.post-create <cmd>         Set post-create hook");
    console.log("  hooks.post-create.add <cmd>     Add post-create hook");
    console.log("  hooks.post-create.remove <cmd>  Remove post-create hook");
    console.log("  issue-prefix <prefix>           Set issue prefix");
    console.log("  copy-dependencies <true|false>  Copy node_modules/vendor");
    console.log();
    console.log("Options:");
    console.log("  --global     Modify user config (~/.config/grimoire/worktrees.json)");
    console.log("  --project    Modify project config (.worktrees/config.json) [default]");
    console.log("  --reset      Reset to defaults");
  });
