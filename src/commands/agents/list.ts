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
 * agents list - List available and enabled agents
 *
 * Shows cached agents and their enabled status per project.
 *
 * Usage:
 *   grimoire agents list            # All cached agents
 *   grimoire agents list --enabled  # Only enabled in current project
 */
export const agentsList = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const enabledOnly = args.flags["enabled"] === true;
    const projectPath = process.cwd();

    const agentService = yield* AgentService;

    if (enabledOnly) {
      // Show only enabled agents in current project
      const enabled = yield* agentService.listEnabled(projectPath);

      if (enabled.length === 0) {
        console.log(`${colors.dim}No agents enabled in this project.${colors.reset}`);
        console.log(`Run 'grimoire agents enable <name>' to enable an agent.`);
        return;
      }

      console.log(`${colors.bold}Enabled Agents${colors.reset}\n`);
      for (const name of enabled) {
        console.log(`  ${colors.green}●${colors.reset} ${name}`);
      }
    } else {
      // Show all cached agents
      const agents = yield* agentService.listCached();
      const enabled = yield* agentService.listEnabled(projectPath);
      const enabledSet = new Set(enabled);

      if (agents.length === 0) {
        console.log(`${colors.dim}No agents cached.${colors.reset}`);
        console.log(`Run 'grimoire agents create <name>' to create an agent.`);
        return;
      }

      console.log(`${colors.bold}Available Agents${colors.reset}\n`);

      for (const agent of agents) {
        const isEnabled = enabledSet.has(agent.name);
        const status = isEnabled
          ? `${colors.green}enabled${colors.reset}`
          : `${colors.dim}cached${colors.reset}`;

        console.log(`  ${agent.name}`);
        console.log(`    ${colors.dim}${agent.definition.description.slice(0, 60)}...${colors.reset}`);
        console.log(`    Status: ${status}`);
        if (agent.definition.wraps_cli) {
          console.log(`    ${colors.dim}Wraps: ${agent.definition.wraps_cli}${colors.reset}`);
        }
        console.log("");
      }

      console.log(`${colors.dim}Total: ${agents.length} agent(s), ${enabled.length} enabled${colors.reset}`);
    }
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      })
    )
  );
