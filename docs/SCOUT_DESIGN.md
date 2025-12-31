# grim scout - Parallel Cognition Primitive

## Overview

`grim scout` spawns lightweight, read-only exploration agents that run in the background. Unlike `grim spawn` which creates isolated worktrees for code changes, scouts are designed for **parallel cognition** - exploring ahead while the main agent continues working.

## Core Concept

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Agent                              │
│                                                              │
│  "I need to understand the auth system..."                   │
│                    │                                         │
│                    ▼                                         │
│  grim scout auth-patterns "How does auth work in this repo?" │
│                    │                                         │
│                    ├──────────────────────┐                  │
│                    │                      │                  │
│                    ▼                      ▼                  │
│          [Main agent continues]    [Scout explores]          │
│          [working on other task]   [stores findings]         │
│                    │                      │                  │
│                    │                      ▼                  │
│                    │              grim scout show auth       │
│                    │                      │                  │
│                    ◄──────────────────────┘                  │
│                    │                                         │
│          [Main agent retrieves scout findings]               │
└─────────────────────────────────────────────────────────────┘
```

## Key Differences from `grim spawn`

| Aspect | `grim spawn` | `grim scout` |
|--------|-------------|--------------|
| **Purpose** | Execute code changes | Explore/research |
| **Isolation** | Full worktree | Shared codebase (read-only) |
| **Output** | Git commits | Structured findings |
| **Lifecycle** | Long-running | Quick exploration |
| **Tools** | All tools | Read-only tools only |
| **SRT Config** | Write access | Read-only + network |

## CLI Design

### Spawn a Scout

```bash
# Basic usage
grim scout <name> "<question>"

# Examples
grim scout auth-flow "How does authentication work in this codebase?"
grim scout test-patterns "What testing patterns are used? Show examples."
grim scout api-structure "Map out the API endpoints and their handlers"

# Options
grim scout <name> "<question>" [options]
  --depth <level>     Exploration depth: shallow|medium|deep (default: medium)
  --focus <path>      Focus exploration on specific directory
  --timeout <seconds> Max exploration time (default: 120)
  --model <name>      Model to use: haiku|sonnet|opus (default: haiku)
```

### Check Scout Status

```bash
# List all scouts
grim scout list
grim scout ls

# Output:
# NAME           STATUS    STARTED       QUESTION
# auth-flow      done      2 min ago     How does authentication work...
# test-patterns  running   30 sec ago    What testing patterns...
# api-structure  pending   just now      Map out the API endpoints...

# Watch scouts in real-time
grim scout watch
```

### Retrieve Scout Findings

```bash
# Show findings
grim scout show <name>

# Output:
# ══════════════════════════════════════════════════════════════
# Scout: auth-flow
# Status: completed (45s)
# Question: How does authentication work in this codebase?
# ══════════════════════════════════════════════════════════════
#
# ## Summary
# The codebase uses JWT-based authentication with refresh tokens...
#
# ## Key Files
# - src/auth/jwt-service.ts - JWT generation and validation
# - src/middleware/auth.ts - Express middleware for protected routes
# - src/routes/auth.ts - Login/logout endpoints
#
# ## Code Patterns
# ```typescript
# // Authentication middleware pattern
# export const requireAuth = async (req, res, next) => { ... }
# ```
#
# ## Related Areas
# - Session management in src/services/session.ts
# - Rate limiting for auth endpoints

# Get raw JSON for programmatic use
grim scout show <name> --json

# Get just the summary
grim scout show <name> --summary
```

### Manage Scouts

```bash
# Cancel a running scout
grim scout cancel <name>

# Clear completed scouts
grim scout clear
grim scout clear --all  # Include running

# Re-run a scout with same question
grim scout retry <name>
```

## Storage Design

### Directory Structure

```
.grim/
└── scouts/
    ├── state.json           # Scout registry
    └── findings/
        ├── auth-flow.json
        ├── test-patterns.json
        └── api-structure.json
```

### State Schema

```typescript
// .grim/scouts/state.json
interface ScoutState {
  version: 1;
  scouts: Record<string, ScoutEntry>;
}

interface ScoutEntry {
  name: string;
  question: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  pid?: number;
  startedAt: string;
  completedAt?: string;
  options: {
    depth: "shallow" | "medium" | "deep";
    focus?: string;
    timeout: number;
    model: string;
  };
}
```

### Findings Schema

```typescript
// .grim/scouts/findings/<name>.json
interface ScoutFindings {
  name: string;
  question: string;
  exploredAt: string;
  duration: number; // seconds

  summary: string;

  keyFiles: Array<{
    path: string;
    relevance: string;
  }>;

  codePatterns: Array<{
    description: string;
    example: string;
    location: string;
  }>;

  relatedAreas: Array<{
    path: string;
    description: string;
  }>;

  rawNotes?: string; // Full exploration log for deep dives
}
```

## Implementation

### Scout Service

```typescript
// src/services/scout/scout-service.ts
import { Context, Effect, Layer } from "effect";

export interface ScoutService {
  spawn(name: string, question: string, options: ScoutOptions): Effect<ScoutEntry>;
  list(): Effect<ScoutEntry[]>;
  show(name: string): Effect<ScoutFindings>;
  cancel(name: string): Effect<void>;
  clear(includeRunning?: boolean): Effect<void>;
  waitFor(name: string, timeout?: number): Effect<ScoutFindings>;
}

