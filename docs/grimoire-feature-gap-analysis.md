# Grimoire CLI: Feature Gap Analysis
## Roadmap to Essential Agentic Coding Tool

---

## Executive Summary

This document identifies all features required to transform Grimoire from a functional skills manager into an indispensable tool for the agentic coding ecosystem. Features are organized by priority, with implementation guidance and success metrics.

---

## Part 1: Critical Gaps (P0) — Compatibility Blockers

These issues prevent Grimoire from working with the existing skill ecosystem. They must be resolved before any other features.

### 1.1 SKILL.md-Only Skills Support
**Issue ID:** `grimoire-4tk9`

**Current State:**
- Grimoire requires `skill.yaml` manifest for all skills
- Claude Code allows skills with just `SKILL.md` (YAML frontmatter + markdown)

**Gap Impact:**
- Cannot use Anthropic's official skills (e.g., `/mnt/skills/public/pdf/`)
- Incompatible with community skills following Claude Code conventions
- Forces skill authors to maintain dual formats

**Required Implementation:**
```
Detection Priority Order:
1. skill.yaml (full manifest) → use as-is
2. SKILL.md with YAML frontmatter → extract metadata automatically
3. SKILL.md without frontmatter → infer from filename/directory
```

**Acceptance Criteria:**
- [ ] `grimoire skills add github:anthropics/skills#pdf` works without skill.yaml
- [ ] YAML frontmatter parsed for: name, description, license, version
- [ ] Fallback inference when frontmatter incomplete
- [ ] Existing skill.yaml skills continue working

---

### 1.2 Personal Skills Directory
**Issue ID:** `grimoire-3uia`

**Current State:**
- Only supports project-level skills (`.claude/skills/`)
- No global/personal skill location

**Gap Impact:**
- Users cannot create personal skills that apply across all projects
- No way to share skills between projects without reinstalling
- Breaks Claude Code's 3-tier skill hierarchy

**Required Implementation:**
```
Skill Resolution Order:
1. Project: .claude/skills/<name>/
2. User: ~/.claude/skills/<name>/
3. System: (future - enterprise deployments)

New Commands:
grimoire skills enable <name> --global    # Install to ~/.claude/skills/
grimoire skills list --global             # List personal skills
grimoire skills list --all                # All scopes combined
```

**Acceptance Criteria:**
- [ ] Skills can be enabled at `~/.claude/skills/`
- [ ] Global skills detected and listed separately
- [ ] Conflict resolution when same skill exists at multiple scopes
- [ ] `--global` flag on enable/disable/list commands

---

### 1.3 Multi-File Skills Support
**Issue ID:** `grimoire-py0i`

**Current State:**
- Only copies `SKILL.md` and `README.md` from cached skills
- Scripts, templates, and reference docs are lost

**Gap Impact:**
- Anthropic's official skills include `scripts/`, reference docs
- Complex skills with tooling are broken
- PDF skill's `scripts/extract.py` would be missing

**Required Implementation:**
```
Full Directory Copy:
skill-name/
├── SKILL.md          ✓ (currently copied)
├── README.md         ✓ (currently copied)
├── skill.yaml        ✓ (currently copied)
├── scripts/          ✗ → must copy
├── templates/        ✗ → must copy
├── references/       ✗ → must copy
├── examples/         ✗ → must copy
└── *.md              ✗ → must copy (REFERENCE.md, FORMS.md, etc.)
```

**Acceptance Criteria:**
- [ ] All files/directories copied during enable (not just SKILL.md)
- [ ] Symlink option for large skills to save disk space
- [ ] Exclude patterns configurable (node_modules, .git, etc.)
- [ ] `scripts/` paths work correctly after installation

---

## Part 2: High Priority Features (P1) — Core DX

These features are essential for a good developer experience and differentiation from manual workflows.

### 2.1 Single-Command Install
**Issue ID:** `grimoire-ft2k`

