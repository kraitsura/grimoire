# Skills System

Skills inject reusable capabilities into AI coding agents. A skill is a `SKILL.md` file with YAML frontmatter that provides instructions, documentation, and context.

---

## Concepts

### What is a Skill?

A skill extends an AI agent's knowledge with domain-specific instructions. Skills are discovered by agents based on their `description` field in the frontmatter.

```yaml
---
name: code-review
description: Use when reviewing pull requests or analyzing code quality.
allowed-tools: Read, Grep, Glob
---

# Code Review Instructions

When reviewing code, focus on...
```

### Skills vs Plugins

| Aspect | Skills | Plugins |
|--------|--------|---------|
| Purpose | Inject instructions/context | Provide tools, commands, hooks |
| Format | `SKILL.md` with frontmatter | `.claude-plugin/plugin.json` |
| Capabilities | Instructions only | CLI tools, MCP servers, hooks |

Use skills for knowledge. Use plugins for functionality.

### Supported Agents

- Claude Code
- OpenCode
- Cursor
- Codex
- Aider
- Amp

---

## Commands

### Initialize

Set up skills in a project:

```bash
grimoire skills init                     # Auto-detect agent
grimoire skills init --agent=claude_code
grimoire skills init --agent=opencode
grimoire skills init --agent=cursor
grimoire skills init --agent=codex
grimoire skills init --agent=aider
grimoire skills init --agent=amp
```

Creates:
- `.grimoire/skills-state.json` - Tracks enabled skills
- Agent-specific config (e.g., `.claude/skills/` for Claude Code)

### Add Skills

Download skills to local cache:

```bash
grimoire skills add github:owner/repo           # From GitHub
grimoire skills add github:owner/repo@v1.0.0    # Specific version
grimoire skills add github:owner/repo@main      # Branch
grimoire skills add github:owner/repo#subdir    # Subdirectory
grimoire skills add ./local-skill               # Local path
grimoire skills add <source> --force            # Force re-add
grimoire skills add <source> --no-validate      # Skip validation
```

### Enable & Disable

Activate skills in a project:

```bash
grimoire skills enable <name>              # Enable skill
grimoire skills enable skill1 skill2       # Multiple
grimoire skills enable <name> -y           # Auto-confirm
grimoire skills enable <name> --no-deps    # Skip CLI dependencies
grimoire skills enable <name> --no-init    # Skip init commands
grimoire skills enable <name> -g           # Global install
grimoire skills enable <name> -l           # Symlink from global

grimoire skills disable <name>             # Disable
grimoire skills disable <name> --purge     # Remove artifacts
grimoire skills disable <name> -y          # Skip confirmation
```

### Install

One command to add and enable:

```bash
grimoire skills install github:owner/repo
grimoire skills install <source> --target <name>
```

### List & Info

```bash
grimoire skills list                 # All cached skills
grimoire skills list --enabled       # Enabled in project
grimoire skills info <name>          # Detailed info
grimoire skills search <query>       # Search GitHub
```

### Update

Modify skill metadata after installation:

```bash
grimoire skills update <name> --trigger "..."
grimoire skills update <name> --allowed-tools "Read,Write,Bash"
grimoire skills update <name> --description "..."
```

### Sync

Update all enabled skills:

```bash
grimoire skills sync
grimoire skills sync -y
```

### Validate

Check against agentskills.io specification:

```bash
grimoire skills validate <name>
grimoire skills validate ./path
grimoire skills validate . --json
```

### Doctor

Diagnose and fix issues:

```bash
grimoire skills doctor
grimoire skills doctor --fix
```

---

## Creating Skills

### Directory Structure

```
my-skill/
├── SKILL.md      # Required: frontmatter + instructions
└── README.md     # Optional: documentation
```

### SKILL.md Format

```yaml
---
name: my-skill
description: When to use this skill. Be specific about triggers.
allowed-tools: Read, Write, Bash, Glob, Grep
---

# My Skill

Instructions for the agent...
```

### Discovery

The `description` field determines when agents invoke the skill. Be specific:

- Good: "Use when managing git branches, resolving merge conflicts, or reviewing commit history"
- Bad: "Git utilities"

### Validation Rules

Per agentskills.io specification:
- Name: 1-64 chars, lowercase alphanumeric + hyphens
- Description: 1-1024 chars
- SKILL.md: Warning if >500 lines or >5000 tokens
