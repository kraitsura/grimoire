# Grimoire CLI: Plugin Management Feature Proposal
## Cross-Agent Plugin System for Claude Code & OpenCode

---

## Executive Summary

This document proposes a comprehensive plugin management feature for Grimoire that bridges Claude Code's marketplace-based plugin system with OpenCode's JavaScript/TypeScript plugin architecture. The goal is to provide unified plugin discovery, installation, and management while respecting each tool's native conventions.

---

## Part 1: Current Plugin Landscape

### Claude Code Plugin System

Claude Code plugins are extensions that enhance Claude Code with custom slash commands, specialized agents, hooks, and MCP servers. Plugins can be shared across projects and teams, providing consistent tooling and workflows.

#### Plugin Structure
```
plugin-name/
├── .claude-plugin/
│   └── plugin.json          # Required: Plugin manifest
├── commands/                 # Custom slash commands (.md files)
├── agents/                   # Subagent definitions (.md files)
├── skills/                   # Agent Skills (SKILL.md files)
├── hooks/
│   └── hooks.json           # Event handlers
└── .mcp.json                # MCP server configuration
```

#### Plugin Manifest (plugin.json)
```json
{
  "name": "plugin-name",
  "version": "1.2.0",
  "description": "Brief plugin description",
  "author": {
    "name": "Author Name",
    "email": "author@example.com",
    "url": "https://github.com/author"
  },
  "homepage": "https://docs.example.com/plugin",
  "repository": "https://github.com/author/plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"],
  "commands": ["./custom/commands/special.md"],
  "agents": "./custom/agents/",
  "hooks": "./config/hooks.json",
  "mcpServers": "./mcp-config.json"
}
```

#### Native CLI Commands
```bash
# Marketplace management
/plugin marketplace add <source>
/plugin marketplace remove <name>

# Plugin installation
/plugin install <plugin>@<marketplace>
/plugin uninstall <plugin>@<marketplace>
/plugin enable <plugin>@<marketplace>
/plugin disable <plugin>@<marketplace>
/plugin update <plugin>@<marketplace>

# Scopes
--scope user      # Default, user-level
--scope project   # Shared with team
--scope local     # Gitignored
```

#### Marketplace Structure
```json
{
  "name": "marketplace-name",
  "owner": {
    "name": "Organization Name",
    "email": "contact@example.com"
  },
  "plugins": [
    {
      "name": "plugin-name",
      "source": "./plugins/plugin-name",
      "description": "What the plugin does",
      "version": "1.0.0",
      "category": "utilities",
      "tags": ["tag1", "tag2"]
    }
  ]
}
```

---

### OpenCode Plugin System

Plugins allow you to extend OpenCode by hooking into various events and customizing behavior. You can create plugins to add new features, integrate with external services, or modify OpenCode's default behavior.

#### Plugin Structure
```
.opencode/plugin/
└── my-plugin.js    # or .ts
```

Or globally:
```
~/.config/opencode/plugin/
└── my-plugin.js
```

#### Plugin Format (JavaScript/TypeScript)
```javascript
export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // Event hooks
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        // Handle event
      }
    },
    
    // Tool execution hooks
    "tool.execute.before": async (input, output) => {
      // Pre-execution logic
    },
    
    "tool.execute.after": async (input, output) => {
      // Post-execution logic
    },
    
    // Custom tools
    tool: {
      mytool: tool({
        description: "Custom tool description",
        args: {
          param: tool.schema.string(),
        },
        async execute(args, ctx) {
          return `Result: ${args.param}`;
        },
      }),
    },
  };
};
```

#### Available Events
| Category | Events |
|----------|--------|
| Session | `session.created`, `session.idle`, `session.deleted`, `session.error`, `session.status` |
| Message | `message.updated`, `message.removed`, `message.part.updated` |
| Tool | `tool.execute.before`, `tool.execute.after` |
| File | `file.edited`, `file.watcher.updated` |
| Permission | `permission.updated`, `permission.replied` |
| TUI | `tui.prompt.append`, `tui.command.execute`, `tui.toast.show` |
| LSP | `lsp.client.diagnostics`, `lsp.updated` |

---

### Key Differences Summary

