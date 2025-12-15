/**
 * Skills Init Command - Initialize skills management in current project
 *
 * Usage:
 *   grimoire skills init
 *   grimoire skills init --agent claude_code
 *   grimoire skills init --agent opencode -y
 */

import { Effect, Data } from "effect";
import { join } from "path";
import type { ParsedArgs } from "../../cli/parser";
import { SkillStateService } from "../../services";
import type { AgentType } from "../../models/skill";

// Error types
export class InitError extends Data.TaggedError("InitError")<{
  message: string;
}> {}

/**
 * Detect which agent is used in the project
 */
const detectAgent = (): Effect.Effect<AgentType | null, InitError> =>
  Effect.gen(function* () {
    const cwd = process.cwd();
    const claudeDir = join(cwd, ".claude");
    const opencodeDir = join(cwd, ".opencode");

    const [claudeExists, opencodeExists] = yield* Effect.all([
      Effect.promise(() =>
        import("fs/promises").then((fs) =>
          fs
            .stat(claudeDir)
            .then(() => true)
            .catch(() => false)
        )
      ),
      Effect.promise(() =>
        import("fs/promises").then((fs) =>
          fs
            .stat(opencodeDir)
            .then(() => true)
            .catch(() => false)
        )
      ),
    ]);

    if (claudeExists && opencodeExists) {
      // Both exist - ambiguous
      return null;
    }

    if (claudeExists) {
      return "claude_code";
    }

    if (opencodeExists) {
      return "opencode";
    }

    // Neither exists
    return null;
  });

/**
 * Prompt user to choose agent type
 */
const promptAgentChoice = (
  detectedAgent: AgentType | null,
  hasMultiple: boolean
): Effect.Effect<AgentType, InitError> =>
  Effect.gen(function* () {
    if (hasMultiple) {
      console.log(
        "Both .claude/ and .opencode/ directories found. Please choose which agent to use:"
      );
    } else if (detectedAgent === null) {
      console.log("No agent directories found. Please choose which agent to initialize:");
    }

    console.log("  1) claude_code");
    console.log("  2) opencode");
    console.log("");
    console.log("Enter choice (1 or 2): ");

    // For now, default to claude_code in non-interactive mode
    // TODO: Add proper prompt library for interactive input
    return "claude_code";
  });

/**
 * Ensure agent config file exists
 */
const ensureAgentConfigFile = (agent: AgentType): Effect.Effect<void, InitError> =>
  Effect.gen(function* () {
    const cwd = process.cwd();
    let configPath: string;
    let configContent: string;

    if (agent === "claude_code") {
      configPath = join(cwd, ".claude", "CLAUDE.md");
      configContent = `# Claude Code Configuration

This project uses Claude Code for AI-assisted development.

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
`;
    } else if (agent === "opencode") {
      configPath = join(cwd, ".opencode", "AGENTS.md");
      configContent = `# OpenCode Configuration

This project uses OpenCode for AI-assisted development.

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
`;
    } else {
      // Generic agent type
      return;
    }

    const file = Bun.file(configPath);
    const exists = yield* Effect.promise(() => file.exists());

    if (!exists) {
      // Create the config file
      yield* Effect.promise(() => Bun.write(configPath, configContent)).pipe(
        Effect.mapError(
          (error) =>
            new InitError({
              message: `Failed to create config file: ${error instanceof Error ? error.message : String(error)}`,
            })
        )
      );
      console.log(`Created ${configPath}`);
    } else {
      // File exists - check for markers
      const content = yield* Effect.promise(() => file.text());
      if (!content.includes("<!-- skills:managed:start -->")) {
        // Add markers at the end
        const updatedContent = `${content.trim()}

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
`;
        yield* Effect.promise(() => Bun.write(configPath, updatedContent)).pipe(
          Effect.mapError(
            (error) =>
              new InitError({
                message: `Failed to update config file: ${error instanceof Error ? error.message : String(error)}`,
              })
          )
        );
        console.log(`Updated ${configPath} with managed section markers`);
      }
    }
  });

