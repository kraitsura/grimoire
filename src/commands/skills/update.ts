/**
 * Skills Update Command
 *
 * Updates skill metadata (trigger description, allowed tools) after installation.
 *
 * Usage:
 *   grimoire skills update <name> [options]
 *   grimoire skills update beads --trigger "Use when managing tasks"
 *   grimoire skills update beads --allowed-tools "Read,Write,Bash"
 */

import { Effect } from "effect";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParsedArgs } from "../../cli/parser";
import { SkillStateService } from "../../services";
import { getAgentAdapter } from "../../services/skills/agent-adapter";

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
 * Parse YAML frontmatter from SKILL.md content
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }

  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const yamlBlock = trimmed.slice(4, endIndex);
  const body = trimmed.slice(endIndex + 4).trimStart();

  // Simple YAML parsing (key: value lines)
  const frontmatter: Record<string, string> = {};
  let currentKey = "";
  let currentValue = "";
  let inMultiline = false;

  for (const line of yamlBlock.split("\n")) {
    if (inMultiline) {
      if (line.startsWith("  ")) {
        currentValue += (currentValue ? "\n" : "") + line.slice(2);
        continue;
      } else {
        frontmatter[currentKey] = currentValue;
        inMultiline = false;
      }
    }

    const match = /^(\w[\w-]*?):\s*(.*)$/.exec(line);
    if (match) {
      currentKey = match[1];
      const value = match[2];
      if (value === "|" || value === ">") {
        inMultiline = true;
        currentValue = "";
      } else {
        frontmatter[currentKey] = value;
      }
    }
  }

  if (inMultiline && currentKey) {
    frontmatter[currentKey] = currentValue;
  }

  return { frontmatter, body };
}

/**
 * Serialize frontmatter and body back to SKILL.md content
 */
function serializeFrontmatter(
  frontmatter: Record<string, string>,
  body: string
): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value.includes("\n")) {
      lines.push(`${key}: |`);
      for (const line of value.split("\n")) {
        lines.push(`  ${line}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push("---");
  lines.push("");

  return lines.join("\n") + body;
}

/**
 * Skills update command handler
 */
export const skillsUpdate = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const skillStateService = yield* SkillStateService;

    const projectPath = process.cwd();
    const skillName = args.positional[1]; // After "update" subcommand

    // Extract flags
    const triggerFlag = args.flags.trigger as string | undefined;
    const allowedToolsFlag = args.flags["allowed-tools"] as string | undefined;
    const descriptionFlag = args.flags.description as string | undefined;

    // Validate arguments
    if (!skillName) {
      console.log(`${colors.red}Error:${colors.reset} No skill name specified`);
      console.log();
      console.log("Usage: grimoire skills update <name> [options]");
      console.log();
      console.log("Options:");
      console.log("  --trigger <text>         Update trigger description for skill discovery");
      console.log("  --allowed-tools <list>   Update allowed tools (comma-separated)");
      console.log("  --description <text>     Update main description");
      console.log();
      console.log("Examples:");
      console.log('  grimoire skills update beads --trigger "Use when managing tasks, issues, or sprints"');
      console.log('  grimoire skills update beads --allowed-tools "Read,Write,Bash,Glob"');
      process.exit(1);
    }

    // Check if any update flags provided
    if (!triggerFlag && !allowedToolsFlag && !descriptionFlag) {
      console.log(`${colors.red}Error:${colors.reset} No update options specified`);
      console.log();
      console.log("Provide at least one of:");
      console.log("  --trigger <text>");
      console.log("  --allowed-tools <list>");
      console.log("  --description <text>");
      process.exit(1);
    }

    // Check project initialized
    const isInitialized = yield* skillStateService.isInitialized(projectPath);
    if (!isInitialized) {
      console.log(`${colors.red}Error:${colors.reset} Project not initialized`);
      console.log();
      console.log(`Run ${colors.bold}grimoire skills init${colors.reset} first.`);
      process.exit(1);
    }

    // Get project state to determine agent type
    const projectState = yield* skillStateService.getProjectState(projectPath);
    if (!projectState) {
      console.log(`${colors.red}Error:${colors.reset} Could not read project state`);
      process.exit(1);
    }

    // Check skill is enabled
    const enabledSkills = yield* skillStateService.getEnabled(projectPath);
    if (!enabledSkills.includes(skillName)) {
      console.log(`${colors.red}Error:${colors.reset} Skill "${skillName}" is not enabled in this project`);
      console.log();
      console.log("Enabled skills:", enabledSkills.join(", ") || "(none)");
      process.exit(1);
    }

    // Find skill file path based on agent type
    const adapter = getAgentAdapter(projectState.agent);
    const skillsDir = adapter.getSkillsDir(projectPath);

    // Try new directory structure first, then legacy file
    let skillFilePath = join(skillsDir, skillName, "SKILL.md");
    if (!existsSync(skillFilePath)) {
      skillFilePath = join(skillsDir, `${skillName}.md`);
    }

    if (!existsSync(skillFilePath)) {
      console.log(`${colors.red}Error:${colors.reset} Skill file not found`);
      console.log(`  Tried: ${join(skillsDir, skillName, "SKILL.md")}`);
      console.log(`  Tried: ${join(skillsDir, `${skillName}.md`)}`);
      process.exit(1);
    }

    // Read current content
    const content = yield* Effect.tryPromise({
      try: () => readFile(skillFilePath, "utf-8"),
      catch: () => new Error(`Failed to read ${skillFilePath}`),
    });

    // Parse frontmatter
    const { frontmatter, body } = parseFrontmatter(content);

    // Track changes
    const changes: string[] = [];

    // Apply updates
    if (triggerFlag) {
      frontmatter.description = triggerFlag;
      changes.push(`description -> "${triggerFlag.slice(0, 50)}${triggerFlag.length > 50 ? "..." : ""}"`);
    }

    if (allowedToolsFlag) {
      frontmatter["allowed-tools"] = allowedToolsFlag;
      changes.push(`allowed-tools -> ${allowedToolsFlag}`);
    }

    if (descriptionFlag && !triggerFlag) {
      // Only update description if trigger wasn't set (trigger takes precedence)
      frontmatter.description = descriptionFlag;
      changes.push(`description -> "${descriptionFlag.slice(0, 50)}${descriptionFlag.length > 50 ? "..." : ""}"`);
    }

    // Ensure name is set
    if (!frontmatter.name) {
      frontmatter.name = skillName;
    }

    // Serialize and write
    const newContent = serializeFrontmatter(frontmatter, body);

    yield* Effect.tryPromise({
      try: () => writeFile(skillFilePath, newContent, "utf-8"),
      catch: () => new Error(`Failed to write ${skillFilePath}`),
    });

    // Output success
    console.log(`${colors.green}[ok]${colors.reset} Updated ${colors.bold}${skillName}${colors.reset}`);
    for (const change of changes) {
      console.log(`  ${colors.gray}•${colors.reset} ${change}`);
    }
    console.log();
    console.log(`${colors.cyan}File:${colors.reset} ${skillFilePath}`);
  });
