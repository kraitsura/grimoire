# Grimoire CLI: End-to-End Workflow Guide
## Current Implementation & Future Vision

---

## Document Purpose

This document provides a complete view of Grimoire's workflows—what exists today and what the refined product will look like. Each workflow shows the current implementation status, user journey, and the target experience.

---

## Part 1: User Personas & Journey Map

### Primary Personas

| Persona | Description | Primary Workflows |
|---------|-------------|-------------------|
| **New User** | First time using AI coding agents | Discovery → Install → First Skill |
| **Active Developer** | Daily user across projects | Quick Install → Enable/Disable → Sync |
| **Skill Author** | Creates skills for team/community | Create → Develop → Validate → Publish |
| **Team Lead** | Manages skills across team | Registry Setup → Standardization → Audit |
| **Multi-Tool User** | Uses Claude Code + Cursor + others | Cross-Agent Sync → Format Translation |

### Journey Phases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER JOURNEY                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DISCOVER        INSTALL         USE            AUTHOR         SHARE       │
│  ────────        ───────         ───            ──────         ─────       │
│  • Search        • Init          • Enable       • Create       • Publish   │
│  • Browse        • Add           • Disable      • Develop      • Registry  │
│  • Suggest       • Install       • Sync         • Validate     • Teams     │
│                                  • Update       • Test                     │
│                                                                             │
│  ◉ Implemented   ◐ Partial      ○ Not Yet                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 2: Core Workflows

### Workflow 1: Project Initialization

**Purpose:** Set up a new project for skill management

#### Current Implementation ◉
```bash
grimoire skills init

# Interactive flow:
? Select AI agent type:
  ❯ Claude Code
    OpenCode  
    Generic

# Creates:
.claude/
└── skills/
CLAUDE.md  (with managed section markers)
```

#### Target Experience
```bash
grimoire skills init

# Enhanced auto-detection:
Detecting project environment...
  ✓ Found: package.json, tsconfig.json
  ✓ Detected AI tools: Claude Code (claude.ai), Cursor
  
? Initialize for which agents?
  ◉ Claude Code (detected)
  ◉ Cursor (detected)
  ◯ OpenCode
  ◯ Aider

Creating configuration...
  ✓ .claude/skills/ directory
  ✓ CLAUDE.md with managed section
  ✓ .cursor/rules/ directory
  ✓ .cursorrules
  ✓ .grimoire/config.json

? Would you like skill suggestions based on your project? (Y/n)
```

#### State Changes
```
Before:                          After:
my-project/                      my-project/
├── src/                         ├── src/
├── package.json                 ├── package.json
└── tsconfig.json                ├── tsconfig.json
                                 ├── .grimoire/
                                 │   └── config.json
                                 ├── .claude/
                                 │   └── skills/
                                 ├── CLAUDE.md
                                 └── .cursor/
                                     └── rules/
```

---

### Workflow 2: Skill Discovery

**Purpose:** Find skills that match project needs

#### Current Implementation ◉
```bash
grimoire skills search pdf

# Searches GitHub by:
# - Topic: grimoire-skill
# - File: skill.yaml presence
# Results sorted by stars

┌──────────────────────────────────────────────────────────────┐
│ Search Results: "pdf"                                        │
├────────────────────┬─────────────────────────────────┬───────┤
│ Name               │ Description                     │ Stars │
├────────────────────┼─────────────────────────────────┼───────┤
│ anthropics/skills  │ Official Anthropic skills       │ 1.2k  │
│ user/pdf-toolkit   │ Advanced PDF processing         │ 234   │
└────────────────────┴─────────────────────────────────┴───────┘
```

