/**
 * Agent Model Schema Tests
 *
 * Tests for agent domain types and schemas including:
 * - AgentPlatformSchema
 * - AgentDefinitionSchema
 * - ClaudeCodeAgentSchema
 * - OpenCodeAgentSchema
 * - AgentStateSchema
 * - Constants and platform detection
 */

import { describe, it, expect } from "bun:test";
import { Schema } from "@effect/schema";
import {
  AgentPlatformSchema,
  PermissionModeSchema,
  AgentModeSchema,
  OpenCodePermissionValueSchema,
  AgentDefinitionSchema,
  ClaudeCodeAgentSchema,
  OpenCodeAgentSchema,
  CachedAgentSchema,
  AgentProjectStateSchema,
  AgentStateSchema,
  AgentTypeEnumSchema,
  GLOBAL_AGENT_LOCATIONS,
  PROJECT_AGENT_LOCATIONS,
  PLATFORM_DETECTION_PATTERNS,
  CLI_WRAPPER_DEFAULT_TOOLS,
  SPECIALIZED_TOOL_PRESETS,
  type AgentPlatform,
  type PermissionMode,
  type AgentMode,
  type OpenCodePermissionValue,
  type AgentDefinition,
  type ClaudeCodeAgent,
  type OpenCodeAgent,
  type CachedAgent,
  type AgentProjectState,
  type AgentState,
  type AgentTypeEnum,
} from "../../src/models/agent";

describe("AgentPlatformSchema", () => {
  it("should validate all platform types", () => {
    const decode = Schema.decodeUnknownSync(AgentPlatformSchema);

    expect(decode("claude_code")).toBe("claude_code");
    expect(decode("opencode")).toBe("opencode");
    expect(decode("cursor")).toBe("cursor");
    expect(decode("generic")).toBe("generic");
  });

  it("should fail on invalid platform", () => {
    const decode = Schema.decodeUnknownSync(AgentPlatformSchema);
    expect(() => decode("vscode")).toThrow();
  });
});

describe("PermissionModeSchema", () => {
  it("should validate all permission modes", () => {
    const decode = Schema.decodeUnknownSync(PermissionModeSchema);

    expect(decode("default")).toBe("default");
    expect(decode("ask")).toBe("ask");
    expect(decode("allow")).toBe("allow");
  });

  it("should fail on invalid mode", () => {
    const decode = Schema.decodeUnknownSync(PermissionModeSchema);
    expect(() => decode("deny")).toThrow();
  });
});

describe("AgentModeSchema", () => {
  it("should validate all agent modes", () => {
    const decode = Schema.decodeUnknownSync(AgentModeSchema);

    expect(decode("primary")).toBe("primary");
    expect(decode("subagent")).toBe("subagent");
    expect(decode("all")).toBe("all");
  });

  it("should fail on invalid mode", () => {
    const decode = Schema.decodeUnknownSync(AgentModeSchema);
    expect(() => decode("background")).toThrow();
  });
});

describe("OpenCodePermissionValueSchema", () => {
  it("should validate boolean values", () => {
    const decode = Schema.decodeUnknownSync(OpenCodePermissionValueSchema);

    expect(decode(true)).toBe(true);
    expect(decode(false)).toBe(false);
  });

  it("should validate 'ask' literal", () => {
    const decode = Schema.decodeUnknownSync(OpenCodePermissionValueSchema);
    expect(decode("ask")).toBe("ask");
  });

  it("should validate array of paths", () => {
    const decode = Schema.decodeUnknownSync(OpenCodePermissionValueSchema);
    const result = decode(["/home/user", "/tmp"]);

    expect(result).toEqual(["/home/user", "/tmp"]);
  });

  it("should fail on invalid string", () => {
    const decode = Schema.decodeUnknownSync(OpenCodePermissionValueSchema);
    expect(() => decode("invalid")).toThrow();
  });
});