| Aspect | Claude Code | OpenCode |
|--------|-------------|----------|
| **Format** | Declarative (JSON + Markdown) | Programmatic (JS/TS) |
| **Location** | `.claude-plugin/` + directories | `.opencode/plugin/` |
| **Distribution** | Marketplaces (Git repos) | Direct file copy |
| **Components** | Commands, Agents, Skills, Hooks, MCP | Event hooks, Custom tools |
| **Discovery** | `/plugin` interactive menu | Manual file placement |
| **Installation** | `/plugin install` | File drop + restart |
| **Scopes** | User, Project, Local | Project, Global |

---

## Part 2: Proposed Grimoire Plugin Feature

### Design Philosophy

1. **Delegation over Duplication**: Use native plugin commands where possible
2. **Format Translation**: Convert between systems when installing cross-platform
3. **Unified Discovery**: Single search across Claude Code marketplaces and OpenCode community
4. **Graceful Degradation**: Install what's compatible, skip what isn't

---

### Command Structure

```
grimoire plugins
├── search <query>        # Search across all sources
├── install <source>      # Install plugin (delegating to native tools)
├── uninstall <name>      # Remove plugin
├── list                  # List installed plugins
├── info <name>           # Show plugin details
├── sync                  # Sync plugins across agents
├── create                # Scaffold new plugin
├── validate              # Validate plugin structure
└── marketplace
    ├── add <source>      # Add marketplace
    ├── remove <name>     # Remove marketplace
    └── list              # List marketplaces
```

---

### Workflow 1: Plugin Discovery

```bash
grimoire plugins search "code review"

Searching across all sources...

Claude Code Marketplaces:
┌─────────────────────┬──────────────────────────────────┬───────────────┐
│ Plugin              │ Description                      │ Marketplace   │
├─────────────────────┼──────────────────────────────────┼───────────────┤
│ code-reviewer       │ Automated PR code review         │ anthropics    │
│ review-assistant    │ Multi-agent review workflow      │ community     │
└─────────────────────┴──────────────────────────────────┴───────────────┘

OpenCode Community:
┌─────────────────────┬──────────────────────────────────┬───────────────┐
│ Plugin              │ Description                      │ Source        │
├─────────────────────┼──────────────────────────────────┼───────────────┤
│ review-hooks        │ Code review event hooks          │ awesome-oc    │
└─────────────────────┴──────────────────────────────────┴───────────────┘

Install with:
  grimoire plugins install code-reviewer@anthropics --target claude
  grimoire plugins install review-hooks --target opencode
```

---

### Workflow 2: Plugin Installation

#### For Claude Code (Delegation)
```bash
grimoire plugins install code-reviewer@anthropics --target claude

Installing plugin for Claude Code...

# Grimoire executes native commands:
# 1. claude plugin marketplace add anthropics (if not present)
# 2. claude plugin install code-reviewer@anthropics

✓ Plugin 'code-reviewer' installed via Claude Code

Components installed:
  • Commands: /review, /review-pr
  • Agents: code-reviewer-agent
  • Hooks: PostToolUse (format on write)

Verify with: claude /help
```

#### For OpenCode (File Installation)
```bash
grimoire plugins install github:awesome-opencode/review-hooks --target opencode

Installing plugin for OpenCode...

# Grimoire:
# 1. Downloads plugin from GitHub
# 2. Copies to .opencode/plugin/review-hooks.js
# 3. Validates plugin exports

✓ Plugin 'review-hooks' installed

Components:
  • Events: tool.execute.after, session.idle
  • Custom Tools: review-file, review-diff

Restart OpenCode to activate.
```

#### Cross-Platform Installation
```bash
grimoire plugins install code-reviewer --target all

Installing plugin across agents...

Claude Code:
  ✓ Installed via marketplace (native)
  
OpenCode:
  ⚠ No direct equivalent found
  → Generated compatibility shim: .opencode/plugin/code-reviewer-compat.js
  → Mapped commands to custom tools
  → Hooks not translatable (skipped)

Summary:
  Claude Code: Full installation
  OpenCode: Partial (commands only)
```

---

### Workflow 3: Plugin Management