/**
 * Create skills directory
 */
const createSkillsDirectory = (agent: AgentType): Effect.Effect<void, InitError> =>
  Effect.gen(function* () {
    const cwd = process.cwd();
    let skillsDir: string;
    let agentDir: string;

    if (agent === "claude_code") {
      agentDir = join(cwd, ".claude");
      skillsDir = join(cwd, ".claude", "skills");
    } else if (agent === "opencode") {
      agentDir = join(cwd, ".opencode");
      skillsDir = join(cwd, ".opencode", "skills");
    } else {
      // Generic agent
      return;
    }

    // Ensure agent directory exists
    yield* Effect.promise(() =>
      import("fs/promises").then((fs) => fs.mkdir(agentDir, { recursive: true }))
    ).pipe(
      Effect.mapError(
        (error) =>
          new InitError({
            message: `Failed to create agent directory: ${error instanceof Error ? error.message : String(error)}`,
          })
      )
    );

    // Ensure skills directory exists
    yield* Effect.promise(() =>
      import("fs/promises").then((fs) => fs.mkdir(skillsDir, { recursive: true }))
    ).pipe(
      Effect.mapError(
        (error) =>
          new InitError({
            message: `Failed to create skills directory: ${error instanceof Error ? error.message : String(error)}`,
          })
      )
    );

    console.log(`Created skills directory: ${skillsDir}`);
  });

/**
 * Skills init command handler
 */
export const skillsInit = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const stateService = yield* SkillStateService;
    const projectPath = process.cwd();

    // Check if already initialized
    const isInitialized = yield* stateService.isInitialized(projectPath);
    if (isInitialized) {
      console.log("Skills already initialized in this project");
      return;
    }

    // Get agent type from flag or detect
    let agent: AgentType;
    const agentFlag = args.flags.agent;
    const yesFlag = args.flags.yes || args.flags.y;

    if (typeof agentFlag === "string") {
      // Validate agent flag
      if (
        agentFlag !== "auto" &&
        agentFlag !== "claude_code" &&
        agentFlag !== "opencode"
      ) {
        yield* Effect.fail(
          new InitError({
            message: `Invalid agent type: ${agentFlag}. Must be one of: auto, claude_code, opencode`,
          })
        );
      }

      if (agentFlag === "auto") {
        // Auto-detect
        const detected = yield* detectAgent();
        if (detected === null) {
          // No agent detected, prompt user (unless -y flag)
          if (yesFlag) {
            agent = "claude_code"; // Default to claude_code
            console.log("No agent detected, defaulting to claude_code");
          } else {
            agent = yield* promptAgentChoice(null, false);
          }
        } else {
          agent = detected;
          console.log(`Detected agent: ${agent}`);
        }
      } else {
        agent = agentFlag as AgentType;
      }
    } else {
      // No --agent flag, try to auto-detect
      const detected = yield* detectAgent();

      if (detected === null) {
        // No agent detected or both exist, prompt user (unless -y flag)
        if (yesFlag) {
          agent = "claude_code"; // Default to claude_code
          console.log("No agent detected, defaulting to claude_code");
        } else {
          agent = yield* promptAgentChoice(null, false);
        }
      } else {
        agent = detected;
        console.log(`Detected agent: ${agent}`);
      }
    }

    // Create directory structure
    yield* createSkillsDirectory(agent);

    // Ensure config file exists with managed markers
    yield* ensureAgentConfigFile(agent);

    // Initialize project state
    yield* stateService.initProject(projectPath, agent);

    console.log("");
    console.log(`Skills initialized successfully for ${agent}`);
    console.log(`Project path: ${projectPath}`);
    console.log("");
    console.log("Next steps:");
    console.log("  - Use 'grimoire skills add <source>' to add skills");
    console.log("  - Use 'grimoire skills enable <name>' to enable skills");
  });
