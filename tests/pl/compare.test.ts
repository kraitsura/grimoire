/**
 * Tests for pl compare command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { compareCommand } from "../../src/commands/pl/compare";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockVersionService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl compare command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should compare two versions of a prompt", async () => {
    const prompt = createTestPrompt({ id: "compare-test", name: "compare-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const versions = {
      ...createMockVersionService([]),
      diff: (promptId: string, fromVersion: number, toVersion: number) =>
        Effect.succeed({
          from: { version: fromVersion, content: "Original content" },
          to: { version: toVersion, content: "Modified content" },
          hunks: [{ start: 1, lines: ["-Original content", "+Modified content"] }],
          stats: { added: 1, removed: 1, unchanged: 0 },
        }),
    };
    const TestLayer = createTestLayer({ storage, versions });

    const args = createParsedArgs({
      positional: ["compare-prompt", "1", "2"],
    });

    await Effect.runPromise(compareCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("-Original") || l.includes("+Modified"))).toBe(true);
  });

  it("should compare with current version when one version specified", async () => {
    const prompt = createTestPrompt({ id: "current-test", name: "current-prompt", version: 5 });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let diffParams: { from: number; to: number } = { from: 0, to: 0 };
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
      diff: (promptId: string, fromVersion: number, toVersion: number) => {
        diffParams = { from: fromVersion, to: toVersion };
        return Effect.succeed({
          from: { version: fromVersion, content: "old" },
          to: { version: toVersion, content: "new" },
          hunks: [],
          stats: { added: 0, removed: 0, unchanged: 0 },
        });
      },
    };
    const TestLayer = createTestLayer({ storage, versions });

    const args = createParsedArgs({
      positional: ["current-prompt", "3"],
    });

    await Effect.runPromise(compareCommand(args).pipe(Effect.provide(TestLayer)));

    expect(diffParams.from).toBe(3);
    expect(diffParams.to).toBe(5);
  });

  it("should show unified diff format with --unified flag", async () => {
    const prompt = createTestPrompt({ id: "unified-test", name: "unified-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const versions = {
      ...createMockVersionService([]),
      diff: (_promptId: string, _fromVersion: number, _toVersion: number) =>
        Effect.succeed({
          from: { version: 1, content: "line1\nline2\nline3" },
          to: { version: 2, content: "line1\nmodified\nline3" },
          hunks: [{ start: 2, lines: ["-line2", "+modified"] }],
          stats: { added: 1, removed: 1, unchanged: 2 },
        }),
    };
    const TestLayer = createTestLayer({ storage, versions });

    const args = createParsedArgs({
      positional: ["unified-prompt", "1", "2"],
      flags: { unified: true },
    });

    await Effect.runPromise(compareCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("@@") || l.includes("-") || l.includes("+"))).toBe(true);
  });

  it("should show context with --context flag", async () => {
    const prompt = createTestPrompt({ id: "context-test", name: "context-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const versions = {
      ...createMockVersionService([]),
      diff: (_promptId: string, _fromVersion: number, _toVersion: number) =>
        Effect.succeed({
          from: { version: 1, content: "old" },
          to: { version: 2, content: "new" },
          hunks: [],
          stats: { added: 1, removed: 1, unchanged: 0 },
        }),
    };
    const TestLayer = createTestLayer({ storage, versions });

    const args = createParsedArgs({
      positional: ["context-prompt", "1", "2"],
      flags: { context: "3" },
    });

    await Effect.runPromise(compareCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it("should show stats with --stat flag", async () => {
    const prompt = createTestPrompt({ id: "stat-test", name: "stat-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const versions = {
      ...createMockVersionService([]),
      diff: (_promptId: string, _fromVersion: number, _toVersion: number) =>
        Effect.succeed({
          from: { version: 1, content: "old" },
          to: { version: 2, content: "new" },
          hunks: [],
          stats: { added: 10, removed: 5, unchanged: 100 },
        }),
    };
    const TestLayer = createTestLayer({ storage, versions });

    const args = createParsedArgs({
      positional: ["stat-prompt", "1", "2"],
      flags: { stat: true },
    });

    await Effect.runPromise(compareCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("10") || l.includes("added"))).toBe(true);
    expect(logs.some((l) => l.includes("5") || l.includes("removed"))).toBe(true);
  });

  it("should show no changes message when identical", async () => {
    const prompt = createTestPrompt({ id: "identical-test", name: "identical-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const versions = {
      ...createMockVersionService([]),
      diff: (_promptId: string, _fromVersion: number, _toVersion: number) =>
        Effect.succeed({
          from: { version: 1, content: "same" },
          to: { version: 2, content: "same" },
          hunks: [],
          stats: { added: 0, removed: 0, unchanged: 1 },
        }),
    };
    const TestLayer = createTestLayer({ storage, versions });

    const args = createParsedArgs({
      positional: ["identical-prompt", "1", "2"],
    });

    await Effect.runPromise(compareCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("No changes") || l.includes("identical"))).toBe(true);
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(compareCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });
});
