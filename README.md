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
grimoire wt new feature-branch         # Create worktree
grimoire wt spawn feature-branch       # Launch Claude session
grimoire wt status                     # View all worktrees
```

- Link worktrees to issues
- Progress logging and checkpoints
- Claim/release for exclusive access
- Agent handoff protocol

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
