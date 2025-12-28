# grimoire

A CLI tool for storing, managing, and testing prompts with full version control, branching, chains, and AI agent integration.

---

## Installation

```bash
bun install -g grimoire
```

## Quick Start

```bash
grimoire                    # Interactive mode (TUI)
grimoire my-prompt          # Create or edit a prompt
grimoire list               # List all prompts
grimoire copy my-prompt     # Copy to clipboard
grimoire search "query"     # Search prompts
```

---

## Commands

### Prompt Management

#### Create & Edit Prompts

```bash
grimoire <name>                    # Create/edit prompt (opens editor)
grimoire <name> -c "content"       # Set content directly
grimoire <name> -p                 # Create from clipboard
grimoire <name> -t "tag1,tag2"     # Set tags
grimoire <name> -i                 # Use Ink editor instead of vim
grimoire <name> --name new-name    # Rename prompt
grimoire <name> --add-tag foo      # Add single tag
grimoire <name> --remove-tag bar   # Remove single tag
grimoire <name> --template         # Mark as template
```

#### List & Search

```bash
grimoire list                      # List all prompts
grimoire list -t "tag1,tag2"       # Filter by tags
grimoire list -s "query"           # Search in list
grimoire list --sort name          # Sort by name|created|updated
grimoire list -n 50                # Limit results

grimoire search "query"            # Full-text search
grimoire search "query" -t "tags"  # Filter by tags
grimoire search --fuzzy "query"    # Fuzzy matching
grimoire search --from 2024-01-01  # Date range filter
```

#### View & Copy

```bash
grimoire show <name>               # Show prompt with metadata
grimoire show <name> -r            # Raw content only
grimoire show <name> --json        # JSON output

grimoire copy <name>               # Copy to clipboard
```

#### Delete

```bash
grimoire rm <name>                 # Delete prompt
grimoire delete <name>             # Alias for rm
```

---

### Version Control

Prompts support full version history with branching and rollback.

#### History & Versions

```bash
grimoire versions <name>           # List all versions
grimoire history <name>            # Show edit history
grimoire rollback <name> <version> # Rollback to version
```

#### Branching

```bash
grimoire branch <name> list                    # List branches
grimoire branch <name> create <branch>         # Create branch
grimoire branch <name> switch <branch>         # Switch to branch
grimoire branch <name> compare <a> <b>         # Compare branches
grimoire branch <name> merge <source> [target] # Merge (default: main)
grimoire branch <name> delete <branch>         # Delete branch
```

---

### Tags

```bash
grimoire tag add <prompt> <tag>    # Add tag to prompt
grimoire tag remove <prompt> <tag> # Remove tag
grimoire tag list                  # List all tags with counts
grimoire tag rename <old> <new>    # Rename tag globally
```

---

### Chains (Prompt Workflows)

Chains allow sequencing multiple prompts with variable substitution.

```bash
grimoire chain list                # List all chains
grimoire chain show <name>         # Show chain details
grimoire chain create <name>       # Create chain (opens editor)
grimoire chain delete <name>       # Delete chain
grimoire chain validate <name>     # Validate chain definition

# Execute chain
grimoire chain run <name>
grimoire chain run <name> --var key=value     # Set variables
grimoire chain run <name> --dry-run           # Preview execution
grimoire chain run <name> --verbose           # Detailed output
```

---

### Testing & Benchmarking

Test prompts against LLM providers directly from the CLI.

#### Test Prompt

```bash
grimoire test <name>                    # Test with default provider
grimoire test <name> -m gpt-4           # Specify model
grimoire test <name> -p anthropic       # Provider: openai|anthropic|ollama
grimoire test <name> --temperature 0.5  # Set temperature (0-2)
grimoire test <name> --max-tokens 2048  # Max output tokens
grimoire test <name> --vars '{"x":"y"}' # Pass variables as JSON
grimoire test <name> --no-stream        # Disable streaming
grimoire test <name> --save             # Save result to history
grimoire test <name> -i                 # Interactive mode
```

#### Cost Estimation

```bash
grimoire cost <name>                    # Estimate token costs
```

#### Benchmarking

```bash
grimoire benchmark <file>               # Run test suite from file
grimoire compare <prompt1> <prompt2>    # A/B test prompts
```

---

### Export & Import

```bash
# Export
grimoire export                         # Export to stdout (JSON)
grimoire export -o prompts.json         # Export to file
grimoire export -f yaml                 # YAML format
grimoire export --tags "important"      # Filter by tags
grimoire export --all                   # Include all prompts
grimoire export --include-history       # Include version history

# Import
grimoire import prompts.json                    # Import from file
grimoire import data.yaml                       # YAML support
grimoire import file.json --on-conflict skip    # skip|rename|overwrite
grimoire import file.json --dry-run             # Preview without importing
```

