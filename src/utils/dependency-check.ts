/**
 * Dependency checker utilities
 *
 * Provides functions to check for optional CLI dependencies
 * and display helpful error messages when they're missing.
 */

import { spawnSync } from "child_process";

export type Dependency = "claude" | "bd" | "gh" | "srt";

interface DependencyInfo {
  name: string;
  description: string;
  checkCommand: string;
  installInstructions: string;
  url: string;
}

const DEPENDENCIES: Record<Dependency, DependencyInfo> = {
  claude: {
    name: "Claude Code CLI",
    description: "spawn agents in worktrees",
    checkCommand: "claude --version",
    installInstructions: "npm install -g @anthropic-ai/claude-code",
    url: "https://claude.ai/claude-code",
  },
  bd: {
    name: "Beads",
    description: "issue tracking integration",
    checkCommand: "bd --version",
    installInstructions:
      "curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash",
    url: "https://github.com/steveyegge/beads",
  },
  gh: {
    name: "GitHub CLI",
    description: "create PRs from worktrees",
    checkCommand: "gh --version",
    installInstructions: "brew install gh",
    url: "https://cli.github.com",
  },
  srt: {
    name: "Sandbox Runtime",
    description: "sandboxed agent execution",
    checkCommand: "srt --version",
    installInstructions: "npm install -g @anthropic-ai/sandbox-runtime",
    url: "https://github.com/anthropic-experimental/sandbox-runtime",
  },
};

/**
 * Check if a CLI dependency is installed
 */
export function isInstalled(dep: Dependency): boolean {
  const info = DEPENDENCIES[dep];
  try {
    const result = spawnSync("sh", ["-c", info.checkCommand], {
      stdio: "pipe",
      timeout: 5000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Check if dependency is installed, exit with helpful message if not
 */
export function requireDependency(dep: Dependency, feature: string): void {
  if (!isInstalled(dep)) {
    const info = DEPENDENCIES[dep];
    console.error(`Error: ${info.name} is required for ${feature}`);
    console.error();
    console.error(`${info.name} is used for ${info.description}.`);
    console.error();
    console.error("Install it:");
    console.error(`  ${info.installInstructions}`);
    console.error();
    console.error(`More info: ${info.url}`);
    process.exit(1);
  }
}

/**
 * Check if dependency is installed, return false with warning if not
 * Use this for optional/soft dependencies where the command can still proceed
 */
export function checkDependency(dep: Dependency, feature: string): boolean {
  if (!isInstalled(dep)) {
    const info = DEPENDENCIES[dep];
    console.warn(`Warning: ${info.name} not found - ${feature} will be skipped`);
    console.warn(`  Install: ${info.installInstructions}`);
    return false;
  }
  return true;
}
