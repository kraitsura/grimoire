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
