import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { AgentService } from "../../services/agents";
import type { AgentDefinition } from "../../models/agent";
import { hasTemplate, getTemplate, listTemplateNames } from "../../templates/agents";

// ANSI color codes
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

/**
 * Generate a CLI wrapper agent
 */
const generateCliWrapper = (name: string, cliTool: string): AgentDefinition => {
  const description = `Use for ${cliTool} operations. Invoke when user mentions ${cliTool} commands or related tasks.`;

  const content = `You are a ${cliTool} CLI specialist.

## Usage
Use the \`${cliTool}\` command for all operations. You have access to the Bash tool.

## Guidelines
- Execute ${cliTool} commands as needed
- Explain command output to the user
- Suggest relevant commands based on user intent
- Handle errors gracefully

## Safety
- Avoid destructive operations without explicit confirmation
- Prefer read-only operations when exploring
`;

  return {
    name,
    description,
    tools: ["Bash"],
    content,
    wraps_cli: cliTool,
    tags: ["cli", cliTool],
  };
};

/**
 * Generate a specialized agent
 */
const generateSpecialized = (
  name: string,
  description: string,
  tools: string[]
): AgentDefinition => {
  const content = `You are a specialized agent for: ${name}

## Purpose
${description}

## Guidelines
- Focus on your specialized task
- Use only the allowed tools
- Provide clear, actionable output
`;

  return {
    name,
    description,
    tools: tools.length > 0 ? tools : undefined,
    content,
    tags: ["specialized"],
  };
};

/**
 * agents create - Scaffold a new agent definition
 *
 * Creates agent definitions that wrap CLI tools for use as subagents.
 * Supports interactive creation or CLI flags for automation.
 *
 * Usage:
 *   grimoire agents create <name>              # Interactive creation
 *   grimoire agents create <name> --cli bd     # Wrap CLI tool
 *   grimoire agents create <name> --template beads  # Use template
 */
export const agentsCreate = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    const cliFlag = args.flags["cli"] as string | undefined;
    const templateFlag = args.flags["template"] as string | undefined;
    const descriptionFlag = args.flags["description"] as string | undefined;
    const toolsFlag = args.flags["tools"] as string | undefined;

    if (!name) {
      console.log("Usage: grimoire agents create <name> [options]");
      console.log("");
      console.log("Options:");
      console.log("  --cli <tool>           Wrap an existing CLI tool");
      console.log("  --template <name>      Use a pre-built template");
      console.log("  --description <text>   Agent description");
      console.log("  --tools <t1,t2>        Allowed tools (comma-separated)");
      console.log("");
      console.log("Available templates:");
      for (const t of listTemplateNames()) {
        console.log(`  - ${t}`);
      }
      process.exit(1);
    }

    // Validate name format
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      console.log(`${colors.red}Error:${colors.reset} Name must be kebab-case (lowercase, numbers, hyphens)`);
      process.exit(1);
    }

    const agentService = yield* AgentService;

    // Check if agent already exists
    const existing = yield* agentService.getCached(name).pipe(
      Effect.map(() => true),
      Effect.catchTag("AgentNotCachedError", () => Effect.succeed(false))
    );

    if (existing) {
      console.log(`${colors.yellow}Agent '${name}' already exists.${colors.reset}`);
      console.log("Use a different name or remove the existing agent first.");
      process.exit(1);
    }

    let agent: AgentDefinition;

    if (templateFlag) {
      // Use template
      if (!hasTemplate(templateFlag)) {
        console.log(`${colors.red}Error:${colors.reset} Template '${templateFlag}' not found.`);
        console.log("Available templates:");
        for (const t of listTemplateNames()) {
          console.log(`  - ${t}`);
        }
        process.exit(1);
      }

      agent = yield* getTemplate(templateFlag as Parameters<typeof getTemplate>[0]).pipe(
        Effect.catchAll((e) =>
          Effect.fail(new Error(`Failed to load template: ${e.message}`))
        )
      );

      // Override name if different
      if (agent.name !== name) {
        agent = { ...agent, name };
      }

      console.log(`${colors.cyan}Creating agent from template:${colors.reset} ${templateFlag}`);
    } else if (cliFlag) {
      // Generate CLI wrapper
      agent = generateCliWrapper(name, cliFlag);
      console.log(`${colors.cyan}Creating CLI wrapper agent for:${colors.reset} ${cliFlag}`);
    } else {
      // Generate specialized agent
      const description = descriptionFlag || `Specialized agent: ${name}`;
      const tools = toolsFlag ? toolsFlag.split(",").map((t) => t.trim()) : [];

      agent = generateSpecialized(name, description, tools);
      console.log(`${colors.cyan}Creating specialized agent:${colors.reset} ${name}`);
    }

    // Cache the agent
    yield* agentService.cache(agent, "local").pipe(
      Effect.catchTag("AgentCacheError", (e) =>
        Effect.fail(new Error(`Failed to cache agent: ${e.message}`))
      )
    );

    console.log(`\n${colors.green}✓ Agent '${name}' created successfully.${colors.reset}`);
    console.log("");
    console.log(`${colors.dim}Description:${colors.reset}`);
    console.log(`  ${agent.description}`);
    console.log("");
    if (agent.tools && agent.tools.length > 0) {
      console.log(`${colors.dim}Tools:${colors.reset} ${agent.tools.join(", ")}`);
    }
    if (agent.wraps_cli) {
      console.log(`${colors.dim}Wraps:${colors.reset} ${agent.wraps_cli}`);
    }
    console.log("");
    console.log(`Next steps:`);
    console.log(`  ${colors.cyan}grimoire agents info ${name}${colors.reset}     # View full details`);
    console.log(`  ${colors.cyan}grimoire agents enable ${name}${colors.reset}   # Enable in project`);
    console.log(`  ${colors.cyan}grimoire agents validate ${name}${colors.reset} # Validate definition`);
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error(`${colors.red}Error:${colors.reset} ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      })
    )
  );