**Current State (4 commands):**
```bash
grimoire skills search beads
grimoire skills add github:beadifier/beads-skill
grimoire skills init
grimoire skills enable beads
```

**Target State (1 command):**
```bash
grimoire skills install beads
grimoire skills install github:org/repo
grimoire skills install ./local/path
```

**Required Implementation:**
```
grimoire skills install <source>

Workflow:
1. Parse source (shorthand → full GitHub URL if needed)
2. If not initialized, run init (detect agent or prompt)
3. Add to cache (if not present)
4. Enable skill
5. Report success with summary
```

**Flags:**
- `--global` — Install to personal skills
- `--no-deps` — Skip CLI dependency installation
- `--no-init` — Skip init commands
- `-y` — Auto-confirm prompts

**Acceptance Criteria:**
- [ ] New user can install first skill in < 30 seconds
- [ ] Smart source detection (GitHub shorthand, URLs, local paths)
- [ ] Auto-initialization when project not set up
- [ ] Clear progress indicators and success message

---

### 2.2 Skill Scaffolding (Create Command)
**Issue IDs:** `grimoire-rgyl`, `grimoire-dm0w`

**Current State:**
- No way to create new skills
- Developers must manually create file structure

**Required Implementation:**
```bash
grimoire skills create <name> [--template=<type>]

Templates:
- basic        → SKILL.md only (minimal)
- standard     → SKILL.md + skill.yaml + README.md
- mcp          → Includes MCP server configuration
- cli-wrapper  → Includes CLI dependency setup
- full         → All features: scripts/, templates/, examples/
```

**Generated Structure (standard template):**
```
my-skill/
├── skill.yaml          # Full manifest with all fields
├── SKILL.md            # Instructions with YAML frontmatter
├── README.md           # Human documentation
├── scripts/
│   └── .gitkeep
├── templates/
│   └── .gitkeep
└── examples/
    └── example-usage.md
```

**Interactive Mode:**
```bash
grimoire skills create my-skill --interactive

? Skill name: my-skill
? Description: A skill for processing data pipelines
? Type: (prompt/mcp/cli-wrapper/hybrid)
? Target agents: [Claude Code, OpenCode]
? Include CLI dependencies? (y/N)
? Include MCP server? (y/N)
```

**Acceptance Criteria:**
- [ ] `grimoire skills create` generates valid skill structure
- [ ] All templates pass `grimoire skills validate`
- [ ] Interactive mode guides through all options
- [ ] Generated skills work immediately with `enable`

---

### 2.3 Dry-Run Mode
**Issue ID:** `grimoire-qkhr`

**Current State:**
- No way to preview changes before applying
- Users must trust the tool or manually inspect after

**Required Implementation:**
```bash
grimoire skills enable beads --dry-run

Output:
┌─────────────────────────────────────────────────────────────┐
│ Dry Run: grimoire skills enable beads                       │
├─────────────────────────────────────────────────────────────┤
│ Would create:                                               │
│   • .claude/skills/beads/SKILL.md                          │
│   • .claude/skills/beads/scripts/process.py                │
│                                                             │
│ Would modify:                                               │
│   • CLAUDE.md (add managed section, +15 lines)             │
│                                                             │
│ Would run:                                                  │
│   • npm install -g beads-cli                               │
│                                                             │
│ No changes made.                                            │
└─────────────────────────────────────────────────────────────┘
```

**Commands Supporting Dry-Run:**
- `skills enable --dry-run`
- `skills disable --dry-run`
- `skills sync --dry-run`
- `rules sync --dry-run`

**Acceptance Criteria:**
- [ ] All state-modifying commands support `--dry-run`
- [ ] Output clearly shows what would change
- [ ] Exit code indicates success (what would happen) vs failure

---

### 2.4 Verbose Logging
**Issue ID:** `grimoire-89qh`

**Current State:**
- Minimal output during operations
- Hard to debug failures

