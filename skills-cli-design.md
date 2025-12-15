# Skills CLI — Design Document

> A model-agnostic, provider-agnostic skills manager for CLI coding agents.

**Target Agents:** Claude Code, OpenCode  
**Implementation Language:** Rust  
**Version:** 0.1.0 (MVP)

---

## Table of Contents

1. [Vision & Goals](#vision--goals)
2. [Design Principles](#design-principles)
3. [Architecture](#architecture)
4. [Data Model](#data-model)
5. [File System Layout](#file-system-layout)
6. [Core Workflows](#core-workflows)
7. [CLI Interface](#cli-interface)
8. [Skill Types](#skill-types)
9. [Agent Integrations](#agent-integrations)
10. [Edge Cases & Error Handling](#edge-cases--error-handling)
11. [Security Considerations](#security-considerations)
12. [Future Considerations](#future-considerations)

---

## Vision & Goals

### The Problem

Coding agents suffer from context amnesia. Every session starts cold. Developers:

- Manually maintain prompt snippets that "work"
- Have no standard way to share effective patterns
- Repeat the same context setup across projects
- Can't leverage community knowledge

### The Solution

A package manager for agent context. Install battle-tested prompts, share team conventions, auto-detect project needs.

```
skills init        →  Instant project-aware agent setup
skills enable X    →  One command to add capabilities
skills disable X   →  Clean removal when not needed
```

### Success Criteria

1. **Zero to productive in 30 seconds** — `skills init` should make any agent immediately effective
2. **No lock-in** — Skills are just markdown files; works without the tool
3. **Community-driven** — Easy to share, discover, and contribute skills
4. **Agent-agnostic** — Same skills work across Claude Code, OpenCode, and future agents

---

## Design Principles

### 1. Files Are The Interface

Skills are markdown files. The tool just manages where they live.

```
Enable  = copy/inject file
Disable = remove file
```

No database. No daemon. No magic. If the tool disappears, your skills are still there as readable markdown.

### 2. Leverage Existing Infrastructure

- **GitHub as registry** — No custom registry infrastructure
- **Agent CLIs** — Use `claude plugin` commands directly
- **Standard locations** — XDG dirs, `.claude/`, `AGENTS.md`

### 3. Explicit Over Implicit

- Skills must be explicitly enabled per-project
- No global "always on" that surprises users
- Clear separation: cached ≠ enabled

### 4. Graceful Degradation

- Missing CLI dependencies → warn, continue
- Network offline → use cache
- Malformed skill.yaml → fall back to prompt-only
- Unknown agent → use generic AGENTS.md

### 5. Idempotent Operations

Running the same command twice should be safe:

```bash
skills enable beads  # Enables beads
skills enable beads  # No-op, already enabled
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         skills CLI                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Source    │  │    Skill    │  │    Agent    │              │
│  │   Manager   │  │    Engine   │  │   Adapters  │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     State Manager                           ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │    File System      │
                    │  ~/.skills/         │
                    │  .claude/           │
                    │  CLAUDE.md          │
                    │  AGENTS.md          │
                    └─────────────────────┘
```

### Components

| Component | Responsibility |
|-----------|----------------|
| **Source Manager** | Fetch skills from GitHub, manage cache |
| **Skill Engine** | Parse skill.yaml, resolve dependencies, orchestrate enable/disable |
| **Agent Adapters** | Agent-specific logic (Claude Code, OpenCode) |
| **State Manager** | Track enabled skills per project, handle config |

---

## Data Model

### Skill Manifest (skill.yaml)

```yaml
# Required
name: string              # Unique identifier (lowercase, hyphens)
version: string           # Semver
description: string       # One-line description

# Optional metadata
tags: string[]            # For search/discovery
author: string            # GitHub username or org
license: string           # SPDX identifier
repository: string        # Source repository URL

# Skill type determines behavior
type: prompt | plugin | mcp | tool

# CLI dependencies (installed on host)
cli:
  <binary_name>:
    check: string         # Command to verify installation
    install:
      brew: string        # Homebrew package name
      cargo: string       # Cargo package name
      npm: string         # NPM package name
      go: string          # Go install path
      script: string      # Custom install script

# Agent-specific configuration
agents:
  claude_code:
    plugin:
      marketplace: string # GitHub path for marketplace
      name: string        # Plugin name
    mcp:
      command: string     # MCP server command
      args: string[]      # MCP server arguments
      env: object         # Environment variables
    skill_file: bool      # Copy SKILL.md to .claude/skills/
    inject:
      file: string        # Target file (CLAUDE.md)
      content: string     # Content to inject
      
  opencode:
    mcp:
      command: string
      args: string[]
    skill_file: bool
    inject:
      file: string        # Target file (AGENTS.md)
      content: string

# Project initialization
init:
  commands: string[]      # Commands to run on enable
  files: object           # Files to create
  
# Skill content (alternative to SKILL.md file)
prompt: string            # Inline prompt content
```

### State File (~/.skills/state.json)

```json
{
  "version": 1,
  "projects": {
    "/absolute/path/to/project": {
      "agent": "claude_code",
      "enabled": ["beads", "typescript-strict"],
      "disabled_at": {
        "prisma": "2024-01-15T10:00:00Z"
      },
      "initialized_at": "2024-01-10T09:00:00Z",
      "last_sync": "2024-01-15T10:00:00Z"
    }
  }
}
```

### Config File (~/.skills/config.yaml)

```yaml
# User preferences
defaults:
  agent: auto                    # auto | claude_code | opencode
  
# Skills to suggest on init (not auto-enable)
recommended:
  - core/coding-standards
  - core/git-conventions

# Custom sources
sources:
  - github:mycompany/internal-skills
  
# Detection rules (extend built-ins)
detect:
  "supabase/config.toml": supabase
  ".cursorrules": cursor-compat

# Feature flags
features:
  auto_detect: true
  inject_agent_md: true
  color_output: true
```

---

## File System Layout

### Global (~/.skills/)

```
~/.skills/
├── config.yaml              # User configuration
├── state.json               # Project state tracking
├── cache/                   # Downloaded skills
│   ├── beads/
│   │   ├── skill.yaml       # Parsed manifest
│   │   ├── SKILL.md         # Prompt content
│   │   └── README.md        # Documentation
│   ├── nextjs-14/
│   │   ├── skill.yaml
│   │   └── SKILL.md
│   └── .index.json          # Cache metadata
└── logs/                    # Debug logs (optional)
    └── skills.log
```

### Project — Claude Code

```
project/
├── .claude/
│   ├── settings.json        # MCP servers configured here
│   └── skills/              # Enabled skill files
│       ├── nextjs-14.md
│       └── typescript.md
├── CLAUDE.md                # Agent instructions (with managed section)
└── ...
```

### Project — OpenCode

```
project/
├── .opencode/
│   ├── config.json          # OpenCode configuration
│   └── skills/              # Enabled skill files
│       ├── nextjs-14.md
│       └── typescript.md
├── AGENTS.md                # Agent instructions (with managed section)
└── ...
```

### Managed Section Format

```markdown
# CLAUDE.md (or AGENTS.md)

[User's existing content...]

<!-- skills:managed:start -->
<!-- 
  This section is managed by the skills CLI.
  Manual edits will be overwritten.
  Run `skills list` to see enabled skills.
-->

<!-- skill:beads:start -->
## Issue Tracking (beads)

This project uses beads for issue tracking. At session start:
1. Run `bd ready` to see available work
2. Use `bd create` for new issues, not markdown TODOs
3. Run `bd sync` before ending session
<!-- skill:beads:end -->

<!-- skill:typescript-strict:start -->
## TypeScript Conventions

- Strict mode enabled, no `any` types
- Prefer `unknown` over `any` for truly unknown types
- Use type predicates for type narrowing
<!-- skill:typescript-strict:end -->

<!-- skills:managed:end -->

[User's existing content...]
```

---

## Core Workflows

### Workflow 1: First-Time Setup

```
User runs: skills init

┌─────────────────────────────────────────────────────────────────┐
│ 1. DETECT ENVIRONMENT                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Check for existing agent setup:                               │
│   ├── .claude/ exists?           → Claude Code                  │
│   ├── .opencode/ exists?         → OpenCode                     │
│   ├── Both exist?                → Prompt user to choose        │
│   └── Neither?                   → Prompt user to choose        │
│                                                                 │
│   If --agent flag provided, use that instead                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. CREATE DIRECTORY STRUCTURE                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Claude Code:                                                  │
│   ├── mkdir -p .claude/skills                                   │
│   └── touch CLAUDE.md (if not exists)                           │
│                                                                 │
│   OpenCode:                                                     │
│   ├── mkdir -p .opencode/skills                                 │
│   └── touch AGENTS.md (if not exists)                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. ADD MANAGED SECTION TO AGENT MD                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   If managed section markers don't exist:                       │
│   ├── Find end of file (or before final section)                │
│   ├── Insert <!-- skills:managed:start --> marker               │
│   └── Insert <!-- skills:managed:end --> marker                 │
│                                                                 │
│   If markers exist: no-op                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. DETECT PROJECT STACK (optional, if --detect)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Scan for known files:                                         │
│   ├── package.json         → detect node ecosystem              │
│   ├── tsconfig.json        → suggest typescript                 │
│   ├── next.config.*        → suggest nextjs-14                  │
│   ├── prisma/schema.prisma → suggest prisma                     │
│   ├── Cargo.toml           → suggest rust                       │
│   ├── go.mod               → suggest golang                     │
│   └── pyproject.toml       → suggest python                     │
│                                                                 │
│   Output: "Detected: typescript, nextjs, prisma"                │
│   Output: "Run: skills enable typescript nextjs-14 prisma"      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. SAVE STATE                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Update ~/.skills/state.json:                                  │
│   {                                                             │
│     "projects": {                                               │
│       "/path/to/project": {                                     │
│         "agent": "claude_code",                                 │
│         "enabled": [],                                          │
│         "initialized_at": "2024-01-15T10:00:00Z"                │
│       }                                                         │
│     }                                                           │
│   }                                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Edge Cases:**

| Scenario | Handling |
|----------|----------|
| Not in a git repo | Warn but continue; skills work without git |
| No write permission | Error with clear message |
| CLAUDE.md has conflicting markers | Error; ask user to resolve |
| Agent MD file is very large (>100KB) | Warn about context size |
| Running in home directory | Warn; probably not intentional |

---

### Workflow 2: Adding a Skill Source

```
User runs: skills add github:steveyegge/beads

┌─────────────────────────────────────────────────────────────────┐
│ 1. PARSE SOURCE IDENTIFIER                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Supported formats:                                            │
│   ├── github:owner/repo           → GitHub repository           │
│   ├── github:owner/repo@tag       → Specific tag/branch         │
│   ├── github:owner/repo#subdir    → Subdirectory of repo        │
│   ├── ./local/path                → Local directory             │
│   └── https://github.com/...      → Full URL (normalized)       │
│                                                                 │
│   Output: { type: "github", owner, repo, ref, subdir }          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. CHECK CACHE                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   If skill exists in ~/.skills/cache/:                          │
│   ├── --force flag?  → Continue to fetch                        │
│   ├── Otherwise      → "Already cached. Use --force to update"  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. FETCH SKILL                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   For GitHub:                                                   │
│   ├── Try GitHub API first (faster, no git needed)              │
│   │   GET /repos/{owner}/{repo}/contents/{path}                 │
│   │   Download: skill.yaml, SKILL.md, README.md                 │
│   ├── Fallback: shallow git clone                               │
│   │   git clone --depth 1 --filter=blob:none                    │
│   └── If subdir specified, extract only that path               │
│                                                                 │
│   For local:                                                    │
│   └── Symlink or copy to cache                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. VALIDATE SKILL                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Required files (one of):                                      │
│   ├── skill.yaml                  → Full manifest               │
│   ├── SKILL.md                    → Prompt-only skill           │
│   └── README.md + infer           → Fallback (warn)             │
│                                                                 │
│   Validation:                                                   │
│   ├── Parse YAML syntax                                         │
│   ├── Check required fields (name, version, description)        │
│   ├── Validate type is known                                    │
│   └── Warn on unknown fields (forward compat)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. STORE IN CACHE                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ~/.skills/cache/{skill-name}/                                 │
│   ├── skill.yaml                                                │
│   ├── SKILL.md                                                  │
│   ├── README.md                                                 │
│   └── .meta.json    # source URL, fetched_at, version           │
│                                                                 │
│   Update ~/.skills/cache/.index.json                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Edge Cases:**

| Scenario | Handling |
|----------|----------|
| GitHub rate limited | Use git clone fallback; suggest GITHUB_TOKEN |
| Network offline | Error with clear message |
| Repo not found / private | Clear error; suggest checking URL or permissions |
| No skill.yaml or SKILL.md | Treat README.md as prompt content with warning |
| skill.yaml parse error | Show line number; don't cache |
| Name collision with existing | Require --force or rename |
| Skill name has invalid chars | Normalize (uppercase→lower, spaces→hyphens) |

---

### Workflow 3: Enabling a Skill

```
User runs: skills enable beads

┌─────────────────────────────────────────────────────────────────┐
│ 1. RESOLVE SKILL                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Search order:                                                 │
│   ├── Exact match in cache: ~/.skills/cache/beads/              │
│   ├── Fuzzy match: "bead" → suggest "beads"                     │
│   └── Not found: "Skill not found. Run: skills add <source>"    │
│                                                                 │
│   Load skill.yaml and parse                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. CHECK PROJECT STATE                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Is project initialized?                                       │
│   ├── No  → Error: "Run 'skills init' first"                    │
│   └── Yes → Continue                                            │
│                                                                 │
│   Is skill already enabled?                                     │
│   ├── Yes → "Already enabled" (exit 0, idempotent)              │
│   └── No  → Continue                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. INSTALL CLI DEPENDENCIES                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   For each CLI dependency:                                      │
│   ├── Run check command (e.g., "bd --version")                  │
│   ├── If found → Skip                                           │
│   ├── If not found:                                             │
│   │   ├── --yes flag         → Auto-install                     │
│   │   ├── Interactive        → Prompt: "Install bd? [Y/n]"      │
│   │   └── --no-deps flag     → Skip with warning                │
│   │                                                             │
│   │   Install order preference:                                 │
│   │   ├── brew (if on macOS and available)                      │
│   │   ├── cargo (if Rust project or cargo available)            │
│   │   ├── npm (if Node project)                                 │
│   │   └── go (if Go available)                                  │
│   │                                                             │
│   └── Verify installation succeeded                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. AGENT-SPECIFIC SETUP                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Delegate to agent adapter (Claude Code or OpenCode)           │
│   See: Agent Integrations section                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. COPY SKILL FILE                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   If skill has skill_file: true (or is prompt-only):            │
│   ├── Source: ~/.skills/cache/{name}/SKILL.md                   │
│   ├── Dest: .claude/skills/{name}.md (or .opencode/skills/)     │
│   └── Copy with UTF-8 encoding preserved                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. INJECT INTO AGENT MD                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   If skill has inject.content:                                  │
│   ├── Find managed section in CLAUDE.md / AGENTS.md             │
│   ├── Check if skill section already exists                     │
│   │   ├── Exists → Replace content                              │
│   │   └── Not exists → Append within managed section            │
│   ├── Wrap with <!-- skill:{name}:start/end --> markers         │
│   └── Write file atomically (write temp, rename)                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. RUN INIT COMMANDS                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   If skill has init.commands:                                   │
│   ├── Run each command in project directory                     │
│   ├── Capture stdout/stderr                                     │
│   ├── On failure:                                               │
│   │   ├── Show error output                                     │
│   │   ├── Rollback: disable skill                               │
│   │   └── Exit with error                                       │
│   └── On success: continue                                      │
│                                                                 │
│   Example: "bd init --quiet" for beads                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. UPDATE STATE                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Add skill to enabled list in state.json                       │
│   Remove from disabled_at if present                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 9. REPORT SUCCESS                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ✓ Enabled beads                                               │
│   • Installed bd CLI via brew                                   │
│   • Installed Claude Code plugin                                │
│   • Initialized .beads/ directory                               │
│                                                                 │
│   ⚠️  Restart Claude Code to activate plugin                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Edge Cases:**

| Scenario | Handling |
|----------|----------|
| CLI install fails | Show error, suggest manual install, don't enable |
| Plugin install fails | Show error, rollback, suggest checking auth |
| Init command fails | Show stderr, rollback entire enable |
| CLAUDE.md doesn't exist | Create it with just managed section |
| CLAUDE.md is read-only | Error with clear message |
| Concurrent enable (race) | Use file locking on state.json |
| Skill has no agent config for current agent | Use generic: copy SKILL.md only |
| SKILL.md contains `<!-- skill:*` markers | Escape or warn (content collision) |

---

### Workflow 4: Disabling a Skill

```
User runs: skills disable beads

┌─────────────────────────────────────────────────────────────────┐
│ 1. VERIFY SKILL IS ENABLED                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Check state.json for this project                             │
│   ├── Not enabled → "Skill 'beads' is not enabled" (exit 0)     │
│   └── Enabled → Continue                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. REMOVE SKILL FILE                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Delete: .claude/skills/{name}.md                              │
│   ├── File exists → Delete                                      │
│   └── File missing → Continue (maybe manually deleted)          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. REMOVE FROM AGENT MD                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Find and remove skill section:                                │
│   ├── Locate <!-- skill:{name}:start --> marker                 │
│   ├── Locate <!-- skill:{name}:end --> marker                   │
│   ├── Remove everything between (inclusive)                     │
│   └── Clean up extra blank lines                                │
│                                                                 │
│   If section not found → Continue (maybe manually edited)       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. DO NOT UNINSTALL DEPENDENCIES                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ❌ Don't uninstall CLI tools (might be used elsewhere)         │
│   ❌ Don't uninstall plugins (user might re-enable)              │
│   ❌ Don't remove MCP config (might break other things)          │
│                                                                 │
│   These are "install once, keep forever" by design              │
│   User can manually uninstall if desired                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. UPDATE STATE                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Remove from enabled list                                      │
│   Add to disabled_at with timestamp                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Flags:**

- `--purge`: Also remove project-level artifacts (e.g., `.beads/` directory)
- `--yes`: Skip confirmation for purge

---

### Workflow 5: Listing Skills

```
User runs: skills list

┌─────────────────────────────────────────────────────────────────┐
│ OUTPUT FORMAT                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Enabled (3):                                                  │
│     ● beads              Agent memory & issue tracking          │
│     ● typescript-strict  Strict TypeScript conventions          │
│     ● nextjs-14          Next.js 14 App Router patterns         │
│                                                                 │
│   Available (12):                                               │
│     ○ prisma             Prisma ORM patterns                    │
│     ○ tailwind           Tailwind CSS utilities                 │
│     ○ react-query        TanStack Query patterns                │
│     ...                                                         │
│                                                                 │
│   Run 'skills enable <name>' to enable a skill                  │
│   Run 'skills search <query>' to find more                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Flags:**

- `--enabled`: Only show enabled
- `--available`: Only show cached but not enabled
- `--json`: Machine-readable output
- `--quiet`: Names only, one per line

---

### Workflow 6: Syncing/Updating Skills

```
User runs: skills sync

┌─────────────────────────────────────────────────────────────────┐
│ SYNC PROCESS                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   For each enabled skill:                                       │
│   1. Check source for updates (git fetch / API)                 │
│   2. If newer version available:                                │
│      ├── Download new version to cache                          │
│      ├── Re-run enable workflow (updates files)                 │
│      └── Report: "Updated beads: v1.0.0 → v1.1.0"               │
│   3. If no update: skip                                         │
│                                                                 │
│   ⚠️  Does NOT re-run init commands (could be destructive)       │
│   Use --reinit to force                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## CLI Interface

### Command Structure

```
skills <command> [subcommand] [args] [flags]

COMMANDS:
  init                    Initialize skills in current project
  add <source>            Add a skill to local cache
  remove <name>           Remove a skill from cache
  enable <name> [names…]  Enable skill(s) in current project
  disable <name> [names…] Disable skill(s) in current project
  list                    List available and enabled skills
  search <query>          Search for skills (GitHub)
  info <name>             Show details about a skill
  sync                    Update enabled skills to latest versions
  doctor                  Diagnose and fix common issues

GLOBAL FLAGS:
  -h, --help              Show help
  -v, --verbose           Verbose output
  -q, --quiet             Minimal output
  --version               Show version
  --no-color              Disable colored output
```

### Command Details

#### `skills init`

```
Initialize skills management in the current project.

USAGE:
  skills init [flags]

FLAGS:
  --agent <type>    Agent type: auto, claude_code, opencode (default: auto)
  --detect          Detect project stack and suggest skills (default: true)
  --no-detect       Skip project detection
  --bare            Only create directories, no detection
  -y, --yes         Accept all defaults non-interactively

EXAMPLES:
  skills init
  skills init --agent claude_code
  skills init --bare
```

#### `skills add`

```
Add a skill from a source to the local cache.

USAGE:
  skills add <source> [flags]

ARGUMENTS:
  source            Skill source (see formats below)

SOURCE FORMATS:
  github:owner/repo           GitHub repository
  github:owner/repo@v1.0.0    Specific version/tag
  github:owner/repo#subdir    Subdirectory within repo
  ./path/to/skill             Local directory
  
FLAGS:
  -f, --force       Overwrite if already cached
  --no-validate     Skip validation (use with caution)

EXAMPLES:
  skills add github:steveyegge/beads
  skills add github:mycompany/internal-skills#typescript
  skills add ./my-local-skill
```

#### `skills enable`

```
Enable skill(s) in the current project.

USAGE:
  skills enable <name> [names…] [flags]

ARGUMENTS:
  name              Skill name(s) to enable

FLAGS:
  -y, --yes         Auto-confirm all prompts
  --no-deps         Skip CLI dependency installation
  --no-init         Skip init commands

EXAMPLES:
  skills enable beads
  skills enable typescript-strict nextjs-14 prisma
  skills enable beads --yes
```

#### `skills disable`

```
Disable skill(s) in the current project.

USAGE:
  skills disable <name> [names…] [flags]

ARGUMENTS:
  name              Skill name(s) to disable

FLAGS:
  --purge           Also remove project artifacts created by skill
  -y, --yes         Skip confirmation for purge

EXAMPLES:
  skills disable beads
  skills disable prisma --purge
```

#### `skills list`

```
List skills and their status.

USAGE:
  skills list [flags]

FLAGS:
  --enabled         Only show enabled skills
  --available       Only show available (cached) skills
  --json            Output as JSON
  -q, --quiet       Names only, one per line

EXAMPLES:
  skills list
  skills list --enabled --quiet
  skills list --json
```

#### `skills search`

```
Search for skills on GitHub.

USAGE:
  skills search <query> [flags]

ARGUMENTS:
  query             Search terms

FLAGS:
  --limit <n>       Max results (default: 10)

EXAMPLES:
  skills search nextjs
  skills search "issue tracking"
  skills search prisma --limit 5
```

#### `skills info`

```
Show detailed information about a skill.

USAGE:
  skills info <name> [flags]

FLAGS:
  --readme          Show README content
  --manifest        Show raw skill.yaml

EXAMPLES:
  skills info beads
  skills info nextjs-14 --readme
```

#### `skills sync`

```
Update enabled skills to latest versions.

USAGE:
  skills sync [flags]

FLAGS:
  --dry-run         Show what would be updated
  --reinit          Also re-run init commands

EXAMPLES:
  skills sync
  skills sync --dry-run
```

#### `skills doctor`

```
Diagnose and fix common issues.

USAGE:
  skills doctor [flags]

CHECKS:
  • Project initialized correctly
  • Agent MD file has valid managed section
  • All enabled skills have source files
  • No orphaned skill files
  • CLI dependencies available
  • State file consistency

FLAGS:
  --fix             Attempt to auto-fix issues

EXAMPLES:
  skills doctor
  skills doctor --fix
```

---

## Skill Types

### Type: `prompt`

The simplest skill type. Just markdown content.

```yaml
name: typescript-strict
type: prompt
# SKILL.md is copied to skills directory
```

**Enable action:**
1. Copy SKILL.md to `.claude/skills/` or `.opencode/skills/`

**No other actions.** Pure context injection.

---

### Type: `plugin`

Claude Code plugin. Uses `claude plugin` CLI.

```yaml
name: beads
type: plugin

agents:
  claude_code:
    plugin:
      marketplace: "steveyegge/beads"
      name: "beads"
```

**Enable action:**
1. `claude plugin marketplace add steveyegge/beads`
2. `claude plugin install beads`
3. Optionally copy SKILL.md
4. Optionally inject into CLAUDE.md

**OpenCode handling:** Falls back to prompt-only (no plugin system).

---

### Type: `mcp`

MCP server integration.

```yaml
name: filesystem
type: mcp

agents:
  claude_code:
    mcp:
      command: "npx"
      args: ["-y", "@anthropic/mcp-filesystem", "/path"]
      
  opencode:
    mcp:
      command: "npx"
      args: ["-y", "@anthropic/mcp-filesystem", "/path"]
```

**Enable action (Claude Code):**
1. Read `.claude/settings.json`
2. Add to `mcpServers` object
3. Write back atomically

**Enable action (OpenCode):**
1. Read `.opencode/config.json` (or appropriate config)
2. Add to MCP servers section
3. Write back atomically

---

### Type: `tool`

CLI tool with accompanying prompt knowledge.

```yaml
name: jq-expert
type: tool

cli:
  jq:
    check: "jq --version"
    install:
      brew: "jq"
```

**Enable action:**
1. Ensure CLI is installed
2. Copy SKILL.md to skills directory

---

## Agent Integrations

### Claude Code Adapter

```rust
trait AgentAdapter {
    fn detect(&self, project_path: &Path) -> bool;
    fn init(&self, project_path: &Path) -> Result<()>;
    fn enable_skill(&self, skill: &Skill, project_path: &Path) -> Result<()>;
    fn disable_skill(&self, skill_name: &str, project_path: &Path) -> Result<()>;
    fn get_agent_md_path(&self, project_path: &Path) -> PathBuf;
    fn get_skills_dir(&self, project_path: &Path) -> PathBuf;
}
```

#### Detection

```rust
fn detect(&self, project_path: &Path) -> bool {
    project_path.join(".claude").exists()
}
```

#### Initialization

```rust
fn init(&self, project_path: &Path) -> Result<()> {
    // Create .claude/skills/
    fs::create_dir_all(project_path.join(".claude/skills"))?;
    
    // Ensure CLAUDE.md exists
    let claude_md = project_path.join("CLAUDE.md");
    if !claude_md.exists() {
        fs::write(&claude_md, "")?;
    }
    
    // Add managed section if missing
    add_managed_section(&claude_md)?;
    
    Ok(())
}
```

#### Plugin Installation

```rust
fn install_plugin(&self, marketplace: &str, name: &str) -> Result<()> {
    // Add marketplace
    let _ = Command::new("claude")
        .args(["plugin", "marketplace", "add", marketplace])
        .status(); // Ignore error if already added
    
    // Install plugin
    let status = Command::new("claude")
        .args(["plugin", "install", name])
        .status()?;
    
    if !status.success() {
        return Err(Error::PluginInstallFailed(name.to_string()));
    }
    
    Ok(())
}
```

#### MCP Configuration

```rust
fn add_mcp_server(&self, project_path: &Path, name: &str, config: &McpConfig) -> Result<()> {
    let settings_path = project_path.join(".claude/settings.json");
    
    // Read existing or create new
    let mut settings: Value = if settings_path.exists() {
        serde_json::from_str(&fs::read_to_string(&settings_path)?)?
    } else {
        json!({})
    };
    
    // Ensure mcpServers object exists
    if settings.get("mcpServers").is_none() {
        settings["mcpServers"] = json!({});
    }
    
    // Add server config
    settings["mcpServers"][name] = json!({
        "command": config.command,
        "args": config.args,
    });
    
    // Write atomically
    let temp_path = settings_path.with_extension("tmp");
    fs::write(&temp_path, serde_json::to_string_pretty(&settings)?)?;
    fs::rename(&temp_path, &settings_path)?;
    
    Ok(())
}
```

---

### OpenCode Adapter

#### Detection

```rust
fn detect(&self, project_path: &Path) -> bool {
    project_path.join(".opencode").exists()
}
```

#### Initialization

```rust
fn init(&self, project_path: &Path) -> Result<()> {
    // Create .opencode/skills/
    fs::create_dir_all(project_path.join(".opencode/skills"))?;
    
    // Ensure AGENTS.md exists
    let agents_md = project_path.join("AGENTS.md");
    if !agents_md.exists() {
        fs::write(&agents_md, "")?;
    }
    
    // Add managed section
    add_managed_section(&agents_md)?;
    
    Ok(())
}
```

#### Skills Directory

```rust
fn get_skills_dir(&self, project_path: &Path) -> PathBuf {
    project_path.join(".opencode/skills")
}

fn get_agent_md_path(&self, project_path: &Path) -> PathBuf {
    project_path.join("AGENTS.md")
}
```

---

## Edge Cases & Error Handling

### Categories

1. **User errors** — Invalid input, missing prerequisites
2. **Environment errors** — Missing tools, permissions, network
3. **State errors** — Corrupted files, race conditions
4. **Skill errors** — Malformed manifests, missing files

### Error Messages

Format: `Error: <what happened>. <what to do>.`

```
Error: Project not initialized. Run 'skills init' first.

Error: Skill 'beadz' not found. Did you mean 'beads'?
       Run 'skills search beadz' to find matching skills.

Error: Cannot install CLI dependency 'bd'. Homebrew not available.
       Install manually: go install github.com/steveyegge/beads/cmd/bd@latest

Error: Failed to update CLAUDE.md: Permission denied.
       Check file permissions and try again.

Error: Network request failed. Using cached version.
       Run with --offline to suppress this warning.
```

### Graceful Degradation Table

| Failure | Behavior |
|---------|----------|
| Network unavailable | Use cache; warn if skill not cached |
| GitHub rate limited | Use git fallback; suggest GITHUB_TOKEN |
| CLI dep install fails | Warn; continue without that feature |
| Plugin install fails | Error; rollback enable |
| MCP config write fails | Error; rollback enable |
| Agent MD write fails | Error; rollback enable |
| Init command fails | Error; rollback enable |
| Skill file copy fails | Error; rollback enable |
| State file locked | Retry with backoff; eventually error |
| Malformed skill.yaml | Error on add; don't cache |
| Missing SKILL.md | Use inline prompt if available; else error |

### Recovery Commands

```bash
# Check for issues
skills doctor

# Auto-fix what's possible
skills doctor --fix

# Force re-enable (resets skill state)
skills disable beads && skills enable beads

# Clear and re-add corrupted cache entry
skills remove beads --force
skills add github:steveyegge/beads
```

---

## Security Considerations

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Malicious skill.yaml | Don't execute arbitrary code from manifest |
| Command injection in init | Validate/sanitize init commands; run in subprocess |
| Path traversal | Normalize all paths; reject `..` in skill names |
| Symlink attacks | Don't follow symlinks when copying to project |
| Secrets in manifests | Warn if skill.yaml contains patterns like `API_KEY=` |
| Typosquatting | Warn on similar names; show source URL before install |

### Init Command Restrictions

Init commands are run in a subprocess with:

- Working directory set to project root
- No access to skills manager internals
- stdout/stderr captured for display
- Timeout after 60 seconds
- No shell expansion (direct exec)

Allowed commands should be:

- Simple CLI invocations (`bd init --quiet`)
- Package manager commands (`npm install`)

NOT allowed:

- Curl piped to shell
- Arbitrary script execution
- Commands with shell operators (`&&`, `|`, `;`)

### Validation

```rust
fn validate_init_command(cmd: &str) -> Result<()> {
    // No shell metacharacters
    let forbidden = ['|', ';', '&', '$', '`', '(', ')', '{', '}'];
    if cmd.chars().any(|c| forbidden.contains(&c)) {
        return Err(Error::UnsafeCommand(cmd.to_string()));
    }
    
    // No curl/wget piped anywhere
    if cmd.contains("curl") || cmd.contains("wget") {
        return Err(Error::UnsafeCommand("Network fetch in init not allowed".into()));
    }
    
    Ok(())
}
```

---

## Future Considerations

### Not in MVP

These are explicitly deferred:

1. **Custom registry server** — GitHub is enough for now
2. **Skill versioning/pinning** — Always use latest; add if needed
3. **Dependency resolution between skills** — Keep skills independent
4. **Skill templates/scaffolding** — Focus on usage, not authoring
5. **GUI/TUI** — CLI only for now
6. **Team/org features** — Individual developer focus first
7. **Skill analytics** — No telemetry
8. **Auto-update daemon** — Manual sync only

### Migration Path

If/when other agents adopt skills:

1. Add new adapter implementing `AgentAdapter` trait
2. Extend skill.yaml schema with agent-specific config
3. Skills without agent-specific config fall back to generic behavior

### Schema Versioning

```yaml
# In skill.yaml
schema_version: 1  # Bump when breaking changes occur

# CLI handles:
# - schema_version missing → assume v1
# - schema_version > supported → warn, try anyway
# - schema_version < current → migrate if possible
```

---

## Implementation Checklist

### Phase 1: Core (Week 1)

- [ ] Project structure (Cargo workspace)
- [ ] CLI argument parsing (clap)
- [ ] Config file loading
- [ ] State file management
- [ ] `skills init` (basic)
- [ ] `skills add` (GitHub only)
- [ ] `skills enable` (prompt-only)
- [ ] `skills disable`
- [ ] `skills list`

### Phase 2: Agent Integration (Week 2)

- [ ] Claude Code adapter
- [ ] OpenCode adapter
- [ ] Plugin installation
- [ ] MCP configuration
- [ ] Agent MD injection

### Phase 3: Polish (Week 3)

- [ ] `skills search`
- [ ] `skills info`
- [ ] `skills sync`
- [ ] `skills doctor`
- [ ] Error messages
- [ ] Colors and formatting
- [ ] Shell completions

### Phase 4: Distribution

- [ ] GitHub releases
- [ ] Homebrew formula
- [ ] Cargo publish
- [ ] Documentation site
- [ ] Seed skills repository

---

## Appendix: Example Session

```bash
# Start a new project
$ mkdir my-app && cd my-app
$ git init
$ npm init -y

# Initialize skills
$ skills init
✓ Detected agent: none (will use AGENTS.md)
? Select agent: Claude Code
✓ Created .claude/skills/
✓ Created CLAUDE.md with managed section

Detected: node
Suggested: skills enable node typescript

# Add and enable beads
$ skills add github:steveyegge/beads
✓ Fetched steveyegge/beads to cache

$ skills enable beads
✓ bd CLI already installed (v0.24.0)
✓ Added marketplace: steveyegge/beads
✓ Installed plugin: beads
✓ Injected into CLAUDE.md
✓ Ran: bd init --quiet
✓ Enabled beads

⚠️  Restart Claude Code to activate plugin

# Check status
$ skills list
Enabled (1):
  ● beads    Agent memory & issue tracking

Available (0):
  Run 'skills search <query>' to find more

# Later: disable
$ skills disable beads
✓ Removed from CLAUDE.md
✓ Removed .claude/skills/beads.md
✓ Disabled beads

Note: Plugin and CLI remain installed for future use.
```

---

*Document version: 1.0.0*
*Last updated: 2024-01-15*
