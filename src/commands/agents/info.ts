import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { AgentService } from "../../services/agents";

// ANSI color codes
const colors = {
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

/**
 * agents info - Show agent details
 *
 * Displays full agent definition including:
 * - Name and description
 * - Allowed tools
 * - Model override
 * - System prompt preview
 * - Enabled platforms
 *
 * Usage:
 *   grimoire agents info <name>
 */
export const agentsInfo = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    const projectPath = process.cwd();

    if (!name) {
      console.log("Usage: grimoire agents info <name>");
      process.exit(1);
    }

    const agentService = yield* AgentService;

    // Get cached agent
    const cachedAgent = yield* agentService.getCached(name).pipe(
      Effect.catchTag("AgentNotCachedError", () =>
        Effect.fail(new Error(`Agent '${name}' not found. Run 'grimoire agents list' to see available agents.`))
      )
    );

    const def = cachedAgent.definition;
    const isEnabled = yield* agentService.isEnabled(name, projectPath);

    console.log(`${colors.bold}Agent: ${def.name}${colors.reset}\n`);

    // Description
    console.log(`${colors.cyan}Description:${colors.reset}`);
    console.log(`  ${def.description}\n`);

    // Status
    console.log(`${colors.cyan}Status:${colors.reset}`);
    console.log(`  ${isEnabled ? `${colors.green}Enabled${colors.reset}` : `${colors.dim}Not enabled${colors.reset}`} in current project\n`);

    // Tools
    if (def.tools && def.tools.length > 0) {
      console.log(`${colors.cyan}Allowed Tools:${colors.reset}`);
      console.log(`  ${def.tools.join(", ")}\n`);
    }

    // Model
    if (def.model) {
      console.log(`${colors.cyan}Model:${colors.reset}`);
      console.log(`  ${def.model}\n`);
    }

    // CLI wrapper
    if (def.wraps_cli) {
      console.log(`${colors.cyan}Wraps CLI:${colors.reset}`);
      console.log(`  ${def.wraps_cli}\n`);
    }

    // Tags
    if (def.tags && def.tags.length > 0) {
      console.log(`${colors.cyan}Tags:${colors.reset}`);
      console.log(`  ${def.tags.join(", ")}\n`);
    }

    // Source
    console.log(`${colors.cyan}Source:${colors.reset}`);
    console.log(`  ${cachedAgent.source}\n`);

    // Cached at
    console.log(`${colors.cyan}Cached At:${colors.reset}`);
    console.log(`  ${cachedAgent.cachedAt}\n`);

    // System prompt preview
    console.log(`${colors.cyan}System Prompt (preview):${colors.reset}`);
    const preview = def.content.slice(0, 300);
    const lines = preview.split("\n").slice(0, 8);
    for (const line of lines) {
      console.log(`  ${colors.dim}${line}${colors.reset}`);
    }
    if (def.content.length > 300) {
      console.log(`  ${colors.dim}...${colors.reset}`);
    }
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      })
    )
  );