describe("AgentDefinitionSchema", () => {
  it("should validate minimal agent definition", () => {
    const agent = {
      name: "my-agent",
      description: "An agent for testing",
      content: "# My Agent\nThis is the system prompt.",
    };

    const decode = Schema.decodeUnknownSync(AgentDefinitionSchema);
    const result = decode(agent);

    expect(result.name).toBe("my-agent");
    expect(result.description).toBe("An agent for testing");
    expect(result.content).toContain("system prompt");
    expect(result.tools).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(result.wraps_cli).toBeUndefined();
    expect(result.tags).toBeUndefined();
  });

  it("should validate full agent definition", () => {
    const agent = {
      name: "dev-agent",
      description: "Development agent",
      tools: ["Read", "Write", "Bash", "Glob", "Grep"],
      model: "sonnet",
      content: "Development instructions",
      wraps_cli: "git",
      tags: ["development", "git"],
    };

    const decode = Schema.decodeUnknownSync(AgentDefinitionSchema);
    const result = decode(agent);

    expect(result.tools).toEqual(["Read", "Write", "Bash", "Glob", "Grep"]);
    expect(result.model).toBe("sonnet");
    expect(result.wraps_cli).toBe("git");
    expect(result.tags).toEqual(["development", "git"]);
  });

  it("should fail on empty name", () => {
    const decode = Schema.decodeUnknownSync(AgentDefinitionSchema);

    expect(() =>
      decode({ name: "", description: "test", content: "test" })
    ).toThrow();
  });

  it("should fail on empty description", () => {
    const decode = Schema.decodeUnknownSync(AgentDefinitionSchema);

    expect(() =>
      decode({ name: "test", description: "", content: "test" })
    ).toThrow();
  });
});

describe("ClaudeCodeAgentSchema", () => {
  it("should validate minimal Claude Code agent", () => {
    const agent = {
      name: "claude-agent",
      description: "Claude Code specific agent",
      content: "# Agent Instructions\nDo things.",
    };

    const decode = Schema.decodeUnknownSync(ClaudeCodeAgentSchema);
    const result = decode(agent);

    expect(result.name).toBe("claude-agent");
    expect(result.tools).toBeUndefined();
    expect(result.color).toBeUndefined();
    expect(result.permissionMode).toBeUndefined();
  });

  it("should validate full Claude Code agent", () => {
    const agent = {
      name: "full-agent",
      description: "Fully configured agent",
      tools: ["Read", "Write", "Edit"],
      model: "opus",
      color: "#FF5500",
      permissionMode: "ask" as const,
      content: "Full agent content",
    };

    const decode = Schema.decodeUnknownSync(ClaudeCodeAgentSchema);
    const result = decode(agent);

    expect(result.tools).toEqual(["Read", "Write", "Edit"]);
    expect(result.model).toBe("opus");
    expect(result.color).toBe("#FF5500");
    expect(result.permissionMode).toBe("ask");
  });

  it("should validate all permission modes", () => {
    const decode = Schema.decodeUnknownSync(ClaudeCodeAgentSchema);

    const base = {
      name: "test",
      description: "test",
      content: "test",
    };

    expect(decode({ ...base, permissionMode: "default" }).permissionMode).toBe("default");
    expect(decode({ ...base, permissionMode: "ask" }).permissionMode).toBe("ask");
    expect(decode({ ...base, permissionMode: "allow" }).permissionMode).toBe("allow");
  });
});

describe("OpenCodeAgentSchema", () => {
  it("should validate minimal OpenCode agent", () => {
    const agent = {
      description: "OpenCode agent",
      content: "# Agent\nOpenCode instructions.",
    };

    const decode = Schema.decodeUnknownSync(OpenCodeAgentSchema);
    const result = decode(agent);

    expect(result.description).toBe("OpenCode agent");
    expect(result.mode).toBeUndefined();
    expect(result.temperature).toBeUndefined();
    expect(result.permissions).toBeUndefined();
    expect(result.maxSteps).toBeUndefined();
  });

  it("should validate full OpenCode agent", () => {
    const agent = {
      description: "Full OpenCode agent",
      model: "gpt-4",
      mode: "all" as const,
      temperature: 0.7,
      tools: ["file", "shell"],
      permissions: {
        fileRead: true,
        fileWrite: "ask",
        shell: ["/home/user"],
      },
      maxSteps: 50,
      content: "Agent content",
    };

    const decode = Schema.decodeUnknownSync(OpenCodeAgentSchema);
    const result = decode(agent);

    expect(result.model).toBe("gpt-4");
    expect(result.mode).toBe("all");
    expect(result.temperature).toBe(0.7);
    expect(result.tools).toEqual(["file", "shell"]);
    expect(result.permissions?.fileRead).toBe(true);
    expect(result.permissions?.fileWrite).toBe("ask");
    expect(result.permissions?.shell).toEqual(["/home/user"]);
    expect(result.maxSteps).toBe(50);
  });

  it("should fail on non-integer maxSteps", () => {
    const decode = Schema.decodeUnknownSync(OpenCodeAgentSchema);

    expect(() =>
      decode({
        description: "test",
        content: "test",
        maxSteps: 10.5,
      })
    ).toThrow();
  });
});