#### Target Experience
```bash
# Enhanced search with categories
grimoire skills search pdf --category document

# Project-aware suggestions
grimoire skills suggest

Analyzing project...
  ✓ Framework: Next.js 14
  ✓ Database: Prisma
  ✓ Styling: TailwindCSS

Recommended Skills:
┌─────────────┬────────────────────────────────────┬──────────┐
│ Skill       │ Why Recommended                    │ Install  │
├─────────────┼────────────────────────────────────┼──────────┤
│ nextjs-14   │ Detected Next.js App Router        │ ✓ cached │
│ prisma      │ Found prisma/ directory            │ ○        │
│ tailwind    │ Found tailwind.config.js           │ ○        │
└─────────────┴────────────────────────────────────┴──────────┘

Quick install: grimoire skills install nextjs-14 prisma tailwind

# Interactive browse mode
grimoire skills browse

┌───────────────────────────────────────────────────────────────┐
│ Skill Registry Browser                           [q] quit     │
├───────────────────────────────────────────────────────────────┤
│ Categories          │ Skills                                  │
│ ─────────────       │ ────────                                │
│ ▸ Documents         │ pdf          - PDF manipulation    ★234 │
│   Code Quality      │ docx         - Word documents      ★189 │
│   Frameworks        │ xlsx         - Excel processing    ★156 │
│   DevOps            │ pptx         - PowerPoint          ★143 │
│   Data              │                                         │
├───────────────────────────────────────────────────────────────┤
│ [↑↓] navigate  [enter] details  [i] install  [/] search      │
└───────────────────────────────────────────────────────────────┘
```

---

### Workflow 3: Skill Installation

**Purpose:** Add a skill to the local cache and enable it in a project

#### Current Implementation ◐ (Multi-step)
```bash
# Step 1: Add to cache
grimoire skills add github:anthropics/skills#pdf

# Step 2: Initialize (if not done)
grimoire skills init

# Step 3: Enable in project
grimoire skills enable pdf
```

#### Target Experience
```bash
# Single command does everything
grimoire skills install pdf

Installing skill: pdf
  [1/4] Resolving source... ✓ github:anthropics/skills#pdf
  [2/4] Downloading...      ✓ cached at ~/.skills/cache/pdf
  [3/4] Initializing...     ✓ project already initialized
  [4/4] Enabling...         ✓ installed to .claude/skills/pdf/

✓ Skill 'pdf' installed successfully

Files created:
  • .claude/skills/pdf/SKILL.md
  • .claude/skills/pdf/REFERENCE.md
  • .claude/skills/pdf/FORMS.md
  • .claude/skills/pdf/scripts/extract.py

# With options
grimoire skills install pdf --global         # Personal skill
grimoire skills install pdf --dry-run        # Preview only
grimoire skills install pdf -y               # No prompts
grimoire skills install pdf --no-deps        # Skip CLI deps
```

#### Behind the Scenes
```
User Command                     System Actions
─────────────                    ──────────────
grimoire skills install pdf
        │
        ▼
┌─────────────────┐
│ Parse Source    │──▶ Resolve "pdf" → github:anthropics/skills#pdf
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────────────────────┐
│ Check Cache     │──▶  │ ~/.skills/cache/pdf/             │
└────────┬────────┘     │ ├── skill.yaml (or inferred)     │
         │              │ ├── SKILL.md                     │
         │              │ ├── REFERENCE.md                 │
         │              │ ├── FORMS.md                     │
         │              │ └── scripts/                     │
         ▼              └──────────────────────────────────┘
┌─────────────────┐
│ Check Init      │──▶ Is .claude/skills/ present? Auto-init if not
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────────────────────┐
│ Install Deps    │──▶  │ Check/install CLI dependencies   │
└────────┬────────┘     │ (pypdf, pdfplumber, etc.)        │
         │              └──────────────────────────────────┘
         ▼
┌─────────────────┐     ┌──────────────────────────────────┐
│ Copy Files      │──▶  │ .claude/skills/pdf/              │
└────────┬────────┘     │ ├── SKILL.md (with frontmatter)  │
         │              │ ├── REFERENCE.md                 │
         │              │ ├── FORMS.md                     │
         │              │ └── scripts/extract.py           │
         ▼              └──────────────────────────────────┘
┌─────────────────┐
│ Inject Content  │──▶ Update CLAUDE.md managed section
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Update State    │──▶ ~/.skills/state.json
└─────────────────┘
```

---

### Workflow 4: Skill Lifecycle Management