---

### Stash (Clipboard Stack)

Save clipboard contents to a stack for later use.

```bash
grimoire stash                     # Stash current clipboard
grimoire stash my-snippet          # Stash with name
grimoire stash -l                  # List stashed items
grimoire stash --clear             # Clear all stashed items

grimoire pop                       # Pop to clipboard
grimoire pop my-snippet            # Pop specific item
grimoire pop -p                    # Peek without removing
grimoire pop --stdout              # Output to stdout
```

---

### Favorites & Pinning

```bash
grimoire favorite                  # Manage favorites
grimoire favorite <name>           # Toggle favorite

grimoire pin                       # Manage pinned prompts
grimoire pin <name>                # Toggle pin
```

---

### Aliases

```bash
grimoire alias                     # Manage aliases
```

---

### Archive

```bash
grimoire archive <name>            # Archive a prompt
```

---

### Templates

```bash
grimoire templates                 # List available templates
grimoire <name> --template         # Mark prompt as template
```

---

### Formatting

```bash
grimoire format                    # Format all prompts
grimoire format <name>             # Format specific prompt
```

---

### Statistics

```bash
grimoire stats                     # Show usage statistics
grimoire stats <name>              # Stats for specific prompt

grimoire reindex                   # Rebuild search index
```

---

## Skills System

Skills are reusable AI agent capabilities that inject documentation and context into agent system prompts. Skills are stored as `SKILL.md` files with YAML frontmatter.

### Initialize

```bash
grimoire skills init                     # Auto-detect agent type
grimoire skills init --agent=claude_code # Explicit agent type
grimoire skills init --agent=opencode
grimoire skills init --agent=cursor
grimoire skills init --agent=codex
grimoire skills init --agent=aider
grimoire skills init --agent=amp
```

### Add Skills

```bash
grimoire skills add github:owner/repo           # From GitHub
grimoire skills add github:owner/repo@v1.0.0    # Specific version
grimoire skills add github:owner/repo#subdir    # Subdirectory
grimoire skills add ./local-skill               # Local path
grimoire skills add <source> --force            # Force re-add
grimoire skills add <source> --no-validate      # Skip validation
```

### Enable & Disable

```bash
grimoire skills enable <name>              # Enable skill
grimoire skills enable skill1 skill2       # Multiple skills
grimoire skills enable <name> -y           # Auto-confirm
grimoire skills enable <name> --no-deps    # Skip CLI dependencies
grimoire skills enable <name> --no-init    # Skip init commands
grimoire skills enable <name> -g           # Install globally
grimoire skills enable <name> -l           # Symlink from global

grimoire skills disable <name>             # Disable skill
grimoire skills disable <name> --purge     # Remove project artifacts
grimoire skills disable <name> -y          # Skip confirmation
```

### Install (Add + Enable)

```bash
grimoire skills install github:owner/repo          # One command install
grimoire skills install <source> --target <name>   # Custom target name
```

### List & Info

```bash
grimoire skills list                 # All cached skills
grimoire skills list --enabled       # Enabled in current project
grimoire skills info <name>          # Detailed skill info
grimoire skills search <query>       # Search GitHub for skills
```

### Update & Sync

```bash
grimoire skills update <name> --trigger "..."      # Update trigger description
grimoire skills update <name> --allowed-tools "..."# Update allowed tools
grimoire skills update <name> --description "..."  # Update description

grimoire skills sync                 # Update all enabled skills
grimoire skills sync -y              # Skip confirmation
```

### Validate & Doctor

```bash
grimoire skills validate <name>      # Validate against agentskills.io spec
grimoire skills validate ./path      # Validate local skill
grimoire skills validate . --json    # JSON output

grimoire skills doctor               # Diagnose issues
grimoire skills doctor --fix         # Auto-fix issues
```

---

## Agents System

Scaffold and manage AI agent definitions.

```bash
grimoire agents create <name>              # Create agent scaffold
grimoire agents create <name> --cli <tool> # With CLI tool
grimoire agents list                       # List agents
grimoire agents enable <name>              # Enable agent
grimoire agents disable <name>             # Disable agent
grimoire agents info <name>                # Show agent details
grimoire agents validate <name>            # Validate definition
```

---

## Plugins System

Install and manage plugins from marketplaces.

