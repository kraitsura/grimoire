# Version Retention Quick Start Guide

## What is Version Retention?

Version retention automatically cleans up old versions of your prompts to manage storage efficiently, while preserving important versions you want to keep.

## Quick Commands

```bash
# View current settings
grimoire versions config

# Preview what would be deleted (safe, doesn't delete anything)
grimoire versions cleanup --preview

# Tag a version to preserve it forever
grimoire versions tag my-prompt 5 stable

# Run cleanup (deletes old versions)
grimoire versions cleanup

# Clean up a specific prompt
grimoire versions cleanup my-prompt

# List tagged versions
grimoire versions tags my-prompt

# Remove a tag
grimoire versions untag my-prompt 5
```

## Default Settings

By default, Grimoire uses these retention settings:

- **Strategy:** `count` (keep only the last N versions)
- **Max versions:** `50` (keep the 50 most recent versions)
- **Retention days:** `90` (keep versions from last 90 days)
- **Preserve tagged:** `true` (never delete tagged versions)

## Protected Versions

These versions are NEVER deleted:

1. **Version 1** - Your initial version (historical record)
2. **HEAD** - The latest version (current state)
3. **Tagged versions** - Any version you've tagged (if preserveTagged is true)

## Retention Strategies

### Count Strategy (Default)
```
Keeps: Last 50 versions
Deletes: Anything beyond the 50 most recent
Use when: Storage is limited, you care about recent history
```

### Days Strategy
```
Keeps: Versions from last 90 days
Deletes: Anything older than 90 days
Use when: Time-based retention is required
```

### Both Strategy
```
Keeps: Versions that meet BOTH criteria
Deletes: Versions older than 90 days OR beyond 50 versions
Use when: Need strict storage limits
```

## Common Workflows

### Before Running Cleanup

1. **Preview what will be deleted:**
   ```bash
   grimoire versions cleanup --preview
   ```

2. **Tag any important versions:**
   ```bash
   grimoire versions tag my-prompt 10 production
   grimoire versions tag my-prompt 5 stable
   ```

3. **Run the cleanup:**
   ```bash
   grimoire versions cleanup
   ```

### Tag Important Versions

Tag versions you want to keep forever:

```bash
# Tag the production version
grimoire versions tag api-prompt 15 production

# Tag a stable version
grimoire versions tag api-prompt 12 stable

# Tag a backup version
grimoire versions tag api-prompt 8 backup

# View all tags
grimoire versions tags api-prompt
```

Output:
```
Tagged versions for: api-prompt

  v15 - production
    2024-12-13 10:30
  v12 - stable
    2024-12-10 14:15
  v8 - backup
    2024-12-05 09:00
```

### Change Retention Settings

Currently, you need to update settings programmatically:

```typescript
import { Effect } from "effect";
import { RetentionService } from "./services";

const updateSettings = Effect.gen(function* () {
  const retention = yield* RetentionService;

  yield* retention.setConfig({
    maxVersionsPerPrompt: 100,  // Keep more versions
    retentionDays: 180,          // Keep for 6 months
    strategy: "both",            // Apply both limits
    preserveTaggedVersions: true // Keep tagged versions
  });
});
```

## Examples

### Example 1: Clean up a single prompt

```bash
# First, preview
grimoire versions cleanup --preview

# Check which versions of specific prompt will be deleted
# (Look for your prompt in the output)

# Tag any important versions
grimoire versions tag my-prompt 5 important

# Run cleanup for just that prompt
grimoire versions cleanup my-prompt
```

### Example 2: Tag then cleanup workflow

```bash
# List all versions to find important ones
grimoire history my-prompt

# Tag the important versions
grimoire versions tag my-prompt 10 production
grimoire versions tag my-prompt 5 stable

# Preview to confirm tags are working
grimoire versions cleanup --preview
# (Tagged versions won't appear in the delete list)

# Run cleanup
grimoire versions cleanup
```

### Example 3: View and manage tags

```bash
# List all tags for a prompt
grimoire versions tags my-prompt

# Remove a tag if no longer needed
grimoire versions untag my-prompt 8

# Verify it's removed
grimoire versions tags my-prompt
```

## Understanding the Preview

When you run `grimoire versions cleanup --preview`, you'll see:

```
Version Cleanup Preview

Would delete: 15 version(s)
Prompts affected: 3

Details:

my-api-prompt
  5 version(s) to delete:

  - v2 (2024-09-15 14:30)
    Exceeds max versions (50)
  - v3 (2024-09-16 09:45)
    Exceeds max versions (50)
  - v4 (2024-09-17 11:20)
    Exceeds max versions (50)
```

**What this means:**
- 15 total versions will be deleted
- 3 prompts are affected
- For each version, you see:
  - Version number
  - Creation date
  - Reason for deletion

## Safety Features

### Always Protected
- Version 1 (initial)
- Latest version (HEAD)
- Tagged versions (if enabled)

### Preview Mode
- Always preview before cleanup
- No data is deleted in preview mode
- See exactly what will be removed

### Tagging
- Tag any version to preserve it
- Tags persist across cleanups
- Can remove tags if no longer needed

## Troubleshooting

### "Would delete too many versions"

If preview shows too many deletions:

1. **Tag important versions first:**
   ```bash
   grimoire versions tag my-prompt 10 keep
   ```

2. **Adjust retention settings** (see programmatic example above)

3. **Run cleanup per-prompt** instead of globally:
   ```bash
   grimoire versions cleanup my-prompt
   ```

### "No versions to clean up"

This means all versions are within your retention policy. No action needed!

### "Can't delete version 1 or HEAD"

This is expected and correct behavior. These versions are always protected.

## Best Practices

### 1. Always Preview First
```bash
grimoire versions cleanup --preview
```

### 2. Tag Production Versions
```bash
grimoire versions tag my-prompt <version> production
```

### 3. Regular Cleanup
Run cleanup regularly to manage storage:
```bash
# Weekly or monthly
grimoire versions cleanup --preview
grimoire versions cleanup
```

### 4. Meaningful Tag Names
Use descriptive tags:
- `production` - Currently deployed
- `stable` - Known good version
- `backup` - Safe fallback
- `milestone` - Important checkpoint

### 5. Review Tags Periodically
```bash
# Check what you have tagged
grimoire versions tags my-prompt

# Remove outdated tags
grimoire versions untag my-prompt 5
```

## More Information

- **Full Documentation:** `examples/RETENTION_README.md`
- **Usage Examples:** `examples/retention-example.ts`
- **Implementation Details:** `IMPLEMENTATION_SUMMARY.md`
- **Tests:** `tests/retention-service.test.ts`

## Need Help?

```bash
# View all available commands
grimoire versions --help

# View config details
grimoire versions config
```
