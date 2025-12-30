# Grimoire

A CLI tool for storing, editing, and managing prompts with clipboard support.

## Agent Rules

> **IMPORTANT**: This project uses Beads (`bd`) for task tracking. **Do NOT use the TodoWrite tool.** All tasks, bugs, and features must be tracked using Beads commands.

### Task Management with Beads

- **Never use TodoWrite** - Use `bd create` to create tasks instead
- **Check for work** - Run `bd ready` at session start to see available tasks
- **Claim work** - Use `bd update <id> --status=in_progress` before starting
- **Close completed work** - Use `bd close <id>` when done
- **Always sync** - Run `bd sync` before ending any session

### Session Close Protocol

Before saying "done" or ending work, run this checklist:
1. `git status` - Check what changed
2. `git add <files>` - Stage code changes
3. `bd sync` - Commit beads changes
4. `git commit -m "..."` - Commit code
5. `bd sync` - Commit any new beads changes
6. `git push` - Push to remote

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

Skills are reusable AI agent capabilities that can be enabled in projects. Skills inject documentation and context into the agent's system prompt.

### Skills vs Plugins (Important Distinction)

| Aspect | Skills | Claude Code Plugins |
|--------|--------|---------------------|
| **Purpose** | Inject instructions/context | Provide tools, commands, hooks |
| **Format** | `SKILL.md` with frontmatter | `.claude-plugin/plugin.json` |
| **Location** | `.claude/skills/<name>/SKILL.md` | Separate repository |
| **Install** | `grimoire skills enable` | `claude plugin install` |
| **Discovery** | By description in frontmatter | By Skill tool invocation |
| **Capabilities** | Instructions only | Commands, agents, hooks, MCP, skills |

**Use skills when**: You want to add knowledge, instructions, or context to the agent.

**Use plugins when**: You want to add tools, slash commands, hooks, MCP servers, or CLI tools.

### Overview

A skill is simply a `SKILL.md` file with YAML frontmatter that provides:
- **Instructions/Documentation**: Inject context into CLAUDE.md

Skills do NOT provide CLI tools, MCP servers, or init scripts. For those capabilities, create a full Claude Code plugin with `.claude-plugin/plugin.json`.

See `examples/SKILL.md` for an example skill file.

### Skill Discovery

For Claude Code to automatically discover and use a skill, the SKILL.md file needs YAML frontmatter:

```yaml
---
name: my-skill
description: When to use this skill. Describe triggers and use cases clearly.
allowed-tools: Read, Write, Bash
---

# My Skill Instructions
...
```

The `description` field is **critical** - Claude uses it to decide when to invoke the skill. Make it specific:
- Good: "Use when managing git branches, resolving merge conflicts, or reviewing commit history"
- Bad: "Git utilities" (too vague)

### Commands

```bash
grimoire skills init [--agent=<type>]  # Initialize skills in project
grimoire skills add <source>           # Add skill from GitHub/URL
grimoire skills enable <name>          # Enable skill in project
grimoire skills disable <name>         # Disable skill
grimoire skills update <name> [opts]   # Update skill metadata
grimoire skills list [--enabled]       # List available/enabled skills
grimoire skills info <name>            # Show skill details
grimoire skills search <query>         # Search for skills
grimoire skills sync                   # Update enabled skills
grimoire skills doctor                 # Diagnose and fix issues
grimoire skills validate <name|path>   # Validate against agentskills.io
```

### Initialize Skills

Initialize the skills system in your project:

```bash
grimoire skills init                    # Auto-detect agent type
grimoire skills init --agent=claude_code
grimoire skills init --agent=opencode
grimoire skills init --agent=codex
grimoire skills init --agent=cursor
grimoire skills init --agent=aider
grimoire skills init --agent=amp
```