**Purpose:** Enable, disable, update, and sync skills across projects

#### Current Implementation ◉
```bash
# Enable a cached skill
grimoire skills enable pdf
grimoire skills enable pdf xlsx docx    # Multiple

# Disable
grimoire skills disable pdf
grimoire skills disable pdf --purge     # Remove artifacts too

# List status
grimoire skills list
grimoire skills list --enabled
grimoire skills list --available

# Update metadata
grimoire skills update pdf --trigger "Process PDF files"

# Sync to latest versions
grimoire skills sync
grimoire skills sync --dry-run
```

#### Target Experience (Enhanced)
```bash
# Interactive enable
grimoire skills enable

? Select skills to enable:
  ◉ pdf          - PDF manipulation (v1.2.0)
  ◯ docx         - Word documents (v1.1.0)
  ◉ xlsx         - Excel processing (v1.0.5)
  
[space] toggle  [a] all  [enter] confirm

# Diff before enable
grimoire skills diff pdf

Changes if 'pdf' is enabled:
┌─────────────────────────────────────────────────────────────┐
│ + .claude/skills/pdf/SKILL.md          (new, 295 lines)    │
│ + .claude/skills/pdf/REFERENCE.md      (new, 450 lines)    │
│ + .claude/skills/pdf/scripts/          (new directory)     │
│ ~ CLAUDE.md                            (+12 lines)         │
│                                                             │
│ CLI Dependencies:                                           │
│   pypdf >= 3.0.0       (will install via pip)              │
│   pdfplumber >= 0.9.0  (will install via pip)              │
└─────────────────────────────────────────────────────────────┘

# Enhanced sync with update preview
grimoire skills sync

Checking for updates...
┌─────────┬─────────┬─────────┬────────────────────────────────┐
│ Skill   │ Current │ Latest  │ Changes                        │
├─────────┼─────────┼─────────┼────────────────────────────────┤
│ pdf     │ 1.2.0   │ 1.3.0   │ Added OCR support, bug fixes   │
│ docx    │ 1.1.0   │ 1.1.0   │ Up to date                     │
│ xlsx    │ 1.0.5   │ 1.1.0   │ Formula recalculation fixes    │
└─────────┴─────────┴─────────┴────────────────────────────────┘

? Update pdf and xlsx? (Y/n)
```

---

### Workflow 5: Skill Authoring

**Purpose:** Create, develop, validate, and publish new skills

#### Current Implementation ○ (Not Yet)
- No scaffolding command
- Manual file creation required
- No validation tooling
- No publish workflow

#### Target Experience
```bash
# Create new skill from template
grimoire skills create my-api-skill --template mcp

Creating skill: my-api-skill
  ✓ Created directory structure
  ✓ Generated skill.yaml template
  ✓ Generated SKILL.md with frontmatter
  ✓ Created README.md
  ✓ Set up scripts/ directory

Created at: ./my-api-skill/
Next steps:
  1. Edit SKILL.md with your instructions
  2. Run: grimoire skills validate ./my-api-skill
  3. Test: grimoire skills dev ./my-api-skill

# Generated structure:
my-api-skill/
├── skill.yaml
│   ├── name: my-api-skill
│   ├── version: 0.1.0
│   ├── description: "TODO: Add description"
│   └── ...
├── SKILL.md
│   ├── ---
│   ├── name: my-api-skill
│   ├── description: "TODO"
│   ├── ---
│   └── # My API Skill
│       ## Usage
│       ...
├── README.md
├── scripts/
│   └── .gitkeep
├── templates/
│   └── .gitkeep
└── examples/
    └── basic-usage.md
```

```bash
# Local development mode
grimoire skills dev ./my-api-skill

Watching ./my-api-skill for changes...
  ✓ Linked to .claude/skills/my-api-skill/

[14:23:01] SKILL.md modified → synced
[14:23:45] scripts/process.py added → synced
[14:24:12] SKILL.md modified → synced

Press Ctrl+C to stop watching
```

