# Implementation Plan to Beads Converter Skill

> **Convert phased implementation markdown documents into properly structured beads issue hierarchies**
>
> **Invoke with**: When you have completed a phased implementation plan document and need to convert it into beads
>
> **Purpose**: Ensures consistent epic/phase/task structure with proper dependencies and human-readable issue titles

---

## When to Use This Skill

Invoke this skill when you need to:
- Convert a phased implementation plan markdown document into beads
- Create a structured hierarchy of epics, phases, and tasks
- Set up proper blocking relationships between phases
- Identify and mark independent tasks that can run in parallel
- Ensure all work is tracked in beads before starting implementation

---

## Core Principles

### Human-Readable Titles

All beads titles must be:
- **Action-oriented**: Start with a verb (Implement, Create, Add, Update, Fix, Refactor, etc.)
- **Specific**: Include what component/feature/file is affected
- **Concise**: 5-15 words maximum
- **Contextual**: Include enough context to understand without reading description

**Title Patterns**:

```
Epics:
- "[Feature] Implementation" (e.g., "Email Sync Implementation", "Auth System Overhaul")
- "Phase N: [Brief Description]" (e.g., "Phase 1: Core Infrastructure", "Phase 2: UI Components")

Tasks:
- "[Component] Action description" (e.g., "EmailThread: Add pagination support")
- "Implement [feature] in [component]" (e.g., "Implement rate limiting in API client")
- "Create [thing] for [purpose]" (e.g., "Create webhook handler for DocuSign events")
- "Fix [issue] in [component]" (e.g., "Fix race condition in email sync")
- "Refactor [component] to [goal]" (e.g., "Refactor auth flow to use Clerk")
```

### Issue Type Guidelines

- **Epic**: Large initiatives spanning multiple phases (e.g., "Email Sync Implementation")
- **Feature**: Single complete feature within a phase (e.g., "Add OAuth flow for Nylas")
- **Task**: Individual actionable work item (e.g., "Create database schema for emails")
- **Bug**: Fix for a specific issue (e.g., "Fix duplicate email ingestion")
- **Chore**: Maintenance work (e.g., "Update dependencies to latest versions")

### Priority Mapping

Map priority based on:
- **p0** (Critical/Blocker): Must be done first, blocks everything
- **p1** (High): Core functionality, blocks major features
- **p2** (Medium): Standard tasks, default priority
- **p3** (Low): Nice-to-haves, polish items
- **p4** (Backlog): Future work, not immediate

---

## Labeling Strategy

**CRITICAL**: Labels enable agents to focus on specific features/phases without context pollution from unrelated work.

### Required Label Categories

Every task MUST have labels from these categories:

#### 1. Feature Label (Required)
Derive from the feature/initiative name. Use kebab-case.

```
feature:<feature-name>
```

Examples:
- `feature:email-sync`
- `feature:auth-overhaul`
- `feature:docusign-integration`
- `feature:contact-management`

#### 2. Phase Label (Required for phase-bound tasks)
Indicates which phase the task belongs to.

```
phase:<N>
```

Examples:
- `phase:1`
- `phase:2`
- `phase:3`

#### 3. Area Labels (Recommended)
Technical area the task affects.

```
area:<area-name>
```

Common areas:
- `area:convex` - Backend/database work
- `area:frontend` - React/UI components
- `area:api` - API endpoints, external integrations
- `area:schema` - Database schema changes
- `area:ui` - Visual/styling work
- `area:testing` - Test-related work
- `area:infra` - Infrastructure, deployment

#### 4. Work Type Labels (Recommended)
Nature of the work.

- `type:research` - Investigation, spikes, exploration
- `type:implementation` - Core coding work
- `type:testing` - Writing/updating tests
- `type:docs` - Documentation
- `type:design` - Design work, mockups
- `type:refactor` - Refactoring existing code

#### 5. Special Status Labels
- `independent` - No phase dependencies, can start anytime
- `early-start` - Future phase task that can begin before its phase
- `parallel` - Can run in parallel with other work
- `blocked-external` - Blocked by something outside beads (e.g., waiting on API access)

### Label Filtering for Focused Work

Agents can filter to reduce context pollution:

