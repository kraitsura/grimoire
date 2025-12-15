# Grimoire

A CLI tool for storing, editing, and managing prompts with clipboard support.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Framework**: Ink (React for CLI)
- **Core Library**: Effect (functional programming, error handling, services)

## Project Structure

```
grimoire/
├── src/
│   ├── cli/           # Ink components and CLI interface
│   ├── services/      # Effect services (storage, clipboard, etc.)
│   ├── commands/      # CLI command handlers
│   ├── models/        # Domain types and schemas
│   └── index.ts       # Entry point
├── tests/
├── package.json
├── tsconfig.json
└── bunfig.toml
```

## Commands

```bash
bun run dev        # Development mode with watch
bun run build      # Build for production
bun run test       # Run tests
bun run lint       # Lint code
```

## Development Guidelines

### Effect Patterns

- Use `Effect.gen` for effectful computations
- Define services with `Context.Tag` and `Layer`
- Use `Schema` for runtime validation
- Handle errors with typed error channels
- Prefer `pipe` for composition

### Ink Patterns

- Keep components small and focused
- Use hooks for state management
- Handle keyboard input via `useInput`
- Use `Box` and `Text` for layout

### Code Style

- Prefer `const` over `let`
- Use explicit return types on functions
- Name files in kebab-case
- Export types separately from implementations
- Use barrel exports (`index.ts`) sparingly

### Error Handling

- Define domain-specific error types
- Never throw - use Effect error channel
- Provide helpful error messages for CLI users

## Key Concepts

### Prompts

A prompt is the core entity:
- `id`: Unique identifier
- `name`: Human-readable name
- `content`: The prompt text
- `tags`: Optional categorization
- `createdAt`: Timestamp
- `updatedAt`: Timestamp

### Storage

Prompts are stored locally in `~/.grimoire/prompts.json`

### Clipboard

Uses system clipboard for copy operations

## Skills Commands

Skills are reusable AI agent capabilities that can be enabled in projects. Skills inject documentation, CLI tools, plugins, and MCP servers into the agent's context.

### Overview

A skill can provide:
- **Prompt/Documentation**: Inject instructions into CLAUDE.md or agent config
- **CLI Tools**: Install command-line dependencies (via brew, npm, cargo, etc.)
- **Plugins**: Install agent marketplace plugins
- **MCP Servers**: Configure Model Context Protocol servers
- **Init Scripts**: Run setup commands when first enabled

See `examples/example-skill.yaml` for a complete skill manifest example.

### Commands

```bash
grimoire skills init [--agent=<type>]  # Initialize skills in project
grimoire skills add <source>           # Add skill from GitHub/URL
grimoire skills enable <name>          # Enable skill in project
grimoire skills disable <name>         # Disable skill
grimoire skills list [--enabled]       # List available/enabled skills
grimoire skills info <name>            # Show skill details
grimoire skills search <query>         # Search for skills
grimoire skills sync                   # Update enabled skills
grimoire skills doctor                 # Diagnose and fix issues
```

### Initialize Skills

Initialize the skills system in your project:

```bash
grimoire skills init                    # Auto-detect agent type
grimoire skills init --agent=claude_code
grimoire skills init --agent=opencode
```

This creates:
- `.grimoire/skills-state.json` (enabled skills tracking)
- `.claude/skills/` directory (for Claude Code)
- Managed sections in CLAUDE.md

### Add Skills

Add skills from various sources:

```bash
# From GitHub repository
grimoire skills add github:username/skill-name

# From GitHub with specific branch/tag
grimoire skills add github:username/skill-name@v1.0.0
grimoire skills add github:username/skill-name@main

# From URL
grimoire skills add https://example.com/skills/my-skill.zip
```

### Enable Skills

Enable one or more skills in the current project:

```bash
grimoire skills enable beads
grimoire skills enable beads typescript-strict  # Multiple skills
grimoire skills enable beads -y                 # Auto-confirm prompts
grimoire skills enable beads --no-deps          # Skip CLI dependency installation
grimoire skills enable beads --no-init          # Skip init commands
```

When enabling a skill:
1. Checks if skill is cached (use `skills add` first)
2. Checks if project is initialized (use `skills init` first)
3. Installs CLI dependencies (unless --no-deps)
4. Runs init commands (unless --no-init, only on first enable)
5. Installs plugins (if configured)
6. Configures MCP servers (if configured)
7. Injects documentation into agent config

