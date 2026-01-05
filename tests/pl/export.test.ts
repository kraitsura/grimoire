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

  it("should export all prompts to stdout by default", async () => {
    let exportAllCalled = false;
    const exportService = {
      ...createMockExportService(),
      exportAll: (_options: any) => {
        exportAllCalled = true;
        return Effect.succeed('{"version":"1.0","prompts":[]}');
      },
    };
    const TestLayer = createTestLayer({ export: exportService });

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    expect(exportAllCalled).toBe(true);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("version") || l.includes("prompts"))).toBe(true);
  });

  it("should export to file with --output flag", async () => {
    let writtenPath = "";
    const exportService = {
      ...createMockExportService(),
      exportAll: (_options: any) =>
        Effect.succeed('{"version":"1.0","prompts":[]}'),
      writeToFile: (content: string, path: string) => {
        writtenPath = path;
        return Effect.void;
      },
    };
    const TestLayer = createTestLayer({ export: exportService });

    const args = createParsedArgs({
      positional: [],
      flags: { output: "prompts.json" },
    });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    expect(writtenPath).toBe("prompts.json");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Exported"))).toBe(true);
  });

  it("should filter by tags with --tags flag", async () => {
    let receivedTags: string[] = [];
    const exportService = {
      ...createMockExportService(),
      exportByTags: (tags: string[], _options: any) => {
        receivedTags = tags;
        return Effect.succeed('{"version":"1.0","prompts":[]}');
      },
    };
    const TestLayer = createTestLayer({ export: exportService });

    const args = createParsedArgs({
      positional: [],
      flags: { tags: "coding,testing" },
    });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedTags).toContain("coding");
    expect(receivedTags).toContain("testing");
  });

  it("should include history with --include-history flag", async () => {
    let receivedOptions: any;
    const exportService = {
      ...createMockExportService(),
      exportAll: (options: any) => {
        receivedOptions = options;
        return Effect.succeed('{"version":"1.0","prompts":[]}');
      },
    };
    const TestLayer = createTestLayer({ export: exportService });

    const args = createParsedArgs({
      positional: [],
      flags: { "include-history": true },
    });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.includeHistory).toBe(true);
  });

  it("should use specified format with --format flag", async () => {
    let receivedOptions: any;
    const exportService = {
      ...createMockExportService(),
      exportAll: (options: any) => {
        receivedOptions = options;
        return Effect.succeed("prompts: []");
      },
    };
    const TestLayer = createTestLayer({ export: exportService });

    const args = createParsedArgs({
      positional: [],
      flags: { format: "yaml" },
    });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.format).toBe("yaml");
  });

  it("should use -o shorthand for --output", async () => {
    let writtenPath = "";
    const exportService = {
      ...createMockExportService(),
      exportAll: (_options: any) =>
        Effect.succeed('{"version":"1.0","prompts":[]}'),
      writeToFile: (_content: string, path: string) => {
        writtenPath = path;
        return Effect.void;
      },
    };
    const TestLayer = createTestLayer({ export: exportService });

    const args = createParsedArgs({
      positional: [],
      flags: { o: "output.json" },
    });

    await Effect.runPromise(exportCommand(args).pipe(Effect.provide(TestLayer)));

    expect(writtenPath).toBe("output.json");
  });
});
