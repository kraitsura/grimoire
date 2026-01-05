/**
 * Tests for pl format command
 *
 * The format command formats prompt content according to configuration.
 * Supports:
 * - --check: Check mode (no changes, just report issues)
 * - --fix: Auto-fix issues (default)
 * - --all: Format all prompts
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
      formatPrompt: (content: string, _config: any) =>
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

  it("should check prompt with --check flag", async () => {
    const prompt = createTestPrompt({
      id: "check-test",
      name: "check-prompt",
      content: "Content to check",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const format = {
      ...createMockFormatService(),
      checkPrompt: (_content: string, _config: any) =>
        Effect.succeed({
          valid: true,
          issues: [],
        }),
    };
    const TestLayer = createTestLayer({ storage, format });

    const args = createParsedArgs({
      positional: ["check-prompt"],
      flags: { check: true },
    });

    await Effect.runPromise(formatCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    // Check mode should not modify content
    expect(state.prompts.get("check-test")?.content).toBe("Content to check");
  });

  it("should report check issues", async () => {
    const prompt = createTestPrompt({
      id: "check-issues",
      name: "check-issues-prompt",
      content: "Content with issues",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const format = {
      ...createMockFormatService(),
      checkPrompt: (_content: string, _config: any) =>
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
      positional: ["check-issues-prompt"],
      flags: { check: true },
    });

    await Effect.runPromise(formatCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("issue") || l.includes("error") || l.includes("warning"))).toBe(true);
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
    expect(logs.some((l) => l.includes("3") || l.includes("prompts") || l.includes("Formatted"))).toBe(true);
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(formatCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });
});
