/**
 * Skills Info Command
 *
 * Show detailed information about a skill from the cache.
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { SkillCacheService, SkillStateService } from "../../services";
import type { CachedSkill } from "../../services";
import type { CliDependency } from "../../models/skill";

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
};

/**
 * Format CLI dependency installation instructions
 */
const formatInstallInstructions = (dep: CliDependency): string[] => {
  const instructions: string[] = [];

  if (!dep.install) {
    return instructions;
  }

  if (dep.install.brew) {
    instructions.push(`brew install ${dep.install.brew}`);
  }
  if (dep.install.cargo) {
    instructions.push(`cargo install ${dep.install.cargo}`);
  }
  if (dep.install.npm) {
    instructions.push(`npm install -g ${dep.install.npm}`);
  }
  if (dep.install.go) {
    instructions.push(`go install ${dep.install.go}`);
  }
  if (dep.install.script) {
    instructions.push(dep.install.script);
  }

  return instructions;
};

/**
 * Format agent support information
 */
const formatAgentSupport = (skill: CachedSkill): string[] => {
  const support: string[] = [];
  const agents = skill.manifest.agents;

  if (!agents) {
    return support;
  }

  // Claude Code
  if (agents.claude_code) {
    const methods: string[] = [];
    if (agents.claude_code.plugin) methods.push("plugin");
    if (agents.claude_code.mcp) methods.push("MCP");
    if (agents.claude_code.inject) methods.push("injection");
    if (methods.length > 0) {
      support.push(`Claude Code: ${methods.join(" + ")}`);
    }
  }

  // OpenCode
  if (agents.opencode) {
    const methods: string[] = [];
    if (agents.opencode.mcp) methods.push("MCP");
    if (agents.opencode.inject) methods.push("injection");
    if (methods.length > 0) {
      support.push(`OpenCode: ${methods.join(" + ")}`);
    }
  }

  return support;
};

/**
 * Skills info command implementation
 */
export const skillsInfo = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const skillCacheService = yield* SkillCacheService;
    const skillStateService = yield* SkillStateService;

    const skillName = args.positional[1];
    const readmeFlag = args.flags.readme === true;
    const manifestFlag = args.flags.manifest === true;

    // Validate arguments
    if (!skillName) {
      console.log(`${colors.yellow}Error:${colors.reset} No skill specified`);
      console.log();
      console.log("Usage: grimoire skills info <name>");
      console.log();
      console.log("Examples:");
      console.log("  grimoire skills info beads");
      console.log("  grimoire skills info beads --readme");
      console.log("  grimoire skills info beads --manifest");
      console.log();
      console.log("Flags:");
      console.log("  --readme     Show README content");
      console.log("  --manifest   Show raw skill.yaml content");
      process.exit(1);
    }

    // Get cached skill
    const skillResult = yield* skillCacheService.getCached(skillName).pipe(Effect.either);

    if (skillResult._tag === "Left") {
      console.log(`${colors.yellow}Error:${colors.reset} Skill "${skillName}" not found in cache`);
      console.log();
      console.log(`Run ${colors.bold}grimoire skills add <source>${colors.reset} to add it to cache first.`);
      console.log();
      console.log("Example:");
      console.log(`  grimoire skills add github:example/skill-${skillName}`);
      process.exit(1);
    }

    const skill = skillResult.right;
    const manifest = skill.manifest;

    // Check if enabled
    const projectPath = process.cwd();
    const enabled = yield* skillStateService.getEnabled(projectPath);
    const isEnabled = enabled.includes(skillName);

    // Show README if requested
    if (readmeFlag) {
      if (skill.readmePath) {
        const file = Bun.file(skill.readmePath);
        const content = yield* Effect.promise(() => file.text());
        console.log(content);
      } else {
        console.log("No README.md found for this skill");
      }
      return;
    }

    // Show raw manifest if requested
    if (manifestFlag) {
      const { join } = yield* Effect.promise(() => import("path"));
      const { homedir } = yield* Effect.promise(() => import("os"));
      const skillCacheDir = join(homedir(), ".skills", "cache", skillName);
      const manifestPath = join(skillCacheDir, "skill.yaml");
      const file = Bun.file(manifestPath);
      const content = yield* Effect.promise(() => file.text());
      console.log(content);
      return;
    }

    // Standard info display
    console.log(`${colors.bold}${manifest.name}${colors.reset} v${manifest.version}`);
    console.log(manifest.description);
    console.log();

    // Metadata
    if (manifest.author) {
      console.log(`${colors.gray}Author:${colors.reset} ${manifest.author}`);
    }
    if (manifest.license) {
      console.log(`${colors.gray}License:${colors.reset} ${manifest.license}`);
    }
    if (manifest.repository) {
      console.log(`${colors.gray}Repository:${colors.reset} ${manifest.repository}`);
    }
    console.log();

    // Type and tags
    console.log(`${colors.gray}Type:${colors.reset} ${manifest.type}`);
    if (manifest.tags && manifest.tags.length > 0) {
      console.log(`${colors.gray}Tags:${colors.reset} ${manifest.tags.join(", ")}`);
    }
    console.log();

    // CLI Dependencies
    if (manifest.cli && Object.keys(manifest.cli).length > 0) {
      console.log(`${colors.bold}CLI Dependencies:${colors.reset}`);
      for (const [name, dep] of Object.entries(manifest.cli)) {
        console.log(`  ${colors.cyan}•${colors.reset} ${name} (check: ${dep.check})`);
        const installInstructions = formatInstallInstructions(dep);
        if (installInstructions.length > 0) {
          console.log(`    ${colors.gray}Install: ${installInstructions.join(", ")}${colors.reset}`);
        }
      }
      console.log();
    }

    // Agent Support
    const agentSupport = formatAgentSupport(skill);
    if (agentSupport.length > 0) {
      console.log(`${colors.bold}Agent Support:${colors.reset}`);
      for (const support of agentSupport) {
        console.log(`  ${colors.cyan}•${colors.reset} ${support}`);
      }
      console.log();
    }

    // Status
    const statusColor = isEnabled ? colors.green : colors.gray;
    const statusText = isEnabled ? "Enabled" : "Not enabled";
    console.log(`${colors.bold}Status:${colors.reset} ${statusColor}${statusText}${colors.reset}`);
    console.log();

    // Source and cache info
    console.log(`${colors.gray}Source:${colors.reset} ${skill.source}`);
    console.log(`${colors.gray}Cached at:${colors.reset} ${skill.cachedAt.toISOString()}`);
    console.log();

    // Available files
    const availableFiles: string[] = [];
    if (skill.skillMdPath) availableFiles.push("SKILL.md");
    if (skill.readmePath) availableFiles.push("README.md");
    if (availableFiles.length > 0) {
      console.log(`${colors.gray}Available files:${colors.reset} ${availableFiles.join(", ")}`);
      console.log();
    }

    // Hints
    if (!isEnabled) {
      console.log(
        `${colors.gray}Run 'grimoire skills enable ${skillName}' to enable this skill${colors.reset}`
      );
    }
    if (skill.readmePath) {
      console.log(
        `${colors.gray}Run 'grimoire skills info ${skillName} --readme' to view README${colors.reset}`
      );
    }
  });