```bash
grimoire plugins list

Installed Plugins:
┌─────────────────────┬─────────┬─────────────┬────────────────────────────┐
│ Plugin              │ Version │ Agent       │ Components                 │
├─────────────────────┼─────────┼─────────────┼────────────────────────────┤
│ code-reviewer       │ 2.1.0   │ Claude Code │ 2 commands, 1 agent        │
│ review-hooks        │ 1.0.0   │ OpenCode    │ 2 event hooks, 1 tool      │
│ formatter           │ 1.5.0   │ Both        │ Claude: hook, OC: event    │
└─────────────────────┴─────────┴─────────────┴────────────────────────────┘

grimoire plugins info code-reviewer

Plugin: code-reviewer
Version: 2.1.0
Source: anthropics/claude-code-plugins
Agent: Claude Code
Scope: user

Components:
  Commands:
    • /review - Review current file for issues
    • /review-pr - Review entire PR diff
  
  Agents:
    • code-reviewer-agent - Specialized for code analysis
  
  Hooks:
    • PostToolUse (Write|Edit) - Auto-format on save

Installed: 2024-01-15
Last Updated: 2024-01-20

Native commands:
  claude /plugin info code-reviewer@anthropics
```

---

### Workflow 4: Plugin Synchronization

```bash
grimoire plugins sync

Synchronizing plugins across agents...

Checking Claude Code plugins...
  ✓ code-reviewer: up to date
  ↑ formatter: update available (1.5.0 → 1.6.0)
  
Checking OpenCode plugins...
  ✓ review-hooks: up to date
  ⚠ notification-plugin: source unavailable

Actions:
  1. Update formatter? (Y/n) y
  
Updating formatter...
  Claude Code: claude plugin update formatter@anthropics
  OpenCode: Downloading latest, replacing .opencode/plugin/formatter.js

✓ Sync complete
```

---

### Workflow 5: Plugin Creation

```bash
grimoire plugins create my-plugin --target both

Creating cross-platform plugin: my-plugin

? Plugin type:
  ❯ Commands only (simplest)
    Commands + Hooks
    Full (commands, agents, hooks, MCP)

? Primary use case:
  ❯ Code quality
    Workflow automation
    External integration
    Custom

Generating plugin structure...

my-plugin/
├── claude/                          # Claude Code version
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── commands/
│   │   └── my-command.md
│   └── hooks/
│       └── hooks.json
├── opencode/                        # OpenCode version
│   └── my-plugin.ts
├── shared/                          # Shared logic
│   └── core.ts
├── package.json
└── README.md

Generated files:
  ✓ claude/.claude-plugin/plugin.json
  ✓ claude/commands/my-command.md
  ✓ opencode/my-plugin.ts
  ✓ README.md

Next steps:
  1. Edit command logic in claude/commands/
  2. Edit event hooks in opencode/my-plugin.ts
  3. Test: grimoire plugins validate ./my-plugin
  4. Install locally: grimoire plugins install ./my-plugin
```

---

## Part 3: Format Translation Layer

### Claude Code → OpenCode Translation

When a Claude Code plugin needs to work in OpenCode, Grimoire generates a compatibility shim:

**Source (Claude Code command):**
```markdown
---
description: Review code for bugs and improvements
argument-hint: [file]
---

# Review Command

Analyze the specified file for:
- Potential bugs and edge cases
- Performance issues
- Security vulnerabilities
- Code style improvements

Be specific. Cite line numbers. Suggest fixes with code examples.
```

**Generated (OpenCode plugin):**
```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const ReviewCompat: Plugin = async (ctx) => {
  return {
    tool: {
      review: {
        description: "Review code for bugs and improvements",
        args: {
          file: { type: "string", description: "File to review" },
        },
        async execute(args) {
          // Inject the original Claude Code prompt as context
          const prompt = `
            Analyze ${args.file} for:
            - Potential bugs and edge cases
            - Performance issues
            - Security vulnerabilities
            - Code style improvements
            
            Be specific. Cite line numbers. Suggest fixes with code examples.
          `;
          
          // Use OpenCode's client to send to AI
          const result = await ctx.client.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
          });
          
          return result.choices[0].message.content;
        },
      },
    },
  };
};
```

### OpenCode → Claude Code Translation

When an OpenCode plugin needs to work in Claude Code:

**Source (OpenCode plugin):**
```typescript
export const NotifyPlugin: Plugin = async ({ $ }) => {
  return {
    "session.idle": async () => {
      await $`osascript -e 'display notification "Done!" with title "OpenCode"'`;
    },
  };
};
```

**Generated (Claude Code hook):**
```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Done!\" with title \"Claude Code\"'"
          }
        ]
      }
    ]
  }
}
```