```bash
# Validate before publishing
grimoire skills validate ./my-api-skill

Validating: my-api-skill

Structure ──────────────────────────────────────────────────
  ✓ SKILL.md exists
  ✓ YAML frontmatter present and valid
  ✓ skill.yaml present (optional enhancement)
  ✓ Directory structure valid

Metadata ───────────────────────────────────────────────────
  ✓ name: my-api-skill
  ✓ description: 127 characters (max 1024)
  ✓ version: 0.1.0 (valid semver)
  ⚠ license: not specified (recommended)

Content ────────────────────────────────────────────────────
  ✓ Instructions present (423 words)
  ✓ No broken file references
  ✓ All scripts are executable
  ⚠ No examples provided (recommended)

Security ───────────────────────────────────────────────────
  ✓ No hardcoded secrets detected
  ✓ No suspicious external URLs
  ✓ Scripts don't require elevated privileges

Quality ────────────────────────────────────────────────────
  ✓ README.md present
  ⚠ No CHANGELOG.md
  ✓ Code examples included in SKILL.md

Result: PASS with 3 warnings
  → Ready to publish (warnings are recommendations)
```

```bash
# Publish to registry
grimoire skills publish ./my-api-skill

Publishing my-api-skill v0.1.0...

? Select registry:
  ❯ GitHub (personal)
    GitHub (organization: my-company)
    Private Registry (skills.company.com)

? Repository name: my-api-skill
? Visibility: Public

Publishing...
  ✓ Created repository: github.com/username/my-api-skill
  ✓ Pushed skill files
  ✓ Added grimoire-skill topic
  ✓ Created release v0.1.0

✓ Published successfully!

Install with:
  grimoire skills install github:username/my-api-skill
```

---

### Workflow 6: Multi-Agent Synchronization

**Purpose:** Keep skills in sync across multiple AI coding tools

#### Current Implementation ◐ (Limited)
- Claude Code: Full support
- OpenCode: Basic support
- Others: Not supported

#### Target Experience
```bash
# Initialize for multiple agents
grimoire skills init --target claude,cursor,opencode

Creating multi-agent configuration...
  ✓ .claude/skills/
  ✓ CLAUDE.md
  ✓ .cursor/rules/
  ✓ .cursorrules  
  ✓ .opencode/agent/
  ✓ AGENTS.md
  ✓ .grimoire/config.json

# Install skill across all agents
grimoire skills install pdf --target all

Installing pdf for all configured agents...
  
Claude Code:
  ✓ .claude/skills/pdf/SKILL.md
  ✓ Updated CLAUDE.md
  
Cursor:
  ✓ .cursor/rules/pdf.mdc (converted format)
  ✓ Updated .cursorrules
  
OpenCode:
  ✓ Added to AGENTS.md (skills section)

# Sync rules across agents
grimoire rules sync

Syncing rules to all agents...

Source: .grimoire/rules.md

Generated:
  ✓ CLAUDE.md      (Claude Code format)
  ✓ .cursorrules   (Cursor MDC format)
  ✓ AGENTS.md      (OpenCode format)
  ✓ .aider.conf.yml (Aider format)

# View sync status
grimoire status

╭───────────────────────────────────────────────────────────────╮
│ Grimoire Status                                               │
├───────────────────────────────────────────────────────────────┤
│ Project: ~/projects/my-app                                    │
│ Config:  .grimoire/config.json                                │
├───────────────────────────────────────────────────────────────┤
│ Agent        │ Status    │ Skills │ Last Sync                 │
│ ─────────────┼───────────┼────────┼─────────────────────────  │
│ Claude Code  │ ✓ Active  │ 4      │ 2 min ago                 │
│ Cursor       │ ✓ Active  │ 4      │ 2 min ago                 │
│ OpenCode     │ ○ Inactive│ 0      │ Never                     │
│ Aider        │ - N/A     │ -      │ Not configured            │
╰───────────────────────────────────────────────────────────────╯
```

---

### Workflow 7: Diagnostics & Troubleshooting

**Purpose:** Identify and fix issues with skill configuration

