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
import { render } from "ink";
import React from "react";
import type { ParsedArgs } from "../../cli/parser";
import { SkillStateService } from "../../services";
import type { AgentType } from "../../models/skill";
import {
  ProviderSelector,
  DEFAULT_OPTIONS,
} from "../../cli/components/ProviderSelector.js";

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
 * Interactive provider selection using TUI
 */
const promptProviderSelection = (): Effect.Effect<AgentType[], InitError> =>
  Effect.async<AgentType[], InitError>((resume) => {
    const { unmount, waitUntilExit } = render(
      React.createElement(ProviderSelector, {
        title: "Select AI Provider(s) to initialize",
        options: DEFAULT_OPTIONS,
        multiSelect: true,
        onConfirm: (selected: string[]) => {
          unmount();
          // Map selected IDs to AgentType array
          const agents = selected.filter(
            (id): id is AgentType => id === "claude_code" || id === "opencode"
          );
          resume(Effect.succeed(agents));
        },
        onCancel: () => {
          unmount();
          resume(Effect.fail(new InitError({ message: "Selection cancelled" })));
        },
      })
    );

    // Handle process cleanup
    waitUntilExit().catch(() => {
      resume(Effect.fail(new InitError({ message: "Process interrupted" })));
    });
  });

/**
 * Get config file info for agent type
 */
const getAgentConfigInfo = (agent: AgentType): { path: string; content: string } | null => {
  const cwd = process.cwd();

  switch (agent) {
    case "claude_code":
      return {
        path: join(cwd, "CLAUDE.md"),
        content: `# Claude Code Configuration

This project uses Claude Code for AI-assisted development.

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
`,
      };
    case "opencode":
    case "codex":
      // Both OpenCode and Codex use AGENTS.md
      return {
        path: join(cwd, "AGENTS.md"),
        content: `# Agent Instructions

This project uses AI coding assistants.

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
`,
      };
    case "cursor":
      // Cursor uses .cursor/rules/<name>/RULE.md and AGENTS.md as fallback
      return {
        path: join(cwd, "AGENTS.md"),
        content: `# Agent Instructions

This project uses Cursor for AI-assisted development.

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
`,
      };
    case "gemini":
      return {
        path: join(cwd, "GEMINI.md"),
        content: `# Gemini CLI Configuration

This project uses Gemini CLI for AI-assisted development.

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
`,
      };
    case "aider":
      return {
        path: join(cwd, "CONVENTIONS.md"),
        content: `# Coding Conventions

Coding guidelines and conventions for this project.

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
`,
      };
    case "amp":
      // Note: Amp uses AGENT.md (singular)
      return {
        path: join(cwd, "AGENT.md"),
        content: `# Agent Instructions

Instructions for Amp AI coding assistant.

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
`,
      };
    default:
      return null;
  }
};

/**
 * Ensure agent config file exists
 */
const ensureAgentConfigFile = (agent: AgentType): Effect.Effect<void, InitError> =>
  Effect.gen(function* () {
    const configInfo = getAgentConfigInfo(agent);
    if (!configInfo) {
      // Agent doesn't use a config file (e.g., Cursor uses .cursor/rules/)
      return;
    }

    const { path: configPath, content: configContent } = configInfo;

    const file = Bun.file(configPath);
    const exists = yield* Effect.promise(() => file.exists());

    if (!exists) {
      // Create the config file
      yield* Effect.tryPromise({
        try: () => Bun.write(configPath, configContent),
        catch: (error) =>
          new InitError({
            message: `Failed to create config file: ${error instanceof Error ? error.message : String(error)}`,
          }),
      });
      console.log(`  + Created ${configPath}`);
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
        yield* Effect.tryPromise({
          try: () => Bun.write(configPath, updatedContent),
          catch: (error) =>
            new InitError({
              message: `Failed to update config file: ${error instanceof Error ? error.message : String(error)}`,
            }),
        });
        console.log(`  + Updated ${configPath} with managed section markers`);
      } else {
        console.log(`  - Config file exists: ${configPath}`);
      }
    }
  });

/**
 * Get skills directory info for agent type
 */
