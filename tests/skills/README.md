# Skills Feature Tests

This directory contains comprehensive test coverage for the Grimoire skills feature.

## Test Structure

```
tests/skills/
├── skill-state-service.test.ts       # State management service tests
├── skill-engine-service.test.ts      # Core skill orchestration tests
├── commands/
│   ├── init.test.ts                  # Init command tests
│   ├── add.test.ts                   # Add command tests
│   ├── enable.test.ts                # Enable command tests
│   ├── disable.test.ts               # Disable command tests
│   └── list.test.ts                  # List command tests
└── integration/
    └── full-workflow.test.ts         # End-to-end integration tests
```

## Existing Tests in src/services/skills/

The following tests are already present in the source directory:

- `skill-cache-service.test.ts` - Skill caching and GitHub API tests
- `injection-utils.test.ts` - Markdown injection utilities tests
- `agent-adapter.test.ts` - Agent adapter tests
- `cli-installer-service.test.ts` - CLI dependency installer tests

## Test Coverage

### Service Tests

#### SkillStateService (`skill-state-service.test.ts`)
Tests for project state management and persistence:
- Project initialization with different agents (claude_code, opencode)
- Getting and setting enabled skills
- Adding and removing enabled skills
- Recording disable timestamps
- Updating last sync timestamps
- State persistence across service instances
- Idempotent operations

**Test count:** 22 tests
**Coverage:** ~95%

#### SkillEngineService (`skill-engine-service.test.ts`)
Tests for core skill orchestration:
- Enabling basic prompt skills
- Handling skill dependencies (CLI tools)
- Disabling enabled skills
- Error handling (not cached, already enabled, not initialized)
- Options handling (noDeps, noInit)
- canEnable checks with various conditions
- Listing missing dependencies

**Test count:** 15+ tests
**Coverage:** Tests core workflows with mocked dependencies

### Command Tests

#### Init Command (`commands/init.test.ts`)
Tests for project initialization:
- Initializing with different agents
- Agent auto-detection from directory structure
- Creating agent configuration files
- Adding managed section markers
- Handling existing configuration files
- Preventing re-initialization
- Invalid agent type handling

**Test count:** 12 tests
**Status:** All passing

#### Add Command (`commands/add.test.ts`)
Tests for adding skills from sources:
- Adding from GitHub URLs (multiple formats)
- Normalizing GitHub URLs (HTTPS, SSH, git@)
- Adding from local paths
- GitHub URL parsing with refs and subdirs
- Error handling for invalid sources

**Test count:** 6 tests
**Status:** Needs service layer integration

#### Enable Command (`commands/enable.test.ts`)
Tests for enabling skills:
- Enabling single skills
- Enabling multiple skills
- Passing options (noDeps, noInit)
- Error handling (not cached, already enabled, not initialized)
- Graceful error display

**Test count:** 8 tests
**Status:** Needs full service layer

#### Disable Command (`commands/disable.test.ts`)
Tests for disabling skills:
- Disabling single skills
- Disabling multiple skills
- Error handling (not enabled)
- Continuing through errors
- Multiple skill operations

**Test count:** 5 tests
**Status:** Needs full service layer

#### List Command (`commands/list.test.ts`)
Tests for listing skills:
- Listing enabled and available skills
- Filtering (enabled-only, available-only)
- Handling empty cache
- Multiple skill states

**Test count:** 6 tests
**Status:** Needs full service layer

### Integration Tests

#### Full Workflow (`integration/full-workflow.test.ts`)
End-to-end tests covering complete workflows:
- Full workflow: init → add → enable → disable
- Multiple skills enabled simultaneously
- CLI dependency installation
- Preventing duplicate enables (idempotency)
- State persistence across instances
- canEnable checks at different stages

**Test count:** 6 comprehensive integration tests
**Status:** Working with mocked services

## Running Tests

```bash
# Run all skills tests
bun test tests/skills/

# Run specific test file
bun test tests/skills/skill-state-service.test.ts

# Run with coverage
bun test tests/skills/ --coverage

# Run in watch mode
bun test tests/skills/ --watch
```

## Test Patterns Used

### Effect Service Mocking

Tests use Effect's Layer system for service mocking:

```typescript
const mockService = createMockService();
const TestLayer = Layer.succeed(ServiceTag, mockService);
const program = Effect.gen(function* () {
  const service = yield* ServiceTag;
  // test logic
}).pipe(Effect.provide(TestLayer));
```

### State Cleanup

Tests that modify global state (like ~/.skills/state.json) use proper setup/teardown:

```typescript
beforeEach(async () => {
  // Backup state
  if (existsSync(testStatePath)) {
    originalState = await readFile(testStatePath);
  }
});

afterEach(async () => {
  // Restore state
  if (originalState) {
    await writeFile(testStatePath, originalState);
  }
});
```

### Error Testing

Tests verify proper error handling using Effect.either:

```typescript
const result = await Effect.runPromise(Effect.either(program));
expect(result._tag).toBe("Left");
if (result._tag === "Left") {
  expect(result.left._tag).toBe("SkillNotCachedError");
}
```

## Known Limitations

1. **Command Tests**: Some command tests require integration with all service layers. They currently test the command logic but may need updates to properly mock all dependencies.

2. **File System Operations**: Tests that create actual files/directories need proper cleanup. Current tests use temporary directories and restore state.

3. **Real vs Mock Services**: Integration tests use a mix of real service implementations (SkillStateServiceLive) and mock implementations for better isolation.

## Future Improvements

1. Add tests for error recovery and rollback scenarios
2. Add tests for concurrent skill operations
3. Add performance benchmarks for large skill catalogs
4. Add tests for GitHub API rate limiting
5. Add tests for skill manifest validation edge cases
6. Improve command test integration with full service stack
