/**
 * Skill Model Schema Tests
 *
 * Tests for skill domain types and schemas including:
 * - SkillManifestSchema
 * - Agent configuration schemas
 * - Skills state schemas
 * - Related types and enumerations
 */

import { describe, it, expect } from "bun:test";
import { Schema } from "@effect/schema";
import {
  CliDependencySchema,
  McpConfigSchema,
  PluginReferenceSchema,
  InjectConfigSchema,
  ClaudeCodeConfigSchema,
  OpenCodeConfigSchema,
  CodexConfigSchema,
  GeminiConfigSchema,
  CursorConfigSchema,
  AiderConfigSchema,
  AmpConfigSchema,
  AgentConfigsSchema,
  InitConfigSchema,
  SkillTypeSchema,
  SkillManifestSchema,
  AgentTypeSchema,
  InstallScopeSchema,
  ProjectStateSchema,
  SkillsStateSchema,
  AgentDetectionModeSchema,
  FeatureFlagsSchema,
  SkillsConfigSchema,
  GLOBAL_SKILL_LOCATIONS,
  type CliDependency,
  type McpConfig,
  type PluginReference,
  type InjectConfig,
  type ClaudeCodeConfig,
  type SkillManifest,
  type AgentType,
  type InstallScope,
  type ProjectState,
  type SkillsState,
  type SkillsConfig,
} from "../../src/models/skill";
import { createSkillManifest, SAMPLE_SKILLS } from "../utils";

describe("CliDependencySchema", () => {
  it("should validate minimal dependency (check only)", () => {
    const dep = {
      check: "which git",
    };

    const decode = Schema.decodeUnknownSync(CliDependencySchema);
    const result = decode(dep);

    expect(result.check).toBe("which git");
    expect(result.install).toBeUndefined();
  });

  it("should validate dependency with install options", () => {
    const dep = {
      check: "which git",
      install: {
        brew: "git",
        npm: "git",
      },
    };

    const decode = Schema.decodeUnknownSync(CliDependencySchema);
    const result = decode(dep);

    expect(result.install?.brew).toBe("git");
    expect(result.install?.npm).toBe("git");
  });

  it("should validate all install options", () => {
    const dep = {
      check: "which tool",
      install: {
        brew: "tool",
        cargo: "tool-cli",
        npm: "@org/tool",
        go: "github.com/org/tool",
        script: "curl -sSL https://example.com/install.sh | sh",
      },
    };

    const decode = Schema.decodeUnknownSync(CliDependencySchema);
    const result = decode(dep);

    expect(result.install?.brew).toBe("tool");
    expect(result.install?.cargo).toBe("tool-cli");
    expect(result.install?.npm).toBe("@org/tool");
    expect(result.install?.go).toBe("github.com/org/tool");
    expect(result.install?.script).toContain("curl");
  });

  it("should fail on empty check command", () => {
    const decode = Schema.decodeUnknownSync(CliDependencySchema);

    expect(() => decode({ check: "" })).toThrow();
  });
});

describe("McpConfigSchema", () => {
  it("should validate minimal MCP config", () => {
    const config = {
      command: "npx",
    };

    const decode = Schema.decodeUnknownSync(McpConfigSchema);
    const result = decode(config);

    expect(result.command).toBe("npx");
    expect(result.args).toBeUndefined();
    expect(result.env).toBeUndefined();
  });

  it("should validate full MCP config", () => {
    const config = {
      command: "npx",
      args: ["-y", "@org/mcp-server"],
      env: {
        API_KEY: "secret",
        DEBUG: "true",
      },
    };

    const decode = Schema.decodeUnknownSync(McpConfigSchema);
    const result = decode(config);

    expect(result.args).toEqual(["-y", "@org/mcp-server"]);
    expect(result.env).toEqual({ API_KEY: "secret", DEBUG: "true" });
  });

  it("should fail on empty command", () => {
    const decode = Schema.decodeUnknownSync(McpConfigSchema);

    expect(() => decode({ command: "" })).toThrow();
  });
});

describe("PluginReferenceSchema", () => {
  it("should validate plugin reference", () => {
    const ref = {
      marketplace: "beads-marketplace",
      name: "beads",
    };

    const decode = Schema.decodeUnknownSync(PluginReferenceSchema);
    const result = decode(ref);

    expect(result.marketplace).toBe("beads-marketplace");
    expect(result.name).toBe("beads");
  });

  it("should fail on empty marketplace", () => {
    const decode = Schema.decodeUnknownSync(PluginReferenceSchema);

    expect(() => decode({ marketplace: "", name: "test" })).toThrow();
  });

  it("should fail on empty name", () => {
    const decode = Schema.decodeUnknownSync(PluginReferenceSchema);

    expect(() => decode({ marketplace: "test", name: "" })).toThrow();
  });
});

