/**
 * Tests for pl versions command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { versionsCommand } from "../../src/commands/pl/versions";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockVersionService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";
import type { PromptVersion } from "../../src/services/version-service";

describe("pl versions command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should list versions for a prompt", async () => {
    const prompt = createTestPrompt({ id: "ver-test", name: "version-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const versions: PromptVersion[] = [
      { id: 1, promptId: "ver-test", version: 3, content: "v3", frontmatter: {}, createdAt: new Date(), branch: "main" },
      { id: 2, promptId: "ver-test", version: 2, content: "v2", frontmatter: {}, createdAt: new Date(), branch: "main" },
      { id: 3, promptId: "ver-test", version: 1, content: "v1", frontmatter: {}, createdAt: new Date(), branch: "main" },
    ];
    const versionService = createMockVersionService(versions);
    const TestLayer = createTestLayer({ storage, versions: versionService });

    const args = createParsedArgs({ positional: ["version-prompt"] });

    await Effect.runPromise(versionsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("VERSION") || l.includes("versions"))).toBe(true);
  });

  it("should show specific version with --version flag", async () => {
    const prompt = createTestPrompt({ id: "show-ver", name: "show-version-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const versions: PromptVersion[] = [
      { id: 1, promptId: "show-ver", version: 2, content: "Version 2 content", frontmatter: {}, createdAt: new Date(), branch: "main" },
    ];
    const versionService = {
      ...createMockVersionService(versions),
      getVersion: (promptId: string, version: number) =>
        Effect.succeed(versions.find((v) => v.version === version) ?? null),
    };
    const TestLayer = createTestLayer({ storage, versions: versionService });

    const args = createParsedArgs({
      positional: ["show-version-prompt"],
      flags: { version: "2" },
    });

    await Effect.runPromise(versionsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Version 2") || l.includes("2"))).toBe(true);
  });

  it("should limit version count with --limit flag", async () => {
    const prompt = createTestPrompt({ id: "limit-ver", name: "limit-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let receivedOptions: any;
    const versionService = {
      ...createMockVersionService([]),
      listVersions: (promptId: string, options?: any) => {
        receivedOptions = options;
        return Effect.succeed([]);
      },
    };
    const TestLayer = createTestLayer({ storage, versions: versionService });

    const args = createParsedArgs({
      positional: ["limit-prompt"],
      flags: { limit: "5" },
    });

    await Effect.runPromise(versionsCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.limit).toBe(5);
  });

  it("should handle -n shorthand for --limit", async () => {
    const prompt = createTestPrompt({ id: "n-ver", name: "n-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let receivedOptions: any;
    const versionService = {
      ...createMockVersionService([]),
      listVersions: (promptId: string, options?: any) => {
        receivedOptions = options;
        return Effect.succeed([]);
      },
    };
    const TestLayer = createTestLayer({ storage, versions: versionService });

    const args = createParsedArgs({
      positional: ["n-prompt"],
      flags: { n: 3 },
    });

    await Effect.runPromise(versionsCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.limit).toBe(3);
  });

  it("should show no versions message when empty", async () => {
    const prompt = createTestPrompt({ id: "empty-ver", name: "empty-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const versionService = createMockVersionService([]);
    const TestLayer = createTestLayer({ storage, versions: versionService });

    const args = createParsedArgs({ positional: ["empty-prompt"] });

    await Effect.runPromise(versionsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("No versions") || l.includes("history"))).toBe(true);
  });

  it("should filter by branch with --branch flag", async () => {
    const prompt = createTestPrompt({ id: "branch-ver", name: "branch-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let receivedOptions: any;
    const versionService = {
      ...createMockVersionService([]),
      listVersions: (promptId: string, options?: any) => {
        receivedOptions = options;
        return Effect.succeed([]);
      },
    };
    const TestLayer = createTestLayer({ storage, versions: versionService });

    const args = createParsedArgs({
      positional: ["branch-prompt"],
      flags: { branch: "feature" },
    });

    await Effect.runPromise(versionsCommand(args).pipe(Effect.provide(TestLayer)));

    expect(receivedOptions?.branch).toBe("feature");
  });

  it("should output JSON with --json flag", async () => {
    const prompt = createTestPrompt({ id: "json-ver", name: "json-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const versions: PromptVersion[] = [
      { id: 1, promptId: "json-ver", version: 1, content: "content", frontmatter: {}, createdAt: new Date(), branch: "main" },
    ];
    const versionService = createMockVersionService(versions);
    const TestLayer = createTestLayer({ storage, versions: versionService });

    const args = createParsedArgs({
      positional: ["json-prompt"],
      flags: { json: true },
    });

    await Effect.runPromise(versionsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    const output = logs.join("\n");
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(versionsCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });
});
