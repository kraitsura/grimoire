/**
 * Tests for pl rollback command
 *
 * The rollback command reverts a prompt to a previous version.
 * Uses VersionService to get head, diff, and rollback.
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
import type { PromptVersion } from "../../src/services/version-service";

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
    const currentVersion: PromptVersion = {
      id: 1,
      promptId: "rollback-test",
      version: 5,
      content: "current content",
      frontmatter: {},
      createdAt: new Date(),
      branch: "main",
    };
    let rolledBackTo = 0;
    const versions = {
      ...createMockVersionService([currentVersion]),
      getHead: (_promptId: string, _branch?: string) => Effect.succeed(currentVersion),
      getVersion: (_promptId: string, version: number) =>
        Effect.succeed({
          id: 1,
          promptId: "rollback-test",
          version,
          content: `Version ${version} content`,
          frontmatter: {},
          createdAt: new Date(),
          branch: "main",
        }),
      rollback: (_promptId: string, targetVersion: number, _options?: any) => {
        rolledBackTo = targetVersion;
        return Effect.succeed({
          id: 1,
          promptId: "rollback-test",
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
      flags: { force: true },
    });

    await Effect.runPromise(rollbackCommand(args).pipe(Effect.provide(TestLayer)));

    expect(rolledBackTo).toBe(3);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Rolled back") || l.includes("3"))).toBe(true);
  });

  it("should show diff with --diff flag", async () => {
    const prompt = createTestPrompt({ id: "diff-test", name: "diff-prompt", version: 5 });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const currentVersion: PromptVersion = {
      id: 1,
      promptId: "diff-test",
      version: 5,
      content: "current",
      frontmatter: {},
      createdAt: new Date(),
      branch: "main",
    };
    const versions = {
      ...createMockVersionService([currentVersion]),
      getHead: () => Effect.succeed(currentVersion),
      getVersion: (_promptId: string, version: number) =>
        Effect.succeed({
          id: 1,
          promptId: "diff-test",
          version,
          content: `v${version}`,
          frontmatter: {},
          createdAt: new Date(),
          branch: "main",
        }),
      diff: () =>
        Effect.succeed({
          from: { version: 3, content: "old content" },
          to: { version: 5, content: "new content" },
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
      flags: { diff: true, force: true },
    });

    await Effect.runPromise(rollbackCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("-") || l.includes("+") || l.includes("old") || l.includes("new"))).toBe(true);
  });

  it("should fail with validation error when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    const result = await Effect.runPromiseExit(
      rollbackCommand(args).pipe(Effect.provide(TestLayer))
    );

    // Should fail with validation error
    expect(result._tag).toBe("Failure");
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
