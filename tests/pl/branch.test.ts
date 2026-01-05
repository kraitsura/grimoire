/**
 * Tests for pl branch command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { branchCommand } from "../../src/commands/pl/branch";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createMockBranchService,
  createTestPrompt,
  captureConsole,
} from "./test-helpers";
import type { Branch } from "../../src/services/branch-service";

describe("pl branch command", () => {
  const console$ = captureConsole();

  beforeEach(() => {
    console$.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
  });

  it("should list branches for a prompt", async () => {
    const prompt = createTestPrompt({ id: "branch-test", name: "branch-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const branches: Branch[] = [
      { id: "b1", name: "main", promptId: "branch-test", createdAt: new Date(), isActive: true },
      { id: "b2", name: "feature", promptId: "branch-test", createdAt: new Date(), isActive: false },
    ];
    const branchService = {
      ...createMockBranchService(branches),
      getActiveBranch: (_promptId: string) => Effect.succeed(branches[0]),
    };
    const TestLayer = createTestLayer({ storage, branches: branchService });

    // Command uses positional: [prompt-name, subcommand]
    const args = createParsedArgs({ positional: ["branch-prompt", "list"] });

    await Effect.runPromise(branchCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("main"))).toBe(true);
  });

  it("should create a new branch with create subcommand", async () => {
    const prompt = createTestPrompt({ id: "create-branch", name: "create-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let createdBranch = "";
    const branchService = {
      ...createMockBranchService([]),
      createBranch: (params: { promptId: string; name: string }) => {
        createdBranch = params.name;
        return Effect.succeed({
          id: "new-branch",
          name: params.name,
          promptId: params.promptId,
          createdAt: new Date(),
          isActive: false,
          createdFromVersion: 1,
        });
      },
    };
    const TestLayer = createTestLayer({ storage, branches: branchService });

    // Command uses positional: [prompt-name, "create", branch-name]
    const args = createParsedArgs({
      positional: ["create-prompt", "create", "new-feature"],
    });

    await Effect.runPromise(branchCommand(args).pipe(Effect.provide(TestLayer)));

    expect(createdBranch).toBe("new-feature");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Created branch") || l.includes("new-feature"))).toBe(true);
  });

  it("should switch to a branch with switch subcommand", async () => {
    const prompt = createTestPrompt({ id: "switch-branch", name: "switch-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let switchedTo = "";
    const branchService = {
      ...createMockBranchService([
        { id: "b1", name: "main", promptId: "switch-branch", createdAt: new Date(), isActive: true },
        { id: "b2", name: "feature", promptId: "switch-branch", createdAt: new Date(), isActive: false },
      ]),
      switchBranch: (_promptId: string, name: string) => {
        switchedTo = name;
        return Effect.succeed({
          id: "b2",
          name: name,
          promptId: _promptId,
          createdAt: new Date(),
          isActive: true,
        });
      },
    };
    const TestLayer = createTestLayer({ storage, branches: branchService });

    // Command uses positional: [prompt-name, "switch", branch-name]
    const args = createParsedArgs({
      positional: ["switch-prompt", "switch", "feature"],
    });

    await Effect.runPromise(branchCommand(args).pipe(Effect.provide(TestLayer)));

    expect(switchedTo).toBe("feature");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Switched to") || l.includes("feature"))).toBe(true);
  });

  it("should delete a branch with delete subcommand", async () => {
    const prompt = createTestPrompt({ id: "delete-branch", name: "delete-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let deletedBranch = "";
    const branchService = {
      ...createMockBranchService([
        { id: "b1", name: "main", promptId: "delete-branch", createdAt: new Date(), isActive: true },
        { id: "b2", name: "to-delete", promptId: "delete-branch", createdAt: new Date(), isActive: false },
      ]),
      deleteBranch: (_promptId: string, name: string) => {
        deletedBranch = name;
        return Effect.void;
      },
    };
    const TestLayer = createTestLayer({ storage, branches: branchService });

    // Command uses positional: [prompt-name, "delete", branch-name]
    const args = createParsedArgs({
      positional: ["delete-prompt", "delete", "to-delete"],
    });

    await Effect.runPromise(branchCommand(args).pipe(Effect.provide(TestLayer)));

    expect(deletedBranch).toBe("to-delete");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Deleted") || l.includes("to-delete"))).toBe(true);
  });

  it("should compare branches with compare subcommand", async () => {
    const prompt = createTestPrompt({ id: "compare-branch", name: "compare-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const branchService = {
      ...createMockBranchService([]),
      compareBranches: (_promptId: string, from: string, to: string) =>
        Effect.succeed({
          from: { name: from, headVersion: 1 },
          to: { name: to, headVersion: 3 },
          ahead: 2,
          behind: 0,
          canMerge: true,
        }),
    };
    const TestLayer = createTestLayer({ storage, branches: branchService });

    // Command uses positional: [prompt-name, "compare", branch-a, branch-b]
    const args = createParsedArgs({
      positional: ["compare-prompt", "compare", "main", "feature"],
    });

    await Effect.runPromise(branchCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("ahead") || l.includes("2"))).toBe(true);
  });

  it("should merge branch with merge subcommand", async () => {
    const prompt = createTestPrompt({ id: "merge-branch", name: "merge-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    let mergedFrom = "";
    const branchService = {
      ...createMockBranchService([]),
      mergeBranch: (params: { promptId: string; sourceBranch: string; targetBranch: string }) => {
        mergedFrom = params.sourceBranch;
        return Effect.succeed({
          id: 1,
          promptId: params.promptId,
          version: 4,
          content: "merged content",
          frontmatter: {},
          createdAt: new Date(),
          branch: "main",
        });
      },
    };
    const TestLayer = createTestLayer({ storage, branches: branchService });

    // Command uses positional: [prompt-name, "merge", source-branch, target-branch?]
    const args = createParsedArgs({
      positional: ["merge-prompt", "merge", "feature"],
    });

    await Effect.runPromise(branchCommand(args).pipe(Effect.provide(TestLayer)));

    expect(mergedFrom).toBe("feature");
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Merged") || l.includes("feature"))).toBe(true);
  });

  it("should show active branch indicator", async () => {
    const prompt = createTestPrompt({ id: "active-branch", name: "active-prompt" });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const branches: Branch[] = [
      { id: "b1", name: "main", promptId: "active-branch", createdAt: new Date(), isActive: true },
      { id: "b2", name: "other", promptId: "active-branch", createdAt: new Date(), isActive: false },
    ];
    const branchService = {
      ...createMockBranchService(branches),
      getActiveBranch: (_promptId: string) => Effect.succeed(branches[0]),
    };
    const TestLayer = createTestLayer({ storage, branches: branchService });

    const args = createParsedArgs({ positional: ["active-prompt", "list"] });

    await Effect.runPromise(branchCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("*") || l.includes("main"))).toBe(true);
  });

  it("should show usage when no subcommand provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: ["some-prompt"] });

    await Effect.runPromise(branchCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should show usage when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(branchCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Usage"))).toBe(true);
  });

  it("should fail for non-existent prompt", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({ positional: ["non-existent", "list"] });

    const result = await Effect.runPromiseExit(
      branchCommand(args).pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("Failure");
  });
});