This creates (varies by agent):
- `.grimoire/skills-state.json` (enabled skills tracking)
- Claude Code: `.claude/skills/` + `CLAUDE.md`
- OpenCode: `.opencode/skills/` + `AGENTS.md`
- Cursor: `.cursor/rules/`
- Codex: `AGENTS.md`
- Aider: `CONVENTIONS.md`
- Amp: `AGENT.md`

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
```

When enabling a skill:
1. Checks if skill is cached (use `skills add` first)
2. Checks if project is initialized (use `skills init` first)
3. Copies SKILL.md to `.claude/skills/`
4. Injects documentation into agent config (CLAUDE.md)

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
2. Removes skill file from `.claude/skills/`
3. Updates skills state
4. Optionally purges project artifacts (--purge)

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

### Update Skills

Update skill metadata (trigger description, allowed tools) after installation:

```bash
grimoire skills update beads --trigger "Use when managing tasks, issues, or sprints"
grimoire skills update beads --allowed-tools "Read,Write,Bash,Glob"
grimoire skills update beads --description "Task and issue tracking with dependencies"
```

This modifies the installed SKILL.md file's YAML frontmatter without re-enabling the skill.

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
- Agent config injection markers
- Skill file existence

### Validate

Validate a skill against the agentskills.io standard:

```bash
grimoire skills validate beads           # Validate cached skill
grimoire skills validate ./my-skill      # Validate local skill
grimoire skills validate .               # Validate current directory
grimoire skills validate beads --json    # JSON output
```

Validation rules (per agentskills.io specification):
- **Name**: 1-64 chars, lowercase alphanumeric + hyphens, no start/end hyphens, no consecutive hyphens, must match directory name
- **Description**: 1-1024 characters
- **Compatibility**: 1-500 characters (optional)
- **SKILL.md size**: Warning if >500 lines or >5000 tokens

### Skill Structure

A skill is a directory containing a single required file:

```
skill-name/
├── SKILL.md            # Required: frontmatter + instructions
└── README.md           # Optional: additional documentation
```

The `SKILL.md` file must have YAML frontmatter with:
- `name`: Skill identifier (kebab-case)
- `description`: When to use the skill (critical for discovery)
- `allowed-tools`: Optional list of allowed tools

See `examples/SKILL.md` for a complete example.

**Note**: Skills no longer use `skill.yaml`. For CLI tools, MCP servers, or hooks, create a Claude Code plugin with `.claude-plugin/plugin.json` instead.

## Issue Tracking (Beads)

This project uses Beads (`bd`) for AI-native task and issue tracking. Issues are stored in `.beads/issues.jsonl` and synced via git.

> **CRITICAL**: Do NOT use the `TodoWrite` tool. Use Beads (`bd`) commands for all task tracking.

### Why Beads Instead of TodoWrite

- **Persistent** - Tasks survive across sessions, stored in git
- **Collaborative** - Multiple agents/humans can work on the same project
- **Dependency-aware** - Track blocking relationships between tasks
- **Git-native** - Changes sync via git, no separate database
- **Richer metadata** - Priority, labels, assignees, comments, acceptance criteria

### Issue Types

| Type | Use For |
|------|---------|
| `task` | General work items |
| `bug` | Defects to fix |
| `feature` | New functionality |
| `epic` | Large initiatives with subtasks |
| `chore` | Maintenance, refactoring, cleanup |

### Issue Statuses

| Status | Meaning |
|--------|---------|
| `open` | Not started |
| `in_progress` | Currently being worked on |
| `blocked` | Waiting on dependencies |
| `closed` | Completed |

### Core Commands

```bash
# Finding work
bd ready                              # Tasks with no blockers (start here!)
bd list                               # All open issues
bd list --status=in_progress          # Currently active work
bd list --status=blocked              # Blocked issues with blockers shown
bd show <id>                          # Full issue details

# Creating issues
bd create --title="Fix login bug" --type=bug
bd create --title="Add dark mode" --type=feature --priority=1
bd create --title="Refactor auth" --type=task --description="..."

# Updating issues
bd update <id> --status=in_progress   # Claim work
bd update <id> --priority=1           # Set priority (1=highest, 5=lowest)
bd update <id> --assignee=username    # Assign to someone
bd update <id> --add-label=urgent     # Add label
bd update <id> --description="..."    # Update description

# Completing work
bd close <id>                         # Mark complete
bd close <id1> <id2> <id3>            # Close multiple at once (efficient!)
bd close <id> --reason="Won't fix"    # Close with explanation

# Dependencies
bd dep add <issue> <depends-on>       # Issue depends on another (depends-on blocks issue)
bd dep remove <issue> <depends-on>    # Remove dependency
bd dep tree <id>                      # View dependency graph

# Comments
bd comment add <id> "Found root cause"  # Add progress note
bd comment list <id>                    # View comments

# Syncing
bd sync                               # Commit and push beads changes
bd sync --status                      # Check sync status
```

### Workflows

**Starting a session:**
```bash
bd ready                              # Find available work
bd show <id>                          # Review details and acceptance criteria
bd update <id> --status=in_progress   # Claim it
```

**During work:**
```bash
bd comment add <id> "Implemented X"   # Track progress
bd create --title="Found edge case"   # Discovered new work
bd dep add <new-id> <current-id>      # Link discovered work
```

**Completing work:**
```bash
bd close <id>                         # Mark done
bd sync                               # Push to remote
```

**Creating dependent tasks:**
```bash
bd create --title="Design API" --type=task
bd create --title="Implement API" --type=task
bd create --title="Write tests" --type=task
bd dep add <implement-id> <design-id>  # Implement depends on Design
bd dep add <tests-id> <implement-id>   # Tests depend on Implement
```

### Dependency Types

- `blocks` - Hard blocker (must complete first)
- `related` - Soft link (contextual connection)
- `parent-child` - Epic/subtask hierarchy
- `discovered-from` - Found during other work

### Filtering Issues

```bash
bd list --label=bug                   # Issues with label (AND logic)
bd list --label-any=p0 --label-any=p1 # Issues with any label (OR logic)
bd list --priority=1                  # High priority only
bd list --assignee=username           # Assigned to specific person
bd ready --unassigned                 # Ready work with no owner
```

### MCP Tools (Alternative to CLI)

Instead of `bd` CLI commands, you can use the MCP tools directly:
- `mcp__plugin_beads_beads__ready` - Find ready tasks
- `mcp__plugin_beads_beads__list` - List issues
- `mcp__plugin_beads_beads__show` - View issue
- `mcp__plugin_beads_beads__create` - Create issue
- `mcp__plugin_beads_beads__update` - Update issue
- `mcp__plugin_beads_beads__close` - Close issue
- `mcp__plugin_beads_beads__dep` - Manage dependencies
- `mcp__plugin_beads_beads__comment` - Add/list comments

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

<!-- bv-agent-instructions-v1 -->

---

## Beads Workflow Integration

This project uses [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) for issue tracking. Issues are stored in `.beads/` and tracked in git.

### Essential Commands

```bash
# View issues (launches TUI - avoid in automated sessions)
bv

