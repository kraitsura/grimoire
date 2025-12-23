/**
 * Claude Code Agent Transpiler
 *
 * Transpiles between unified AgentDefinition and Claude Code's agent format.
 *
 * Claude Code agents are stored as:
 * - Global: ~/.claude/agents/<name>.md
 * - Project: .claude/agents/<name>.md
 *
 * Format:
 * ```yaml
 * ---
 * name: agent-name
 * description: When to use this agent...
 * tools: [Read, Write, Bash]
 * model: haiku
 * color: "#ff5733"
 * permissionMode: default
 * ---
 *
 * System prompt content here...
 * ```
 */

import { join } from "path";
import { homedir } from "os";
import * as yaml from "js-yaml";
import type { AgentDefinition } from "../../../models/agent";
import type { AgentTranspiler, ParseResult } from "./types";

/**
 * Claude Code specific frontmatter fields
 */
interface ClaudeCodeFrontmatter {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  color?: string;
  permissionMode?: "default" | "ask" | "allow";
}

/**
 * Claude Code agent transpiler
 */
export const claudeCodeTranspiler: AgentTranspiler = {
  platform: "claude_code",

  transpile: (agent: AgentDefinition): string => {
    const frontmatter: ClaudeCodeFrontmatter = {
      name: agent.name,
      description: agent.description,
    };

    // Only include optional fields if they have values
    if (agent.tools && agent.tools.length > 0) {
      frontmatter.tools = agent.tools;
    }
    if (agent.model) {
      frontmatter.model = agent.model;
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

    const frontmatter = yaml.load(frontmatterStr) as ClaudeCodeFrontmatter;

    const definition: AgentDefinition = {
      name: frontmatter.name || name,
      description: frontmatter.description || "",
      tools: frontmatter.tools,
      model: frontmatter.model,
      content: body,
    };

    // Capture Claude Code specific fields as extras
    const extras: Record<string, unknown> = {};
    if (frontmatter.color) {
      extras.color = frontmatter.color;
    }
    if (frontmatter.permissionMode) {
      extras.permissionMode = frontmatter.permissionMode;
    }

    return { definition, extras };
  },

  getProjectPath: (projectPath: string, name: string): string => {
    return join(projectPath, ".claude", "agents", `${name}.md`);
  },

  getGlobalPath: (name: string): string => {
    return join(homedir(), ".claude", "agents", `${name}.md`);
  },
};
