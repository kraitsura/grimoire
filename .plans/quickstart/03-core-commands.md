# Core Commands

## Overview

Basic CRUD operations for prompts.

## Commands

### `add` Command

```
grimoire add [name]
  --content, -c     Prompt content
  --tags, -t        Comma-separated tags
  --template, -T    Template ID to use
  -i                Interactive mode
```

```typescript
// src/commands/add.ts
export const addCommand = Command.make(
  "add",
  { name: nameArg, content: contentOption, tags: tagsOption, interactive: interactiveOption },
  ({ name, content, tags, interactive }) =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const editor = yield* Editor

      if (interactive || (!name && !content)) {
        return yield* runInteractiveAdd()
      }

      let finalContent = content
      if (!finalContent) {
        finalContent = yield* editor.open("", `${name}.md`)
      }

      const prompt = yield* storage.create({
        name,
        content: finalContent,
        tags: tags?.split(",").map(t => t.trim()) ?? []
      })

      return { success: true, prompt }
    })
)
```

### `list` Command

```
grimoire list
  --tags, -t        Filter by tags
  --search, -s      Search query
  --sort            Sort by: name, date, usage
  --limit, -n       Number of results
  -i                Interactive mode
```

### `edit` Command

```
grimoire edit <name-or-id>
  --name, -n        Edit only name
  --tags, -t        Edit only tags
  --inline          Edit in terminal
  -i                Interactive mode
```

### `copy` Command

```
grimoire copy <name-or-id>
  --vars, -v        Variables as key=value
  --stdout          Output to stdout
  --raw, -r         No interpolation
  -i                Interactive variable filling
```

### `rm` Command

```
grimoire rm <name-or-id...>
  --force, -f       Hard delete
  --yes, -y         Skip confirmation
  -i                Interactive selection
```

### `show` Command

```
grimoire show <name-or-id>
  --raw, -r         Raw content only
  --json            JSON output
  --history, -H     Show versions
  -i                Interactive viewer
```

### `templates` Command

```
grimoire templates list
grimoire templates show <id>
grimoire templates create
grimoire templates apply <id>
```

## Services

### StorageService

```typescript
interface StorageService {
  readonly getAll: Effect.Effect<Prompt[], StorageError>
  readonly getById: (id: string) => Effect.Effect<Prompt, PromptNotFoundError | StorageError>
  readonly getByName: (name: string) => Effect.Effect<Prompt, PromptNotFoundError | StorageError>
  readonly create: (input: CreatePromptInput) => Effect.Effect<Prompt, DuplicateNameError | StorageError>
  readonly update: (id: string, input: UpdatePromptInput) => Effect.Effect<Prompt, PromptNotFoundError | StorageError>
  readonly delete: (id: string, hard?: boolean) => Effect.Effect<void, PromptNotFoundError | StorageError>
  readonly findByTags: (tags: string[]) => Effect.Effect<Prompt[], StorageError>
  readonly search: (query: string) => Effect.Effect<Prompt[], StorageError>
}
```

### ClipboardService

```typescript
interface ClipboardService {
  readonly copy: (text: string) => Effect.Effect<void, ClipboardError>
  readonly paste: Effect.Effect<string, ClipboardError>
}
```

### EditorService

```typescript
interface EditorService {
  readonly open: (content: string, filename?: string) => Effect.Effect<string, EditorError>
  readonly getEditorCommand: Effect.Effect<string>
}
```

## Ink Components

- `PromptForm` - Interactive prompt creation
- `PromptList` - Table with selection
- `PromptViewer` - Full content display
- `VariableFiller` - Template variable input
- `DeleteConfirm` - Confirmation dialog

## Implementation Checklist

- [ ] Implement StorageService
- [ ] Implement ClipboardService (platform detection)
- [ ] Implement EditorService ($EDITOR integration)
- [ ] Create add command
- [ ] Create list command
- [ ] Create edit command
- [ ] Create copy command
- [ ] Create rm command
- [ ] Create show command
- [ ] Create templates subcommands
- [ ] Build Ink components for interactive mode
