/**
 * Tests for pl import command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { importCommand } from "../../src/commands/pl/import";
import {
  createParsedArgs,
  createTestLayer,
  createMockImportService,
  captureConsole,
} from "./test-helpers";

describe("pl import command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should import prompts from file", async () => {
    let importedSource = "";
    const importService = {
      ...createMockImportService(),
      import: (source: string, _strategy: any) => {
        importedSource = source;
        return Effect.succeed({
          imported: 5,
          skipped: 0,
          renamed: 0,
          overwritten: 0,
          errors: [],
        });
      },
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    expect(importedSource).toBe("prompts.json");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Imported") || l.includes("5"))).toBe(true);
  });

  it("should use skip strategy by default", async () => {
    let receivedStrategy = "";
    const importService = {
      ...createMockImportService(),
      import: (source: string, strategy: any) => {
        receivedStrategy = strategy;
        return Effect.succeed({
          imported: 2,
          skipped: 1,
          renamed: 0,
          overwritten: 0,
          errors: [],
        });
      },
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedStrategy).toBe("skip");
  });

  it("should use overwrite strategy with --on-conflict=overwrite", async () => {
    let receivedStrategy = "";
    const importService = {
      ...createMockImportService(),
      import: (_source: string, strategy: any) => {
        receivedStrategy = strategy;
        return Effect.succeed({
          imported: 2,
          skipped: 0,
          renamed: 0,
          overwritten: 3,
          errors: [],
        });
      },
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
      flags: { "on-conflict": "overwrite" },
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedStrategy).toBe("overwrite");
  });

  it("should use rename strategy with --on-conflict=rename", async () => {
    let receivedStrategy = "";
    const importService = {
      ...createMockImportService(),
      import: (_source: string, strategy: any) => {
        receivedStrategy = strategy;
        return Effect.succeed({
          imported: 2,
          skipped: 0,
          renamed: 3,
          overwritten: 0,
          errors: [],
        });
      },
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
      flags: { "on-conflict": "rename" },
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedStrategy).toBe("rename");
  });

  it("should preview import with --dry-run flag", async () => {
    let previewCalled = false;
    const importService = {
      ...createMockImportService(),
      preview: (_source: string) => {
        previewCalled = true;
        return Effect.succeed({
          total: 10,
          newPrompts: 7,
          conflicts: [
            { name: "conflict1", contentDiffers: true },
            { name: "conflict2", contentDiffers: false },
          ],
          errors: [],
        });
      },
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
      flags: { "dry-run": true },
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    expect(previewCalled).toBe(true);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Preview"))).toBe(true);
  });

  it("should report import errors", async () => {
    const importService = {
      ...createMockImportService(),
      import: (_source: string, _strategy: any) =>
        Effect.succeed({
          imported: 3,
          skipped: 0,
          renamed: 0,
          overwritten: 0,
          errors: ["Failed to import prompt1", "Invalid format for prompt2"],
        }),
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Error") || l.includes("Failed"))).toBe(true);
  });

  it("should fail when no file path provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    const result = await Effect.runPromiseExit(
      importCommand(args).pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("Failure");
  });
});