describe("InjectConfigSchema", () => {
  it("should validate inject config", () => {
    const config = {
      file: "CLAUDE.md",
      content: "# Custom content\nInstructions here.",
    };

    const decode = Schema.decodeUnknownSync(InjectConfigSchema);
    const result = decode(config);

    expect(result.file).toBe("CLAUDE.md");
    expect(result.content).toContain("Instructions");
  });

  it("should fail on empty file", () => {
    const decode = Schema.decodeUnknownSync(InjectConfigSchema);

    expect(() => decode({ file: "", content: "test" })).toThrow();
  });
});

describe("ClaudeCodeConfigSchema", () => {
  it("should validate empty config", () => {
    const decode = Schema.decodeUnknownSync(ClaudeCodeConfigSchema);
    const result = decode({});

    expect(result.plugin).toBeUndefined();
    expect(result.mcp).toBeUndefined();
    expect(result.skill_file).toBeUndefined();
    expect(result.inject).toBeUndefined();
  });

  it("should validate with plugin", () => {
    const config = {
      plugin: {
        marketplace: "test",
        name: "test-plugin",
      },
    };

    const decode = Schema.decodeUnknownSync(ClaudeCodeConfigSchema);
    const result = decode(config);

    expect(result.plugin?.name).toBe("test-plugin");
  });

  it("should validate with MCP and skill_file", () => {
    const config = {
      mcp: {
        command: "npx",
        args: ["-y", "mcp-server"],
      },
      skill_file: true,
    };

    const decode = Schema.decodeUnknownSync(ClaudeCodeConfigSchema);
    const result = decode(config);

    expect(result.mcp?.command).toBe("npx");
    expect(result.skill_file).toBe(true);
  });
});

describe("OpenCodeConfigSchema", () => {
  it("should validate empty config", () => {
    const decode = Schema.decodeUnknownSync(OpenCodeConfigSchema);
    const result = decode({});

    expect(result.inject).toBeUndefined();
    expect(result.mcp).toBeUndefined();
  });

  it("should validate with inject", () => {
    const config = {
      inject: {
        file: "AGENTS.md",
        content: "OpenCode instructions",
      },
    };

    const decode = Schema.decodeUnknownSync(OpenCodeConfigSchema);
    const result = decode(config);

    expect(result.inject?.file).toBe("AGENTS.md");
  });
});

describe("CodexConfigSchema", () => {
  it("should validate with skill_file option", () => {
    const config = {
      skill_file: true,
    };

    const decode = Schema.decodeUnknownSync(CodexConfigSchema);
    const result = decode(config);

    expect(result.skill_file).toBe(true);
  });
});

describe("GeminiConfigSchema", () => {
  it("should validate full Gemini config", () => {
    const config = {
      inject: {
        file: "GEMINI.md",
        content: "Gemini instructions",
      },
      mcp: {
        command: "npx",
      },
      skill_file: true,
    };

    const decode = Schema.decodeUnknownSync(GeminiConfigSchema);
    const result = decode(config);

    expect(result.inject?.file).toBe("GEMINI.md");
    expect(result.skill_file).toBe(true);
  });
});

describe("CursorConfigSchema", () => {
  it("should validate with globs and always_apply", () => {
    const config = {
      globs: ["**/*.ts", "**/*.tsx"],
      always_apply: true,
    };

    const decode = Schema.decodeUnknownSync(CursorConfigSchema);
    const result = decode(config);

    expect(result.globs).toEqual(["**/*.ts", "**/*.tsx"]);
    expect(result.always_apply).toBe(true);
  });
});

describe("AiderConfigSchema", () => {
  it("should validate with inject", () => {
    const config = {
      inject: {
        file: "CONVENTIONS.md",
        content: "Aider conventions",
      },
    };

    const decode = Schema.decodeUnknownSync(AiderConfigSchema);
    const result = decode(config);

    expect(result.inject?.file).toBe("CONVENTIONS.md");
  });
});

describe("AmpConfigSchema", () => {
  it("should validate with inject", () => {
    const config = {
      inject: {
        file: "AGENT.md",
        content: "Amp agent instructions",
      },
    };

    const decode = Schema.decodeUnknownSync(AmpConfigSchema);
    const result = decode(config);

    expect(result.inject?.file).toBe("AGENT.md");
  });
});

