# Plugins & Agents

Extend grimoire with marketplace plugins and scaffold custom agent definitions.

---

## Plugins

### Concepts

Plugins provide:
- CLI tools
- MCP servers
- Hooks
- Commands

Unlike skills (which inject instructions), plugins add functionality.

### Commands

```bash
grimoire plugins add <source>              # Add marketplace
grimoire plugins install <name>            # Install plugin
grimoire plugins list                      # List installed
grimoire plugins info <name>               # Plugin details
grimoire plugins uninstall <name>          # Uninstall
```

### Marketplaces

```bash
grimoire plugins marketplace list          # List marketplaces
grimoire plugins marketplace remove        # Remove marketplace
```

### Scope

Install at user or project scope:

```bash
grimoire plugins install <name> --user     # ~/.claude/
grimoire plugins install <name> --project  # .claude/
```

---

## Agents

Scaffold and manage custom agent definitions.

### Create

```bash
grimoire agents create <name>              # Scaffold agent
grimoire agents create <name> --cli <tool> # With CLI tool
```

### Manage

```bash
grimoire agents list                       # List agents
grimoire agents enable <name>              # Enable
grimoire agents disable <name>             # Disable
grimoire agents info <name>                # Details
grimoire agents validate <name>            # Validate
```