describe("CachedAgentSchema", () => {
  it("should validate cached agent", () => {
    const cached = {
      name: "cached-agent",
      source: "github:user/agent-repo",
      cachedAt: "2025-01-01T00:00:00.000Z",
      definition: {
        name: "cached-agent",
        description: "An agent from GitHub",
        content: "Agent instructions",
      },
    };

    const decode = Schema.decodeUnknownSync(CachedAgentSchema);
    const result = decode(cached);

    expect(result.name).toBe("cached-agent");
    expect(result.source).toBe("github:user/agent-repo");
    expect(result.cachedAt).toBe("2025-01-01T00:00:00.000Z");
    expect(result.definition.description).toBe("An agent from GitHub");
  });

  it("should fail on empty name", () => {
    const decode = Schema.decodeUnknownSync(CachedAgentSchema);

    expect(() =>
      decode({
        name: "",
        source: "local",
        cachedAt: "2025-01-01T00:00:00.000Z",
        definition: {
          name: "test",
          description: "test",
          content: "test",
        },
      })
    ).toThrow();
  });
});

describe("AgentProjectStateSchema", () => {
  it("should validate minimal project state", () => {
    const state = {
      platforms: ["claude_code"],
      enabled: ["agent1", "agent2"],
      initializedAt: "2025-01-01T00:00:00.000Z",
    };

    const decode = Schema.decodeUnknownSync(AgentProjectStateSchema);
    const result = decode(state);

    expect(result.platforms).toEqual(["claude_code"]);
    expect(result.enabled).toEqual(["agent1", "agent2"]);
    expect(result.lastSync).toBeUndefined();
  });

  it("should validate with multiple platforms", () => {
    const state = {
      platforms: ["claude_code", "opencode", "cursor"],
      enabled: [],
      initializedAt: "2025-01-01T00:00:00.000Z",
      lastSync: "2025-01-02T00:00:00.000Z",
    };

    const decode = Schema.decodeUnknownSync(AgentProjectStateSchema);
    const result = decode(state);

    expect(result.platforms).toHaveLength(3);
    expect(result.lastSync).toBe("2025-01-02T00:00:00.000Z");
  });
});

