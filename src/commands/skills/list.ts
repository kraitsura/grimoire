/**
 * Skills List Command
 *
 * Lists skills and their status (enabled/available).
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { SkillCacheService, SkillStateService } from "../../services";

import { AgentAdapterService } from "../../services";

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

/**
 * Format skill name with description
 */
const formatSkillLine = (name: string, description: string, maxWidth: number): string => {
  const padding = maxWidth - name.length;
  return `  ${name}${" ".repeat(padding + 2)}${description}`;
};

/**
 * Find the longest skill name for alignment
 */
const getLongestNameLength = (names: string[]): number => {
  return names.reduce((max, name) => Math.max(max, name.length), 0);
};

/**
 * Skills list command implementation
 */
export const skillsList = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const skillCacheService = yield* SkillCacheService;
    const skillStateService = yield* SkillStateService;
    const agentAdapterService = yield* AgentAdapterService;

    const projectPath = process.cwd();
    const jsonFlag = args.flags.json;
    const quietFlag = args.flags.quiet || args.flags.q;
    const enabledOnlyFlag = args.flags.enabled;
    const availableOnlyFlag = args.flags.available;
    const globalFlag = args.flags.global || args.flags.g;

    // Get project state to determine agent type
    const projectState = yield* skillStateService.getProjectState(projectPath);
    const agentType = projectState?.agent ?? "generic";

    // Get enabled skills based on scope
    const enabled = globalFlag
      ? yield* skillStateService.getGlobalEnabled(agentType)
      : yield* skillStateService.getEnabled(projectPath);
    const enabledSet = new Set(enabled);

    // Get all cached skills
    const cached = yield* skillCacheService.listCached();

    // Separate into enabled and available
    const enabledSkills = cached.filter((skill) => enabledSet.has(skill.manifest.name));
    const availableSkills = cached.filter((skill) => !enabledSet.has(skill.manifest.name));

    // JSON output
    if (jsonFlag) {
      const output = {
        scope: globalFlag ? "global" : "project",
        agent: agentType,
        enabled: enabledSkills.map((skill) => ({
          name: skill.manifest.name,
          description: skill.manifest.description,
          source: skill.source,
        })),
        available: availableSkills.map((skill) => ({
          name: skill.manifest.name,
          description: skill.manifest.description,
          source: skill.source,
        })),
      };
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // Quiet output (names only)
    if (quietFlag) {
      if (!availableOnlyFlag) {
        for (const skill of enabledSkills) {
          console.log(skill.manifest.name);
        }
      }
      if (!enabledOnlyFlag) {
        for (const skill of availableSkills) {
          console.log(skill.manifest.name);
        }
      }
      return;
    }

    // Standard output with formatting
    const showEnabled = !availableOnlyFlag;
    const showAvailable = !enabledOnlyFlag;

    // Show enabled skills
    const scopeLabel = globalFlag ? "Global" : "Enabled";
    const scopeColor = globalFlag ? colors.yellow : colors.green;
    if (showEnabled && enabledSkills.length > 0) {
      console.log(`${colors.bold}${scopeLabel} (${enabledSkills.length}):${colors.reset}`);
      const maxWidth = getLongestNameLength(enabledSkills.map((s) => s.manifest.name));
      for (const skill of enabledSkills.sort((a, b) =>
        a.manifest.name.localeCompare(b.manifest.name)
      )) {
        const line = formatSkillLine(skill.manifest.name, skill.manifest.description, maxWidth);
        console.log(`${scopeColor}*${colors.reset}${line}`);
      }
      console.log();
    } else if (showEnabled && enabledSkills.length === 0) {
      console.log(`${colors.bold}${scopeLabel} (0):${colors.reset}`);
      console.log(`${colors.gray}  No skills ${globalFlag ? "installed globally" : "enabled"}${colors.reset}`);
      console.log();
    }

    // Show available skills
    if (showAvailable && availableSkills.length > 0) {
      console.log(`${colors.bold}Available (${availableSkills.length}):${colors.reset}`);
      const maxWidth = getLongestNameLength(availableSkills.map((s) => s.manifest.name));
      for (const skill of availableSkills.sort((a, b) =>
        a.manifest.name.localeCompare(b.manifest.name)
      )) {
        const line = formatSkillLine(skill.manifest.name, skill.manifest.description, maxWidth);
        console.log(`${colors.gray}o${colors.reset}${line}`);
      }
      console.log();
    } else if (showAvailable && availableSkills.length === 0) {
      console.log(`${colors.bold}Available (0):${colors.reset}`);
      console.log(`${colors.gray}  No skills cached${colors.reset}`);
      console.log();
    }

    // Show help messages
    if (!enabledOnlyFlag) {
      if (availableSkills.length > 0) {
        // Have cached skills to enable
        console.log(
          `${colors.gray}Run 'grimoire skills enable <name>' to enable a skill${colors.reset}`
        );
      } else if (cached.length === 0) {
        // No skills cached at all - suggest search/add
        console.log(
          `${colors.gray}Run 'grimoire skills search <query>' to find skills${colors.reset}`
        );
        console.log(
          `${colors.gray}Run 'grimoire skills add <url>' to add a custom skill${colors.reset}`
        );
      }
    }
  });
