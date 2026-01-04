/**
 * Tests for pl alias command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { aliasCommand } from "../../src/commands/pl/alias";
import {
  createParsedArgs,
  createTestLayer,
  createMockAliasService,
  captureConsole,
} from "./test-helpers";
import type { Alias } from "../../src/services/alias-service";

describe("pl alias command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should create a new alias", async () => {
    const aliases = new Map<string, Alias>();
    const alias = createMockAliasService(aliases);
    const TestLayer = createTestLayer({ alias });

    const args = createParsedArgs({
      positional: ["add", "myalias", "copy my-prompt"],
    });

    await Effect.runPromise(aliasCommand(args).pipe(Effect.provide(TestLayer)));

    expect(aliases.has("myalias")).toBe(true);
    expect(aliases.get("myalias")?.command).toBe("copy my-prompt");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Created alias") || l.includes("myalias"))).toBe(true);
  });

  it("should list all aliases", async () => {
    const aliases = new Map<string, Alias>([
      ["alias1", { name: "alias1", command: "copy prompt1", createdAt: new Date() }],
      ["alias2", { name: "alias2", command: "show prompt2", createdAt: new Date() }],
    ]);
    const alias = createMockAliasService(aliases);
    const TestLayer = createTestLayer({ alias });

    const args = createParsedArgs({
      positional: ["list"],
    });

    await Effect.runPromise(aliasCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("alias1"))).toBe(true);
    expect(logs.some((l) => l.includes("alias2"))).toBe(true);
  });

  it("should show no aliases message when empty", async () => {
    const aliases = new Map<string, Alias>();
    const alias = createMockAliasService(aliases);
    const TestLayer = createTestLayer({ alias });

    const args = createParsedArgs({
      positional: ["list"],
    });

    await Effect.runPromise(aliasCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("No aliases") || l.includes("empty"))).toBe(true);
  });

  it("should delete an alias", async () => {
    const aliases = new Map<string, Alias>([
      ["todelete", { name: "todelete", command: "some command", createdAt: new Date() }],
    ]);
    const alias = createMockAliasService(aliases);
    const TestLayer = createTestLayer({ alias });

    const args = createParsedArgs({
      positional: ["remove", "todelete"],
    });

    await Effect.runPromise(aliasCommand(args).pipe(Effect.provide(TestLayer)));

    expect(aliases.has("todelete")).toBe(false);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Removed") || l.includes("Deleted"))).toBe(true);
  });

  it("should handle delete of non-existent alias", async () => {
    const aliases = new Map<string, Alias>();
    const alias = createMockAliasService(aliases);
    const TestLayer = createTestLayer({ alias });

    const args = createParsedArgs({
      positional: ["remove", "nonexistent"],
    });

    const result = await Effect.runPromiseExit(
      aliasCommand(args).pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("Failure");
  });

  it("should show alias details with show subcommand", async () => {
    const aliases = new Map<string, Alias>([
      ["myalias", { name: "myalias", command: "copy my-prompt -v name=test", createdAt: new Date() }],
    ]);
    const alias = createMockAliasService(aliases);
    const TestLayer = createTestLayer({ alias });

    const args = createParsedArgs({
      positional: ["show", "myalias"],
    });

    await Effect.runPromise(aliasCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("myalias"))).toBe(true);
    expect(logs.some((l) => l.includes("copy my-prompt"))).toBe(true);
  });

  it("should show usage when no subcommand provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(aliasCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage") || l.includes("Subcommands"))).toBe(true);
  });

  it("should show usage for add without arguments", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: ["add"] });

    await Effect.runPromise(aliasCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should handle unknown subcommand", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: ["unknown"] });

    await Effect.runPromise(aliasCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Unknown") || l.includes("subcommand"))).toBe(true);
  });
});