export const ScoutService = Context.Tag<ScoutService>("ScoutService");
```

### Scout Command

```typescript
// src/commands/scout.ts
import { Effect } from "effect";
import { spawn } from "child_process";
import type { ParsedArgs } from "../cli/parser";

export const scoutCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0];

    switch (subcommand) {
      case "list":
      case "ls":
        return yield* listScouts();
      case "show":
        return yield* showScout(args.positional[1]);
      case "cancel":
        return yield* cancelScout(args.positional[1]);
      case "clear":
        return yield* clearScouts(args.flags.all === true);
      case "watch":
        return yield* watchScouts();
      case "retry":
        return yield* retryScout(args.positional[1]);
      default:
        // Default: spawn a scout
        // grim scout <name> "<question>"
        return yield* spawnScout(
          args.positional[0],  // name
          args.positional[1],  // question
          parseScoutOptions(args.flags)
        );
    }
  });
```

### Scout Prompt Template

The scout agent receives a specialized system prompt:

```typescript
const scoutSystemPrompt = (question: string, options: ScoutOptions) => `
You are a Scout agent - a lightweight exploration assistant.

## Your Mission
${question}

## Constraints
- You are READ-ONLY. Do not modify any files.
- Focus on understanding, not changing.
- Be concise but thorough.
- Time limit: ${options.timeout} seconds

## Output Format
Produce structured findings in this exact format:

### Summary
[2-3 sentence overview of what you found]

### Key Files
[List the most relevant files with one-line descriptions]

### Code Patterns
[Show 1-3 code examples that answer the question]

### Related Areas
[Other parts of the codebase worth exploring]

## Allowed Tools
- Read: Read file contents
- Glob: Find files by pattern
- Grep: Search file contents
- Bash: Only for \`ls\`, \`tree\`, \`wc\` (read-only commands)

Begin exploration now.
`;
```

### SRT Configuration for Scouts

Scouts get a restricted sandbox configuration:

```typescript
const scoutSrtConfig = (projectPath: string): SrtConfig => ({
  filesystem: {
    // Read-only access to project
    allowedReadPaths: [projectPath, "/tmp"],
    allowedWritePaths: [
      // Only allow writing to scout output
      `${projectPath}/.grim/scouts`,
      "/tmp",
    ],
    denyReadPaths: ["~/.ssh", "~/.aws", "~/.gnupg"],
    denyWritePaths: ["*"], // Deny all except explicitly allowed
  },
  network: {
    allowedDomains: [
      "api.anthropic.com",
      // No npm, no github - scouts don't install or fetch
    ],
  },
});
```

## Usage Patterns

### Pattern 1: Ahead-of-Time Exploration

```bash
# Main agent is about to work on auth
# Spawn scout to explore while planning

grim scout auth-deep "Analyze the authentication system thoroughly.
What are the key components, flows, and potential issues?"

# Continue planning...

# Later, retrieve findings
grim scout show auth-deep
```

### Pattern 2: Parallel Context Gathering

```bash
# Spawn multiple scouts for different aspects
grim scout frontend "What frontend framework and patterns are used?"
grim scout backend "How is the backend API structured?"
grim scout database "What database and ORM patterns are used?"

# Wait for all to complete
grim scout watch

# Retrieve all findings
grim scout show frontend
grim scout show backend
grim scout show database
```

### Pattern 3: Quick Lookups

```bash
# Fast, shallow explorations
grim scout imports --depth shallow "Where is lodash imported?"
grim scout env-vars --depth shallow "What environment variables are used?"
```

### Pattern 4: Focused Deep Dives

```bash
# Deep exploration of specific area
grim scout perf-issues --depth deep --focus src/api \
  "Identify potential performance issues in the API layer"
```

## Integration with Main Agent

The main agent can use scouts programmatically:

```typescript
// In agent code
const scoutResult = await Effect.runPromise(
  scoutService.spawn("quick-lookup", "Find all API routes", { depth: "shallow" })
);

// Continue other work...

// Later retrieve findings
const findings = await Effect.runPromise(
  scoutService.waitFor("quick-lookup", 60_000)
);

console.log(findings.summary);
```

## Cost Considerations

- Scouts use **haiku** by default (fast, cheap)
- Shallow explorations: ~$0.001-0.005
- Medium explorations: ~$0.01-0.05
- Deep explorations: ~$0.05-0.20

## Future Enhancements

1. **Scout Chains**: Scouts that spawn sub-scouts for deeper exploration
2. **Scout Cache**: Reuse findings for similar questions
3. **Scout Collaboration**: Multiple scouts working on related questions
4. **Scout Summaries**: Aggregate findings from multiple scouts
5. **Scout Hooks**: Trigger actions when scouts complete

## File Structure

```
src/
├── commands/
│   └── scout.ts                 # CLI command handler
├── services/
│   └── scout/
│       ├── index.ts
│       ├── scout-service.ts     # Core service
│       ├── scout-state-service.ts
│       └── scout-prompt.ts      # Prompt templates
└── models/
    └── scout.ts                 # Type definitions
```
