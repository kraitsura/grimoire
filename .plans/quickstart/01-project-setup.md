# Project Setup & Infrastructure

## Overview

Foundation and infrastructure for Grimoire CLI tool.

## Dependencies

```json
{
  "name": "grimoire",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "bin": { "grimoire": "dist/index.js" },
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx}\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "effect": "^3.12.0",
    "ink": "^5.1.0",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@types/bun": "^1.1.14",
    "@types/react": "^18.3.12",
    "typescript": "^5.7.2"
  }
}
```

## TypeScript Configuration

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["bun-types"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

## Directory Structure

```
grimoire/
├── src/
│   ├── index.ts              # Entry point
│   ├── cli/
│   │   ├── app.tsx           # Root Ink App
│   │   ├── components/
│   │   └── hooks/
│   ├── services/
│   │   ├── index.ts          # Layer composition
│   │   ├── storage.ts
│   │   └── clipboard.ts
│   ├── commands/
│   │   ├── add.ts
│   │   └── list.ts
│   └── models/
│       ├── prompt.ts
│       └── errors.ts
├── tests/
└── package.json
```

## Effect Service Pattern

```typescript
// Service interface
interface StorageService {
  readonly getAll: Effect.Effect<Prompt[], StorageError>
  readonly save: (prompt: Prompt) => Effect.Effect<void, StorageError>
}

// Service Tag
class Storage extends Context.Tag("Storage")<Storage, StorageService>() {}

// Layer implementation
const StorageLive = Layer.effect(
  Storage,
  Effect.gen(function* () {
    return {
      getAll: Effect.gen(function* () { /* impl */ }),
      save: (prompt) => Effect.gen(function* () { /* impl */ })
    }
  })
)
```

## Error Types

```typescript
// src/models/errors.ts
import { Data } from "effect"

export class StorageError extends Data.TaggedError("StorageError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class PromptNotFoundError extends Data.TaggedError("PromptNotFoundError")<{
  readonly id: string
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string
  readonly message: string
}> {}
```

## CLI Entry Point

```typescript
// src/index.ts
#!/usr/bin/env bun
import { Effect, Console } from "effect"
import { parseArgs, runCommand, runInteractive } from "./cli"
import { MainLive } from "./services"

const program = Effect.gen(function* () {
  const args = process.argv.slice(2)
  const { command, flags, positional } = parseArgs(args)

  if (flags.interactive || args.length === 0) {
    yield* runInteractive()
  } else {
    yield* runCommand(command, positional, flags)
  }
})

const main = program.pipe(
  Effect.catchAll(handleError),
  Effect.provide(MainLive)
)

Effect.runPromise(main)
```

## Implementation Checklist

- [ ] Initialize Bun project with `bun init`
- [ ] Install dependencies
- [ ] Create tsconfig.json
- [ ] Set up ESLint + Prettier
- [ ] Create directory structure
- [ ] Implement basic error types
- [ ] Create service pattern templates
- [ ] Set up CLI entry point
- [ ] Configure test runner
