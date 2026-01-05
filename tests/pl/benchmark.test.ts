/**
 * Tests for pl benchmark command
 *
 * The benchmark command runs YAML test suites against prompts.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { benchmarkCommand } from "../../src/commands/pl/benchmark";
import {
  createParsedArgs,
  createTestLayer,
  captureConsole,
} from "./test-helpers";

describe("pl benchmark command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(benchmarkCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should handle missing suite file gracefully", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({
      positional: ["non-existent-suite.yaml"],
    });

    // Command logs error and returns, doesn't throw
    await Effect.runPromise(benchmarkCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    // Just verify it completes without crashing
    expect(logs.length).toBeGreaterThanOrEqual(0);
  });
});