#### Current Implementation ◉
```bash
grimoire skills doctor

Running diagnostics...

Project Status:
  ✓ Project initialized
  ✓ Agent type: claude-code
  ✓ Skills directory exists

CLAUDE.md:
  ✓ File exists
  ✓ Managed section present

Enabled Skills:
  ✓ pdf - file exists, in cache
  ⚠ docx - file exists, NOT in cache (orphaned?)
  ✗ xlsx - enabled but file missing

State Consistency:
  ⚠ 1 orphaned skill file
  ✗ 1 missing skill file

Run with --fix to auto-repair issues
```

#### Target Experience (Enhanced)
```bash
grimoire skills doctor --fix --verbose

Running diagnostics with auto-fix...

[1/6] Checking initialization...
      ✓ .grimoire/config.json exists
      ✓ .claude/skills/ directory present
      ✓ Agent type: claude-code

[2/6] Checking agent configuration...
      ✓ CLAUDE.md exists
      ✓ Managed section markers present
      ⚠ Managed section has manual edits
        → Suggestion: Use 'grimoire rules edit' for changes

[3/6] Checking enabled skills...
      Skill: pdf
        ✓ Enabled in state
        ✓ File exists: .claude/skills/pdf/SKILL.md
        ✓ Present in cache: ~/.skills/cache/pdf/
        ✓ YAML frontmatter valid
      
      Skill: docx
        ✓ Enabled in state  
        ✓ File exists: .claude/skills/docx/SKILL.md
        ✗ NOT in cache
        → Auto-fix: Re-downloading to cache...
        ✓ Fixed: Cache restored from GitHub
      
      Skill: xlsx
        ✓ Enabled in state
        ✗ File missing: .claude/skills/xlsx/SKILL.md
        → Auto-fix: Re-enabling from cache...
        ✓ Fixed: Skill file restored

[4/6] Checking for orphans...
      ✓ No orphaned skill files

[5/6] Checking dependencies...
      ✓ All CLI dependencies available

[6/6] Checking cache integrity...
      ✓ Cache index valid
      ✓ No corrupted entries

Summary:
  ✓ 2 issues found and fixed
  ○ 1 suggestion (non-blocking)
  
All systems operational.
```

---

## Part 3: Configuration & State Model

### File Locations

```
Global (User-level)
~/.skills/
├── state.json              # Global state: enabled skills per project
├── config.json             # User preferences
├── cache/                  # Downloaded skills
│   ├── .index.json         # Fast lookup index
│   ├── pdf/
│   │   ├── skill.yaml
│   │   ├── SKILL.md
│   │   ├── REFERENCE.md
│   │   └── scripts/
│   └── docx/
│       └── ...
└── registries/             # Custom registry configs

Personal Skills (Future)
~/.claude/skills/           # User's personal skills
├── my-helper/
│   └── SKILL.md
└── code-review/
    └── SKILL.md

Project-level
my-project/
├── .grimoire/
│   ├── config.json         # Project-specific settings
│   └── lockfile.json       # Version locks (future)
├── .claude/
│   └── skills/
│       ├── pdf/
│       │   ├── SKILL.md
│       │   └── scripts/
│       └── docx/
│           └── SKILL.md
├── CLAUDE.md               # Agent instructions
├── .cursor/
│   └── rules/
│       └── pdf.mdc
└── .cursorrules
```

### State Schema

```json
// ~/.skills/state.json
{
  "version": "1.0.0",
  "projects": {
    "/Users/dev/my-project": {
      "agent": "claude-code",
      "initialized": "2024-01-15T10:30:00Z",
      "skills": {
        "pdf": {
          "version": "1.2.0",
          "source": "github:anthropics/skills#pdf",
          "enabled": "2024-01-15T10:35:00Z",
          "scope": "project"
        },
        "docx": {
          "version": "1.1.0",
          "source": "github:anthropics/skills#docx",
          "enabled": "2024-01-15T10:36:00Z",
          "scope": "project"
        }
      }
    }
  },
  "global_skills": {
    "my-helper": {
      "version": "0.1.0",
      "source": "local:~/skills/my-helper",
      "enabled": "2024-01-10T09:00:00Z"
    }
  }
}
```