**Required Implementation:**
```bash
grimoire skills enable beads --verbose

[1/6] Checking cache...
      ✓ Found in ~/.skills/cache/beads (v1.2.0)
      
[2/6] Reading manifest...
      ✓ skill.yaml parsed successfully
      ├─ Name: beads
      ├─ Version: 1.2.0
      └─ Type: prompt
      
[3/6] Installing CLI dependencies...
      → bd: checking availability...
      ⚠ Already installed (v2.1.0 ≥ required v2.0.0)
      
[4/6] Copying skill files...
      ├─ Source: ~/.skills/cache/beads/
      ├─ Dest: .claude/skills/beads/
      ├─ Files: SKILL.md, scripts/process.py
      └─ ✓ 2 files copied
      
[5/6] Injecting into CLAUDE.md...
      ├─ Added skill reference to managed section
      └─ ✓ CLAUDE.md updated (+8 lines)
      
[6/6] Updating state...
      ├─ Project: /Users/dev/my-project
      └─ ✓ State saved to ~/.skills/state.json

✓ Skill 'beads' enabled successfully
```

**Acceptance Criteria:**
- [ ] `--verbose` / `-v` flag on all commands
- [ ] Step numbers with clear progress indication
- [ ] File paths shown for all I/O operations
- [ ] Errors include full context for debugging

---

### 2.5 Skill Validation Command
**Issue ID:** `grimoire-g30h`

**Current State:**
- `doctor` checks enabled skills
- No way to validate a skill before publishing

**Required Implementation:**
```bash
grimoire skills validate ./my-skill

Validating my-skill...

Structure Checks:
  ✓ SKILL.md exists
  ✓ YAML frontmatter present
  ✓ skill.yaml valid (optional)
  
Metadata Checks:
  ✓ name field present
  ✓ description present (156 chars)
  ⚠ version missing (recommended)
  
Content Checks:
  ✓ Description under 1024 chars
  ✓ All referenced files exist
  ✓ No broken internal links
  
Quality Checks:
  ⚠ No examples/ directory
  ⚠ README.md missing
  ✓ No secrets detected
  
Security Checks:
  ✓ No hardcoded credentials
  ✓ Scripts don't require sudo
  ✓ No suspicious URLs
  
Result: PASS (2 warnings)
```

**Acceptance Criteria:**
- [ ] Validates structure, metadata, content, quality, security
- [ ] Clear pass/fail with actionable warnings
- [ ] Exit codes: 0 = pass, 1 = warnings, 2 = errors
- [ ] JSON output option for CI integration

---

## Part 3: Medium Priority Features (P2) — Polish & Discovery

### 3.1 Project Detection & Suggestions
**Issue ID:** `grimoire-yuru`

**Implementation:**
```bash
grimoire skills suggest

Analyzing project...
  ✓ Detected: package.json, tsconfig.json, prisma/

Project Stack:
  • Framework: Next.js 14 (App Router)
  • Language: TypeScript 5.3
  • Database: Prisma + PostgreSQL
  • Styling: TailwindCSS

Recommended Skills:
  ┌────────────────┬─────────────────────────────────────┬───────┐
  │ Skill          │ Reason                              │ Stars │
  ├────────────────┼─────────────────────────────────────┼───────┤
  │ nextjs-14      │ Matches framework                   │ 234   │
  │ typescript     │ Matches language                    │ 567   │
  │ prisma         │ Detected prisma/ directory          │ 123   │
  │ tailwind       │ Detected tailwind.config.js         │ 456   │
  └────────────────┴─────────────────────────────────────┴───────┘

Install all? grimoire skills install nextjs-14 typescript prisma tailwind
```

---

### 3.2 Interactive Mode
**Issue ID:** `grimoire-aass`

**Implementation:**
```bash
grimoire skills enable   # No args → interactive

? Select skills to enable:
  ◉ pdf          Comprehensive PDF manipulation (enabled)
  ◯ xlsx         Excel spreadsheet processing
  ◉ docx         Word document creation (enabled)
  ◯ pptx         PowerPoint presentations
  
  [↑↓ to move, space to select, enter to confirm]
```