### Disable Skills

Disable one or more skills in the current project:

```bash
grimoire skills disable beads
grimoire skills disable beads typescript-strict  # Multiple skills
grimoire skills disable beads --purge            # Also remove project artifacts
grimoire skills disable beads --purge -y         # Skip confirmation
```

When disabling a skill:
1. Removes injected documentation from agent config
2. Removes skill file from .claude/skills/
3. Updates skills state
4. Optionally purges project artifacts (--purge)

Note: Disabling does NOT uninstall CLI tools or plugins, as these may be shared by other skills or projects.

### List Skills

List available or enabled skills:

```bash
grimoire skills list                # All cached skills
grimoire skills list --enabled      # Only enabled skills in current project
```

### Skill Info

Show detailed information about a skill:

```bash
grimoire skills info beads
```

Displays:
- Skill metadata (name, version, description, author)
- Type and tags
- CLI dependencies
- Agent configurations
- Initialization steps

### Search Skills

Search for skills in configured repositories:

```bash
grimoire skills search beads
grimoire skills search "task management"
```

### Sync Skills

Update all enabled skills to their latest cached versions:

```bash
grimoire skills sync               # Sync all enabled skills
grimoire skills sync -y            # Skip confirmation
```

### Doctor

Diagnose and fix common issues:

```bash
grimoire skills doctor             # Check for issues
grimoire skills doctor --fix       # Auto-fix issues
```

Checks:
- Skills state file integrity
- CLI dependencies installation
- Agent config injection markers
- Skill file existence
- MCP server configuration

### Skill Structure

A skill is a directory containing:

```
skill-name/
├── skill.yaml          # Manifest (required)
├── SKILL.md            # Documentation (optional)
├── init/               # Init scripts (optional)
│   ├── setup.sh
│   └── config.json
└── templates/          # File templates (optional)
    └── .example.yaml
```

The `skill.yaml` manifest defines:
- Metadata (name, version, description, tags)
- Skill type (prompt, plugin, mcp, tool)
- CLI dependencies
- Agent-specific configurations
- Initialization steps

See `examples/example-skill.yaml` for a complete example.

## Issue Tracking (Beads)

This project uses Beads (`bd`) for AI-native task and issue tracking. Issues are stored in `.beads/issues.jsonl` and synced via git.

### When to Use Beads

- Track ALL work in Beads - do not use markdown TODOs or the TodoWrite tool
- Use `bd create` to file new tasks, bugs, and features
- Check `bd ready` at session start to find available work
- Always run `bd sync` before ending a session

### Core Commands

```bash
bd ready                              # Find tasks with no blockers
bd list [--status=open]               # List issues
bd show <id>                          # View issue details
bd create --title="..." --type=task   # Create issue (types: bug, feature, task, epic, chore)
bd update <id> --status=in_progress   # Claim work
bd close <id>                         # Mark complete
bd dep add <issue> <depends-on>       # Add dependency
bd sync                               # Sync with git remote
```

### Workflows

**Starting work:**
```bash
bd ready                              # Find available work
bd show <id>                          # Review details
bd update <id> --status=in_progress   # Claim it
```

**Completing work:**
```bash
bd close <id>                         # Mark done
bd sync                               # Push to remote
```

### Dependency Types

- `blocks` - Hard blocker (must complete first)
- `related` - Soft link (contextual connection)
- `parent-child` - Epic/subtask hierarchy
- `discovered-from` - Found during other work

### Beads Viewer (bv)

For graph-aware insights and execution planning, use `bv` with robot flags. This offloads complex dependency analysis to avoid hallucinated traversals.

**AI agents must use robot flags only** (interactive mode traps the terminal):

```bash
bv --robot-help                       # Show all AI-facing commands
bv --robot-insights                   # JSON graph metrics (PageRank, bottlenecks, cycles)
bv --robot-plan                       # JSON execution plan with parallel tracks
bv --robot-priority                   # Priority recommendations with confidence scores
bv --robot-diff --diff-since HEAD~5   # Track structural changes since commit
```

**When to use bv:**
- Before starting work: `bv --robot-insights` to assess project health and find bottlenecks
- Planning execution order: `bv --robot-plan` for dependency-respecting task order
- After refactoring: `bv --robot-diff` to verify no cycles introduced

**bv vs bd:**
- `bd` - CRUD operations (create, update, close, sync)
- `bv` - Read-only analysis (insights, planning, visualization)
