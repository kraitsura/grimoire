# Version Retention Policy Implementation

This document describes the version retention policy implementation for Grimoire.

## Overview

The retention system provides configurable version cleanup to manage storage efficiently while preserving important versions.

## Components

### 1. RetentionService (`src/services/retention-service.ts`)

The core service that handles version retention logic.

**Key Features:**
- Configurable retention policies (count, days, or both)
- Version tagging to preserve important versions
- Preview mode to see what would be deleted
- Per-prompt or global cleanup operations

**Configuration:**
```typescript
interface RetentionConfig {
  maxVersionsPerPrompt: number;  // Keep last 50 versions (default)
  retentionDays: number;          // Keep versions from last 90 days (default)
  strategy: "count" | "days" | "both";  // How to apply limits
  preserveTaggedVersions: boolean;      // Never delete tagged versions (default: true)
}
```

**Strategies:**
- `count`: Keep only the last N versions per prompt
- `days`: Delete versions older than N days
- `both`: Delete if EITHER limit is exceeded

**Protected Versions:**
- Version 1 (initial version) is always kept
- HEAD (latest version) is always kept
- Tagged versions are preserved (if `preserveTaggedVersions` is true)

### 2. VersionsCommand (`src/commands/versions.ts`)

CLI interface for managing versions and retention.

**Available Subcommands:**

```bash
# Preview cleanup (shows what would be deleted)
grimoire versions cleanup --preview

# Run cleanup for all prompts
grimoire versions cleanup

# Run cleanup for specific prompt
grimoire versions cleanup <prompt-name>

# Tag a version to preserve it
grimoire versions tag <prompt-name> <version> <tag>

# Remove tag from a version
grimoire versions untag <prompt-name> <version>

# List tagged versions for a prompt
grimoire versions tags <prompt-name>

# Show current retention configuration
grimoire versions config

# Update retention configuration (interactive)
grimoire versions config --set
```

### 3. Database Schema (Migration #7)

Two new tables added:

**version_tags:**
- Stores tags for specific versions
- Primary key: (prompt_id, version)
- Indexed on prompt_id for fast lookups

**config:**
- Stores key-value configuration
- Retention config stored as `retention.*` keys
- Values stored as JSON strings

## Usage Examples

### Example 1: Preview Cleanup

```bash
grimoire versions cleanup --preview
```

Output:
```
Version Cleanup Preview

Would delete: 15 version(s)
Prompts affected: 3

Details:

my-prompt
  5 version(s) to delete:

  - v2 (2024-10-15 14:30)
    Exceeds max versions (50)
  - v3 (2024-10-16 09:45)
    Exceeds max versions (50)
  ...
```

### Example 2: Tag Important Versions

```bash
# Tag version 5 as "stable"
grimoire versions tag my-prompt 5 stable

# Tag version 10 as "production"
grimoire versions tag my-prompt 10 production

# List tagged versions
grimoire versions tags my-prompt
```

Output:
```
Tagged versions for: my-prompt

  v10 - production
    2024-12-01 10:00
  v5 - stable
    2024-11-15 14:30
```

### Example 3: Run Cleanup

```bash
# Run cleanup (prompts for confirmation)
grimoire versions cleanup
```

Output:
```
Running Version Cleanup

Cleanup complete:
  Deleted: 15 version(s)
  Prompts affected: 3
```

### Example 4: View Configuration

```bash
grimoire versions config
```

Output:
```
Retention Configuration

Strategy: count
Max versions per prompt: 50
Retention days: 90
Preserve tagged versions: yes

Strategy meanings:
  count - Keep only the last N versions
  days - Delete versions older than N days
  both - Delete if either limit is exceeded

Protected versions:
  - Version 1 (initial) is always kept
  - HEAD (latest) is always kept
  - Tagged versions are preserved
```

## Programmatic Usage

### Using the Service Directly

```typescript
import { Effect, Layer } from "effect";
import {
  RetentionService,
  RetentionServiceLive,
  SqlLive,
} from "./services";

// Set up application layer
const AppLive = Layer.mergeAll(
  SqlLive,
  RetentionServiceLive.pipe(Layer.provide(SqlLive))
);

// Use the service
const program = Effect.gen(function* () {
  const retention = yield* RetentionService;

  // Get current config
  const config = yield* retention.getConfig();
  console.log("Current config:", config);

  // Preview cleanup
  const preview = yield* retention.previewCleanup();
  console.log("Would delete:", preview.totalVersionsToDelete, "versions");

  // Tag a version
  yield* retention.tagVersion("prompt-123", 5, "stable");

  // Run cleanup
  const result = yield* retention.cleanupAll();
  console.log("Deleted:", result.totalVersionsDeleted, "versions");
});

// Run it
Effect.runPromise(program.pipe(Effect.provide(AppLive)));
```

### Updating Configuration

```typescript
const updateConfig = Effect.gen(function* () {
  const retention = yield* RetentionService;

  const newConfig = {
    maxVersionsPerPrompt: 100,
    retentionDays: 180,
    strategy: "both" as const,
    preserveTaggedVersions: true,
  };

  yield* retention.setConfig(newConfig);
  console.log("Config updated!");
});
```

## Implementation Details

### Cleanup Logic

1. **Fetch all versions** for the prompt with tag information
2. **Identify protected versions:**
   - Version 1 (initial)
   - Latest version (HEAD)
   - Tagged versions (if `preserveTaggedVersions` is true)
3. **Apply retention strategy:**
   - `count`: Sort by version DESC, keep first N unprotected versions
   - `days`: Keep versions newer than cutoff date
   - `both`: Apply both rules, delete if either limit exceeded
4. **Delete versions** that don't meet criteria

### Database Queries

The service uses efficient SQL queries with:
- LEFT JOIN to get tag information
- Indexed lookups on prompt_id
- Batch deletes with placeholders
- Transaction support for atomicity

### Error Handling

All operations return Effect types with proper error channels:
- `SqlError`: Database operation failures
- `ConfigError`: Invalid configuration
- `StorageError`: File system issues

## Testing

See `examples/retention-example.ts` for comprehensive usage examples including:
- Configuration management
- Cleanup preview
- Version tagging
- Complete workflows

## Future Enhancements

Potential improvements:
1. Automated cleanup on schedule (cron-like)
2. Per-prompt retention overrides
3. Retention based on version size
4. Cleanup dry-run with interactive selection
5. Retention analytics and reporting
6. Integration with backup systems

## Migration

The database schema is automatically migrated when running Grimoire:
- Migration #7 adds the `version_tags` and `config` tables
- Default retention config is inserted
- Existing versions are not affected

To manually trigger migration:
```typescript
import { MigrationService } from "./services";

const migrate = Effect.gen(function* () {
  const migration = yield* MigrationService;
  const applied = yield* migration.migrate();
  console.log("Applied migrations:", applied);
});
```