describe("AgentConfigsSchema", () => {
  it("should validate empty configs", () => {
    const decode = Schema.decodeUnknownSync(AgentConfigsSchema);
    const result = decode({});

    expect(result.claude_code).toBeUndefined();
    expect(result.opencode).toBeUndefined();
    expect(result.cursor).toBeUndefined();
  });

  it("should validate multiple agent configs", () => {
    const configs = {
      claude_code: {
        skill_file: true,
      },
      opencode: {
        inject: {
          file: "AGENTS.md",
          content: "test",
        },
      },
      cursor: {
        always_apply: true,
      },
    };

    const decode = Schema.decodeUnknownSync(AgentConfigsSchema);
    const result = decode(configs);

    expect(result.claude_code?.skill_file).toBe(true);
    expect(result.opencode?.inject?.file).toBe("AGENTS.md");
    expect(result.cursor?.always_apply).toBe(true);
  });
});

describe("InitConfigSchema", () => {
  it("should validate empty init config", () => {
    const decode = Schema.decodeUnknownSync(InitConfigSchema);
    const result = decode({});

    expect(result.commands).toBeUndefined();
    expect(result.files).toBeUndefined();
  });

  it("should validate with commands and files", () => {
    const config = {
      commands: ["bun install", "bun run build"],
      files: {
        ".env": "API_KEY=",
        "config.json": '{"debug": true}',
      },
    };

    const decode = Schema.decodeUnknownSync(InitConfigSchema);
    const result = decode(config);

    expect(result.commands).toEqual(["bun install", "bun run build"]);
    expect(result.files?.[".env"]).toBe("API_KEY=");
  });
});

describe("SkillTypeSchema", () => {
  it("should validate all skill types", () => {
    const decode = Schema.decodeUnknownSync(SkillTypeSchema);

    expect(decode("prompt")).toBe("prompt");
    expect(decode("plugin")).toBe("plugin");
    expect(decode("mcp")).toBe("mcp");
    expect(decode("tool")).toBe("tool");
  });

  it("should fail on invalid type", () => {
    const decode = Schema.decodeUnknownSync(SkillTypeSchema);
    expect(() => decode("invalid")).toThrow();
  });
});

describe("SkillManifestSchema", () => {
  it("should validate minimal manifest", () => {
    const manifest = {
      name: "my-skill",
      description: "A skill for testing purposes.",
    };

    const decode = Schema.decodeUnknownSync(SkillManifestSchema);
    const result = decode(manifest);

    expect(result.name).toBe("my-skill");
    expect(result.description).toBe("A skill for testing purposes.");
    expect(result.allowed_tools).toBeUndefined();
  });

  it("should validate manifest with allowed_tools", () => {
    const manifest = {
      name: "dev-skill",
      description: "Development skill",
      allowed_tools: ["Read", "Write", "Bash", "Glob", "Grep"],
    };

    const decode = Schema.decodeUnknownSync(SkillManifestSchema);
    const result = decode(manifest);

    expect(result.allowed_tools).toEqual(["Read", "Write", "Bash", "Glob", "Grep"]);
  });

  it("should fail on empty name", () => {
    const decode = Schema.decodeUnknownSync(SkillManifestSchema);

    expect(() =>
      decode({ name: "", description: "Test" })
    ).toThrow();
  });

  it("should allow empty description", () => {
    const manifest = {
      name: "test",
      description: "",
    };

    const decode = Schema.decodeUnknownSync(SkillManifestSchema);
    const result = decode(manifest);

    expect(result.description).toBe("");
  });
});

describe("AgentTypeSchema", () => {
  it("should validate all agent types", () => {
    const decode = Schema.decodeUnknownSync(AgentTypeSchema);

    expect(decode("claude_code")).toBe("claude_code");
    expect(decode("opencode")).toBe("opencode");
    expect(decode("codex")).toBe("codex");
    expect(decode("cursor")).toBe("cursor");
    expect(decode("aider")).toBe("aider");
    expect(decode("amp")).toBe("amp");
    expect(decode("gemini")).toBe("gemini");
    expect(decode("generic")).toBe("generic");
  });

  it("should fail on invalid agent type", () => {
    const decode = Schema.decodeUnknownSync(AgentTypeSchema);
    expect(() => decode("unknown")).toThrow();
  });
});