```bash
# Focus on one feature only
bd list --label=feature:email-sync

# Focus on one phase of one feature
bd list --label=feature:email-sync --label=phase:1

# Find all independent/early-start work across features
bd list --label=independent
bd list --label=early-start

# Find ready work for a specific feature
bd ready --label=feature:email-sync

# Find backend work only
bd list --label=area:convex
```

### Multi-Feature Projects

When an implementation plan covers multiple features:

1. Create separate master epics for each feature
2. Use distinct `feature:*` labels for each
3. Agents working on Feature A filter with `--label=feature:a` to ignore Feature B beads
4. Cross-feature dependencies use `related` dep type, not `blocks`

---

## Workflow

### Step 1: Parse the Implementation Document

Identify and extract:
- **Project/Feature Name**: Main title or heading
- **Phases**: Look for:
  - "Phase 1:", "Phase 2:", etc.
  - "## Phase", "### Phase", etc.
  - Numbered sections that represent sequential phases
- **Tasks within each phase**: Bulleted lists, numbered lists, or paragraphs describing work
- **Explicit dependencies**: Any "depends on", "requires", "blocked by" mentions
- **Independent work**: Tasks marked as "parallel", "independent", or "can start immediately"

### Step 2: Set Context

Always start by setting the workspace context:

```typescript
mcp__plugin_beads_beads__set_context({
  workspace_root: "/Users/aaryareddy/Projects/colosseum/colosseum-hq"
})
```

### Step 3: Derive Feature Slug

Before creating any beads, derive a consistent feature slug from the initiative name:

```
"Email Sync Implementation" → feature:email-sync
"Auth System Overhaul" → feature:auth-overhaul
"DocuSign Integration" → feature:docusign
```

This slug will be used on ALL beads for this feature.

### Step 4: Create Master Epic

Create a top-level epic for the entire initiative:

```typescript
mcp__plugin_beads_beads__create({
  title: "[Feature Name] Implementation",  // e.g., "Email Sync Implementation"
  issue_type: "epic",
  priority: 1,
  description: "Master epic for [brief description of initiative]",
  design: "[Optional: Link to design doc or high-level architecture notes]",
  labels: ["feature:email-sync"]  // Feature label on epic too
})
```

### Step 5: Create Phase Epics

For each phase in the plan, create a child epic:

```typescript
mcp__plugin_beads_beads__create({
  title: "Phase N: [Phase Description]",  // e.g., "Phase 1: Database Schema & Models"
  issue_type: "epic",
  priority: 1,
  description: "[Summary of what this phase accomplishes]",
  labels: ["feature:email-sync", "phase:1"],  // Feature + Phase labels
  deps: ["<master-epic-id>"]  // Link to master epic as parent
})
```

### Step 6: Add Phase-Level Blocking

**CRITICAL**: Each phase should block the next phase to enforce sequential execution:

```typescript
// Phase 2 blocks on Phase 1
mcp__plugin_beads_beads__dep({
  issue_id: "<phase-2-id>",
  depends_on_id: "<phase-1-id>",
  dep_type: "blocks"
})

// Phase 3 blocks on Phase 2
mcp__plugin_beads_beads__dep({
  issue_id: "<phase-3-id>",
  depends_on_id: "<phase-2-id>",
  dep_type: "blocks"
})
```

### Step 7: Create Tasks Within Phases

For each task identified in the implementation doc:

```typescript
mcp__plugin_beads_beads__create({
  title: "[Component] Action description",  // Human-readable, action-oriented
  issue_type: "task",  // or "feature", "bug", "chore" as appropriate
  priority: 2,  // Map from implementation doc or use default
  description: "[Detailed description from the plan]",
  acceptance: "[Optional: Specific criteria for completion]",
  labels: [
    "feature:email-sync",     // REQUIRED: Feature label
    "phase:1",                // REQUIRED: Phase label
    "area:convex",            // RECOMMENDED: Technical area
    "type:implementation"     // RECOMMENDED: Work type
  ],
  deps: ["<phase-epic-id>"]  // Link to parent phase epic
})
```

**Label Assignment**:
- Feature label: Always the same for all tasks in the initiative
- Phase label: Match the phase epic this task belongs to
- Area label: Determine from task description (backend → `area:convex`, UI → `area:frontend`, etc.)
- Type label: Determine from task nature (coding → `type:implementation`, tests → `type:testing`, etc.)

