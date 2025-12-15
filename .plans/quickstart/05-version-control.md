# Version Control & History

## Overview

Version tracking, history viewing, rollback, and branching for A/B testing.

## Commands

### `history` Command

```
grimoire history <prompt-name>
  -n, --limit       Number of versions
  --all             Show all versions
  --diff            Show inline diffs
  --oneline         Compact format
  -i                Interactive mode
```

### `rollback` Command

```
grimoire rollback <prompt-name> <version>
  --preview         Show changes without applying
  --backup          Create backup (default: true)
  --reason          Reason for rollback
  --force           Skip confirmation
  -i                Interactive mode
```

### `branch` Command

```
grimoire branch <prompt-name> list
grimoire branch <prompt-name> create <name>
grimoire branch <prompt-name> switch <name>
grimoire branch <prompt-name> compare <a> <b>
grimoire branch <prompt-name> merge <source> [target]
```

## Schema

```sql
CREATE TABLE prompt_versions (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  frontmatter TEXT,
  created_at TEXT NOT NULL,
  author TEXT,
  change_reason TEXT,
  parent_version_id TEXT,
  branch_name TEXT DEFAULT 'main',
  is_head INTEGER DEFAULT 0,
  FOREIGN KEY (prompt_id) REFERENCES prompts(id),
  UNIQUE(prompt_id, version_number, branch_name)
);

CREATE TABLE branches (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_from_version TEXT,
  is_active INTEGER DEFAULT 0,
  FOREIGN KEY (prompt_id) REFERENCES prompts(id),
  UNIQUE(prompt_id, name)
);
```

## Services

### VersionService

```typescript
interface VersionService {
  readonly createVersion: (params: CreateVersionParams) => Effect.Effect<PromptVersion>
  readonly getVersion: (promptId: string, version: number, branch?: string) => Effect.Effect<PromptVersion>
  readonly listVersions: (promptId: string, options?: ListOptions) => Effect.Effect<PromptVersion[]>
  readonly getHead: (promptId: string, branch?: string) => Effect.Effect<PromptVersion>
  readonly rollback: (promptId: string, targetVersion: number, options?: RollbackOptions) => Effect.Effect<PromptVersion>
  readonly diff: (promptId: string, fromVersion: number, toVersion: number) => Effect.Effect<DiffResult>
}
```

### BranchService

```typescript
interface BranchService {
  readonly createBranch: (params: CreateBranchParams) => Effect.Effect<Branch>
  readonly listBranches: (promptId: string) => Effect.Effect<Branch[]>
  readonly switchBranch: (promptId: string, branchName: string) => Effect.Effect<Branch>
  readonly deleteBranch: (promptId: string, branchName: string) => Effect.Effect<void>
  readonly mergeBranch: (params: MergeParams) => Effect.Effect<PromptVersion, MergeConflictError>
  readonly compareBranches: (promptId: string, a: string, b: string) => Effect.Effect<BranchComparison>
}
```

### DiffService

Using `diff` npm package:

```typescript
interface DiffService {
  readonly computeDiff: (old: string, new: string, options?: DiffOptions) => Effect.Effect<DiffResult>
  readonly formatUnified: (diff: DiffResult, options?: FormatOptions) => Effect.Effect<string>
  readonly formatSideBySide: (diff: DiffResult, options?: FormatOptions) => Effect.Effect<SideBySideDiff>
}

// Using jsdiff library
const computeDiffImpl = (old: string, new: string) =>
  Effect.sync(() => {
    const changes = Diff.diffLines(old, new)
    const patch = Diff.structuredPatch("old", "new", old, new)
    return { changes, hunks: patch.hunks, additions, deletions }
  })
```

## Ink Components

- `DiffViewer` - Unified diff display
- `SideBySideDiffViewer` - Two-column diff
- `HistoryViewer` - Version timeline
- `RollbackConfirm` - Confirmation dialog
- `BranchManager` - Branch management UI
- `BranchComparison` - Side-by-side branch comparison

## Implementation Checklist

- [ ] Implement VersionService
- [ ] Implement BranchService
- [ ] Implement DiffService with `diff` package
- [ ] Create history command
- [ ] Create rollback command
- [ ] Create branch subcommands
- [ ] Build diff viewer components
- [ ] Add version retention policy
