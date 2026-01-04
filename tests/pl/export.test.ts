/**
 * Tests for pl export command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { exportCommand } from "../../src/commands/pl/export";
import {
  createParsedArgs,
  createTestLayer,
  createMockExportService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";

describe("pl export command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should export all prompts to file", async () => {
    let exportedToPath = "";
    const exportService = {
      ...createMockExportService(),
      exportAll: (_options: any) =>
        Effect.succeed({
          version: "1.0",
          exportedAt: new Date().toISOString(),
          prompts: [
            { id: "1", name: "prompt1", content: "content1" },
            { id: "2", name: "prompt2", content: "content2" },
          ],
        }),
      exportToFile: (filePath: string, _bundle: any) => {
        exportedToPath = filePath;
        return Effect.void;
      },
    };
    const TestLayer = createTestLayer({ export: exportService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
    });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    expect(exportedToPath).toBe("prompts.json");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Exported") || l.includes("prompts.json"))).toBe(true);
  });

  it("should export specific prompts by name", async () => {
    let exportedIds: string[] = [];
    const exportService = {
      ...createMockExportService(),
      exportPrompts: (promptIds: string[], _options: any) => {
        exportedIds = promptIds;
        return Effect.succeed({
          version: "1.0",
          exportedAt: new Date().toISOString(),
          prompts: [],
        });
      },
      exportToFile: (_filePath: string, _bundle: any) => Effect.void,
    };
    const TestLayer = createTestLayer({ export: exportService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
      flags: { prompts: "prompt1,prompt2" },
    });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    expect(exportedIds).toContain("prompt1");
    expect(exportedIds).toContain("prompt2");
  });

  it("should filter by tags with --tags flag", async () => {
    let receivedOptions: any;
    const exportService = {
      ...createMockExportService(),
      exportAll: (options: any) => {
        receivedOptions = options;
        return Effect.succeed({
          version: "1.0",
          exportedAt: new Date().toISOString(),
          prompts: [],
        });
      },
      exportToFile: (_filePath: string, _bundle: any) => Effect.void,
    };
    const TestLayer = createTestLayer({ export: exportService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
      flags: { tags: "coding,testing" },
    });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.tags).toEqual(["coding", "testing"]);
  });

  it("should include versions with --include-versions flag", async () => {
    let receivedOptions: any;
    const exportService = {
      ...createMockExportService(),
      exportAll: (options: any) => {
        receivedOptions = options;
        return Effect.succeed({
          version: "1.0",
          exportedAt: new Date().toISOString(),
          prompts: [],
        });
      },
      exportToFile: (_filePath: string, _bundle: any) => Effect.void,
    };
    const TestLayer = createTestLayer({ export: exportService });

    const args = createParsedArgs({
      positional: ["prompts.json"],
      flags: { "include-versions": true },
    });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.includeVersions).toBe(true);
  });

  it("should output to stdout with --stdout flag", async () => {
    const exportService = {
      ...createMockExportService(),
      exportAll: (_options: any) =>
        Effect.succeed({
          version: "1.0",
          exportedAt: "2025-01-01T00:00:00.000Z",
          prompts: [{ id: "1", name: "test", content: "content" }],
        }),
    };
    const TestLayer = createTestLayer({ export: exportService });

    const args = createParsedArgs({
      positional: [],
      flags: { stdout: true },
    });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    const output = logs.join("\n");
    expect(output.includes("version")).toBe(true);
    expect(output.includes("prompts")).toBe(true);
  });

  it("should show usage when no file path and no --stdout", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should export templates only with --templates-only flag", async () => {
    let receivedOptions: any;
    const exportService = {
      ...createMockExportService(),
      exportAll: (options: any) => {
        receivedOptions = options;
        return Effect.succeed({
          version: "1.0",
          exportedAt: new Date().toISOString(),
          prompts: [],
        });
      },
      exportToFile: (_filePath: string, _bundle: any) => Effect.void,
    };
    const TestLayer = createTestLayer({ export: exportService });

    const args = createParsedArgs({
      positional: ["templates.json"],
      flags: { "templates-only": true },
    });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.templatesOnly).toBe(true);
  });

  it("should export favorites only with --favorites-only flag", async () => {
    let receivedOptions: any;
    const exportService = {
      ...createMockExportService(),
      exportAll: (options: any) => {
        receivedOptions = options;
        return Effect.succeed({
          version: "1.0",
          exportedAt: new Date().toISOString(),
          prompts: [],
        });
      },
      exportToFile: (_filePath: string, _bundle: any) => Effect.void,
    };
    const TestLayer = createTestLayer({ export: exportService });

    const args = createParsedArgs({
      positional: ["favorites.json"],
      flags: { "favorites-only": true },
    });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.favoritesOnly).toBe(true);
  });
});
