/**
 * OpenCode Agent Transpiler
 *
 * Transpiles between unified AgentDefinition and OpenCode's agent format.
 *
 * OpenCode agents are stored as:
 * - Global: ~/.config/opencode/agent/<name>.md
 * - Project: .opencode/agent/<name>.md
 *
 * Format:
 * ```yaml
 * ---
 * description: When to use this agent...
 * model: claude-3-5-sonnet
 * mode: subagent
 * temperature: 0.7
 * tools: [Read, Write, Bash]
 * permissions:
 *   Bash: ask
 *   Write: ["/tmp/*"]
 * maxSteps: 50
 * ---
 *
 * System prompt content here...
 * ```
 *
 * Note: OpenCode uses the filename as the agent name, not a frontmatter field.
 */

import { join } from "path";
import { homedir } from "os";
import * as yaml from "js-yaml";
import type { AgentDefinition } from "../../../models/agent";
import type { AgentTranspiler, ParseResult } from "./types";

/**
 * OpenCode specific frontmatter fields
 */
interface OpenCodeFrontmatter {
  description: string;
  model?: string;
  mode?: "primary" | "subagent" | "all";
  temperature?: number;
  tools?: string[];
  permissions?: Record<string, boolean | "ask" | string[]>;
  maxSteps?: number;
}

/**
 * OpenCode agent transpiler
 */
export const openCodeTranspiler: AgentTranspiler = {
  platform: "opencode",

  transpile: (agent: AgentDefinition): string => {
    const frontmatter: OpenCodeFrontmatter = {
      description: agent.description,
    };

    // Map model names if needed (Claude Code uses short names, OpenCode uses full)
    if (agent.model) {
      // Map short names to full model IDs if needed
      const modelMap: Record<string, string> = {
        haiku: "claude-3-5-haiku",
        sonnet: "claude-3-5-sonnet",
        opus: "claude-3-opus",
      };
      frontmatter.model = modelMap[agent.model] || agent.model;
    }

    if (agent.tools && agent.tools.length > 0) {
      frontmatter.tools = [...agent.tools];
    }

    // Default to subagent mode for CLI wrappers
    if (agent.wraps_cli) {
      frontmatter.mode = "subagent";
    }

    const yamlStr = yaml.dump(frontmatter, {
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    });

    return `---\n${yamlStr}---\n\n${agent.content}`;
  },

  parse: (content: string, name: string): ParseResult => {
    if (!content.startsWith("---")) {
      throw new Error("Agent file must have YAML frontmatter");
    }

    const endMarker = content.indexOf("---", 3);
    if (endMarker === -1) {
      throw new Error("Invalid frontmatter - missing closing ---");
    }

    const frontmatterStr = content.slice(3, endMarker).trim();
    const body = content.slice(endMarker + 3).trim();

    const frontmatter = yaml.load(frontmatterStr) as OpenCodeFrontmatter;

    // Reverse map full model names to short names
    let model = frontmatter.model;
    if (model) {
      const reverseModelMap: Record<string, string> = {
        "claude-3-5-haiku": "haiku",
        "claude-3-5-sonnet": "sonnet",
        "claude-3-opus": "opus",
      };
      model = reverseModelMap[model] || model;
    }

    const definition: AgentDefinition = {
      name, // OpenCode uses filename as name
      description: frontmatter.description || "",
      tools: frontmatter.tools,
      model,
      content: body,
    };

    // Capture OpenCode specific fields as extras
    const extras: Record<string, unknown> = {};
    if (frontmatter.mode) {
      extras.mode = frontmatter.mode;
    }
    if (frontmatter.temperature !== undefined) {
      extras.temperature = frontmatter.temperature;
    }
    if (frontmatter.permissions) {
      extras.permissions = frontmatter.permissions;
    }
    if (frontmatter.maxSteps !== undefined) {
      extras.maxSteps = frontmatter.maxSteps;
    }

    return { definition, extras };
  },

  getProjectPath: (projectPath: string, name: string): string => {
    return join(projectPath, ".opencode", "agent", `${name}.md`);
  },

  getGlobalPath: (name: string): string => {
    return join(homedir(), ".config", "opencode", "agent", `${name}.md`);
  },
};