### Translation Compatibility Matrix

| Feature | Claude Code | OpenCode | Translatable |
|---------|-------------|----------|--------------|
| Slash commands | ✓ | → Custom tools | ✓ Partial |
| Agents | ✓ | → N/A | ✗ No |
| Skills | ✓ | → N/A | ✗ No |
| Post-tool hooks | ✓ | ✓ | ✓ Yes |
| Pre-tool hooks | ✓ | ✓ | ✓ Yes |
| Session events | Stop, Start | Many more | ✓ Partial |
| MCP servers | ✓ | ✓ | ✓ Yes |
| Custom tools | Via MCP | ✓ Native | ✓ Yes |
| File watchers | ✗ | ✓ | ✗ No |
| TUI events | ✗ | ✓ | ✗ No |

---

## Part 4: Technical Implementation

### State Schema

```json
{
  "version": "1.0.0",
  "plugins": {
    "claude-code": {
      "code-reviewer": {
        "version": "2.1.0",
        "marketplace": "anthropics",
        "scope": "user",
        "installed": "2024-01-15T10:00:00Z",
        "components": {
          "commands": ["/review", "/review-pr"],
          "agents": ["code-reviewer-agent"],
          "hooks": ["PostToolUse"]
        }
      }
    },
    "opencode": {
      "review-hooks": {
        "version": "1.0.0",
        "source": "github:awesome-opencode/review-hooks",
        "location": ".opencode/plugin/review-hooks.js",
        "installed": "2024-01-15T10:30:00Z",
        "components": {
          "events": ["tool.execute.after", "session.idle"],
          "tools": ["review-file"]
        }
      }
    },
    "cross-platform": {
      "formatter": {
        "claude-code": {
          "version": "1.5.0",
          "marketplace": "community"
        },
        "opencode": {
          "version": "1.5.0",
          "generated": true,
          "source-type": "translation"
        }
      }
    }
  },
  "marketplaces": {
    "claude-code": [
      "anthropics/claude-code-plugins",
      "community/plugins"
    ]
  }
}
```

### Configuration

```json
{
  "$schema": "https://grimoire.dev/schema/plugins/v1",
  "plugins": {
    "claude-code": {
      "delegate": true,
      "auto-sync": true
    },
    "opencode": {
      "location": ".opencode/plugin",
      "global-location": "~/.config/opencode/plugin"
    },
    "translation": {
      "enabled": true,
      "generate-shims": true,
      "preserve-comments": true
    }
  },
  "registries": [
    {
      "name": "awesome-opencode",
      "type": "github-awesome-list",
      "url": "https://github.com/awesome-opencode/awesome-opencode"
    }
  ]
}
```

### Native Command Delegation

Grimoire delegates to native tools when appropriate:

```typescript
// Pseudocode for Claude Code delegation
async function installClaudePlugin(plugin: string, marketplace: string) {
  // Check if marketplace is added
  const marketplaces = await exec('claude plugin marketplace list --json');
  
  if (!marketplaces.includes(marketplace)) {
    await exec(`claude plugin marketplace add ${marketplace}`);
  }
  
  // Install via native command
  const result = await exec(
    `claude plugin install ${plugin}@${marketplace} --scope user`
  );
  
  // Parse result and update Grimoire state
  return parseInstallResult(result);
}

// For OpenCode, direct file management
async function installOpenCodePlugin(source: string) {
  // Download/copy plugin file
  const pluginContent = await fetchPlugin(source);
  
  // Validate exports
  const validation = await validateOpenCodePlugin(pluginContent);
  
  if (validation.valid) {
    // Write to plugin directory
    await writeFile('.opencode/plugin/plugin.js', pluginContent);
    return { success: true, components: validation.components };
  }
  
  return { success: false, errors: validation.errors };
}
```

---

## Part 5: Plugin Scaffolding Templates

### Claude Code Plugin Template

```bash
grimoire plugins create my-plugin --target claude --template full
```

**Generated Structure:**
```
my-plugin/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   └── example.md
├── agents/
│   └── example-agent.md
├── skills/
│   └── example-skill/
│       └── SKILL.md
├── hooks/
│   ├── hooks.json
│   └── scripts/
│       └── post-edit.sh
├── .mcp.json
└── README.md
```

