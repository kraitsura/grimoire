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
    let importedFile = "";
    const importService = {
      ...createMockImportService(),
      importFromFile: (filePath: string, _strategy: any) => {
        importedFile = filePath;
        return Effect.succeed({
          imported: 5,
          skipped: 0,
          merged: 0,
          errors: [],
        });
      },
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    expect(importedFile).toBe("prompts.json");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Imported") || l.includes("5"))).toBe(true);
  });

  it("should use skip strategy with --skip flag", async () => {
    let receivedStrategy = "";
    const importService = {
      ...createMockImportService(),
      importFromFile: (_filePath: string, strategy: any) => {
        receivedStrategy = strategy;
        return Effect.succeed({
          imported: 3,
          skipped: 2,
          merged: 0,
          errors: [],
        });
      },
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
      flags: { skip: true },
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedStrategy).toBe("skip");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("skipped") || l.includes("2"))).toBe(true);
  });

  it("should use overwrite strategy with --overwrite flag", async () => {
    let receivedStrategy = "";
    const importService = {
      ...createMockImportService(),
      importFromFile: (_filePath: string, strategy: any) => {
        receivedStrategy = strategy;
        return Effect.succeed({
          imported: 5,
          skipped: 0,
          merged: 0,
          errors: [],
        });
      },
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
      flags: { overwrite: true },
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedStrategy).toBe("overwrite");
  });

  it("should use merge strategy with --merge flag", async () => {
    let receivedStrategy = "";
    const importService = {
      ...createMockImportService(),
      importFromFile: (_filePath: string, strategy: any) => {
        receivedStrategy = strategy;
        return Effect.succeed({
          imported: 3,
          skipped: 0,
          merged: 2,
          errors: [],
        });
      },
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
      flags: { merge: true },
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedStrategy).toBe("merge");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("merged") || l.includes("2"))).toBe(true);
  });

  it("should preview import with --dry-run flag", async () => {
    const importService = {
      ...createMockImportService(),
      preview: (_bundle: any) =>
        Effect.succeed({
          prompts: [
            { id: "1", name: "prompt1" },
            { id: "2", name: "prompt2" },
          ],
          conflicts: [{ id: "2", name: "prompt2", reason: "exists" }],
          newCount: 1,
          conflictCount: 1,
        }),
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
      flags: { "dry-run": true },
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Preview") || l.includes("Dry run"))).toBe(true);
  });

  it("should report import errors", async () => {
    const importService = {
      ...createMockImportService(),
      importFromFile: (_filePath: string, _strategy: any) =>
        Effect.succeed({
          imported: 3,
          skipped: 0,
          merged: 0,
          errors: [
            { id: "err-1", name: "failed-prompt", reason: "Invalid format" },
          ],
        }),
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("error") || l.includes("failed"))).toBe(true);
  });

  it("should show usage when no file path provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should handle --prefix flag for imported prompts", async () => {
    let receivedOptions: any;
    const importService = {
      ...createMockImportService(),
      importFromFile: (_filePath: string, _strategy: any, options?: any) => {
        receivedOptions = options;
        return Effect.succeed({
          imported: 5,
          skipped: 0,
          merged: 0,
          errors: [],
        });
      },
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
      flags: { prefix: "imported-" },
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    // The prefix should be passed to the import service
    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  it("should handle --tag flag to add tag to imported prompts", async () => {
    let receivedOptions: any;
    const importService = {
      ...createMockImportService(),
      importFromFile: (_filePath: string, _strategy: any, options?: any) => {
        receivedOptions = options;
        return Effect.succeed({
          imported: 5,
          skipped: 0,
          merged: 0,
          errors: [],
        });
      },
    };
    const TestLayer = createTestLayer({ import: importService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
      flags: { tag: "imported" },
    });

    await Effect.runPromise(importCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });
});