const getAgentSkillsDirInfo = (agent: AgentType): { agentDir: string; skillsDir: string } | null => {
  const cwd = process.cwd();

  switch (agent) {
    case "claude_code":
      return {
        agentDir: join(cwd, ".claude"),
        skillsDir: join(cwd, ".claude", "skills"),
      };
    case "opencode":
      return {
        agentDir: join(cwd, ".opencode"),
        skillsDir: join(cwd, ".opencode", "skills"),
      };
    case "cursor":
      return {
        agentDir: join(cwd, ".cursor"),
        skillsDir: join(cwd, ".cursor", "rules"),
      };
    case "codex":
      // Codex now supports skills directory (Dec 2025)
      return {
        agentDir: join(cwd, ".codex"),
        skillsDir: join(cwd, ".codex", "skills"),
      };
    case "gemini":
      return {
        agentDir: join(cwd, ".gemini"),
        skillsDir: join(cwd, ".gemini", "skills"),
      };
    case "aider":
    case "amp":
      // These agents use injection-based skills only
      return null;
    default:
      return null;
  }
};

/**
 * Create skills directory
 */
const createSkillsDirectory = (agent: AgentType): Effect.Effect<void, InitError> =>
  Effect.gen(function* () {
    const dirInfo = getAgentSkillsDirInfo(agent);
    if (!dirInfo) {
      // Agent doesn't use a skills directory (uses injection instead)
      return;
    }

    const { agentDir, skillsDir } = dirInfo;

    // Ensure agent directory exists
    yield* Effect.tryPromise({
      try: () => import("fs/promises").then((fs) => fs.mkdir(agentDir, { recursive: true })),
      catch: (error) =>
        new InitError({
          message: `Failed to create agent directory: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });

    // Ensure skills directory exists
    yield* Effect.tryPromise({
      try: () => import("fs/promises").then((fs) => fs.mkdir(skillsDir, { recursive: true })),
      catch: (error) =>
        new InitError({
          message: `Failed to create skills directory: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });

    console.log(`  + Created skills directory: ${skillsDir}`);
  });

/**
 * Initialize a single agent
 */
const initializeAgent = (
  agent: AgentType,
  projectPath: string
): Effect.Effect<void, InitError, SkillStateService> =>
  Effect.gen(function* () {
    const stateService = yield* SkillStateService;

    console.log(`\nInitializing ${agent}...`);

    // Create directory structure
    yield* createSkillsDirectory(agent);

    // Ensure config file exists with managed markers
    yield* ensureAgentConfigFile(agent);

    // Initialize project state
    yield* Effect.catchAll(stateService.initProject(projectPath, agent), (error) =>
      Effect.fail(
        new InitError({
          message: `Failed to initialize state: ${error instanceof Error ? error.message : String(error)}`,
        })
      )
    );
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
      console.log("Use 'grimoire skills doctor' to check configuration");
      return;
    }

    // Get agent type(s) from flag or interactive selection
    let agents: AgentType[];
    const agentFlag = args.flags.agent;
    const yesFlag = args.flags.yes || args.flags.y;

    if (typeof agentFlag === "string") {
      // Explicit --agent flag provided
      if (
        agentFlag !== "auto" &&
        agentFlag !== "claude_code" &&
        agentFlag !== "opencode" &&
        agentFlag !== "all"
      ) {
        yield* Effect.fail(
          new InitError({
            message: `Invalid agent type: ${agentFlag}. Must be one of: auto, claude_code, opencode, all`,
          })
        );
      }

      if (agentFlag === "auto") {
        // Auto-detect
        const detected = yield* detectAgent();
        if (detected === null) {
          agents = ["claude_code"];
          console.log("No agent detected, defaulting to claude_code");
        } else {
          agents = [detected];
          console.log(`Detected agent: ${detected}`);
        }
      } else if (agentFlag === "all") {
        agents = ["claude_code", "opencode"];
      } else {
        agents = [agentFlag as AgentType];
      }
    } else if (yesFlag) {
      // Non-interactive mode with -y flag - auto-detect or default
      const detected = yield* detectAgent();
      if (detected === null) {
        agents = ["claude_code"];
        console.log("No agent detected, defaulting to claude_code");
      } else {
        agents = [detected];
        console.log(`Detected agent: ${detected}`);
      }
    } else {
      // No flags - always show interactive TUI
      agents = yield* promptProviderSelection();
    }

    if (agents.length === 0) {
      yield* Effect.fail(new InitError({ message: "No providers selected" }));
    }

    console.log("");
    console.log("Initializing Grimoire Skills...");
    console.log("");

    // Initialize each selected agent
    for (const agent of agents) {
      yield* initializeAgent(agent, projectPath);
    }

    console.log("");
    console.log("Done! Skills initialized successfully.");
    console.log("");
    console.log(`  Project:   ${projectPath}`);
    console.log(`  Providers: ${agents.join(", ")}`);
    console.log("");
    console.log("Next steps:");
    console.log("  grimoire skills add <source>     Add skills from GitHub/URL");
    console.log("  grimoire skills enable <name>    Enable skills in project");
    console.log("  grimoire skills list             List available skills");
  });
