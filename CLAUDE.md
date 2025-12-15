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

Skills are reusable AI agent capabilities that can be enabled in projects. Skills inject documentation and configuration into the agent's context.

```bash
grimoire skills init           # Initialize skills in project
grimoire skills add <source>   # Add skill from GitHub
grimoire skills enable <name>  # Enable skill in project
grimoire skills disable <name> # Disable skill
grimoire skills list           # List skills
grimoire skills info <name>    # Show skill details
grimoire skills search <query> # Search for skills
grimoire skills sync           # Update enabled skills
grimoire skills doctor         # Diagnose issues
```

### Enable Skill

Enable one or more skills in the current project:

```bash
grimoire skills enable beads
grimoire skills enable beads typescript-strict
grimoire skills enable beads -y                 # Auto-confirm
grimoire skills enable beads --no-deps          # Skip CLI dependency installation
grimoire skills enable beads --no-init          # Skip init commands
```

### Disable Skill

Disable one or more skills in the current project:

```bash
grimoire skills disable beads
grimoire skills disable beads typescript-strict
grimoire skills disable beads --purge           # Also remove project artifacts
grimoire skills disable beads --purge -y        # Skip confirmation
```

Note: Disabling a skill removes its documentation from the agent but does NOT uninstall CLI tools or plugins, as these may be used by other skills or projects.

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