**Priority Determination**:
- Keywords like "critical", "must", "required", "blocker" → p0 or p1
- Core functionality, main features → p1
- Standard implementation tasks → p2 (default)
- Polish, optimization, nice-to-have → p3
- Future enhancements, backlog items → p4

### Step 8: Add Intra-Phase Dependencies

Within each phase, identify tasks that depend on others:

**Patterns to look for**:
- "After completing X, do Y"
- "Requires X to be done first"
- "Build on top of X"
- "Uses the API created in X"

```typescript
mcp__plugin_beads_beads__dep({
  issue_id: "<dependent-task-id>",
  depends_on_id: "<blocking-task-id>",
  dep_type: "blocks"
})
```

### Step 9: Identify Independent & Early-Start Tasks

**CRITICAL**: Not all tasks need to be blocked by phase dependencies. Identify tasks that can proceed early.

#### Category 1: Truly Independent Tasks

Tasks with NO technical dependency on any phase work:

**Common types**:
- Research/investigation ("Research X options", "Spike: Evaluate Y")
- Documentation drafts ("Draft API documentation", "Write migration guide")
- Design exploration ("Explore UI patterns", "Evaluate library options")
- Planning ("Plan deployment strategy", "Document error handling approach")

**How to handle**:
- Create WITHOUT any phase epic dependency
- Add `independent` label
- Still add `feature:*` label for filtering

```typescript
mcp__plugin_beads_beads__create({
  title: "Research Nylas webhook security best practices",
  issue_type: "task",
  priority: 2,
  description: "Document webhook signature verification and payload validation",
  labels: [
    "feature:email-sync",   // Still belongs to feature
    "independent",          // Not blocked by any phase
    "type:research"
  ]
  // NO deps - truly independent
})
```

#### Category 2: Early-Start Future Phase Tasks

Tasks that are logically in a later phase but have NO technical dependency on earlier phases:

**Key Question**: "Can I do this task right now, even if Phase 1 isn't done?"

**Examples of early-startable tasks**:

| Task | Phase | Why Early-Startable |
|------|-------|---------------------|
| "Create UI mockups for email thread view" | Phase 3 (UI) | Doesn't need backend done |
| "Write E2E test scenarios" | Phase 4 (Testing) | Can plan tests before code exists |
| "Design error message copy" | Phase 2 | Doesn't need API done |
| "Set up monitoring dashboard" | Phase 3 | Can scaffold before code ships |
| "Document API contract" | Phase 2 | Can design API before implementing |

**How to identify**:
1. Ask: "Does this task need output from an earlier phase?"
2. If NO → Mark as `early-start`
3. If YES → Keep phase-blocked

**How to handle**:
- Create WITH the phase epic as parent (for organization)
- Add `early-start` label
- Do NOT add blocking dependency on the phase epic

```typescript
// Phase 3 task that can start immediately
mcp__plugin_beads_beads__create({
  title: "Create UI mockups for email thread view",
  issue_type: "task",
  priority: 3,
  description: "Design mockups for the email thread display component",
  labels: [
    "feature:email-sync",
    "phase:3",              // Logically belongs to Phase 3
    "early-start",          // But can start before Phase 3
    "area:ui",
    "type:design"
  ]
  // NO deps on phase epic - early-startable
})
```

#### Category 3: Parallel Track Tasks

Tasks within the SAME phase that don't depend on each other:

```typescript
// These are both Phase 1 tasks but don't block each other
// Task A: Schema work
mcp__plugin_beads_beads__create({
  title: "Create email_grants table in Convex schema",
  labels: ["feature:email-sync", "phase:1", "area:schema"],
  deps: ["<phase-1-epic-id>"]  // Blocked by Phase 1 epic
})

// Task B: OAuth work (parallel to Task A)
mcp__plugin_beads_beads__create({
  title: "Implement Nylas OAuth redirect handling",
  labels: ["feature:email-sync", "phase:1", "area:api", "parallel"],
  deps: ["<phase-1-epic-id>"]  // Same phase, parallel track
})
```

#### Decision Tree for Task Blocking

```
For each task:
├── Has NO technical dependencies on any work?
│   └── YES → `independent` label, no deps
├── In future phase but no deps on earlier phases?
│   └── YES → `early-start` label, phase label, no blocking dep
├── In current phase but parallel to other phase work?
│   └── YES → `parallel` label, blocked by phase epic only
└── Has specific task dependencies?
    └── YES → Add explicit task deps with mcp__plugin_beads_beads__dep
```

