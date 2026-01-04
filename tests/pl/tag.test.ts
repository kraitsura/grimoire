/**
 * Tests for pl tag command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { tagCommand } from "../../src/commands/pl/tag";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockTagService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl tag command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should show usage when no subcommand provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(tagCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage:"))).toBe(true);
    expect(logs.some((l) => l.includes("Subcommands:"))).toBe(true);
  });

  it("should add tag to prompt", async () => {
    const prompt = createTestPrompt({
      id: "tag-test",
      name: "tag-prompt",
      tags: [],
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let addedTag = "";
    const tags = {
      ...createMockTagService(),
      addTag: (promptId: string, tag: string) => {
        addedTag = tag;
        return Effect.void;
      },
    };
    const TestLayer = createTestLayer({ storage, tags });

    const args = createParsedArgs({
      positional: ["add", "tag-prompt", "new-tag"],
    });

    await Effect.runPromise(tagCommand(args).pipe(Effect.provide(TestLayer)));

    expect(addedTag).toBe("new-tag");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Added tag") && l.includes("new-tag"))).toBe(true);
  });

  it("should show usage for add without arguments", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: ["add"] });

    await Effect.runPromise(tagCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage: grimoire tag add"))).toBe(true);
  });

  it("should remove tag from prompt", async () => {
    const prompt = createTestPrompt({
      id: "remove-tag-test",
      name: "remove-tag-prompt",
      tags: ["old-tag"],
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let removedTag = "";
    const tags = {
      ...createMockTagService(),
      removeTag: (promptId: string, tag: string) => {
        removedTag = tag;
        return Effect.void;
      },
    };
    const TestLayer = createTestLayer({ storage, tags });

    const args = createParsedArgs({
      positional: ["remove", "remove-tag-prompt", "old-tag"],
    });

    await Effect.runPromise(tagCommand(args).pipe(Effect.provide(TestLayer)));

    expect(removedTag).toBe("old-tag");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Removed tag"))).toBe(true);
  });

  it("should show usage for remove without arguments", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: ["remove"] });

    await Effect.runPromise(tagCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage: grimoire tag remove"))).toBe(true);
  });

  it("should list all tags with counts", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: ["list"] });

    await Effect.runPromise(tagCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("TAG"))).toBe(true);
    expect(logs.some((l) => l.includes("coding"))).toBe(true);
    expect(logs.some((l) => l.includes("5"))).toBe(true);
  });

  it("should show no tags message when empty", async () => {
    const tags = {
      ...createMockTagService(),
      listTags: () => Effect.succeed([]),
    };
    const TestLayer = createTestLayer({ tags });

    const args = createParsedArgs({ positional: ["list"] });

    await Effect.runPromise(tagCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("No tags found"))).toBe(true);
  });

  it("should rename tag globally", async () => {
    let renameParams: { oldName: string; newName: string } | undefined;
    const tags = {
      ...createMockTagService(),
      renameTag: (oldName: string, newName: string) => {
        renameParams = { oldName, newName };
        return Effect.succeed(5);
      },
    };
    const TestLayer = createTestLayer({ tags });

    const args = createParsedArgs({
      positional: ["rename", "old-name", "new-name"],
    });

    await Effect.runPromise(tagCommand(args).pipe(Effect.provide(TestLayer)));

    expect(renameParams?.oldName).toBe("old-name");
    expect(renameParams?.newName).toBe("new-name");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Renamed tag"))).toBe(true);
    expect(logs.some((l) => l.includes("5 prompt(s) affected"))).toBe(true);
  });

  it("should show usage for rename without arguments", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: ["rename"] });

    await Effect.runPromise(tagCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage: grimoire tag rename"))).toBe(true);
  });

  it("should handle unknown subcommand", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: ["unknown"] });

    await Effect.runPromise(tagCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Unknown subcommand"))).toBe(true);
  });

  it("should handle --interactive flag with stub message", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({
      positional: [],
      flags: { interactive: true },
    });

    await Effect.runPromise(tagCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("not yet implemented"))).toBe(true);
  });

  it("should handle -i shorthand for --interactive", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({
      positional: [],
      flags: { i: true },
    });

    await Effect.runPromise(tagCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("not yet implemented"))).toBe(true);
  });

  it("should find prompt by ID when adding tag", async () => {
    const prompt = createTestPrompt({
      id: "id-tag-test",
      name: "id-tag-prompt",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["add", "id-tag-test", "new-tag"],
    });

    await Effect.runPromise(tagCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Added tag"))).toBe(true);
  });
});
