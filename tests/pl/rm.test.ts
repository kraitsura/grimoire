/**
 * Tests for pl rm command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { rmCommand } from "../../src/commands/pl/rm";
import {
  createParsedArgs,
  createTestLayer,
  createMockStorageService,
  createMockStorageState,
  createTestPrompt,
  captureConsole,
  mockProcessExit,
} from "./test-helpers";

describe("pl rm command", () => {
  const console$ = captureConsole();
  const exitMock = mockProcessExit();

  beforeEach(() => {
    console$.start();
    exitMock.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
    exitMock.stop();
    exitMock.reset();
  });

  it("should soft delete prompt by name", async () => {
    const prompt = createTestPrompt({
      id: "rm-test",
      name: "rm-prompt",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["rm-prompt"],
      flags: { yes: true },
    });

    await Effect.runPromise(rmCommand(args).pipe(Effect.provide(TestLayer)));

    expect(state.prompts.has("rm-test")).toBe(false);
  });

  it("should soft delete prompt by ID", async () => {
    const prompt = createTestPrompt({
      id: "rm-id-test",
      name: "rm-id-prompt",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["rm-id-test"],
      flags: { yes: true },
    });

    await Effect.runPromise(rmCommand(args).pipe(Effect.provide(TestLayer)));

    expect(state.prompts.has("rm-id-test")).toBe(false);
  });

  it("should handle --force flag for hard delete", async () => {
    const prompt = createTestPrompt({
      id: "hard-delete-test",
      name: "hard-delete-prompt",
    });
    const state = createMockStorageState([prompt]);
    let hardDeleteCalled = false;
    const storage = {
      ...createMockStorageService(state),
      delete: (id: string, hard?: boolean) => {
        hardDeleteCalled = hard === true;
        state.prompts.delete(id);
        return Effect.void;
      },
    };
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["hard-delete-prompt"],
      flags: { force: true, yes: true },
    });

    await Effect.runPromise(rmCommand(args).pipe(Effect.provide(TestLayer)));

    expect(hardDeleteCalled).toBe(true);
  });

  it("should handle -f shorthand for --force", async () => {
    const prompt = createTestPrompt({
      id: "f-delete-test",
      name: "f-delete-prompt",
    });
    const state = createMockStorageState([prompt]);
    let hardDeleteCalled = false;
    const storage = {
      ...createMockStorageService(state),
      delete: (id: string, hard?: boolean) => {
        hardDeleteCalled = hard === true;
        state.prompts.delete(id);
        return Effect.void;
      },
    };
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["f-delete-prompt"],
      flags: { f: true, y: true },
    });

    await Effect.runPromise(rmCommand(args).pipe(Effect.provide(TestLayer)));

    expect(hardDeleteCalled).toBe(true);
  });

  it("should delete multiple prompts", async () => {
    const prompts = [
      createTestPrompt({ id: "multi-1", name: "multi-prompt-1" }),
      createTestPrompt({ id: "multi-2", name: "multi-prompt-2" }),
      createTestPrompt({ id: "multi-3", name: "multi-prompt-3" }),
    ];
    const state = createMockStorageState(prompts);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["multi-prompt-1", "multi-prompt-2", "multi-prompt-3"],
      flags: { yes: true },
    });

    await Effect.runPromise(rmCommand(args).pipe(Effect.provide(TestLayer)));

    expect(state.prompts.size).toBe(0);
  });

  it("should handle -y shorthand for --yes", async () => {
    const prompt = createTestPrompt({
      id: "y-test",
      name: "y-prompt",
    });
    const state = createMockStorageState([prompt]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["y-prompt"],
      flags: { y: true },
    });

    await Effect.runPromise(rmCommand(args).pipe(Effect.provide(TestLayer)));

    expect(state.prompts.has("y-test")).toBe(false);
  });

  it("should fail for non-existent prompt", async () => {
    const state = createMockStorageState([]);
    const storage = createMockStorageService(state);
    const TestLayer = createTestLayer({ storage });

    const args = createParsedArgs({
      positional: ["non-existent"],
      flags: { yes: true },
    });

    const result = await Effect.runPromiseExit(
      rmCommand(args).pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("Failure");
  });

  it("should fail when no arguments provided", async () => {
    const TestLayer = createTestLayer();

    const args = createParsedArgs({ positional: [] });

    const result = await Effect.runPromiseExit(
      rmCommand(args).pipe(Effect.provide(TestLayer))
    );

    expect(result._tag).toBe("Failure");
  });
});
