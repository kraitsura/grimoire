# grimoire

A prompt engineering toolkit for developers. Store prompts with version control, inject AI agent skills into projects, and manage parallel development with git worktrees.

---

## Features

### Prompt Library

Store and organize prompts with full version control. Create branches to experiment, tag for organization, and sync across machines.

```bash
grimoire my-prompt              # Create or edit
grimoire list                   # Browse library
grimoire copy my-prompt         # Copy to clipboard
```

- Version history with rollback
- Branching and merging
- Tags and search
- Import/export (JSON, YAML)

[View documentation](docs/prompts.md)

---

### Skills

Inject reusable capabilities into AI coding agents. Skills are `SKILL.md` files that extend agent knowledge with domain-specific instructions.

```bash
grimoire skills init                        # Initialize in project
grimoire skills add github:owner/skill      # Add from GitHub
grimoire skills enable my-skill             # Enable in project
```

Supported agents:
- Claude Code
- OpenCode
- Cursor
- Codex
- Aider
- Amp

[View documentation](docs/skills.md)

---

### Worktrees

Manage git worktrees for parallel development. Spawn isolated Claude sessions, track progress, and hand off work between agents.

```bash
grimoire wt new feature-branch              # Create worktree
cd $(grimoire wt new -o feature-branch)     # Create and cd into worktree
grimoire wt spawn task -bg "Fix the bug"    # Background agent
grimoire wt status                          # View all worktrees
```

- Link worktrees to issues
- Progress logging and checkpoints
- Claim/release for exclusive access
- Agent handoff protocol
- Parallel background agents with `-bg` flag

#### Agent Instructions

Add this to your `CLAUDE.md` or `AGENTS.md` to enable parallel agent workflows:

```markdown
## Parallel Work with Worktrees

When a task can be parallelized, use grimoire worktrees to spawn background agents:

### Spawning Background Agents
\`\`\`bash
# Spawn parallel agents for independent subtasks
grim wt spawn task-1 -bg "Implement feature A"
grim wt spawn task-2 -bg "Write tests for feature B"
grim wt spawn task-3 -bg "Update documentation"

# Monitor progress
grim wt ps                    # List running agents
grim wt logs <name>           # View agent output
\`\`\`

### Collecting Results
\`\`\`bash
# Wait for agents to complete
grim wt wait task-1 task-2 task-3

# Merge their work back
grim wt collect task-1 task-2 task-3 --delete
\`\`\`

### When to Parallelize
- Independent features or bug fixes
- Tests that don't depend on each other
- Documentation updates
- Refactoring separate modules

### When NOT to Parallelize
- Sequential dependencies (B needs A's output)
- Shared state modifications
- Small tasks (overhead not worth it)
```

**With Beads Integration** (for projects using `bd` issue tracking):

```markdown
## Parallel Work with Worktrees + Beads

Use grimoire worktrees with beads for tracked, parallel agent workflows.

### Creating Tracked Work
\`\`\`bash
# Create issues for subtasks
bd create --title="Implement feature A" --type=task --priority=2
bd create --title="Write tests for B" --type=task --priority=2
bd create --title="Update docs" --type=task --priority=3

# Spawn agents linked to issues
grim wt spawn feature-a -bg "Implement feature A" -i beads-xxx
grim wt spawn tests-b -bg "Write tests for B" -i beads-yyy
grim wt spawn docs -bg "Update documentation" -i beads-zzz
\`\`\`

### Monitoring & Completion
\`\`\`bash
# Check agent status
grim wt ps
bd list --status=in_progress

# Wait and collect
grim wt wait feature-a tests-b docs
grim wt collect feature-a tests-b docs --delete

# Close completed issues
bd close beads-xxx beads-yyy beads-zzz
bd sync
\`\`\`

### Workflow Pattern
1. Break task into subtasks with `bd create`
2. Spawn background agents with `grim wt spawn -bg`
3. Monitor with `grim wt ps` and `bd list`
4. Collect work with `grim wt collect`
5. Close issues with `bd close` and sync

### Best Practices
- Link worktrees to issues with `-i <issue-id>`
- Use `bd dep add` for dependent subtasks
- Run `bd sync` after completing work
- Use `grim wt collect --dry-run` before merging
```

[View documentation](docs/worktrees.md)

---

### Testing

Test prompts against LLM providers. Estimate costs, run benchmarks, and A/B test variations.

```bash
grimoire test my-prompt -p anthropic   # Test with provider
grimoire cost my-prompt                # Estimate tokens
grimoire compare prompt-a prompt-b     # A/B test
```

Providers: OpenAI, Anthropic, Google Gemini, Ollama

[View documentation](docs/testing.md)

---

### Plugins & Agents

Extend grimoire with marketplace plugins. Scaffold custom agent definitions for your workflows.

```bash
grimoire plugins add marketplace-url   # Add marketplace
grimoire agents create my-agent        # Scaffold agent
```

[View documentation](docs/plugins.md)

---

## Quick Start

### Install

```bash
bun install -g grimoire
```

### Create your first prompt

```bash
grimoire hello-world
```

This opens your editor. Write a prompt, save, and it's stored in your library.

### Copy to clipboard

```bash
grimoire copy hello-world
```

### Add skills to a project

```bash
cd my-project
grimoire skills init
grimoire skills add github:anthropics/claude-code-skills
grimoire skills enable code-review
```

### Configure LLM providers

```bash
grimoire config llm add openai      # Add API key
grimoire config llm add anthropic
grimoire test my-prompt             # Test prompts
```

---

## Storage

| Path | Purpose |
|------|---------|
| `~/.grimoire/` | Global prompt library and config |
| `.grimoire/` | Project-specific state |
| `.claude/skills/` | Enabled skills (Claude Code) |

---

## Documentation

- [Prompt Management](docs/prompts.md) - Version control, branching, tags, chains
- [Skills System](docs/skills.md) - Agent capabilities and discovery
- [Worktree Management](docs/worktrees.md) - Parallel development and handoff
- [Testing & Benchmarking](docs/testing.md) - LLM testing and cost estimation
- [Plugins & Agents](docs/plugins.md) - Extensions and custom agents
- [Configuration](docs/config.md) - LLM providers, sync, shell completions

---

## Tech Stack

Built with Bun, TypeScript, Ink (React for CLI), and Effect.

---

## License

MIT
