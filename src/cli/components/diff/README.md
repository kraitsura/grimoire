# Diff Components

Ink components for displaying diffs, version history, and managing branches in the Grimoire CLI.

## Components

### DiffViewer

Displays a unified diff with color-coded additions and deletions.

**Features:**
- Color-coded additions (green) and deletions (red)
- Line numbers with context
- Hunk headers with cyan highlighting
- Scrollable for long diffs
- Keyboard navigation (j/k, g/G, page up/down)
- Stats summary (additions/deletions/unchanged)

**Usage:**
```tsx
import { DiffViewer } from './components/diff';

<DiffViewer
  diff={diffResult}
  focused={true}
  height={20}
  showStats={true}
/>
```

**Props:**
- `diff: DiffResult` - The diff to display
- `focused?: boolean` - Whether keyboard input is active (default: false)
- `height?: number` - Visible height in lines (default: 20)
- `showStats?: boolean` - Show addition/deletion stats (default: true)

**Keyboard Controls:**
- `j`/`↓` - Scroll down
- `k`/`↑` - Scroll up
- `g` - Jump to top
- `G` - Jump to bottom
- `Page Up`/`Page Down` - Scroll by page

---

### SideBySideDiffViewer

Displays a side-by-side comparison of old and new content.

**Features:**
- Old content on left, new on right
- Aligned line numbers
- Color-coded changes (red for removed, green for added)
- Synchronized scrolling
- Column width control
- Truncation for long lines

**Usage:**
```tsx
import { SideBySideDiffViewer } from './components/diff';

<SideBySideDiffViewer
  diff={sideBySideDiff}
  focused={true}
  height={20}
  columnWidth={40}
/>
```

**Props:**
- `diff: SideBySideDiff` - The side-by-side diff to display
- `focused?: boolean` - Whether keyboard input is active (default: false)
- `height?: number` - Visible height in lines (default: 20)
- `columnWidth?: number` - Width of each column (default: 40)

**Keyboard Controls:**
- Same as DiffViewer

---

### HistoryViewer

Displays a list of versions with expandable diffs.

**Features:**
- List of versions with metadata
- Expandable to show diffs between versions
- Navigate with arrow keys or j/k
- Select version to view
- Restore to previous version
- Relative timestamps (e.g., "2h ago")
- Branch information

**Usage:**
```tsx
import { HistoryViewer } from './components/diff';

<HistoryViewer
  versions={versionList}
  diffs={diffMap}
  focused={true}
  height={15}
  onSelect={(version) => console.log('Selected:', version)}
  onRestore={(version) => console.log('Restoring:', version)}
/>
```

**Props:**
- `versions: PromptVersion[]` - List of versions to display
- `diffs?: Map<number, DiffResult>` - Map of version number to diff from previous
- `focused?: boolean` - Whether keyboard input is active (default: false)
- `height?: number` - Visible height in lines (default: 15)
- `onSelect?: (version: PromptVersion) => void` - Called when version is selected
- `onRestore?: (version: PromptVersion) => void` - Called when restore is requested

**Keyboard Controls:**
- `j`/`↓` - Move selection down
- `k`/`↑` - Move selection up
- `g` - Jump to top
- `G` - Jump to bottom
- `Enter`/`Space` - Expand/collapse diff
- `r` - Restore to selected version
- `s` - Select version

---

### RollbackConfirm

Confirmation dialog for rollback operations with diff preview.

**Features:**
- Shows current and target version information
- Diff preview of changes
- Confirm/Cancel buttons
- Keyboard navigation between buttons
- Quick keys (y/n)

**Usage:**
```tsx
import { RollbackConfirm } from './components/diff';

<RollbackConfirm
  currentVersion={currentVer}
  targetVersion={targetVer}
  diff={diffResult}
  focused={true}
  onConfirm={() => performRollback()}
  onCancel={() => cancelRollback()}
/>
```

**Props:**
- `currentVersion: PromptVersion` - Current version
- `targetVersion: PromptVersion` - Target version to rollback to
- `diff: DiffResult` - Diff between current and target
- `focused?: boolean` - Whether keyboard input is active (default: false)
- `onConfirm: () => void` - Called when rollback is confirmed
- `onCancel: () => void` - Called when rollback is cancelled

**Keyboard Controls:**
- `h`/`←` - Select Cancel
- `l`/`→` - Select Confirm
- `Enter` - Execute selected action
- `y` - Quick confirm
- `n`/`Esc` - Quick cancel

---

### BranchManager

Manages prompt branches with visual indicators.

**Features:**
- List all branches
- Visual active branch indicator
- Create new branches
- Switch between branches
- Delete branches
- Merge branches
- Branch comparison info (ahead/behind)
- Scrollable list

**Usage:**
```tsx
import { BranchManager } from './components/diff';

<BranchManager
  branches={branchList}
  activeBranch={currentBranch}
  comparisons={comparisonMap}
  focused={true}
  height={15}
  onCreate={(name) => createBranch(name)}
  onSwitch={(branch) => switchToBranch(branch)}
  onDelete={(branch) => deleteBranch(branch)}
  onMerge={(source, target) => mergeBranches(source, target)}
/>
```

**Props:**
- `branches: Branch[]` - List of branches
- `activeBranch: Branch` - Currently active branch
- `comparisons?: Map<string, BranchComparison>` - Branch comparison data
- `focused?: boolean` - Whether keyboard input is active (default: false)
- `height?: number` - Visible height in lines (default: 15)
- `onCreate?: (name: string) => void` - Called when creating new branch
- `onSwitch?: (branch: Branch) => void` - Called when switching branches
- `onDelete?: (branch: Branch) => void` - Called when deleting branch
- `onMerge?: (source: Branch, target: Branch) => void` - Called when merging branches

**Keyboard Controls:**
- `j`/`↓` - Move selection down
- `k`/`↑` - Move selection up
- `g` - Jump to top
- `G` - Jump to bottom
- `Enter`/`s` - Switch to selected branch
- `c` - Create new branch (enters input mode)
- `d` - Delete selected branch
- `m` - Merge selected branch into active branch

**Create Mode:**
- Type to enter branch name
- `Enter` - Create branch
- `Esc` - Cancel

---

## Integration with Services

These components work with the following Effect services:

- **DiffService** (`src/services/diff-service.ts`) - Computes diffs between content
- **VersionService** (`src/services/version-service.ts`) - Manages version history
- **BranchService** (`src/services/branch-service.ts`) - Manages branches

## Example

See `/examples/diff-components-usage.tsx` for comprehensive usage examples of all components.

## Patterns Used

- **ScrollableBox pattern** - Inherited from `src/cli/components/input/scrollable-box.tsx`
- **Keyboard navigation** - Using `useInput` hook from Ink
- **Effect integration** - Components accept data from Effect services
- **Callback props** - For handling user actions

## Design Decisions

1. **Separate concerns**: Each component has a single responsibility
2. **Composable**: Components can be used together or separately
3. **Accessible**: Keyboard navigation throughout
4. **Visual feedback**: Clear indicators for state (selected, active, etc.)
5. **Scrollable**: All lists support scrolling for long content
6. **Effect-agnostic**: Components receive processed data, not Effects
