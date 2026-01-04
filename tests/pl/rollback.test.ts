/**
 * Tests for pl rollback command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { rollbackCommand } from "../../src/commands/pl/rollback";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockVersionService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl rollback command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should rollback to specific version", async () => {
    const prompt = createTestPrompt({ id: "rollback-test", name: "rollback-prompt", version: 5 });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let rolledBackTo = 0;
    const versions = {
      ...createMockVersionService([]),
      rollback: (promptId: string, targetVersion: number, _options?: any) => {
        rolledBackTo = targetVersion;
        return Effect.succeed({
          id: 1,
          promptId,
          version: targetVersion,
          content: `Version ${targetVersion} content`,
          frontmatter: {},
          createdAt: new Date(),
          branch: "main",
        });
      },
    };
    const TestLayer = createTestLayer({ storage, versions });

    const args = createParsedArgs({
      positional: ["rollback-prompt", "3"],
    });

    await Effect.runPromise(rollbackCommand(args).pipe(Effect.provide(TestLayer)));

    expect(rolledBackTo).toBe(3);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Rolled back") || l.includes("version 3"))).toBe(true);
  });

  it("should rollback to previous version with no version specified", async () => {
    const prompt = createTestPrompt({ id: "prev-test", name: "prev-prompt", version: 5 });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let rolledBackTo = 0;
    const versions = {
      ...createMockVersionService([]),
      getLatestVersion: (promptId: string) =>
        Effect.succeed({
          id: 1,
          promptId,
          version: 5,
          content: "current",
          frontmatter: {},
          createdAt: new Date(),
          branch: "main",
        }),
      rollback: (promptId: string, targetVersion: number, _options?: any) => {
        rolledBackTo = targetVersion;
        return Effect.succeed({
          id: 1,
          promptId,
          version: targetVersion,
          content: `Version ${targetVersion}`,
          frontmatter: {},
          createdAt: new Date(),
          branch: "main",
        });
      },
    };
    const TestLayer = createTestLayer({ storage, versions });

    const args = createParsedArgs({
      positional: ["prev-prompt"],
    });

    await Effect.runPromise(rollbackCommand(args).pipe(Effect.provide(TestLayer)));

    expect(rolledBackTo).toBe(4);
  });

  it("should preview rollback with --dry-run flag", async () => {
    const prompt = createTestPrompt({ id: "dry-test", name: "dry-prompt", version: 5 });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let rollbackCalled = false;
    const versions = {
      ...createMockVersionService([]),
      getVersion: (promptId: string, version: number) =>
        Effect.succeed({
          id: 1,
          promptId,
          version,
          content: `Version ${version} content`,
          frontmatter: {},
          createdAt: new Date(),
          branch: "main",
        }),
      rollback: (_promptId: string, _targetVersion: number, _options?: any) => {
        rollbackCalled = true;
        return Effect.succeed({
          id: 1,
          promptId: "dry-test",
          version: 3,
          content: "rolled back",
          frontmatter: {},
          createdAt: new Date(),
          branch: "main",
        });
      },
    };
    const TestLayer = createTestLayer({ storage, versions });

    const args = createParsedArgs({
      positional: ["dry-prompt", "3"],
      flags: { "dry-run": true },
    });

    await Effect.runPromise(rollbackCommand(args).pipe(Effect.provide(TestLayer)));

    expect(rollbackCalled).toBe(false);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Preview") || l.includes("Would rollback"))).toBe(true);
  });

  it("should show diff with --diff flag", async () => {
    const prompt = createTestPrompt({ id: "diff-test", name: "diff-prompt", version: 5 });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const versions = {
      ...createMockVersionService([]),
      diff: (promptId: string, fromVersion: number, toVersion: number) =>
        Effect.succeed({
          from: { version: fromVersion, content: "old content" },
          to: { version: toVersion, content: "new content" },
          hunks: [{ start: 1, lines: ["-old content", "+new content"] }],
          stats: { added: 1, removed: 1, unchanged: 0 },
        }),
      rollback: () =>
        Effect.succeed({
          id: 1,
          promptId: "diff-test",
          version: 3,
          content: "rolled back",
          frontmatter: {},
          createdAt: new Date(),
          branch: "main",
        }),
    };
    const TestLayer = createTestLayer({ storage, versions });

    const args = createParsedArgs({
      positional: ["diff-prompt", "3"],
      flags: { diff: true },
    });

    await Effect.runPromise(rollbackCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("old content") || l.includes("new content") || l.includes("-"))).toBe(true);
  });

  it("should create new version on rollback with --keep-history flag", async () => {
    const prompt = createTestPrompt({ id: "keep-test", name: "keep-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let receivedOptions: any;
    const versions = {
      ...createMockVersionService([]),
      rollback: (promptId: string, targetVersion: number, options?: any) => {
        receivedOptions = options;
        return Effect.succeed({
          id: 1,
          promptId,
          version: 6,
          content: "rolled back as new version",
          frontmatter: {},
          createdAt: new Date(),
          branch: "main",
        });
      },
    };
    const TestLayer = createTestLayer({ storage, versions });

    const args = createParsedArgs({
      positional: ["keep-prompt", "3"],
      flags: { "keep-history": true },
    });

    await Effect.runPromise(rollbackCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.keepHistory).toBe(true);
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(rollbackCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should fail for non-existent prompt", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["non-existent", "1"],
    });

    const result = await Effect.runPromiseExit(
      rollbackCommand(args).pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("Failure");
  });
});