### Step 10: Verify Structure

After creating all beads, verify the structure:

```bash
# Check dependency tree (use bv for complex visualizations)
bv --robot-insights

# See what's ready to work on now
bd ready --json

# Check for circular dependencies
bd validate --checks=cycles
```

### Step 11: Report Summary to User

Provide a clear summary:

```markdown
✅ **Beads structure created successfully**

**Feature Label**: `feature:email-sync` (use for filtering)

**Master Epic**: <id> - <title>

**Phases**:
- Phase 1: <id> - <title> (<N> tasks)
- Phase 2: <id> - <title> (<N> tasks, blocked by Phase 1)
- Phase 3: <id> - <title> (<N> tasks, blocked by Phase 2)

**Early-Startable Work**:
- Independent tasks: <count>
- Early-start future phase tasks: <count>
- Total ready now: <count>

**Ready Tasks**:
- <id>: <title> [labels]
- <id>: <title> [labels]

**Agent Focus Commands**:
```bash
# Focus on this feature only
bd list --label=feature:email-sync

# Ready work for this feature
bd ready --label=feature:email-sync

# Phase 1 work only
bd list --label=feature:email-sync --label=phase:1
```

**Next Steps**:
1. Run `bd ready --label=feature:email-sync` to see actionable work
2. Run `bv --robot-plan` to see execution plan with parallel tracks
3. Claim work with `bd update <id> --status=in_progress`
```

---

## Example: Email Sync Implementation

**Input**: Implementation plan with 3 phases for email sync feature

**Feature Slug**: `feature:email-sync`

**Output**:

```typescript
// 1. Master Epic
mcp__plugin_beads_beads__create({
  title: "Email Sync Implementation",
  issue_type: "epic",
  priority: 1,
  description: "Implement real-time email sync with Nylas API",
  labels: ["feature:email-sync"]
})
// Returns: colosseum-hq-100

// 2. Phase Epics
mcp__plugin_beads_beads__create({
  title: "Phase 1: Database Schema & Nylas OAuth",
  issue_type: "epic",
  priority: 1,
  description: "Set up database tables and authentication",
  labels: ["feature:email-sync", "phase:1"],
  deps: ["colosseum-hq-100"]
})
// Returns: colosseum-hq-101

mcp__plugin_beads_beads__create({
  title: "Phase 2: Email Ingestion & Webhooks",
  issue_type: "epic",
  priority: 1,
  description: "Implement email sync and real-time updates",
  labels: ["feature:email-sync", "phase:2"],
  deps: ["colosseum-hq-100"]
})
// Returns: colosseum-hq-102

mcp__plugin_beads_beads__create({
  title: "Phase 3: Email UI Components",
  issue_type: "epic",
  priority: 1,
  description: "Build email thread view and compose UI",
  labels: ["feature:email-sync", "phase:3"],
  deps: ["colosseum-hq-100"]
})
// Returns: colosseum-hq-103

// 3. Block phases sequentially
mcp__plugin_beads_beads__dep({
  issue_id: "colosseum-hq-102",
  depends_on_id: "colosseum-hq-101",
  dep_type: "blocks"
})
mcp__plugin_beads_beads__dep({
  issue_id: "colosseum-hq-103",
  depends_on_id: "colosseum-hq-102",
  dep_type: "blocks"
})

// 4. Phase 1 Tasks (phase-blocked)
mcp__plugin_beads_beads__create({
  title: "Create email_grants table in Convex schema",
  issue_type: "task",
  priority: 1,
  description: "Add email_grants table with fields: grantId, email, status, etc.",
  labels: ["feature:email-sync", "phase:1", "area:schema", "type:implementation"],
  deps: ["colosseum-hq-101"]
})

mcp__plugin_beads_beads__create({
  title: "Implement Nylas OAuth flow in convex/emails/grants/",
  issue_type: "task",
  priority: 1,
  description: "Create mutation for OAuth redirect and grant creation",
  labels: ["feature:email-sync", "phase:1", "area:api", "type:implementation"],
  deps: ["colosseum-hq-101"]
})

// 5. Independent Task (no phase dependency)
mcp__plugin_beads_beads__create({
  title: "Research Nylas webhook security best practices",
  issue_type: "task",
  priority: 2,
  description: "Document webhook signature verification and payload validation",
  labels: ["feature:email-sync", "independent", "type:research"]
  // NO deps - truly independent
})

// 6. Early-Start Task (Phase 3 task that can start now)
mcp__plugin_beads_beads__create({
  title: "Create UI mockups for email thread view",
  issue_type: "task",
  priority: 3,
  description: "Design mockups for email thread display component",
  labels: ["feature:email-sync", "phase:3", "early-start", "area:ui", "type:design"]
  // NO deps - logically Phase 3 but can start immediately
})

// 7. Early-Start Task (Phase 2 task that can start now)
mcp__plugin_beads_beads__create({
  title: "Document email webhook payload contract",
  issue_type: "task",
  priority: 2,
  description: "Define expected webhook payload structure for email events",
  labels: ["feature:email-sync", "phase:2", "early-start", "type:docs"]
  // NO deps - can design contract before Phase 1 is done
})
```

