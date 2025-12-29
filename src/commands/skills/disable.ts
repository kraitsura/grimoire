/**
 * Skills Disable Command
 *
 * Disables one or more skills in the current project or globally.
 * This removes skill files and injections but does NOT uninstall CLI tools or plugins.
 *
 * Usage:
 *   grimoire skills disable <name> [...names]
 *   grimoire skills disable beads --purge
 *   grimoire skills disable beads --purge -y
 *   grimoire skills disable beads --global
 */

import { Effect } from "effect";
import { join } from "path";
import type { ParsedArgs } from "../../cli/parser";
import { SkillStateService } from "../../services";
import { SkillEngineService } from "../../services/skills/skill-engine-service";
import { SkillNotEnabledError } from "../../models/skill-errors";

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
  yellow: "\x1b[33m",
};

/**
 * Purge project artifacts for a skill
 *
 * For example, the beads skill creates a .beads/ directory.
 * This function removes such artifacts based on skill-specific logic.
 *
 * @param projectPath - Project root path
 * @param skillName - Name of the skill
 * @returns Effect indicating if artifacts were purged
 */
const purgeArtifacts = (
  projectPath: string,
  skillName: string
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    // Skill-specific artifact paths
    const artifactPaths: Record<string, string> = {
      beads: ".beads",
    };

    const artifactPath = artifactPaths[skillName];
    if (!artifactPath) {
      // No known artifacts for this skill
      return false;
    }

    const fullPath = join(projectPath, artifactPath);

    // Check if artifact exists
    const dirExists = yield* Effect.promise(() =>
      import("fs/promises").then((fs) =>
        fs
          .stat(fullPath)
          .then(() => true)
          .catch(() => false)
      )
    );

    if (!dirExists) {
      return false;
    }

    // Remove the artifact directory
    yield* Effect.promise(() =>
      import("fs/promises").then((fs) => fs.rm(fullPath, { recursive: true, force: true }))
    ).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

    return true;
  });

/**
 * Disable a single skill
 */
const disableSkill = (
  projectPath: string,
  skillName: string,
  purge: boolean,
  yes: boolean,
  scope: "global" | "project"
): Effect.Effect<void, never, SkillStateService | SkillEngineService> =>
  Effect.gen(function* () {
    const stateService = yield* SkillStateService;
    const engineService = yield* SkillEngineService;

    // For project scope, verify skill is enabled
    if (scope === "project") {
      const enabled = yield* stateService.getEnabled(projectPath);
      if (!enabled.includes(skillName)) {
        console.log(`${colors.gray}Skill '${skillName}' is not enabled${colors.reset}`);
        return;
      }
    }

    // Use SkillEngineService to disable the skill
    yield* engineService.disable(projectPath, skillName, { purge, yes, scope }).pipe(
      Effect.catchTag("SkillNotEnabledError", (error) => {
        console.log(`${colors.gray}Skill '${error.name}' is not enabled${colors.reset}`);
        return Effect.void;
      })
    );

    // Get project state to determine agent type for output messages
    const projectState = yield* stateService.getProjectState(projectPath);
    const agentType = projectState?.agent || "claude_code";

    // Display success message
    const scopeLabel = scope === "global" ? `${colors.yellow}(global)${colors.reset} ` : "";
    console.log(`${colors.green}+${colors.reset} Disabled ${scopeLabel}${skillName}`);

    if (scope === "project") {
      if (agentType === "claude_code") {
        console.log(`  ${colors.gray}- Removed from CLAUDE.md${colors.reset}`);
      } else if (agentType === "opencode") {
        console.log(`  ${colors.gray}- Removed from AGENTS.md${colors.reset}`);
      }
      console.log(`  ${colors.gray}- Removed .claude/skills/${skillName}/${colors.reset}`);
    } else {
      console.log(`  ${colors.gray}- Removed from ~/.claude/skills/${skillName}/${colors.reset}`);
    }

    // Handle purge option (only for project scope)
    if (purge && scope === "project") {
      const purged = yield* purgeArtifacts(projectPath, skillName);
      if (purged) {
        console.log(`  ${colors.gray}- Removed project artifacts${colors.reset}`);
      }
    }
  }).pipe(
    Effect.catchAll((error) => {
      // Handle any unexpected errors
      return Effect.sync(() => {
        console.log(`${colors.gray}x Error during disable: ${String(error)}${colors.reset}`);
      });
    })
  );

/**
 * Skills disable command implementation
 */
export const skillsDisable = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const projectPath = process.cwd();
    const skillNames = args.positional.slice(1); // Skip "disable" subcommand
    const purgeFlag = args.flags.purge === true;
    const yesFlag = args.flags.yes === true || args.flags.y === true;
    const globalFlag = args.flags.global === true || args.flags.g === true;
    const scope = globalFlag ? "global" : "project";

    if (skillNames.length === 0) {
      console.log(`${colors.yellow}Usage: grimoire skills disable <name> [...names]${colors.reset}`);
      console.log("");
      console.log("Flags:");
      console.log("  -g, --global   Remove from global/user location (e.g., ~/.claude/skills/)");
      console.log("  --purge        Also remove project artifacts (e.g., .beads/ directory)");
      console.log("  -y, --yes      Skip confirmation for purge");
      console.log("");
      console.log("Examples:");
      console.log("  grimoire skills disable beads");
      console.log("  grimoire skills disable beads typescript-strict");
      console.log("  grimoire skills disable beads --purge -y");
      console.log("  grimoire skills disable beads --global");
      process.exit(1);
    }

    // Disable each skill
    for (const skillName of skillNames) {
      yield* disableSkill(projectPath, skillName, purgeFlag, yesFlag, scope).pipe(
        Effect.catchAll((error) => {
          console.log(`${colors.gray}x Failed to disable ${skillName}${colors.reset}`);
          console.log(`  ${colors.gray}Error: ${String(error)}${colors.reset}`);
          return Effect.void;
        })
      );
    }

    console.log("");
    console.log(`${colors.gray}Note: Plugin and CLI remain installed for future use.${colors.reset}`);
  });