```bash
grimoire plugins add <source>              # Add marketplace
grimoire plugins install <name>            # Install plugin
grimoire plugins list                      # List installed
grimoire plugins info <name>               # Plugin details
grimoire plugins uninstall <name>          # Uninstall

grimoire plugins marketplace list          # List marketplaces
grimoire plugins marketplace remove        # Remove marketplace

# Scope options
grimoire plugins install <name> --user     # User scope (~/.claude/)
grimoire plugins install <name> --project  # Project scope (.claude/)
```

---

## Git Worktree Management

Manage git worktrees with AI agent integration for parallel development.

### Create Worktrees

```bash
grimoire wt new <branch>                   # Create worktree
grimoire wt new <branch> -b                # Create branch if missing
grimoire wt new <branch> -i <issue>        # Link to issue

grimoire wt spawn <name>                   # Create + launch Claude session
grimoire wt spawn <name> -p "prompt"       # With initial prompt
grimoire wt spawn <name> --no-sandbox      # Without sandbox

grimoire wt from-issue <id>                # Create from issue ID
```

### List & Status

```bash
grimoire wt list                           # List worktrees
grimoire wt list --json                    # JSON output
grimoire wt list --stale                   # Show stale worktrees
grimoire wt status                         # Rich status with claims/logs
grimoire wt -i                             # Interactive TUI dashboard
```

### Navigation & Execution

```bash
grimoire wt path <name>                    # Print path (for scripting)
grimoire wt open <name>                    # Open shell in worktree
grimoire wt exec <name> <command>          # Execute command in worktree
grimoire wt each <command>                 # Run in all worktrees
grimoire wt each <command> --parallel      # Parallel execution
```

### Progress Tracking

```bash
grimoire wt log <name> "message"           # Add progress log
grimoire wt logs <name>                    # View logs

grimoire wt checkpoint                     # Create git checkpoint
grimoire wt checkpoint "message"           # With message
grimoire wt checkpoints                    # View history
```

### Claiming & Handoff

```bash
grimoire wt claim <name>                   # Claim for exclusive work
grimoire wt release <name>                 # Release claim
grimoire wt handoff <name>                 # Release + notify
grimoire wt handoff <name> --to <agent>    # Handoff to specific agent
grimoire wt available                      # List unclaimed worktrees
```

### Cleanup

```bash
grimoire wt rm <name>                      # Remove worktree
grimoire wt rm <name> --branch             # Also delete branch
grimoire wt clean                          # Remove stale worktrees
grimoire wt clean --dry-run                # Preview cleanup
```

### Configuration

```bash
grimoire wt config                         # View config
grimoire wt config <key> <value>           # Set config value
```

---

## Configuration

### LLM Providers

```bash
grimoire config llm list                   # List providers
grimoire config llm add openai             # Add/update API key
grimoire config llm add anthropic
grimoire config llm add google
grimoire config llm add ollama
grimoire config llm test <provider>        # Test connection
grimoire config llm remove <provider>      # Remove provider
```

API keys are stored in `~/.grimoire/.env` with secure permissions (0600).

### Shell Completions

```bash
grimoire completion bash                   # Bash completions
grimoire completion zsh                    # Zsh completions
grimoire completion fish                   # Fish completions
```

---

## Sync

Git-based remote synchronization for prompts.

```bash
grimoire sync                              # Sync with remote
grimoire sync --setup                      # Configure remote
grimoire sync --status                     # Show sync status
grimoire sync --push                       # Force push
grimoire sync --pull                       # Force pull
```

---

## Dotfile Browser

```bash
grimoire dot                               # Browse dotfiles (TUI)
grimoire dot ~/.config                     # Browse specific path
```

---

## Storage

| Location | Purpose |
|----------|---------|
| `~/.grimoire/prompts.json` | Prompt database |
| `~/.grimoire/config.json` | Configuration |
| `~/.grimoire/.env` | API keys (0600 permissions) |
| `.grimoire/skills-state.json` | Project skills state |
| `.claude/skills/` | Enabled skills (Claude Code) |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Language | TypeScript |
| CLI Framework | Ink (React for CLI) |
| FP Library | Effect |
| Validation | @effect/schema |
| Token Counting | js-tiktoken |
| LLM Providers | OpenAI, Anthropic, Google Gemini, Ollama |

---

## Global Options

```bash
grimoire -h, --help        # Show help
grimoire -v, --version     # Show version
grimoire -i, --interactive # Interactive mode
grimoire <cmd> --verbose   # Verbose output
grimoire <cmd> --quiet     # Quiet mode
```

---

## License

MIT
