/**
 * Tests for pl templates command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { templatesCommand } from "../../src/commands/pl/templates";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl templates command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should list all templates", async () => {
    const prompts = [
      createTestPrompt({ id: "t1", name: "template-1", isTemplate: true }),
      createTestPrompt({ id: "t2", name: "template-2", isTemplate: true }),
      createTestPrompt({ id: "p1", name: "regular-prompt", isTemplate: false }),
    ];
    const state = createMockStorageState(prompts);
    const storage = {
      ...createMockStorageService(state),
      getAll: Effect.succeed(prompts),
    };
    const TestLayer = createTestLayer({ storage });

    // Command uses: grimoire templates list
    const args = createParsedArgs({ positional: ["list"] });

    await Effect.runPromise(templatesCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("template-1"))).toBe(true);
    expect(logs.some((l) => l.includes("template-2"))).toBe(true);
    // Should not include regular prompts
    expect(logs.every((l) => !l.includes("regular-prompt"))).toBe(true);
  });

  it("should show no templates message when empty", async () => {
    const prompts = [
      createTestPrompt({ id: "p1", name: "regular-1", isTemplate: false }),
      createTestPrompt({ id: "p2", name: "regular-2", isTemplate: false }),
    ];
    const state = createMockStorageState(prompts);
    const storage = {
      ...createMockStorageService(state),
      getAll: Effect.succeed(prompts),
    };
    const TestLayer = createTestLayer({ storage });

    // Command uses: grimoire templates list
    const args = createParsedArgs({ positional: ["list"] });

    await Effect.runPromise(templatesCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("No templates"))).toBe(true);
  });

  it("should show template with variables using show subcommand", async () => {
    const prompts = [
      createTestPrompt({
        id: "t1",
        name: "template-with-vars",
        isTemplate: true,
        content: "Hello {{name}}, you are a {{role}} working on {{project}}.",
      }),
    ];
    const state = createMockStorageState(prompts);
    const storage = {
      ...createMockStorageService(state),
      getAll: Effect.succeed(prompts),
      getById: (id: string) => {
        const prompt = prompts.find((p) => p.id === id);
        if (!prompt) return Effect.fail({ _tag: "PromptNotFoundError" as const, id });
        return Effect.succeed(prompt);
      },
      getByName: (name: string) => {
        const prompt = prompts.find((p) => p.name === name);
        if (!prompt) return Effect.fail({ _tag: "PromptNotFoundError" as const, id: name });
        return Effect.succeed(prompt);
      },
    };
    const TestLayer = createTestLayer({ storage });

    // Command uses: grimoire templates show <name>
    const args = createParsedArgs({
      positional: ["show", "template-with-vars"],
    });

    await Effect.runPromise(templatesCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("name") || l.includes("role") || l.includes("project"))).toBe(true);
  });

  it("should show usage when no subcommand provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(templatesCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should show usage for show without template name", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: ["show"] });

    await Effect.runPromise(templatesCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should show variables in list output", async () => {
    const prompts = [
      createTestPrompt({
        id: "t1",
        name: "greeting-template",
        isTemplate: true,
        content: "Hello {{name}}, welcome to {{place}}!",
      }),
    ];
    const state = createMockStorageState(prompts);
    const storage = {
      ...createMockStorageService(state),
      getAll: Effect.succeed(prompts),
    };
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({ positional: ["list"] });

    await Effect.runPromise(templatesCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    // List output shows variables in VARIABLES column
    expect(logs.some((l) => l.includes("name") || l.includes("place"))).toBe(true);
  });

  it("should error for non-template prompt in show", async () => {
    const prompts = [
      createTestPrompt({ id: "p1", name: "regular-prompt", isTemplate: false }),
    ];
    const state = createMockStorageState(prompts);
    const storage = {
      ...createMockStorageService(state),
      getById: (id: string) => {
        const prompt = prompts.find((p) => p.id === id);
        if (!prompt) return Effect.fail({ _tag: "PromptNotFoundError" as const, id });
        return Effect.succeed(prompt);
      },
      getByName: (name: string) => {
        const prompt = prompts.find((p) => p.name === name);
        if (!prompt) return Effect.fail({ _tag: "PromptNotFoundError" as const, id: name });
        return Effect.succeed(prompt);
      },
    };
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({ positional: ["show", "regular-prompt"] });

    await Effect.runPromise(templatesCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Not a template"))).toBe(true);
  });
});
