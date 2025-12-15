# Interactive TUI Mode

## Overview

Full interactive mode using Ink (React for CLI).

## Entry Points

- `grimoire` (no args) - Launch full interactive app
- `grimoire <command> -i` - Interactive mode for specific command

## Main Application Shell

```tsx
// src/cli/app.tsx
export const App: React.FC = () => {
  const runtime = useMemo(() => ManagedRuntime.make(MainLayer), [])

  return (
    <RuntimeProvider runtime={runtime}>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </RuntimeProvider>
  )
}

const AppShell: React.FC = () => {
  const { exit } = useApp()
  const { state, navigate } = useAppState()

  useInput((input, key) => {
    if (input === 'q') exit()
    if (input === '/') navigate({ name: 'search' })
    if (key.escape) navigate({ name: 'list' })
  })

  return (
    <Box flexDirection="column">
      <Breadcrumb items={state.breadcrumbs} />
      <Router screen={state.currentScreen} />
      <StatusBar message={state.statusMessage} />
    </Box>
  )
}
```

## State Management

```tsx
// src/cli/context/app-context.tsx
interface AppState {
  currentScreen: Screen
  history: Screen[]
  statusMessage: string | null
  isDirty: boolean
}

type Screen =
  | { name: 'list' }
  | { name: 'view'; promptId: string }
  | { name: 'edit'; promptId?: string }
  | { name: 'search' }
  | { name: 'settings' }
```

## Effect Runtime Integration

```tsx
// src/cli/hooks/use-effect-runtime.ts
function useEffectRun<A, E>(
  effect: Effect.Effect<A, E, MainServices>,
  deps: unknown[] = []
): { data: A | null; error: E | null; loading: boolean; refetch: () => void }

function useEffectCallback<A, E, Args extends unknown[]>(
  effectFn: (...args: Args) => Effect.Effect<A, E, MainServices>
): { execute: (...args: Args) => Promise<A>; loading: boolean; error: E | null }
```

## Screens

### List Screen
- Prompt table with columns (name, tags, updated, usage)
- Keyboard navigation (j/k, arrows)
- Quick actions (Enter=view, e=edit, c=copy, d=delete, a=add)
- Sorting and pagination

### Viewer Screen
- Full content display
- Metadata panel (tags, dates, version)
- Scrollable content
- Actions (edit, copy, test, back)

### Editor Screen
- Name input
- Multi-line content editor with cursor
- Tag editor
- Save/cancel with unsaved changes warning

### Search Screen
- Live search with debounce
- Results with match highlighting
- Tag filter chips
- Recent searches

### Settings Screen
- API key configuration
- Default model selection
- Storage path
- Theme preferences

## Components

### Layout
- `StatusBar` - Current state and hints
- `Breadcrumb` - Navigation path
- `ActionBar` - Available actions

### Input
- `MultiLineInput` - Text editor with cursor
- `TagEditor` - Tag management

### Shared
- `ScrollableBox` - Scrollable content
- `Modal` - Overlay dialogs
- `KeyboardHint` - Shortcut hints

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| q | Quit |
| / | Search |
| Esc | Back/Cancel |
| Enter | Select/Confirm |
| j/k | Navigate up/down |
| a | Add new |
| e | Edit |
| c | Copy |
| d | Delete |
| Tab | Next field |

## Implementation Checklist

- [ ] Set up RuntimeProvider for Effect
- [ ] Create AppProvider for state
- [ ] Implement Router component
- [ ] Build ListScreen with table
- [ ] Build ViewerScreen with scroll
- [ ] Build EditorScreen with multi-line input
- [ ] Build SearchScreen with live search
- [ ] Build SettingsScreen
- [ ] Create layout components
- [ ] Create input components
- [ ] Add keyboard navigation