# CLI commands for agents (use these instead)
bd ready              # Show issues ready to work (no blockers)
bd list --status=open # All open issues
bd show <id>          # Full issue details with dependencies
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id> --reason="Completed"
bd close <id1> <id2>  # Close multiple issues at once
bd sync               # Commit and push changes
```

### Workflow Pattern

1. **Start**: Run `bd ready` to find actionable work
2. **Claim**: Use `bd update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `bd close <id>`
5. **Sync**: Always run `bd sync` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `bd ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers, not words)
- **Types**: task, bug, feature, epic, question, docs
- **Blocking**: `bd dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status              # Check what changed
git add <files>         # Stage code changes
bd sync                 # Commit beads changes
git commit -m "..."     # Commit code
bd sync                 # Commit any new beads changes
git push                # Push to remote
```

### Best Practices

- Check `bd ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `bd create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always `bd sync` before ending session

<!-- end-bv-agent-instructions -->

---

## Git Worktrees (grim wt)

Use `grim wt` instead of raw git worktree commands - it handles branch creation, cleanup, and agent coordination automatically.

### Essential Commands

```bash
grim wt new <name>                # Create worktree + branch
grim wt list                      # Show all worktrees
grim wt status                    # Rich status view
grim wt rm <name>                 # Remove worktree
cd $(grim wt new -o <name>)       # Create and cd in one step
```

### Spawning Agents

There are two ways to spawn Claude agents:

**`grim wt spawn <name>` - Create worktree and spawn agent:**
```bash
# Smart behavior:
# - If worktree exists: spawn agent to it
# - If branch exists (no worktree): create worktree from branch
# - If neither: create new branch + worktree
grim wt spawn fix-auth -bg "Fix the auth bug"
grim wt spawn existing-branch -bg "Continue work"  # Uses existing branch
```

**`grim spawn` - Spawn agent in current directory (no worktree):**
```bash
# Use when you want to spawn in place (current worktree or main repo)
grim spawn -bg "Implement this feature"
grim spawn --new-tab                    # Opens in new terminal
```

Both commands work correctly from inside worktrees or from the main repo.

### Parallel Agents

When subtasks are independent, run them in parallel:

```bash
# Spawn background agents (each gets isolated worktree)
grim wt spawn fix-auth -bg "Fix the authentication bug in login.ts"
grim wt spawn add-tests -bg "Add unit tests for the user service"
grim wt spawn update-docs -bg "Update API documentation"

# Check status
grim wt ps

# Collect all work back
grim wt wait fix-auth add-tests update-docs
grim wt collect fix-auth add-tests update-docs --delete
```

### With Issue Tracking

Link agents to beads issues for traceability:

```bash
# Create tracked subtasks
bd create --title="Fix auth bug" --type=bug --priority=1
bd create --title="Add user service tests" --type=task --priority=2

# Spawn with issue links
grim wt spawn fix-auth -bg "Fix auth bug" -i beads-xxx
grim wt spawn add-tests -bg "Add tests" -i beads-yyy

# After collecting, close issues
bd close beads-xxx beads-yyy
bd sync
```

### Decision: Parallel vs Sequential

**Parallelize when:**
- Tasks touch different files/modules
- No task needs another's output
- Combined time savings > spawn overhead (~30s per agent)

**Stay sequential when:**
- Task B needs Task A's code
- Tasks modify shared state/config
- Only 1-2 small tasks (overhead not worth it)

### If Something Goes Wrong

```bash
grim wt logs <name>               # See what agent did
grim wt ps                        # Check if still running
grim wt collect --dry-run         # Preview merge before doing it
grim wt collect --strategy rebase # Try rebase if merge conflicts
bd show <issue>                   # Check issue context
```

<!-- skills:managed:start -->
<!-- This section is managed by grimoire skills -->
<!-- skills:managed:end -->