```json
// .grimoire/config.json (project)
{
  "$schema": "https://grimoire.dev/schema/v1",
  "version": "1.0.0",
  "agents": {
    "claude-code": {
      "enabled": true,
      "skillsPath": ".claude/skills",
      "rulesPath": "CLAUDE.md"
    },
    "cursor": {
      "enabled": true,
      "rulesPath": ".cursor/rules",
      "mcpPath": ".cursor/mcp.json"
    },
    "opencode": {
      "enabled": false
    }
  },
  "registries": [
    "https://github.com/anthropics/skills",
    "https://github.com/my-company/skills"
  ],
  "settings": {
    "autoSync": true,
    "checkUpdates": "weekly"
  }
}
```

---

## Part 4: Command Reference (Current + Future)

### Currently Implemented ◉

| Command | Purpose | Key Flags |
|---------|---------|-----------|
| `grimoire skills init` | Initialize project | `--agent`, `-y` |
| `grimoire skills add <source>` | Cache skill locally | `-f/--force`, `--no-validate` |
| `grimoire skills enable <n>` | Activate skill(s) | `-y`, `--no-deps`, `--no-init` |
| `grimoire skills disable <n>` | Deactivate skill(s) | `--purge`, `-y` |
| `grimoire skills list` | Show inventory | `--enabled`, `--available`, `--json` |
| `grimoire skills info <n>` | Show details | `--readme`, `--manifest` |
| `grimoire skills search <q>` | Find on GitHub | `--limit` |
| `grimoire skills sync` | Update all | `--dry-run`, `--reinit` |
| `grimoire skills update <n>` | Modify metadata | `--trigger`, `--description` |
| `grimoire skills doctor` | Diagnose issues | `--fix` |

### Planned Features ○

| Command | Purpose | Priority |
|---------|---------|----------|
| `grimoire skills install <n>` | Single-command install | P1 |
| `grimoire skills create <n>` | Scaffold new skill | P1 |
| `grimoire skills validate <path>` | Validate skill | P1 |
| `grimoire skills diff <n>` | Preview changes | P2 |
| `grimoire skills suggest` | Project-based suggestions | P2 |
| `grimoire skills dev <path>` | Watch mode for dev | P3 |
| `grimoire skills publish <path>` | Publish to registry | P3 |
| `grimoire skills browse` | Interactive TUI | P3 |
| `grimoire rules init` | Initialize rules | P2 |
| `grimoire rules edit` | Edit unified rules | P2 |
| `grimoire rules sync` | Sync across agents | P2 |
| `grimoire mcp install <n>` | Install MCP server | P3 |
| `grimoire mcp list` | List MCP servers | P3 |
| `grimoire mcp sync` | Sync MCP configs | P3 |
| `grimoire registry add <url>` | Add registry | P3 |
| `grimoire registry list` | List registries | P3 |
| `grimoire bundle install <n>` | Install skill bundle | P3 |
| `grimoire status` | Show dashboard | P3 |
| `grimoire completion <shell>` | Shell completion | P2 |

---

## Part 5: Error Handling & Recovery

### Current Error Experience

```bash
grimoire skills enable beadss

Error: Skill "beadss" not found in cache
```

### Target Error Experience

```bash
grimoire skills enable beadss

╭─ Error ─────────────────────────────────────────────────────╮
│ Skill "beadss" not found in cache                          │
╰─────────────────────────────────────────────────────────────╯

Did you mean?
  → beads (93% match) - AI-native issue tracking

Try these commands:
  grimoire skills search beads       # Find similar skills
  grimoire skills add <source>       # Add skill to cache first
  grimoire skills list --available   # See cached skills

Need help? https://grimoire.dev/docs/troubleshooting
```

### Error Categories & Handling

| Category | Example | Recovery |
|----------|---------|----------|
| Not Found | Skill not in cache | Fuzzy match suggestions, search hint |
| Not Initialized | Project not set up | Auto-init prompt |
| Network | GitHub unreachable | Retry with backoff, offline mode hint |
| Validation | Invalid skill format | Specific field errors, fix suggestions |
| Permission | Can't write files | Check permissions, sudo hint |
| Conflict | Skill already enabled | Offer --force or skip |
| Dependency | CLI tool missing | Install command, manual steps |