describe("AgentStateSchema", () => {
  it("should validate empty agent state", () => {
    const state = {
      version: 1,
      projects: {},
    };

    const decode = Schema.decodeUnknownSync(AgentStateSchema);
    const result = decode(state);

    expect(result.version).toBe(1);
    expect(result.projects).toEqual({});
  });

  it("should validate state with projects", () => {
    const state = {
      version: 2,
      projects: {
        "/path/to/project": {
          platforms: ["claude_code"],
          enabled: ["agent1"],
          initializedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    };

    const decode = Schema.decodeUnknownSync(AgentStateSchema);
    const result = decode(state);

    expect(result.version).toBe(2);
    expect(Object.keys(result.projects)).toHaveLength(1);
    expect(result.projects["/path/to/project"].enabled).toEqual(["agent1"]);
  });

  it("should fail on non-integer version", () => {
    const decode = Schema.decodeUnknownSync(AgentStateSchema);

    expect(() =>
      decode({ version: 1.5, projects: {} })
    ).toThrow();
  });
});

describe("AgentTypeEnumSchema", () => {
  it("should validate all agent type enums", () => {
    const decode = Schema.decodeUnknownSync(AgentTypeEnumSchema);

    expect(decode("cli_wrapper")).toBe("cli_wrapper");
    expect(decode("specialized")).toBe("specialized");
    expect(decode("cross_platform")).toBe("cross_platform");
  });

  it("should fail on invalid type", () => {
    const decode = Schema.decodeUnknownSync(AgentTypeEnumSchema);
    expect(() => decode("assistant")).toThrow();
  });
});

describe("Constants", () => {
  describe("GLOBAL_AGENT_LOCATIONS", () => {
    it("should have correct Claude Code location", () => {
      expect(GLOBAL_AGENT_LOCATIONS.claude_code).toBe("~/.claude/agents");
    });

    it("should have correct OpenCode location", () => {
      expect(GLOBAL_AGENT_LOCATIONS.opencode).toBe("~/.config/opencode/agent");
    });

    it("should have correct Cursor location", () => {
      expect(GLOBAL_AGENT_LOCATIONS.cursor).toBe("~/.cursor/agents");
    });

    it("should have correct generic location", () => {
      expect(GLOBAL_AGENT_LOCATIONS.generic).toBe("~/.grimoire/agents");
    });
  });

  describe("PROJECT_AGENT_LOCATIONS", () => {
    it("should have correct project-level locations", () => {
      expect(PROJECT_AGENT_LOCATIONS.claude_code).toBe(".claude/agents");
      expect(PROJECT_AGENT_LOCATIONS.opencode).toBe(".opencode/agent");
      expect(PROJECT_AGENT_LOCATIONS.cursor).toBe(".cursor/agents");
      expect(PROJECT_AGENT_LOCATIONS.generic).toBe(".grimoire/agents");
    });
  });

  describe("PLATFORM_DETECTION_PATTERNS", () => {
    it("should have Claude Code detection patterns", () => {
      expect(PLATFORM_DETECTION_PATTERNS.claude_code).toContain("CLAUDE.md");
      expect(PLATFORM_DETECTION_PATTERNS.claude_code).toContain(".claude/");
      expect(PLATFORM_DETECTION_PATTERNS.claude_code).toContain(".clauderc");
    });

    it("should have OpenCode detection patterns", () => {
      expect(PLATFORM_DETECTION_PATTERNS.opencode).toContain("AGENTS.md");
      expect(PLATFORM_DETECTION_PATTERNS.opencode).toContain(".opencode/");
    });

    it("should have Cursor detection patterns", () => {
      expect(PLATFORM_DETECTION_PATTERNS.cursor).toContain(".cursor/");
    });

    it("should have empty generic patterns", () => {
      expect(PLATFORM_DETECTION_PATTERNS.generic).toEqual([]);
    });
  });

  describe("CLI_WRAPPER_DEFAULT_TOOLS", () => {
    it("should include Bash", () => {
      expect(CLI_WRAPPER_DEFAULT_TOOLS).toContain("Bash");
    });
  });

  describe("SPECIALIZED_TOOL_PRESETS", () => {
    it("should have readonly preset", () => {
      expect(SPECIALIZED_TOOL_PRESETS.readonly).toEqual(["Read", "Glob", "Grep"]);
    });

    it("should have analysis preset", () => {
      expect(SPECIALIZED_TOOL_PRESETS.analysis).toEqual(["Read", "Glob", "Grep", "Bash"]);
    });

    it("should have development preset", () => {
      expect(SPECIALIZED_TOOL_PRESETS.development).toContain("Read");
      expect(SPECIALIZED_TOOL_PRESETS.development).toContain("Write");
      expect(SPECIALIZED_TOOL_PRESETS.development).toContain("Edit");
      expect(SPECIALIZED_TOOL_PRESETS.development).toContain("Bash");
    });

    it("should have full preset (empty = all allowed)", () => {
      expect(SPECIALIZED_TOOL_PRESETS.full).toEqual([]);
    });
  });
});

describe("Type exports", () => {
  it("should export AgentPlatform type", () => {
    const platform: AgentPlatform = "claude_code";
    expect(platform).toBeDefined();
  });

  it("should export PermissionMode type", () => {
    const mode: PermissionMode = "ask";
    expect(mode).toBeDefined();
  });

  it("should export AgentMode type", () => {
    const mode: AgentMode = "subagent";
    expect(mode).toBeDefined();
  });

  it("should export OpenCodePermissionValue type", () => {
    const boolVal: OpenCodePermissionValue = true;
    const askVal: OpenCodePermissionValue = "ask";
    const arrayVal: OpenCodePermissionValue = ["/path"];

    expect(boolVal).toBeDefined();
    expect(askVal).toBeDefined();
    expect(arrayVal).toBeDefined();
  });

  it("should export AgentDefinition type", () => {
    const definition: AgentDefinition = {
      name: "test",
      description: "test",
      content: "test",
    };
    expect(definition).toBeDefined();
  });

  it("should export ClaudeCodeAgent type", () => {
    const agent: ClaudeCodeAgent = {
      name: "test",
      description: "test",
      content: "test",
    };
    expect(agent).toBeDefined();
  });

  it("should export OpenCodeAgent type", () => {
    const agent: OpenCodeAgent = {
      description: "test",
      content: "test",
    };
    expect(agent).toBeDefined();
  });

  it("should export CachedAgent type", () => {
    const cached: CachedAgent = {
      name: "test",
      source: "local",
      cachedAt: "2025-01-01T00:00:00.000Z",
      definition: {
        name: "test",
        description: "test",
        content: "test",
      },
    };
    expect(cached).toBeDefined();
  });

  it("should export AgentProjectState type", () => {
    const state: AgentProjectState = {
      platforms: ["claude_code"],
      enabled: [],
      initializedAt: "2025-01-01T00:00:00.000Z",
    };
    expect(state).toBeDefined();
  });

  it("should export AgentState type", () => {
    const state: AgentState = {
      version: 1,
      projects: {},
    };
    expect(state).toBeDefined();
  });

  it("should export AgentTypeEnum type", () => {
    const type: AgentTypeEnum = "cli_wrapper";
    expect(type).toBeDefined();
  });
});