---

### 3.3 Improved Error Messages
**Issue ID:** `grimoire-79se`

**Current:**
```
Error: Skill "beadss" not found in cache
```

**Target:**
```
Error: Skill "beadss" not found in cache

Did you mean?
  → beads (93% match) - AI-native issue tracking

To add a skill:
  grimoire skills add github:org/skill-name
  grimoire skills search beads

Need help? grimoire skills --help
```

---

### 3.4 Shell Tab Completion
**Issue ID:** `grimoire-if3p`

**Implementation:**
```bash
grimoire completion bash >> ~/.bashrc
grimoire completion zsh >> ~/.zshrc
grimoire completion fish > ~/.config/fish/completions/grimoire.fish

# Enables:
grimoire skills en<TAB>    → enable
grimoire skills enable be<TAB>  → beads
```

---

### 3.5 Skill Diff Command
**Issue ID:** `grimoire-f4dk`

**Implementation:**
```bash
grimoire skills diff beads

Changes if enabled:
┌─────────────────────────────────────────────────────────────┐
│ + .claude/skills/beads/SKILL.md (new file, 245 lines)      │
│ + .claude/skills/beads/scripts/run.py (new file)           │
│ ~ CLAUDE.md (+15 lines in managed section)                  │
│ + CLI: bd v2.0.0 (npm global)                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 4: Future Features (P3) — Ecosystem Leadership

### 4.1 Local Dev Mode (Watch)
**Issue ID:** `grimoire-9lo9`

```bash
grimoire skills dev ./my-skill

Watching ./my-skill for changes...
  ✓ Initial sync to .claude/skills/my-skill/

[12:34:56] SKILL.md changed → synced
[12:35:02] scripts/process.py changed → synced
  
Press Ctrl+C to stop
```

---

### 4.2 Central Skill Registry
**Issue ID:** `grimoire-5bt6`

```bash
grimoire registry browse   # Opens TUI or web browser

# Features:
# - Search by category, keyword, stars
# - Featured/curated lists
# - One-click install
# - Publish workflow
```

---

### 4.3 Skill Bundles/Groups
**Issue ID:** `grimoire-fsea`

```bash
grimoire skills install @web-stack
# Installs: html, css, javascript, typescript, react

grimoire skills install @documents
# Installs: pdf, docx, xlsx, pptx

grimoire bundle create my-bundle pdf docx xlsx
grimoire bundle install my-bundle
```

---

### 4.4 Skills Config File
**Issue ID:** `grimoire-n6ob`

```yaml
# .grimoire/skills.yaml
version: 1
agent: claude-code

skills:
  - name: pdf
    source: github:anthropics/skills#pdf
    version: "1.2.0"
  - name: custom-api
    source: ./local-skills/api
    
settings:
  auto_sync: true
  check_updates: weekly
```

```bash
grimoire skills apply   # Apply config file
```

---

### 4.5 Skill Status Dashboard
**Issue ID:** `grimoire-pk5h`

```bash
grimoire skills status

╭───────────────────────────────────────────────────────────╮
│                    Grimoire Skills                        │
├───────────────────────────────────────────────────────────┤
│ Project: /Users/dev/my-project                            │
│ Agent: Claude Code                                        │
├───────────────────────────────────────────────────────────┤
│ ENABLED (3)                          │ AVAILABLE (12)     │
│ ● pdf v1.2.0        ✓ up to date    │ ○ xlsx             │
│ ● docx v1.1.0       ↑ update: 1.2.0 │ ○ pptx             │
│ ● beads v2.0.0      ✓ up to date    │ ○ typescript       │
│                                      │ ○ ...              │
├───────────────────────────────────────────────────────────┤
│ Last sync: 2 hours ago  │  Cache: 15 skills (42 MB)      │
╰───────────────────────────────────────────────────────────╯
```

---

## Part 5: Multi-Agent & Enterprise Features

### 5.1 Universal Multi-Agent Support

**Current:** Claude Code, OpenCode, Generic
**Target:** + Cursor, Aider, Windsurf, Codex CLI

| Agent | Rules File | Skills Location | Format |
|-------|------------|-----------------|--------|
| Claude Code | CLAUDE.md | .claude/skills/ | SKILL.md (YAML frontmatter) |
| OpenCode | AGENTS.md | .opencode/agent/ | Markdown + JSON |
| Cursor | .cursorrules | .cursor/rules/ | MDC format |
| Aider | .aider.conf.yml | — | YAML |
| Windsurf | .windsurfrules | — | Markdown |
| Codex CLI | codex.md | — | Markdown |

**Implementation:**
```bash
grimoire skills enable pdf --target claude,cursor,opencode

