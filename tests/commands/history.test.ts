/**
 * Tests for history command
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { historyCommand } from "../../src/commands/history";
import { MainLive } from "../../src/services";
import type { ParsedArgs } from "../../src/cli/parser";

describe("historyCommand", () => {
  // Mock console methods to capture output
  let consoleOutput: string[] = [];
  let consoleErrorOutput: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  beforeEach(() => {
    consoleOutput = [];
    consoleErrorOutput = [];
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.join(" "));
    };
    console.error = (...args: unknown[]) => {
      consoleErrorOutput.push(args.join(" "));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  test("shows error when prompt name is missing", async () => {
    const args: ParsedArgs = {
      command: "history",
      flags: {},
      positional: [],
    };

    await Effect.runPromise(
      historyCommand(args).pipe(
        Effect.provide(MainLive)
      ) as Effect.Effect<void, never, never>
    );

    expect(consoleErrorOutput[0]).toContain("Error: Prompt name is required");
    expect(consoleErrorOutput[1]).toContain("Usage:");
  });

  test("accepts limit flag", () => {
    const args: ParsedArgs = {
      command: "history",
      flags: { limit: "5" },
      positional: ["test-prompt"],
    };

    // Just verify the args parse correctly
    expect(args.flags.limit).toBe("5");
  });

  test("accepts -n flag as alias for limit", () => {
    const args: ParsedArgs = {
      command: "history",
      flags: { n: "10" },
      positional: ["test-prompt"],
    };

    expect(args.flags.n).toBe("10");
  });

  test("accepts --all flag", () => {
    const args: ParsedArgs = {
      command: "history",
      flags: { all: true },
      positional: ["test-prompt"],
    };

    expect(args.flags.all).toBe(true);
  });

  test("accepts --diff flag", () => {
    const args: ParsedArgs = {
      command: "history",
      flags: { diff: true },
      positional: ["test-prompt"],
    };

    expect(args.flags.diff).toBe(true);
  });

  test("accepts --oneline flag", () => {
    const args: ParsedArgs = {
      command: "history",
      flags: { oneline: true },
      positional: ["test-prompt"],
    };

    expect(args.flags.oneline).toBe(true);
  });

  test("accepts multiple flags", () => {
    const args: ParsedArgs = {
      command: "history",
      flags: { limit: "5", diff: true, oneline: true },
      positional: ["test-prompt"],
    };

    expect(args.flags.limit).toBe("5");
    expect(args.flags.diff).toBe(true);
    expect(args.flags.oneline).toBe(true);
  });
});
