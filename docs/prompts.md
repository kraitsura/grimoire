# Prompt Management

Store, version, and organize your prompt library.

---

## Creating Prompts

```bash
grimoire <name>                    # Opens editor (vim by default)
grimoire <name> -c "content"       # Set content directly
grimoire <name> -p                 # Create from clipboard
grimoire <name> -i                 # Use Ink editor
grimoire <name> --template         # Mark as template
```

## Listing & Searching

```bash
grimoire list                      # List all prompts
grimoire list -t "tag1,tag2"       # Filter by tags
grimoire list -s "query"           # Search
grimoire list --sort name          # Sort: name|created|updated
grimoire list -n 50                # Limit results

grimoire search "query"            # Full-text search
grimoire search --fuzzy "query"    # Fuzzy matching
grimoire search --from 2024-01-01  # Date filter
```

## Viewing & Copying

```bash
grimoire show <name>               # Show with metadata
grimoire show <name> -r            # Raw content only
grimoire show <name> --json        # JSON output

grimoire copy <name>               # Copy to clipboard
```

## Editing

```bash
grimoire <name>                    # Edit existing prompt
grimoire <name> --name new-name    # Rename
grimoire <name> --add-tag foo      # Add tag
grimoire <name> --remove-tag bar   # Remove tag
```

## Deleting

```bash
grimoire rm <name>
grimoire delete <name>             # Alias
```

---

## Version Control

### History

```bash
grimoire versions <name>           # List versions
grimoire history <name>            # Show edit history
grimoire rollback <name> <version> # Restore version
```

### Branching

```bash
grimoire branch <name> list                    # List branches
grimoire branch <name> create <branch>         # Create branch
grimoire branch <name> switch <branch>         # Switch branch
grimoire branch <name> compare <a> <b>         # Compare
grimoire branch <name> merge <source> [target] # Merge
grimoire branch <name> delete <branch>         # Delete
```

---

## Tags

```bash
grimoire tag add <prompt> <tag>    # Add to prompt
grimoire tag remove <prompt> <tag> # Remove from prompt
grimoire tag list                  # List all with counts
grimoire tag rename <old> <new>    # Rename globally
```

---

## Chains

Chain multiple prompts into workflows with variable substitution.

```bash
grimoire chain list                # List chains
grimoire chain show <name>         # View details
grimoire chain create <name>       # Create (opens editor)
grimoire chain validate <name>     # Validate
grimoire chain delete <name>       # Delete

# Execute
grimoire chain run <name>
grimoire chain run <name> --var key=value
grimoire chain run <name> --dry-run
grimoire chain run <name> --verbose
```

---

## Organization

### Favorites & Pins

```bash
grimoire favorite <name>           # Toggle favorite
grimoire pin <name>                # Toggle pin
```

### Aliases

```bash
grimoire alias                     # Manage aliases
```

### Archive

```bash
grimoire archive <name>            # Archive prompt
```

### Templates

```bash
grimoire templates                 # List templates
```

---

## Import & Export

### Export

```bash
grimoire export                         # JSON to stdout
grimoire export -o prompts.json         # To file
grimoire export -f yaml                 # YAML format
grimoire export --tags "important"      # Filter
grimoire export --include-history       # With versions
```

### Import

```bash
grimoire import prompts.json
grimoire import data.yaml
grimoire import file.json --on-conflict skip    # skip|rename|overwrite
grimoire import file.json --dry-run             # Preview
```

---

## Stash

Save clipboard contents to a stack.

```bash
grimoire stash                     # Stash clipboard
grimoire stash my-snippet          # Named stash
grimoire stash -l                  # List
grimoire stash --clear             # Clear all

grimoire pop                       # Pop to clipboard
grimoire pop my-snippet            # Pop specific
grimoire pop -p                    # Peek without removing
grimoire pop --stdout              # Output to stdout
```

---

## Utilities

```bash
grimoire stats                     # Usage statistics
grimoire stats <name>              # Per-prompt stats
grimoire reindex                   # Rebuild search index
grimoire format <name>             # Format prompt
```