# Generates:
# - .claude/skills/pdf/SKILL.md
# - .cursor/rules/pdf.mdc
# - Adds to AGENTS.md
```

---

### 5.2 Format Translation Layer

```bash
# Auto-convert between formats
grimoire convert ./skill.yaml --to cursor-mdc
grimoire convert ./.cursorrules --to skill-md
```

---

### 5.3 Unified Rules Management

```bash
grimoire rules init
grimoire rules edit
grimoire rules sync --target all

# Single source of truth → generates:
# - CLAUDE.md
# - AGENTS.md  
# - .cursorrules
# - .aider.conf.yml
```

---

### 5.4 MCP Server Management

```bash
grimoire mcp install fetch-server
grimoire mcp list
grimoire mcp sync

# Updates all agent MCP configs:
# - .cursor/mcp.json
# - .claude/mcp.json
# - .opencode/mcp.json
```

---

### 5.5 Team/Enterprise Features

```bash
# Private registries
grimoire registry add https://skills.company.com --auth token

# Team sharing
grimoire skills publish ./skill --registry company
grimoire skills install company:internal-api

# Access control
grimoire permissions set pdf --team backend --level read

# Audit logging
grimoire audit log --since "1 week ago"
```

---

## Part 6: Implementation Priority Matrix

| Phase | Features | Timeline | Dependencies |
|-------|----------|----------|--------------|
| **Phase 1: Compatibility** | SKILL.md-only, Personal skills, Multi-file | Week 1-2 | None |
| **Phase 2: Core DX** | Install command, Create command, Dry-run, Verbose | Week 3-4 | Phase 1 |
| **Phase 3: Polish** | Validation, Suggestions, Interactive, Errors | Week 5-6 | Phase 2 |
| **Phase 4: Multi-Agent** | Cursor, Aider, Windsurf support, Translation | Week 7-8 | Phase 2 |
| **Phase 5: Enterprise** | Registries, Teams, MCP, Audit | Week 9-12 | Phase 4 |

---

## Part 7: Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Time to first skill | ~2 min (4 commands) | < 30 sec | User testing |
| Skill creation time | Manual (~10 min) | < 2 min | `create` command |
| Agent coverage | 2 (Claude, OpenCode) | 6 | Config support |
| Community skills compatible | ~30% | 100% | Registry testing |
| Error resolution rate | Unknown | > 80% self-service | Support tickets |

---

## Appendix: Feature Dependency Graph

```
SKILL.md-only support (grimoire-4tk9)
    │
    ├──► Personal skills (grimoire-3uia)
    │        │
    │        └──► Skill scaffolding (grimoire-dm0w)
    │
    └──► Multi-file skills (grimoire-py0i)
             │
             └──► Skill scaffolding (grimoire-dm0w)

Single-command install (grimoire-ft2k)
    │
    └──► Interactive mode (grimoire-aass)

Dry-run mode (grimoire-qkhr)
    │
    └──► Skill diff command (grimoire-f4dk)

Skill validation (grimoire-g30h)
    │
    └──► Central registry (grimoire-5bt6)
             │
             └──► Skill bundles (grimoire-fsea)
```
