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

    const args = createParsedArgs({ positional: [] });

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

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(templatesCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("No templates") || l.includes("empty"))).toBe(true);
  });

  it("should show template variables with --show-vars flag", async () => {
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
    };
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { "show-vars": true },
    });

    await Effect.runPromise(templatesCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("name") || l.includes("role") || l.includes("project"))).toBe(true);
  });

  it("should filter templates by tag with --tag flag", async () => {
    const prompts = [
      createTestPrompt({ id: "t1", name: "coding-template", isTemplate: true, tags: ["coding"] }),
      createTestPrompt({ id: "t2", name: "writing-template", isTemplate: true, tags: ["writing"] }),
    ];
    const state = createMockStorageState(prompts);
    const storage = {
      ...createMockStorageService(state),
      getAll: Effect.succeed(prompts),
    };
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { tag: "coding" },
    });

    await Effect.runPromise(templatesCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("coding-template"))).toBe(true);
    expect(logs.every((l) => !l.includes("writing-template"))).toBe(true);
  });

  it("should output JSON with --json flag", async () => {
    const prompts = [
      createTestPrompt({ id: "t1", name: "json-template", isTemplate: true }),
    ];
    const state = createMockStorageState(prompts);
    const storage = {
      ...createMockStorageService(state),
      getAll: Effect.succeed(prompts),
    };
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { json: true },
    });

    await Effect.runPromise(templatesCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    const output = logs.join("\n");
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("should search templates with --search flag", async () => {
    const prompts = [
      createTestPrompt({ id: "t1", name: "api-template", isTemplate: true, content: "API documentation" }),
      createTestPrompt({ id: "t2", name: "email-template", isTemplate: true, content: "Email format" }),
    ];
    const state = createMockStorageState(prompts);
    const storage = {
      ...createMockStorageService(state),
      getAll: Effect.succeed(prompts),
    };
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { search: "api" },
    });

    await Effect.runPromise(templatesCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("api-template"))).toBe(true);
    expect(logs.every((l) => !l.includes("email-template"))).toBe(true);
  });

  it("should limit results with --limit flag", async () => {
    const prompts = Array.from({ length: 20 }, (_, i) =>
      createTestPrompt({ id: `t${i}`, name: `template-${i}`, isTemplate: true })
    );
    const state = createMockStorageState(prompts);
    const storage = {
      ...createMockStorageService(state),
      getAll: Effect.succeed(prompts),
    };
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: [],
      flags: { limit: "5" },
    });

    await Effect.runPromise(templatesCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    // Should only show limited results
    expect(logs.length).toBeLessThanOrEqual(10); // Including header/footer
  });
});