describe("InstallScopeSchema", () => {
  it("should validate both scopes", () => {
    const decode = Schema.decodeUnknownSync(InstallScopeSchema);

    expect(decode("global")).toBe("global");
    expect(decode("project")).toBe("project");
  });

  it("should fail on invalid scope", () => {
    const decode = Schema.decodeUnknownSync(InstallScopeSchema);
    expect(() => decode("local")).toThrow();
  });
});

describe("ProjectStateSchema", () => {
  it("should validate project state", () => {
    const state = {
      agent: "claude_code" as const,
      enabled: ["skill1", "skill2"],
      disabled_at: {
        skill3: "2025-01-01T00:00:00.000Z",
      },
      initialized_at: "2025-01-01T00:00:00.000Z",
    };

    const decode = Schema.decodeUnknownSync(ProjectStateSchema);
    const result = decode(state);

    expect(result.agent).toBe("claude_code");
    expect(result.enabled).toEqual(["skill1", "skill2"]);
    expect(result.disabled_at.skill3).toBe("2025-01-01T00:00:00.000Z");
    expect(result.last_sync).toBeUndefined();
  });

  it("should validate with last_sync", () => {
    const state = {
      agent: "cursor" as const,
      enabled: [],
      disabled_at: {},
      initialized_at: "2025-01-01T00:00:00.000Z",
      last_sync: "2025-01-02T00:00:00.000Z",
    };

    const decode = Schema.decodeUnknownSync(ProjectStateSchema);
    const result = decode(state);

    expect(result.last_sync).toBe("2025-01-02T00:00:00.000Z");
  });
});

describe("SkillsStateSchema", () => {
  it("should validate empty skills state", () => {
    const state = {
      version: 1,
      projects: {},
    };

    const decode = Schema.decodeUnknownSync(SkillsStateSchema);
    const result = decode(state);

    expect(result.version).toBe(1);
    expect(result.projects).toEqual({});
  });

  it("should validate with multiple projects", () => {
    const state = {
      version: 2,
      projects: {
        "/path/to/project1": {
          agent: "claude_code" as const,
          enabled: ["skill1"],
          disabled_at: {},
          initialized_at: "2025-01-01T00:00:00.000Z",
        },
        "/path/to/project2": {
          agent: "cursor" as const,
          enabled: ["skill2", "skill3"],
          disabled_at: {},
          initialized_at: "2025-01-02T00:00:00.000Z",
        },
      },
    };

    const decode = Schema.decodeUnknownSync(SkillsStateSchema);
    const result = decode(state);

    expect(Object.keys(result.projects)).toHaveLength(2);
    expect(result.projects["/path/to/project1"].enabled).toEqual(["skill1"]);
    expect(result.projects["/path/to/project2"].agent).toBe("cursor");
  });

  it("should fail on non-integer version", () => {
    const decode = Schema.decodeUnknownSync(SkillsStateSchema);

    expect(() =>
      decode({ version: 1.5, projects: {} })
    ).toThrow();
  });
});

describe("AgentDetectionModeSchema", () => {
  it("should validate all detection modes", () => {
    const decode = Schema.decodeUnknownSync(AgentDetectionModeSchema);

    expect(decode("auto")).toBe("auto");
    expect(decode("claude_code")).toBe("claude_code");
    expect(decode("opencode")).toBe("opencode");
    expect(decode("codex")).toBe("codex");
    expect(decode("cursor")).toBe("cursor");
    expect(decode("aider")).toBe("aider");
    expect(decode("amp")).toBe("amp");
    expect(decode("gemini")).toBe("gemini");
  });
});

describe("FeatureFlagsSchema", () => {
  it("should validate empty feature flags", () => {
    const decode = Schema.decodeUnknownSync(FeatureFlagsSchema);
    const result = decode({});

    expect(result.auto_detect).toBeUndefined();
    expect(result.inject_agent_md).toBeUndefined();
    expect(result.color_output).toBeUndefined();
  });

  it("should validate all feature flags", () => {
    const flags = {
      auto_detect: true,
      inject_agent_md: false,
      color_output: true,
    };

    const decode = Schema.decodeUnknownSync(FeatureFlagsSchema);
    const result = decode(flags);

    expect(result.auto_detect).toBe(true);
    expect(result.inject_agent_md).toBe(false);
    expect(result.color_output).toBe(true);
  });
});