**plugin.json:**
```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "TODO: Add description",
  "author": {
    "name": "Your Name",
    "email": "you@example.com"
  },
  "keywords": [],
  "license": "MIT"
}
```

**commands/example.md:**
```markdown
---
description: Example command - customize this
argument-hint: [args]
---

# Example Command

This is a template command. Replace with your implementation.

## Instructions

1. Describe what the command should do
2. Provide context and constraints
3. Specify expected output format
```

### OpenCode Plugin Template

```bash
grimoire plugins create my-plugin --target opencode --template hooks
```

**Generated Structure:**
```
my-plugin/
├── plugin.ts
├── package.json
├── tsconfig.json
└── README.md
```

**plugin.ts:**
```typescript
import type { Plugin } from "@opencode-ai/plugin";

/**
 * My Plugin for OpenCode
 * 
 * This plugin demonstrates the basic structure.
 * Customize the hooks and tools for your use case.
 */
export const MyPlugin: Plugin = async ({ project, client, $, directory }) => {
  console.log(`Plugin initialized for project: ${project.name}`);

  return {
    // Called when any event occurs
    event: async ({ event }) => {
      switch (event.type) {
        case "session.idle":
          // Session completed - add notification, cleanup, etc.
          break;
        case "session.error":
          // Handle errors
          break;
      }
    },

    // Called before a tool executes
    "tool.execute.before": async (input, output) => {
      // Validate, log, or modify before execution
      console.log(`Tool: ${input.tool}, Args:`, output.args);
    },

    // Called after a tool executes
    "tool.execute.after": async (input, output) => {
      // Post-processing, logging, etc.
    },

    // Custom tools available to OpenCode
    tool: {
      // Add custom tools here
      // "my-tool": tool({ ... })
    },
  };
};
```

### Cross-Platform Template

```bash
grimoire plugins create my-plugin --target both
```

**Generated Structure:**
```
my-plugin/
├── claude/
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── commands/
│       └── main.md
├── opencode/
│   └── plugin.ts
├── shared/
│   └── logic.ts         # Shared business logic
├── scripts/
│   └── sync.sh          # Keep versions in sync
├── package.json
└── README.md
```

---

## Part 6: Validation & Testing

### Plugin Validation

```bash
grimoire plugins validate ./my-plugin

Validating plugin: my-plugin

Structure (Claude Code):
  ✓ .claude-plugin/plugin.json exists
  ✓ plugin.json schema valid
  ✓ commands/ directory present
  ⚠ No agents/ directory (optional)
  ⚠ No hooks/ configuration (optional)

Structure (OpenCode):
  ✓ plugin.ts exists
  ✓ TypeScript compiles successfully
  ✓ Exports Plugin type
  ✓ Returns valid hooks object

Manifest Validation:
  ✓ name: my-plugin (valid kebab-case)
  ✓ version: 0.1.0 (valid semver)
  ⚠ description: missing (recommended)
  ✓ author.name present

Command Validation:
  commands/main.md:
    ✓ Frontmatter present
    ✓ description field present
    ⚠ argument-hint missing (optional)
    ✓ Body content present

OpenCode Validation:
  plugin.ts:
    ✓ Plugin export found
    ✓ Returns async function
    ✓ Hooks structure valid
    ⚠ No custom tools defined (optional)

Security Scan:
  ✓ No hardcoded secrets
  ✓ No suspicious URLs
  ✓ Scripts don't require sudo

Result: PASS with 5 warnings
```

### Local Testing

```bash
# Test Claude Code plugin
grimoire plugins test ./my-plugin --target claude

Testing Claude Code plugin locally...

1. Creating test marketplace...
   ✓ Created: /tmp/grimoire-test-marketplace

2. Adding to Claude Code...
   Executing: claude plugin marketplace add /tmp/grimoire-test-marketplace
   ✓ Marketplace added

3. Installing plugin...
   Executing: claude plugin install my-plugin@grimoire-test
   ✓ Plugin installed

4. Verifying...
   ✓ Commands registered: /main
   ✓ Plugin appears in /help

Test complete. Plugin ready for use.

Cleanup:
  claude plugin uninstall my-plugin@grimoire-test
  claude plugin marketplace remove grimoire-test
```

---

