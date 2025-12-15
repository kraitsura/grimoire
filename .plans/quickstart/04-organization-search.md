# Organization & Search

## Overview

Tag management, full-text search, import/export, and archiving.

## Commands

### `tag` Command

```
grimoire tag add <prompt> <tag>
grimoire tag remove <prompt> <tag>
grimoire tag list
grimoire tag rename <old> <new>
grimoire tag -i
```

### `search` Command

```
grimoire search <query>
  --tags, -t        Filter by tags
  --from            Date from
  --to              Date to
  --limit           Max results
  --fuzzy           Fuzzy matching
  -i                Interactive mode
```

### `export` Command

```
grimoire export
  --format, -f      json or yaml (default: json)
  --output, -o      File path or - for stdout
  --tags            Filter by tags
  --include-history Include version history
```

### `import` Command

```
grimoire import <source>
  --on-conflict     skip, rename, overwrite
  --dry-run         Preview without changes
  -i                Interactive mode
```

### `archive` Command

```
grimoire archive add <name>
grimoire archive list
grimoire archive restore <name>
```

## Services

### TagService

```typescript
interface TagService {
  readonly addTag: (promptId: string, tagName: string) => Effect.Effect<void>
  readonly removeTag: (promptId: string, tagName: string) => Effect.Effect<void>
  readonly listTags: () => Effect.Effect<TagWithCount[]>
  readonly renameTag: (oldName: string, newName: string) => Effect.Effect<void>
}
```

### SearchService (FTS5)

```typescript
interface SearchService {
  readonly search: (options: SearchOptions) => Effect.Effect<SearchResult[]>
  readonly suggest: (prefix: string) => Effect.Effect<string[]>
  readonly updateIndex: (promptId: string, name: string, content: string, tags: string[]) => Effect.Effect<void>
  readonly rebuildIndex: () => Effect.Effect<void>
}

// FTS5 query
const searchQuery = `
  SELECT p.id, p.name, snippet(prompts_fts, 1, '<mark>', '</mark>', '...', 64) as snippet,
         bm25(prompts_fts) as rank
  FROM prompts_fts
  JOIN prompts p ON prompts_fts.rowid = p.rowid
  WHERE prompts_fts MATCH ?
  ORDER BY rank
  LIMIT ?
`
```

### ExportService

```typescript
interface ExportService {
  readonly exportAll: (options: ExportOptions) => Effect.Effect<string>
  readonly exportByTags: (tags: string[], options: ExportOptions) => Effect.Effect<string>
  readonly writeToFile: (content: string, path: string) => Effect.Effect<void>
}

const ExportBundleSchema = Schema.Struct({
  version: Schema.Literal("1.0"),
  exportedAt: Schema.String,
  prompts: Schema.Array(ExportedPromptSchema)
})
```

### ImportService

```typescript
interface ImportService {
  readonly preview: (source: string) => Effect.Effect<ImportPreview>
  readonly import: (source: string, strategy: ConflictStrategy) => Effect.Effect<ImportResult>
  readonly validate: (data: unknown) => Effect.Effect<ExportBundle>
}

type ConflictStrategy = "skip" | "rename" | "overwrite"
```

### ArchiveService

```typescript
interface ArchiveService {
  readonly archive: (promptNames: string[]) => Effect.Effect<number>
  readonly list: () => Effect.Effect<ArchivedPrompt[]>
  readonly restore: (promptNames: string[]) => Effect.Effect<number>
  readonly purge: (olderThan: Date) => Effect.Effect<number>
}
```

## Ink Components

- `TagManager` - Interactive tag management
- `SearchUI` - Live search with highlighting
- `ExportWizard` - Export configuration
- `ImportWizard` - Import with conflict handling
- `ArchiveManager` - Archive management

## Implementation Checklist

- [ ] Implement TagService
- [ ] Implement SearchService with FTS5
- [ ] Create search command with highlighting
- [ ] Implement ExportService (JSON/YAML)
- [ ] Implement ImportService (file/URL)
- [ ] Implement ArchiveService
- [ ] Build interactive components
