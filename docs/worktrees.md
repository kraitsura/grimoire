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
grimoire wt new <branch>                   # Create worktree (auto-creates branch)
grimoire wt new <branch> -i <issue>        # Link to issue
grimoire wt new <branch> --no-create       # Error if branch doesn't exist

# Shell integration - create and cd into worktree
cd $(grimoire wt new -o <branch>)

grimoire wt from-issue <id>                # Create from issue ID
```

The `-o` / `--output-path` flag outputs only the path, enabling shell integration for creating and immediately switching to a worktree.

### Spawn Sessions

Launch Claude in a worktree:

```bash
grimoire wt spawn <name>                   # Create + launch interactive session
grimoire wt spawn <name> -p "prompt"       # With initial prompt
grimoire wt spawn <name> --new-tab         # Open in new terminal tab
```

#### Background Agents

For parallel work, use the `-bg` / `--background` flag (combines `-H --srt`):

```bash
grimoire wt spawn task-1 -bg "Fix the login bug"
grimoire wt spawn task-2 -bg "Add unit tests"
grimoire wt spawn task-3 -bg "Update documentation"
```

This creates sandboxed headless agents that run in parallel. Monitor with:

```bash
grimoire wt ps                             # List running agents
grimoire wt logs <name>                    # View agent output
```

#### Headless Mode Options

For granular control over headless agents:

```bash
grimoire wt spawn <name> -H --srt          # Headless with sandbox (same as -bg)
grimoire wt spawn <name> -H --dangerously-skip-permissions  # No sandbox
grimoire wt spawn <name> --no-sandbox      # Disable sandbox (debugging)
```

#### Using Existing Worktrees

Spawn works with existing worktrees - it will deploy an agent to them instead of erroring:

```bash
grimoire wt new my-feature                 # Create worktree manually
# ... do some work ...
grimoire wt spawn my-feature -bg "Continue the implementation"
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

## Agent Coordination

### Wait for Agents

Block until background agents complete:

```bash
grimoire wt wait                           # Wait for all children (in spawned context)
grimoire wt wait task-1 task-2             # Wait for specific worktrees
grimoire wt wait --any                     # Wait for any one to complete
grimoire wt wait --timeout 300             # Timeout after 5 minutes
```

Works with both agent-spawned worktrees and manually created ones. Manually created worktrees (via `wt new`) without agents are considered immediately complete.

### Collect Work

Merge completed worktrees back to current branch:

```bash
grimoire wt collect                        # Collect children (in spawned context)
grimoire wt collect task-1 task-2          # Collect specific worktrees
grimoire wt collect --dry-run              # Preview what would be merged
grimoire wt collect --strategy squash      # Squash commits
grimoire wt collect --delete               # Delete worktrees after merge
```

Strategies:
- `merge` (default) - Standard git merge
- `rebase` - Rebase onto current branch
- `squash` - Squash all commits into one

Explicitly specified worktrees without running agents are treated as ready to collect.

### View Children

```bash
grimoire wt children                       # List worktrees spawned from current
grimoire wt ps                             # List all running agents
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
