# Configuration

Global settings, LLM providers, sync, and shell completions.

---

## LLM Providers

### Add Provider

```bash
grimoire config llm add openai
grimoire config llm add anthropic
grimoire config llm add google
grimoire config llm add ollama
```

Prompts for API key and stores in `~/.grimoire/.env` with secure permissions.

### List Providers

```bash
grimoire config llm list
```

### Test Connection

```bash
grimoire config llm test <provider>
```

### Remove Provider

```bash
grimoire config llm remove <provider>
```

---

## Remote Sync

Sync prompts across machines using git.

```bash
grimoire sync                    # Sync with remote
grimoire sync --setup            # Configure remote
grimoire sync --status           # Show status
grimoire sync --push             # Force push
grimoire sync --pull             # Force pull
```

---

## Shell Completions

Generate completions for your shell:

```bash
grimoire completion bash >> ~/.bashrc
grimoire completion zsh >> ~/.zshrc
grimoire completion fish > ~/.config/fish/completions/grimoire.fish
```

---

## Dotfile Browser

Browse and edit dotfiles with the TUI:

```bash
grimoire dot                     # Browse dotfiles
grimoire dot ~/.config           # Specific path
```

---

## Storage Locations

| Path | Purpose |
|------|---------|
| `~/.grimoire/prompts.json` | Prompt database |
| `~/.grimoire/config.json` | Configuration |
| `~/.grimoire/.env` | API keys (0600) |
| `.grimoire/skills-state.json` | Project skills |
| `.claude/skills/` | Enabled skills |

---

## Global Options

Available on all commands:

```bash
-h, --help        # Show help
-v, --version     # Show version
-i, --interactive # Interactive mode
--verbose         # Verbose output
--quiet           # Quiet mode
```