---

## Part 6: Integration Points

### Git Integration

```bash
# Recommended .gitignore additions
.grimoire/cache/          # Local cache (don't commit)

# Recommended to commit
.grimoire/config.json     # Project settings
.grimoire/lockfile.json   # Version locks
.claude/skills/           # Enabled skills
CLAUDE.md                 # Agent config
```

### CI/CD Integration

```yaml
# .github/workflows/validate-skills.yml
name: Validate Skills
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Grimoire
        run: npm install -g grimoire
      - name: Validate Skills
        run: grimoire skills doctor --ci
      - name: Check Custom Skills
        run: |
          for skill in ./custom-skills/*/; do
            grimoire skills validate "$skill"
          done
```

### IDE Integration (Future)

```json
// VS Code extension settings
{
  "grimoire.autoSync": true,
  "grimoire.showStatusBar": true,
  "grimoire.suggestSkills": true
}
```

---

## Part 7: Future Vision Summary

### The Complete Experience

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GRIMOIRE: The Complete Picture                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   DISCOVER   │───▶│   INSTALL    │───▶│     USE      │                  │
│  │              │    │              │    │              │                  │
│  │ • search     │    │ • install    │    │ • enable     │                  │
│  │ • suggest    │    │ • add        │    │ • disable    │                  │
│  │ • browse     │    │ • init       │    │ • sync       │                  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                  │
│                                                  │                          │
│                                                  ▼                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │    SHARE     │◀───│   PUBLISH    │◀───│    AUTHOR    │                  │
│  │              │    │              │    │              │                  │
│  │ • registry   │    │ • publish    │    │ • create     │                  │
│  │ • teams      │    │ • release    │    │ • validate   │                  │
│  │ • bundle     │    │              │    │ • dev        │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  Multi-Agent Support:                                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ Claude  │ │ Open    │ │ Cursor  │ │ Aider   │ │Windsurf │ │ Codex   │  │
│  │ Code    │ │ Code    │ │         │ │         │ │         │ │ CLI     │  │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │
│       │           │           │           │           │           │        │
│       └───────────┴───────────┴─────┬─────┴───────────┴───────────┘        │
│                                     │                                       │
│                              ┌──────┴──────┐                                │
│                              │  grimoire   │                                │
│                              │   sync      │                                │
│                              └─────────────┘                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Differentiators at Maturity

1. **Universal**: One tool for all AI coding agents
2. **Seamless**: Single-command workflows
3. **Smart**: Project-aware suggestions
4. **Complete**: Author → Validate → Publish → Share
5. **Enterprise-Ready**: Teams, registries, audit trails
6. **Developer-Loved**: Great errors, shell completion, TUI

---

## Appendix: Quick Reference Card

```
DISCOVERY
  grimoire skills search <query>      Find skills
  grimoire skills suggest             Get recommendations
  grimoire skills browse              Interactive browser

INSTALLATION  
  grimoire skills install <n>         One-command install
  grimoire skills add <source>        Cache only
  grimoire skills init                Initialize project

MANAGEMENT
  grimoire skills enable <n>          Activate skill
  grimoire skills disable <n>         Deactivate skill
  grimoire skills list                Show status
  grimoire skills sync                Update all
  grimoire skills doctor              Diagnose issues

AUTHORING
  grimoire skills create <n>          Scaffold new skill
  grimoire skills validate <path>     Check validity
  grimoire skills dev <path>          Watch mode
  grimoire skills publish <path>      Release skill

MULTI-AGENT
  grimoire rules sync                 Sync rules everywhere
  grimoire mcp sync                   Sync MCP configs
  grimoire status                     Dashboard view

Source Formats:
  pdf                                 → Registry lookup
  github:owner/repo                   → GitHub repo
  github:owner/repo@v1.0              → Specific version
  github:owner/repo#subdir            → Subdirectory
  https://github.com/owner/repo       → Full URL
  ./path/to/skill                     → Local path
```
