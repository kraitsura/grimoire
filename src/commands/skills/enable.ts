/**
 * Skills Enable Command
 *
 * Enables one or more skills in the current project.
 *
 * Usage:
 *   grimoire skills enable <name> [names...]
 *   grimoire skills enable beads -y
 *   grimoire skills enable beads --no-deps --no-init
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import {
  SkillCacheService,
  SkillStateService,
  SkillEngineService,
} from "../../services";
import type { EnableResult, SkillError } from "../../services/skills/skill-engine-service";


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
};

/**
 * Format error message for a failed skill
 */
const formatErrorMessage = (skillName: string, error: SkillError): string => {
  const lines: string[] = [];
  lines.push(`${colors.red}x${colors.reset} Failed to enable ${colors.bold}${skillName}${colors.reset}`);

  let message = "";
  switch (error._tag) {
    case "SkillNotCachedError":
      message = `Skill not found in cache. Run: grimoire skills add <source>`;
      break;
    case "SkillAlreadyEnabledError":
      return `${colors.gray}-${colors.reset} ${skillName} is already enabled`;
    case "ProjectNotInitializedError":
      message = `Project not initialized. Run: grimoire skills init`;
      break;
    case "CliDependencyError":
      message = `CLI dependency error: ${error.message}`;
      break;
    case "InjectionError":
      message = `Injection error: ${error.message}`;
      break;
    case "SkillNotEnabledError":
      message = "Skill is not enabled";
      break;
    default:
      message = "Unknown error";
  }

  lines.push(`  ${colors.red}Error:${colors.reset} ${message}`);
  return lines.join("\n");
};

/**
 * Format success message for an enabled skill
 */
const formatSuccessMessage = (result: EnableResult): string => {
  const lines: string[] = [];
  lines.push(`${colors.green}+${colors.reset} Enabled ${colors.bold}${result.skillName}${colors.reset}`);

  const details: string[] = [];
  if (result.cliInstalled && result.cliInstalled.length > 0) {
    details.push(`Installed ${result.cliInstalled.join(", ")} CLI`);
  }
  if (result.pluginInstalled) {
    details.push("Installed plugin");
  }
  if (result.mcpConfigured) {
    details.push("Configured MCP");
  }
  if (result.injected) {
    details.push("Injected skill content");
  }
  if (result.initRan) {
    details.push("Ran initialization commands");
  }

  for (const detail of details) {
    lines.push(`  ${colors.gray}-${colors.reset} ${detail}`);
  }

  return lines.join("\n");
};


/**
 * Skills enable command handler
 */
export const skillsEnable = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const skillCacheService = yield* SkillCacheService;
    const skillStateService = yield* SkillStateService;
    const skillEngineService = yield* SkillEngineService;

    const projectPath = process.cwd();
    const skillNames = args.positional.slice(1); // Skip "enable" subcommand

    // Extract flags
    const yesFlag = args.flags.yes || args.flags.y;
    const noDepsFlag = args.flags["no-deps"];
    const noInitFlag = args.flags["no-init"];

    // Validate arguments
    if (skillNames.length === 0) {
      console.log(`${colors.red}Error:${colors.reset} No skills specified`);
      console.log();
      console.log("Usage: grimoire skills enable <name> [names...]");
      console.log();
      console.log("Examples:");
      console.log("  grimoire skills enable beads");
      console.log("  grimoire skills enable beads typescript-strict");
      console.log();
      console.log("Flags:");
      console.log("  -y, --yes        Auto-confirm all prompts");
      console.log("  --no-deps        Skip CLI dependency installation");
      console.log("  --no-init        Skip init commands");
      process.exit(1);
    }

    // Check project initialized
    const isInitialized = yield* skillStateService.isInitialized(projectPath);
    if (!isInitialized) {
      console.log(`${colors.red}Error:${colors.reset} Project not initialized`);
      console.log();
      console.log(`Run ${colors.bold}grimoire skills init${colors.reset} to initialize skills in this project.`);
      process.exit(1);
    }

    // Resolve each skill from cache
    const skillsToEnable: string[] = [];
    for (const skillName of skillNames) {
      const isCached = yield* skillCacheService.isCached(skillName);
      if (!isCached) {
        console.log(`${colors.red}Error:${colors.reset} Skill "${skillName}" not found in cache`);
        console.log();
        console.log(`Run ${colors.bold}grimoire skills add <source>${colors.reset} to add it to cache first.`);
        console.log();
        console.log("Example:");
        console.log(`  grimoire skills add github:example/skill-${skillName}`);
        process.exit(1);
      }
      skillsToEnable.push(skillName);
    }

    // Enable each skill in order
    const results: EnableResult[] = [];
    let hasErrors = false;

    for (const skillName of skillsToEnable) {
      const result = yield* skillEngineService
        .enable(projectPath, skillName, {
          yes: !!yesFlag,
          noDeps: !!noDepsFlag,
          noInit: !!noInitFlag,
        })
        .pipe(Effect.either);

      if (result._tag === "Right") {
        // Success
        results.push(result.right);
        console.log(formatSuccessMessage(result.right));
      } else {
        // Error
        console.log(formatErrorMessage(skillName, result.left));

        // Stop on first failure (unless it's "already enabled")
        if (result.left._tag !== "SkillAlreadyEnabledError") {
          hasErrors = true;
          console.log();
          console.log(
            `${colors.yellow}Note:${colors.reset} Stopping due to error. Remaining skills not processed.`
          );
          break;
        }
      }

      // Add spacing between skills
      if (skillsToEnable.length > 1) {
        console.log();
      }
    }

    // Show restart warning if any plugins were installed
    const anyPluginInstalled = results.some((r) => r.pluginInstalled);
    if (anyPluginInstalled) {
      console.log(
        `${colors.yellow}!${colors.reset}  Restart your agent to activate installed plugins`
      );
    }

    // Exit with error code if there were errors
    if (hasErrors) {
      process.exit(1);
    }
  });