## Part 7: Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Plugin state schema and storage
- [ ] `grimoire plugins list` - list installed plugins
- [ ] `grimoire plugins info` - show plugin details
- [ ] Basic Claude Code delegation (`plugin install/uninstall`)

### Phase 2: Discovery (Week 3-4)
- [ ] `grimoire plugins search` - search Claude Code marketplaces
- [ ] OpenCode community registry integration
- [ ] `grimoire plugins marketplace add/remove/list`
- [ ] Cross-source search aggregation

### Phase 3: OpenCode Support (Week 5-6)
- [ ] OpenCode plugin file installation
- [ ] Plugin validation for OpenCode format
- [ ] `grimoire plugins install` for OpenCode
- [ ] Event hook detection and cataloging

### Phase 4: Translation Layer (Week 7-8)
- [ ] Claude Code command → OpenCode tool translation
- [ ] OpenCode event → Claude Code hook translation
- [ ] Cross-platform `--target all` support
- [ ] Translation compatibility warnings

### Phase 5: Authoring (Week 9-10)
- [ ] `grimoire plugins create` scaffolding
- [ ] Templates: claude, opencode, both
- [ ] `grimoire plugins validate`
- [ ] Local testing workflow

### Phase 6: Polish (Week 11-12)
- [ ] `grimoire plugins sync` across agents
- [ ] Update detection and management
- [ ] Interactive plugin browser
- [ ] Documentation and examples

---

## Part 8: Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Plugin discovery time | < 30 seconds | User testing |
| Cross-platform install success | > 80% | Automated testing |
| Translation accuracy | > 70% functionality preserved | Manual review |
| Native command delegation | 100% for supported ops | Integration tests |
| Plugin creation time | < 5 minutes | User testing |

---

## Appendix A: Claude Code Plugin CLI Reference

### Marketplace Commands
```bash
# Add marketplace
claude plugin marketplace add <source>
# Sources: github-org/repo, ./local/path, https://url

# Remove marketplace
claude plugin marketplace remove <name>

# List marketplaces
claude plugin marketplace list
```

### Plugin Commands
```bash
# Interactive browser
claude /plugin

# Install plugin
claude plugin install <plugin>@<marketplace> [--scope user|project|local]

# Uninstall plugin
claude plugin uninstall <plugin>@<marketplace>

# Enable/disable
claude plugin enable <plugin>@<marketplace>
claude plugin disable <plugin>@<marketplace>

# Update
claude plugin update <plugin>@<marketplace>
```

---

## Appendix B: OpenCode Plugin API Reference

### Plugin Function Signature
```typescript
type Plugin = (context: PluginContext) => Promise<PluginHooks>;

interface PluginContext {
  project: ProjectInfo;      // Current project
  directory: string;         // Working directory
  worktree: string;          // Git worktree path
  client: OpenCodeClient;    // SDK client
  $: BunShell;               // Bun shell API
}

interface PluginHooks {
  event?: (params: { event: Event }) => Promise<void>;
  "tool.execute.before"?: (input: ToolInput, output: ToolOutput) => Promise<void>;
  "tool.execute.after"?: (input: ToolInput, output: ToolOutput) => Promise<void>;
  tool?: Record<string, ToolDefinition>;
}
```

### Tool Definition
```typescript
import { tool } from "@opencode-ai/plugin";

const myTool = tool({
  description: "What this tool does",
  args: {
    param1: tool.schema.string(),
    param2: tool.schema.number().optional(),
  },
  async execute(args, ctx) {
    // Implementation
    return "result";
  },
});
```

---

## Appendix C: Event Mapping Table

| Claude Code Event | OpenCode Event | Notes |
|-------------------|----------------|-------|
| `PreToolUse` | `tool.execute.before` | Direct mapping |
| `PostToolUse` | `tool.execute.after` | Direct mapping |
| `Stop` | `session.idle` | Similar semantics |
| `SessionStart` | `session.created` | Direct mapping |
| `SessionEnd` | `session.deleted` | Approximate |
| `SubagentStop` | N/A | No equivalent |
| `UserPromptSubmit` | `tui.prompt.append` | Partial |
| `PreCompact` | `session.compacted` | Different timing |
| `Notification` | `tui.toast.show` | Similar purpose |
| N/A | `file.edited` | OpenCode only |
| N/A | `lsp.client.diagnostics` | OpenCode only |
| N/A | `permission.updated` | OpenCode only |
