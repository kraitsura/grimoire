import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { AgentService } from "../../services/agents";
import { getTranspiler, hasTranspiler } from "../../services/agents/transpilers";
import type { AgentPlatform } from "../../models/agent";

// ANSI color codes
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

/**
 * agents disable - Remove agent from current project
 *
 * Removes agent files from platform-specific locations
 * and updates project state.
 *
 * Usage:
 *   grimoire agents disable <name>
 */
export const agentsDisable = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    const projectPath = process.cwd();

    if (!name) {
      console.log("Usage: grimoire agents disable <name>");
      process.exit(1);
    }

    const agentService = yield* AgentService;

    // Check if project is initialized
    const projectState = yield* agentService.getProjectState(projectPath);
    if (!projectState) {
      console.log(`${colors.yellow}No agents initialized in this project.${colors.reset}`);
      process.exit(0);
    }

    // Check if agent is enabled
    const isEnabled = yield* agentService.isEnabled(name, projectPath);
    if (!isEnabled) {
      console.log(`${colors.yellow}Agent '${name}' is not enabled in this project.${colors.reset}`);
      process.exit(0);
    }

    console.log(`${colors.cyan}Disabling agent:${colors.reset} ${name}`);

    // Remove agent files from each platform
    const fs = yield* Effect.promise(() => import("fs/promises"));

    for (const platform of projectState.platforms) {
      if (!hasTranspiler(platform)) continue;

      const transpiler = getTranspiler(platform);
      const targetPath = transpiler.getProjectPath(projectPath, name);

      try {
        yield* Effect.promise(() => fs.unlink(targetPath));
        console.log(`  ${colors.green}✓${colors.reset} Removed: ${targetPath}`);
      } catch {
        // File may not exist for this platform
        console.log(`  ${colors.dim}-${colors.reset} Not found: ${targetPath}`);
      }
    }

    // Update state
    yield* agentService.disable(name, projectPath);

    console.log(`\n${colors.green}Agent '${name}' disabled successfully.${colors.reset}`);
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error(`${colors.red}Error:${colors.reset} ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      })
    )
  );
