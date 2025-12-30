# grimoire

A prompt engineering toolkit for developers. Store prompts with version control, inject AI agent skills into projects, and manage parallel development with git worktrees.

## Installation

### Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/aaryareddy/grimoire/main/install.sh | bash
```

This script will:
- Check for required dependencies (git, node/bun)
- Use your existing bun or npm if available
- Offer to install bun if neither is found
- Suggest optional dependencies for full functionality

### Package Managers

**Bun (recommended)**
```bash
bun install -g grimoire
```

**npm**
```bash
npm install -g grimoire
```

**pnpm**
```bash
pnpm add -g grimoire
```

### From Source

```bash
git clone https://github.com/aaryareddy/grimoire.git
cd grimoire
bun install
bun run build
bun link
```

### Verify Installation

```bash
grimoire --version
grimoire --help
```

The CLI is available as both `grimoire` and `grim` (short alias).

### Requirements

**Required:**
- **Node.js 18+** or **Bun** - JavaScript runtime
- **git** - Version control

**Optional (for specific features):**

| Dependency | Feature | Install |
|------------|---------|---------|
| [Claude Code](https://claude.ai/claude-code) | Spawn agents in worktrees (`grim wt spawn`) | `npm install -g @anthropic-ai/claude-code` |
| [Beads](https://github.com/steveyegge/beads) | Issue tracking integration (`grim wt from-issue`) | `curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh \| bash` |
| [GitHub CLI](https://cli.github.com) | Create PRs from worktrees (`grim wt pr`) | `brew install gh` or [download](https://cli.github.com) |
| [SRT](https://github.com/anthropic-experimental/sandbox-runtime) | Sandboxed agent execution | `npm install -g @anthropic-ai/sandbox-runtime` |
| bubblewrap, socat | SRT on Linux | `sudo apt install bubblewrap socat` |

---

## Quick Start

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

Add to your `CLAUDE.md` or `AGENTS.md`:

```markdown
## Git Worktrees (grim wt)

Use `grim wt` instead of raw git worktree commands - it handles branch creation, cleanup, and agent coordination automatically.

### Essential Commands
\`\`\`bash
grim wt new <name>                # Create worktree + branch
grim wt list                      # Show all worktrees
grim wt status                    # Rich status view
grim wt rm <name>                 # Remove worktree
cd $(grim wt new -o <name>)       # Create and cd in one step
\`\`\`

### Parallel Agents
When subtasks are independent, run them in parallel:

\`\`\`bash
# Spawn background agents (each gets isolated worktree)
grim wt spawn fix-auth -bg "Fix the authentication bug in login.ts"
grim wt spawn add-tests -bg "Add unit tests for the user service"
grim wt spawn update-docs -bg "Update API documentation"

# Check status anytime
grim wt ps

# When ready, collect all work back
grim wt wait fix-auth add-tests update-docs
grim wt collect fix-auth add-tests update-docs --delete
\`\`\`

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
\`\`\`bash
grim wt logs <name>               # See what agent did
grim wt ps                        # Check if still running
grim wt collect --dry-run         # Preview merge before doing it
grim wt collect --strategy rebase # Try rebase if merge conflicts
\`\`\`
```

**With Beads** (if project has `.beads/`):

```markdown
## Git Worktrees (grim wt)

Use `grim wt` instead of raw git worktree commands - it handles branch creation, cleanup, and agent coordination automatically.

### Essential Commands
\`\`\`bash
grim wt new <name>                # Create worktree + branch
grim wt list                      # Show all worktrees
grim wt status                    # Rich status view
grim wt rm <name>                 # Remove worktree
cd $(grim wt new -o <name>)       # Create and cd in one step
\`\`\`

### Parallel Agents
When subtasks are independent, run them in parallel:

\`\`\`bash
# Spawn background agents (each gets isolated worktree)
grim wt spawn fix-auth -bg "Fix the authentication bug in login.ts"
grim wt spawn add-tests -bg "Add unit tests for the user service"
grim wt spawn update-docs -bg "Update API documentation"

# Check status
grim wt ps

# Collect all work back
grim wt wait fix-auth add-tests update-docs
grim wt collect fix-auth add-tests update-docs --delete
\`\`\`

### With Issue Tracking
Link agents to beads issues for traceability:

\`\`\`bash
# Create tracked subtasks
bd create --title="Fix auth bug" --type=bug --priority=1
bd create --title="Add user service tests" --type=task --priority=2

# Spawn with issue links
grim wt spawn fix-auth -bg "Fix auth bug" -i beads-xxx
grim wt spawn add-tests -bg "Add tests" -i beads-yyy

# After collecting, close issues
bd close beads-xxx beads-yyy
bd sync
\`\`\`

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
\`\`\`bash
grim wt logs <name>               # See what agent did
grim wt ps                        # Check if still running
grim wt collect --dry-run         # Preview merge before doing it
grim wt collect --strategy rebase # Try rebase if merge conflicts
bd show <issue>                   # Check issue context
\`\`\`
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
