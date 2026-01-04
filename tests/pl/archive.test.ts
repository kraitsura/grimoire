/**
 * Tests for pl archive command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { archiveCommand } from "../../src/commands/pl/archive";
import {
  createParsedArgs,
  createTestLayer,
  createMockArchiveService,
  captureConsole,
} from "./test-helpers";
import type { ArchivedPrompt } from "../../src/services/archive-service";

describe("pl archive command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should list archived prompts", async () => {
    const archived: ArchivedPrompt[] = [
      { id: "arch-1", name: "archived-1", archivedAt: new Date(), originalPath: "/path/1" },
      { id: "arch-2", name: "archived-2", archivedAt: new Date(), originalPath: "/path/2" },
    ];
    const archive = createMockArchiveService(archived);
    const TestLayer = createTestLayer({ archive });

    const args = createParsedArgs({
      positional: ["list"],
    });

    await Effect.runPromise(archiveCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("archived-1"))).toBe(true);
    expect(logs.some((l) => l.includes("archived-2"))).toBe(true);
  });

  it("should show empty archive message", async () => {
    const archive = createMockArchiveService([]);
    const TestLayer = createTestLayer({ archive });

    const args = createParsedArgs({
      positional: ["list"],
    });

    await Effect.runPromise(archiveCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("empty") || l.includes("No archived"))).toBe(true);
  });

  it("should restore archived prompt", async () => {
    const archived: ArchivedPrompt[] = [
      { id: "restore-test", name: "to-restore", archivedAt: new Date(), originalPath: "/path" },
    ];
    const archive = createMockArchiveService(archived);
    const TestLayer = createTestLayer({ archive });

    const args = createParsedArgs({
      positional: ["restore", "restore-test"],
    });

    await Effect.runPromise(archiveCommand(args).pipe(Effect.provide(TestLayer)));

    expect(archived.length).toBe(0);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Restored"))).toBe(true);
  });

  it("should handle restore by name", async () => {
    const archived: ArchivedPrompt[] = [
      { id: "name-restore", name: "restore-by-name", archivedAt: new Date(), originalPath: "/path" },
    ];
    const archive = createMockArchiveService(archived);
    const TestLayer = createTestLayer({ archive });

    const args = createParsedArgs({
      positional: ["restore", "restore-by-name"],
    });

    await Effect.runPromise(archiveCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it("should permanently delete archived prompt", async () => {
    const archived: ArchivedPrompt[] = [
      { id: "delete-test", name: "to-delete", archivedAt: new Date(), originalPath: "/path" },
    ];
    const archive = createMockArchiveService(archived);
    const TestLayer = createTestLayer({ archive });

    const args = createParsedArgs({
      positional: ["delete", "delete-test"],
      flags: { yes: true },
    });

    await Effect.runPromise(archiveCommand(args).pipe(Effect.provide(TestLayer)));

    expect(archived.length).toBe(0);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Deleted") || l.includes("permanently"))).toBe(true);
  });

  it("should clear all archived prompts", async () => {
    const archived: ArchivedPrompt[] = [
      { id: "clear-1", name: "clear-prompt-1", archivedAt: new Date(), originalPath: "/path" },
      { id: "clear-2", name: "clear-prompt-2", archivedAt: new Date(), originalPath: "/path" },
      { id: "clear-3", name: "clear-prompt-3", archivedAt: new Date(), originalPath: "/path" },
    ];
    const archive = createMockArchiveService(archived);
    const TestLayer = createTestLayer({ archive });

    const args = createParsedArgs({
      positional: ["clear"],
      flags: { yes: true },
    });

    await Effect.runPromise(archiveCommand(args).pipe(Effect.provide(TestLayer)));

    expect(archived.length).toBe(0);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Cleared") || l.includes("3"))).toBe(true);
  });

  it("should show usage when no subcommand provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(archiveCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage") || l.includes("Subcommands"))).toBe(true);
  });

  it("should handle -y shorthand for --yes", async () => {
    const archived: ArchivedPrompt[] = [
      { id: "y-test", name: "y-prompt", archivedAt: new Date(), originalPath: "/path" },
    ];
    const archive = createMockArchiveService(archived);
    const TestLayer = createTestLayer({ archive });

    const args = createParsedArgs({
      positional: ["delete", "y-test"],
      flags: { y: true },
    });

    await Effect.runPromise(archiveCommand(args).pipe(Effect.provide(TestLayer)));

    expect(archived.length).toBe(0);
  });

  it("should fail for non-existent archived prompt", async () => {
    const archive = createMockArchiveService([]);
    const TestLayer = createTestLayer({ archive });

    const args = createParsedArgs({
      positional: ["restore", "non-existent"],
    });

    const result = await Effect.runPromiseExit(
      archiveCommand(args).pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("Failure");
  });
});
