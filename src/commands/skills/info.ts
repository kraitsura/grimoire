/**
 * Skills Info Command
 *
 * Show detailed information about a skill from the cache.
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { SkillCacheService, SkillStateService } from "../../services";

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
    console.log(`${colors.bold}${manifest.name}${colors.reset}`);
    console.log(manifest.description);
    console.log();

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
