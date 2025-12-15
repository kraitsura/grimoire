# Test Suite

This directory contains tests for the Grimoire CLI project.

## Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test:watch

# Run with coverage
bun test --coverage
```

## Test Structure

- `setup.ts` - Global test setup (preloaded via bunfig.toml)
- `example.test.ts` - Demonstrates testing patterns for Effect-based code
- `*.test.ts` - Individual test files

## Testing Patterns

### Basic Assertions

```typescript
import { test, expect } from "bun:test";

test("simple assertion", () => {
  expect(1 + 1).toBe(2);
});
```

### Effect Testing

```typescript
import { Effect } from "effect";
import { test, expect } from "bun:test";

test("Effect program", async () => {
  const program = Effect.succeed(42);
  const result = await Effect.runPromise(program);
  expect(result).toBe(42);
});
```

### Service Mocking

See `example.test.ts` for detailed examples of:
- Creating test service layers
- Mocking Effect services
- Providing test dependencies

### Error Handling

See `example.test.ts` for examples of:
- Testing tagged errors
- Catching specific error types
- Handling multiple error types

## Configuration

Test configuration is in `/bunfig.toml`:
- Preloads `setup.ts` before all tests
- Coverage enabled by default
- Coverage reports in `./coverage/`
