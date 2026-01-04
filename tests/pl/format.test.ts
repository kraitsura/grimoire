/**
 * Tests for pl format command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { formatCommand } from "../../src/commands/pl/format";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockFormatService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl format command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should format a prompt", async () => {
    const prompt = createTestPrompt({
      id: "format-test",
      name: "format-prompt",
      content: "  Poorly   formatted   content  ",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const format = {
      ...createMockFormatService(),
      format: (content: string, _config: any) =>
        Effect.succeed({
          content: content.trim().replace(/\s+/g, " "),
          changes: [{ type: "whitespace", from: 0, to: 10 }],
          stats: { added: 0, removed: 5, modified: 1 },
        }),
    };
    const TestLayer = createTestLayer({ storage, format });

    const args = createParsedArgs({ positional: ["format-prompt"] });

    await Effect.runPromise(formatCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Formatted") || l.includes("format"))).toBe(true);
  });

  it("should lint prompt with --lint flag", async () => {
    const prompt = createTestPrompt({
      id: "lint-test",
      name: "lint-prompt",
      content: "Content to lint",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const format = {
      ...createMockFormatService(),
      lint: (content: string) =>
        Effect.succeed({
          valid: true,
          issues: [],
        }),
    };
    const TestLayer = createTestLayer({ storage, format });

    const args = createParsedArgs({
      positional: ["lint-prompt"],
      flags: { lint: true },
    });

    await Effect.runPromise(formatCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("valid") || l.includes("No issues"))).toBe(true);
  });

  it("should report lint issues", async () => {
    const prompt = createTestPrompt({
      id: "lint-issues",
      name: "lint-issues-prompt",
      content: "Content with issues",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const format = {
      ...createMockFormatService(),
      lint: (_content: string) =>
        Effect.succeed({
          valid: false,
          issues: [
            { line: 1, column: 5, message: "Missing closing tag", severity: "error" as const },
            { line: 2, column: 1, message: "Trailing whitespace", severity: "warning" as const },
          ],
        }),
    };
    const TestLayer = createTestLayer({ storage, format });

    const args = createParsedArgs({
      positional: ["lint-issues-prompt"],
      flags: { lint: true },
    });

    await Effect.runPromise(formatCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Missing closing tag") || l.includes("issues"))).toBe(true);
  });

  it("should check format without modifying with --check flag", async () => {
    const prompt = createTestPrompt({
      id: "check-test",
      name: "check-prompt",
      content: "Content to check",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["check-prompt"],
      flags: { check: true },
    });

    await Effect.runPromise(formatCommand(args).pipe(Effect.provide(TestLayer)));

    // Content should not be modified
    expect(state.prompts.get("check-test")?.content).toBe("Content to check");
  });

  it("should format all prompts with --all flag", async () => {
    const prompts = [
      createTestPrompt({ id: "all-1", name: "all-prompt-1" }),
      createTestPrompt({ id: "all-2", name: "all-prompt-2" }),
      createTestPrompt({ id: "all-3", name: "all-prompt-3" }),
    ];
    const state = createMockStorageState(prompts);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { all: true },
    });

    await Effect.runPromise(formatCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("3") || l.includes("prompts"))).toBe(true);
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(formatCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should handle --dry-run flag", async () => {
    const prompt = createTestPrompt({
      id: "dry-test",
      name: "dry-prompt",
      content: "Original content",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const format = {
      ...createMockFormatService(),
      format: (content: string, _config: any) =>
        Effect.succeed({
          content: "Modified content",
          changes: [],
          stats: { added: 1, removed: 1, modified: 1 },
        }),
    };
    const TestLayer = createTestLayer({ storage, format });

    const args = createParsedArgs({
      positional: ["dry-prompt"],
      flags: { "dry-run": true },
    });

    await Effect.runPromise(formatCommand(args).pipe(Effect.provide(TestLayer)));

    // Content should not be modified in dry-run mode
    expect(state.prompts.get("dry-test")?.content).toBe("Original content");
  });
});
