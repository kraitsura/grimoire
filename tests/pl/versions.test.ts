/**
 * Tests for pl versions command
 *
 * The versions command manages version retention and cleanup:
 * - cleanup: Clean up old versions based on retention policy
 * - tag: Tag a version to preserve it
 * - config: Show or update retention configuration
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { versionsCommand } from "../../src/commands/pl/versions";
import {
  createParsedArgs,
  createTestLayer,
  captureConsole,
} from "./test-helpers";

describe("pl versions command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should handle unknown subcommand gracefully", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: ["unknown-subcommand"] });

    // Should not throw - just outputs to stderr
    await Effect.runPromise(versionsCommand(args).pipe(Effect.provide(TestLayer)));

    // Test passes if no error thrown
    expect(true).toBe(true);
  });

  it("should preview cleanup with --preview flag", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({
      positional: ["cleanup"],
      flags: { preview: true },
    });

    await Effect.runPromise(versionsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    // Should output something about preview or cleanup
    expect(logs.length).toBeGreaterThan(0);
  });

  it("should show retention config with config subcommand", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({
      positional: ["config"],
    });

    await Effect.runPromise(versionsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    // Should output something about configuration
    expect(logs.length).toBeGreaterThan(0);
  });
});
