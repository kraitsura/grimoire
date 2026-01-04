/**
 * Tests for pl alias command
 *
 * The alias command manages command shortcuts:
 *   grimoire alias <name> <command>   # Create alias
 *   grimoire alias --list             # List all aliases
 *   grimoire alias --remove <name>    # Remove alias
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
      positional: ["cp", "copy", "my-prompt"],
    });

    await Effect.runPromise(aliasCommand(args).pipe(Effect.provide(TestLayer)));

    expect(aliases.has("cp")).toBe(true);
    expect(aliases.get("cp")?.command).toBe("copy");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("created") || l.includes("cp"))).toBe(true);
  });

  it("should list all aliases with --list flag", async () => {
    const aliases = new Map<string, Alias>([
      ["alias1", { name: "alias1", command: "copy", args: ["prompt1"], createdAt: new Date() }],
      ["alias2", { name: "alias2", command: "show", args: ["prompt2"], createdAt: new Date() }],
    ]);
    const alias = createMockAliasService(aliases);
    const TestLayer = createTestLayer({ alias });

    const args = createParsedArgs({
      positional: [],
      flags: { list: true },
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
      positional: [],
      flags: { list: true },
    });

    await Effect.runPromise(aliasCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("No aliases"))).toBe(true);
  });

  it("should remove an alias with --remove flag", async () => {
    const aliases = new Map<string, Alias>([
      ["todelete", { name: "todelete", command: "some", args: ["command"], createdAt: new Date() }],
    ]);
    const alias = createMockAliasService(aliases);
    const TestLayer = createTestLayer({ alias });

    const args = createParsedArgs({
      positional: ["todelete"],
      flags: { remove: true },
    });

    await Effect.runPromise(aliasCommand(args).pipe(Effect.provide(TestLayer)));

    expect(aliases.has("todelete")).toBe(false);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("removed") || l.includes("todelete"))).toBe(true);
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(aliasCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should show usage when only name provided without command", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: ["myalias"] });

    await Effect.runPromise(aliasCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });
});
