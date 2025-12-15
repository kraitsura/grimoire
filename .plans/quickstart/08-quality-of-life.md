# Quality of Life & Advanced Features

## Overview

Additional features for power users.

## QoL Commands

### `stats` Command

```
grimoire stats [prompt-name]    # Stats for prompt or collection
grimoire stats --tokens         # Include token counts
grimoire stats --json           # JSON output
grimoire stats -i               # Interactive dashboard
```

Output:
- Character/word/line counts
- Token counts (per model)
- Tag distribution
- Most used prompts
- Recently edited

### `format` Command

```
grimoire format <prompt-name>
grimoire format --all           # Format all prompts
grimoire format --check         # Lint mode (no changes)
grimoire format --fix           # Auto-fix issues
grimoire format -i              # Interactive preview
```

Rules:
- Trailing whitespace removal
- Consistent indentation
- XML tag spacing
- Code block formatting
- YAML frontmatter validation
- Final newline

### `favorite` Command

```
grimoire favorite <prompt-name> # Toggle
grimoire favorite --list        # List favorites
grimoire favorite --add <name>
grimoire favorite --remove <name>
```

### `pin` Command

```
grimoire pin <prompt-name>      # Pin to top
grimoire pin --unpin <name>
grimoire pin --list
grimoire pin --reorder          # Interactive
```

## Advanced Commands

### `chain` Command

Compose multiple prompts into workflows:

```
grimoire chain run <chain-name>
grimoire chain create <chain-name>
grimoire chain validate <chain-name>
grimoire chain --dry-run
grimoire chain --var key=value
```

Chain definition (YAML):
```yaml
name: research-to-article
variables:
  topic: { type: string, required: true }
steps:
  - id: research
    prompt: research-prompt
    variables: { topic: "{{topic}}" }
    output: research_results
  - id: outline
    prompt: outline-prompt
    variables: { research: "{{research_results}}" }
    depends_on: [research]
```

### `alias` Command

```
grimoire alias <name> <command> # Create alias
grimoire alias --list
grimoire alias --remove <name>
grimoire alias -i
```

Examples:
- `cp` -> `copy --to-clipboard`
- `fav` -> `favorite --list`

### `sync` Command

```
grimoire sync                   # Sync with remote
grimoire sync --push
grimoire sync --pull
grimoire sync --status
grimoire sync --setup           # Configure remote
grimoire sync --resolve         # Conflict resolution
```

Providers:
- Git repository
- S3 bucket
- GitHub Gist

## Services

### StatsService

```typescript
interface StatsService {
  readonly getPromptStats: (promptId: string) => Effect.Effect<PromptStats>
  readonly getCollectionStats: () => Effect.Effect<CollectionStats>
  readonly countTokens: (text: string, model: string) => Effect.Effect<number>
  readonly recordUsage: (promptId: string, action: UsageAction) => Effect.Effect<void>
}
```

### FormatService

```typescript
interface FormatService {
  readonly formatPrompt: (content: string, config: FormattingConfig) => Effect.Effect<FormatResult>
  readonly checkPrompt: (content: string, config: FormattingConfig) => Effect.Effect<LintResult>
  readonly validateYamlFrontmatter: (content: string) => Effect.Effect<FrontmatterResult>
}
```

### ChainService

```typescript
interface ChainService {
  readonly loadChain: (name: string) => Effect.Effect<ChainDefinition>
  readonly saveChain: (chain: ChainDefinition) => Effect.Effect<void>
  readonly validateChain: (chain: ChainDefinition) => Effect.Effect<ValidationResult>
  readonly executeChain: (chain: ChainDefinition, variables: Record<string, unknown>) => Effect.Effect<ChainResult>
}
```

### AliasService

```typescript
interface AliasService {
  readonly createAlias: (name: string, command: string, args: string[]) => Effect.Effect<Alias>
  readonly removeAlias: (name: string) => Effect.Effect<void>
  readonly listAliases: () => Effect.Effect<Alias[]>
  readonly resolveAlias: (input: string[]) => Effect.Effect<string[]>
}
```

### SyncService

```typescript
interface SyncService {
  readonly configure: (config: SyncConfig) => Effect.Effect<void>
  readonly push: (options: PushOptions) => Effect.Effect<SyncResult>
  readonly pull: (options: PullOptions) => Effect.Effect<SyncResult>
  readonly getStatus: () => Effect.Effect<SyncStatus>
  readonly resolveConflicts: (resolutions: Resolution[]) => Effect.Effect<void>
}
```

## Data Storage

Extend Prompt model:
```typescript
{
  isFavorite: boolean
  favoriteOrder?: number
  isPinned: boolean
  pinOrder?: number
}
```

Additional stores:
- `~/.grimoire/aliases.json`
- `~/.grimoire/chains/`
- `~/.grimoire/sync-config.json`
- `~/.grimoire/analytics.json`

## Implementation Checklist

- [ ] Implement StatsService
- [ ] Implement FormatService
- [ ] Add favorite/pin fields to Prompt
- [ ] Implement FavoriteService
- [ ] Implement PinService
- [ ] Implement ChainService
- [ ] Implement AliasService
- [ ] Implement SyncService (git provider)
- [ ] Create stats command
- [ ] Create format command
- [ ] Create favorite command
- [ ] Create pin command
- [ ] Create chain subcommands
- [ ] Create alias command
- [ ] Create sync command
- [ ] Build interactive components
