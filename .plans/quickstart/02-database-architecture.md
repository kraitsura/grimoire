# Database Architecture

## Overview

Hybrid storage: Markdown files for content + SQLite for metadata/search.

## File System Layout

```
~/.grimoire/
├── prompts/
│   ├── coding-assistant.md
│   └── creative-writer.md
├── templates/
│   └── system-prompt.md
├── grimoire.db          # SQLite
└── config.yaml
```

## Markdown Format with YAML Frontmatter

```markdown
---
id: 550e8400-e29b-41d4-a716-446655440000
name: Coding Assistant
tags:
  - coding
  - typescript
created: 2024-01-01T00:00:00Z
updated: 2024-01-15T10:30:00Z
version: 3
---

<system>
You are a helpful coding assistant...
</system>

<examples>
...
</examples>
```

## SQLite Schema

```sql
CREATE TABLE prompts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    content_hash TEXT NOT NULL,
    is_template INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE prompt_tags (
    prompt_id TEXT REFERENCES prompts(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (prompt_id, tag_id)
);

CREATE TABLE prompt_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_id TEXT REFERENCES prompts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    frontmatter_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(prompt_id, version)
);

-- FTS5 for full-text search
CREATE VIRTUAL TABLE prompts_fts USING fts5(
    name, content, tags,
    content=prompts,
    content_rowid=rowid,
    tokenize='porter unicode61'
);
```

## SqlService

```typescript
// src/services/sql-service.ts
import { Context, Effect, Layer } from "effect"
import { Database } from "bun:sqlite"

class SqlService extends Context.Tag("SqlService")<SqlService, {
  readonly query: <T>(sql: string, params?: unknown[]) => Effect.Effect<T[], SqlError>
  readonly run: (sql: string, params?: unknown[]) => Effect.Effect<void, SqlError>
  readonly transaction: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E | SqlError>
}>() {}

export const SqlServiceLive = Layer.scoped(
  SqlService,
  Effect.gen(function* () {
    const db = yield* Effect.acquireRelease(
      Effect.sync(() => new Database("~/.grimoire/grimoire.db", { create: true })),
      (db) => Effect.sync(() => db.close())
    )
    db.exec("PRAGMA journal_mode = WAL")
    db.exec("PRAGMA foreign_keys = ON")

    return { /* implementation */ }
  })
)
```

## PromptStorageService

```typescript
// src/services/prompt-storage-service.ts
import matter from "gray-matter"

class PromptStorageService extends Context.Tag("PromptStorageService")<
  PromptStorageService,
  {
    readonly readPrompt: (path: string) => Effect.Effect<ParsedPrompt, FileError>
    readonly writePrompt: (path: string, frontmatter: Frontmatter, content: string) => Effect.Effect<void, FileError>
    readonly listPrompts: () => Effect.Effect<string[], FileError>
    readonly computeHash: (content: string) => Effect.Effect<string>
  }
>() {}
```

## SyncService

```typescript
// src/services/sync-service.ts
class SyncService extends Context.Tag("SyncService")<SyncService, {
  readonly fullSync: () => Effect.Effect<SyncResult>
  readonly syncFile: (path: string) => Effect.Effect<void, SyncError>
}>() {}
```

## Migration System

```typescript
const migrations: Migration[] = [
  {
    version: 1,
    description: "Initial schema",
    up: [/* SQL statements */]
  }
]

class MigrationService extends Context.Tag("MigrationService")<
  MigrationService,
  {
    readonly getCurrentVersion: () => Effect.Effect<number>
    readonly migrate: () => Effect.Effect<number[]>
  }
>() {}
```

## Implementation Checklist

- [ ] Create SqlService with Bun's native SQLite
- [ ] Implement PromptStorageService with gray-matter
- [ ] Define frontmatter schema with Effect Schema
- [ ] Create migration system
- [ ] Set up FTS5 virtual table and triggers
- [ ] Implement SyncService for file-DB sync
- [ ] Add file watching with Bun
