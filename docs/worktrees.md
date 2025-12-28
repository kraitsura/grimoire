# Worktree Management

Manage git worktrees for parallel development with AI agent integration.

---

## Concepts

### What are Worktrees?

Git worktrees allow multiple working directories from a single repository. Grimoire extends this with:

- Issue linking
- Progress tracking
- Agent claiming and handoff
- Session spawning

### Use Cases

- Parallel feature development
- Multiple Claude sessions on different branches
- Agent coordination on complex tasks

---

## Commands

### Create Worktrees

```bash
grimoire wt new <branch>                   # Create worktree
grimoire wt new <branch> -b                # Create branch if missing
grimoire wt new <branch> -i <issue>        # Link to issue

grimoire wt from-issue <id>                # Create from issue ID
```

### Spawn Sessions

Launch Claude in a worktree:

```bash
grimoire wt spawn <name>                   # Create + launch session
grimoire wt spawn <name> -p "prompt"       # With initial prompt
grimoire wt spawn <name> --no-sandbox      # Without sandbox
```

### List & Status

```bash
grimoire wt list                           # List worktrees
grimoire wt list --json                    # JSON output
grimoire wt list --stale                   # Show stale worktrees
grimoire wt status                         # Rich status view
grimoire wt -i                             # Interactive dashboard
```

### Navigation

```bash
grimoire wt path <name>                    # Print path (for scripting)
grimoire wt open <name>                    # Open shell in worktree
grimoire wt exec <name> <command>          # Run command in worktree
```

### Batch Operations

```bash
grimoire wt each <command>                 # Run in all worktrees
grimoire wt each <command> --parallel      # Parallel execution
```

---

## Progress Tracking

### Logs

```bash
grimoire wt log <name> "message"           # Add log entry
grimoire wt logs <name>                    # View logs
```

### Checkpoints

```bash
grimoire wt checkpoint                     # Create checkpoint
grimoire wt checkpoint "message"           # With message
grimoire wt checkpoints                    # View history
```

---

## Claiming & Handoff

Coordinate exclusive access between agents.

### Claim

```bash
grimoire wt claim <name>                   # Claim for exclusive work
grimoire wt release <name>                 # Release claim
grimoire wt available                      # List unclaimed
```

### Handoff

Transfer work to another agent:

```bash
grimoire wt handoff <name>                 # Release + notify
grimoire wt handoff <name> --to <agent>    # To specific agent
```

---

## Cleanup

```bash
grimoire wt rm <name>                      # Remove worktree
grimoire wt rm <name> --branch             # Also delete branch
grimoire wt clean                          # Remove stale worktrees
grimoire wt clean --dry-run                # Preview cleanup
```

---

## Configuration

```bash
grimoire wt config                         # View config
grimoire wt config <key> <value>           # Set value
```