describe("SkillsConfigSchema", () => {
  it("should validate minimal config", () => {
    const config = {
      defaults: {
        agent: "auto" as const,
      },
    };

    const decode = Schema.decodeUnknownSync(SkillsConfigSchema);
    const result = decode(config);

    expect(result.defaults.agent).toBe("auto");
    expect(result.recommended).toBeUndefined();
    expect(result.sources).toBeUndefined();
  });

  it("should validate full config", () => {
    const config = {
      defaults: {
        agent: "claude_code" as const,
      },
      recommended: ["beads", "typescript-strict"],
      sources: ["github:org/skills"],
      detect: {
        "package.json": "npm",
        "Cargo.toml": "rust",
      },
      features: {
        auto_detect: true,
        color_output: false,
      },
    };

    const decode = Schema.decodeUnknownSync(SkillsConfigSchema);
    const result = decode(config);

    expect(result.recommended).toEqual(["beads", "typescript-strict"]);
    expect(result.sources).toEqual(["github:org/skills"]);
    expect(result.detect?.["package.json"]).toBe("npm");
    expect(result.features?.auto_detect).toBe(true);
  });
});

describe("Global skill locations", () => {
  it("should have locations for all agent types", () => {
    expect(GLOBAL_SKILL_LOCATIONS.claude_code).toBe("~/.claude/skills");
    expect(GLOBAL_SKILL_LOCATIONS.opencode).toBe("~/.config/opencode/skills");
    expect(GLOBAL_SKILL_LOCATIONS.cursor).toBe("~/.cursor/rules");
    expect(GLOBAL_SKILL_LOCATIONS.codex).toBe("~/.codex/skills");
    expect(GLOBAL_SKILL_LOCATIONS.aider).toBe("~/.config/aider/conventions");
    expect(GLOBAL_SKILL_LOCATIONS.amp).toBe("~/.config/amp/skills");
    expect(GLOBAL_SKILL_LOCATIONS.gemini).toBe("~/.gemini/skills");
    expect(GLOBAL_SKILL_LOCATIONS.generic).toBe("~/.grimoire/skills");
  });
});

describe("Skill fixtures", () => {
  it("should create skill manifest with defaults", () => {
    const skill = createSkillManifest();

    expect(skill.name).toMatch(/^test-skill-\d+$/);
    expect(skill.description).toBe("A test skill for testing purposes.");
    expect(skill.allowed_tools).toBeUndefined();
  });

  it("should create skill manifest with custom options", () => {
    const skill = createSkillManifest({
      name: "custom-skill",
      description: "Custom description",
      allowed_tools: ["Read", "Write"],
    });

    expect(skill.name).toBe("custom-skill");
    expect(skill.description).toBe("Custom description");
    expect(skill.allowed_tools).toEqual(["Read", "Write"]);
  });

  it("should have sample skills", () => {
    expect(SAMPLE_SKILLS.minimal.name).toBe("minimal-skill");
    expect(SAMPLE_SKILLS.withTools.allowed_tools).toEqual(["Read", "Write", "Bash"]);
  });
});

describe("Type exports", () => {
  it("should export CliDependency type", () => {
    const dep: CliDependency = {
      check: "which git",
    };
    expect(dep).toBeDefined();
  });

  it("should export McpConfig type", () => {
    const config: McpConfig = {
      command: "npx",
    };
    expect(config).toBeDefined();
  });

  it("should export PluginReference type", () => {
    const ref: PluginReference = {
      marketplace: "test",
      name: "plugin",
    };
    expect(ref).toBeDefined();
  });

  it("should export InjectConfig type", () => {
    const config: InjectConfig = {
      file: "test.md",
      content: "content",
    };
    expect(config).toBeDefined();
  });

  it("should export ClaudeCodeConfig type", () => {
    const config: ClaudeCodeConfig = {};
    expect(config).toBeDefined();
  });

  it("should export SkillManifest type", () => {
    const manifest: SkillManifest = {
      name: "test",
      description: "test",
    };
    expect(manifest).toBeDefined();
  });

  it("should export AgentType type", () => {
    const agent: AgentType = "claude_code";
    expect(agent).toBeDefined();
  });

  it("should export InstallScope type", () => {
    const scope: InstallScope = "project";
    expect(scope).toBeDefined();
  });

  it("should export ProjectState type", () => {
    const state: ProjectState = {
      agent: "claude_code",
      enabled: [],
      disabled_at: {},
      initialized_at: "2025-01-01T00:00:00.000Z",
    };
    expect(state).toBeDefined();
  });

  it("should export SkillsState type", () => {
    const state: SkillsState = {
      version: 1,
      projects: {},
    };
    expect(state).toBeDefined();
  });

  it("should export SkillsConfig type", () => {
    const config: SkillsConfig = {
      defaults: {
        agent: "auto",
      },
    };
    expect(config).toBeDefined();
  });
});