**Final Report**:
```
✅ Beads structure created successfully

Feature Label: `feature:email-sync` (use for filtering)

Master Epic: colosseum-hq-100 - Email Sync Implementation

Phases:
- Phase 1: colosseum-hq-101 - Database Schema & Nylas OAuth (5 tasks)
- Phase 2: colosseum-hq-102 - Email Ingestion & Webhooks (8 tasks, blocked by Phase 1)
- Phase 3: colosseum-hq-103 - Email UI Components (4 tasks, blocked by Phase 2)

Early-Startable Work:
- Independent tasks: 1
- Early-start future phase tasks: 2
- Total ready now: 8

Ready Tasks:
- colosseum-hq-104: Create email_grants table [phase:1, area:schema]
- colosseum-hq-105: Implement Nylas OAuth flow [phase:1, area:api]
- colosseum-hq-110: Research Nylas webhook security [independent, type:research]
- colosseum-hq-115: Create UI mockups for email thread [phase:3, early-start]
- colosseum-hq-116: Document email webhook payload contract [phase:2, early-start]

Agent Focus Commands:
  bd list --label=feature:email-sync           # All email-sync work
  bd ready --label=feature:email-sync          # Ready email-sync work
  bd list --label=feature:email-sync --label=phase:1  # Phase 1 only

Next Steps:
1. Run `bd ready --label=feature:email-sync` to see actionable work
2. Run `bv --robot-plan` to see execution plan with parallel tracks
3. Claim work with `bd update <id> --status=in_progress`
```

---

## Best Practices

### Title Clarity
- ✅ "ContactsTable: Add pagination to list query"
- ❌ "Add pagination" (too vague)
- ❌ "Update the contacts table query to support pagination for better performance" (too long)

### Issue Type Selection
- Use **epic** for: Multi-phase initiatives, large features (>10 tasks)
- Use **feature** for: Complete user-facing features (2-10 tasks)
- Use **task** for: Individual work items (most common)
- Use **bug** for: Fixes only
- Use **chore** for: Maintenance, deps, tooling

### Dependency Granularity
- **Phase-level**: Always block subsequent phases
- **Task-level**: Only add if there's a clear technical dependency
- **Avoid over-constraining**: Don't add deps unless necessary (let parallel work happen)

### Labels for Organization

See the **Labeling Strategy** section above for the complete labeling system.

**Required labels** (on every task):
- `feature:<name>` - Feature identifier for filtering
- `phase:<N>` - Phase number (unless independent)

**Recommended labels**:
- `area:*` - Technical area (convex, frontend, api, schema, ui, testing, infra)
- `type:*` - Work type (research, implementation, testing, docs, design, refactor)

**Special status labels**:
- `independent` - No phase dependencies
- `early-start` - Future phase task that can begin early
- `parallel` - Can run alongside other work
- `blocked-external` - Blocked by external factor

---

## Integration with CLAUDE.md

After using this skill, the beads structure becomes the source of truth for tracking work. Claude should:

1. Check `bd ready` before starting new work
2. Update issue status when claiming work (`bd update <id> --status=in_progress`)
3. Close issues when complete (`bd close <id>`)
4. Run session close protocol before ending sessions

This skill bridges the gap between planning (markdown docs) and execution (beads tracking).
