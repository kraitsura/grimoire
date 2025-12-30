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
 * agents enable - Enable agent in current project
 *
 * Transpiles agent definition to platform-specific format
 * and installs to the appropriate location.
 *
 * Usage:
 *   grimoire agents enable <name>
 *   grimoire agents enable <name> --platform claude_code
 */
export const agentsEnable = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    const platformFlag = args.flags.platform as string | undefined;
    const projectPath = process.cwd();

    if (!name) {
      console.log("Usage: grimoire agents enable <name> [options]");
      console.log("");
      console.log("Options:");
      console.log("  --platform <p>  Only enable for specific platform");
      console.log("  -y              Skip confirmation prompts");
      process.exit(1);
    }

    const agentService = yield* AgentService;

    // 1. Get cached agent
    const cachedAgent = yield* agentService.getCached(name).pipe(
      Effect.catchTag("AgentNotCachedError", () =>
        Effect.fail(new Error(`Agent '${name}' not found in cache. Run 'grimoire agents list' to see available agents.`))
      )
    );

    console.log(`${colors.cyan}Enabling agent:${colors.reset} ${cachedAgent.definition.name}`);

    // 2. Detect or use specified platforms
    let platforms: AgentPlatform[];
    if (platformFlag) {
      platforms = [platformFlag as AgentPlatform];
    } else {
      platforms = yield* agentService.detectPlatforms(projectPath);
    }

    // Filter to platforms with transpiler support
    const supportedPlatforms = platforms.filter(hasTranspiler);
    if (supportedPlatforms.length === 0) {
      console.log(`${colors.yellow}No supported platforms detected.${colors.reset}`);
      console.log("Supported platforms: claude_code, opencode");
      process.exit(1);
    }

    // 3. Initialize project if needed
    const isInitialized = yield* agentService.isInitialized(projectPath);
    if (!isInitialized) {
      yield* agentService.initProject(projectPath, supportedPlatforms);
      console.log(`${colors.dim}Initialized agents for platforms: ${supportedPlatforms.join(", ")}${colors.reset}`);
    }

    // 4. Transpile and write to each platform
    const fs = yield* Effect.promise(() => import("fs/promises"));
    const { dirname } = yield* Effect.promise(() => import("path"));

    for (const platform of supportedPlatforms) {
      const transpiler = getTranspiler(platform);
      const content = transpiler.transpile(cachedAgent.definition);
      const targetPath = transpiler.getProjectPath(projectPath, name);

      // Ensure directory exists
      const targetDir = dirname(targetPath);
      yield* Effect.promise(() => fs.mkdir(targetDir, { recursive: true }));

      // Write transpiled agent
      yield* Effect.promise(() => Bun.write(targetPath, content));

      console.log(`  ${colors.green}+${colors.reset} ${platform}: ${targetPath}`);
    }

    // 5. Update state
    yield* agentService.enable(name, projectPath).pipe(
      Effect.catchTag("AgentProjectNotInitializedError", () =>
        Effect.void // Already handled above
      )
    );

    console.log(`\n${colors.green}Agent '${name}' enabled successfully.${colors.reset}`);
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error(`${colors.red}Error:${colors.reset} ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      })
    )
  );
