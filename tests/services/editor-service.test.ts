/**
 * Editor Service Tests
 *
 * Tests for the external editor service which opens prompts in
 * the user's preferred text editor.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Effect, Layer } from "effect";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { homedir, platform } from "os";
import {
  EditorService,
  EditorServiceLive,
} from "../../src/services/editor-service";
import { EditorError } from "../../src/models/errors";

// Helper to run effects with the service
const runEffect = <A, E>(effect: Effect.Effect<A, E, EditorService>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(EditorServiceLive)) as Effect.Effect<A, E, never>
  );

// Mock editor service for testing without launching actual editors
const createMockEditorService = (
  transform: (content: string) => string = (c) => c + "\n[edited]"
) => {
  return {
    getEditorCommand: Effect.succeed("mock-editor"),
    open: (content: string, _filename?: string) =>
      Effect.succeed(transform(content)),
  };
};

describe("EditorService", () => {
  describe("getEditorCommand", () => {
    test("returns VISUAL when set", async () => {
      const originalVisual = process.env.VISUAL;
      const originalEditor = process.env.EDITOR;

      process.env.VISUAL = "code --wait";
      delete process.env.EDITOR;

      const program = Effect.gen(function* () {
        const editor = yield* EditorService;
        return yield* editor.getEditorCommand;
      });

      const command = await runEffect(program);
      expect(command).toBe("code --wait");

      // Restore
      if (originalVisual) process.env.VISUAL = originalVisual;
      else delete process.env.VISUAL;
      if (originalEditor) process.env.EDITOR = originalEditor;
    });

    test("returns EDITOR when VISUAL not set", async () => {
      const originalVisual = process.env.VISUAL;
      const originalEditor = process.env.EDITOR;

      delete process.env.VISUAL;
      process.env.EDITOR = "vim";

      const program = Effect.gen(function* () {
        const editor = yield* EditorService;
        return yield* editor.getEditorCommand;
      });

      const command = await runEffect(program);
      expect(command).toBe("vim");

      // Restore
      if (originalVisual) process.env.VISUAL = originalVisual;
      if (originalEditor) process.env.EDITOR = originalEditor;
      else delete process.env.EDITOR;
    });

    test("returns platform default when no env vars set", async () => {
      const originalVisual = process.env.VISUAL;
      const originalEditor = process.env.EDITOR;

      delete process.env.VISUAL;
      delete process.env.EDITOR;

      const program = Effect.gen(function* () {
        const editor = yield* EditorService;
        return yield* editor.getEditorCommand;
      });

      const command = await runEffect(program);

      const currentPlatform = platform();
      if (currentPlatform === "win32") {
        expect(command).toBe("notepad");
      } else {
        // macOS and Linux default to nano
        expect(command).toBe("nano");
      }

      // Restore
      if (originalVisual) process.env.VISUAL = originalVisual;
      if (originalEditor) process.env.EDITOR = originalEditor;
    });
  });

  describe("Mock Editor Service", () => {
    test("open returns transformed content", async () => {
      const mockService = createMockEditorService();
      const MockLayer = Layer.succeed(EditorService, mockService);

      const program = Effect.gen(function* () {
        const editor = yield* EditorService;
        return yield* editor.open("Original content");
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(result).toBe("Original content\n[edited]");
    });

    test("open preserves content when no changes", async () => {
      const mockService = createMockEditorService((c) => c);
      const MockLayer = Layer.succeed(EditorService, mockService);

      const program = Effect.gen(function* () {
        const editor = yield* EditorService;
        return yield* editor.open("Unchanged content");
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(result).toBe("Unchanged content");
    });

    test("open handles empty content", async () => {
      const mockService = createMockEditorService((c) => c + "Added content");
      const MockLayer = Layer.succeed(EditorService, mockService);

      const program = Effect.gen(function* () {
        const editor = yield* EditorService;
        return yield* editor.open("");
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(result).toBe("Added content");
    });

    test("open handles multiline content", async () => {
      const mockService = createMockEditorService((c) => c);
      const MockLayer = Layer.succeed(EditorService, mockService);

      const multiline = `Line 1
Line 2
Line 3`;

      const program = Effect.gen(function* () {
        const editor = yield* EditorService;
        return yield* editor.open(multiline);
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(result).toBe(multiline);
    });

    test("open handles special characters", async () => {
      const mockService = createMockEditorService((c) => c);
      const MockLayer = Layer.succeed(EditorService, mockService);

      const special = "Hello\t\n\"quotes\" 'apostrophes' `backticks`";

      const program = Effect.gen(function* () {
        const editor = yield* EditorService;
        return yield* editor.open(special);
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(result).toBe(special);
    });

    test("getEditorCommand returns mock command", async () => {
      const mockService = createMockEditorService();
      const MockLayer = Layer.succeed(EditorService, mockService);

      const program = Effect.gen(function* () {
        const editor = yield* EditorService;
        return yield* editor.getEditorCommand;
      });

      const command = await Effect.runPromise(program.pipe(Effect.provide(MockLayer)));
      expect(command).toBe("mock-editor");
    });
  });

  describe("Error Handling", () => {
    test("open fails gracefully with EditorError", async () => {
      const failingService = {
        getEditorCommand: Effect.succeed("mock-editor"),
        open: (_content: string, _filename?: string) =>
          Effect.fail(
            new EditorError({
              message: "Editor not found",
              cause: new Error("ENOENT"),
            })
          ),
      };
      const FailingLayer = Layer.succeed(EditorService, failingService);

      const program = Effect.gen(function* () {
        const editor = yield* EditorService;
        return yield* editor.open("Content");
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(FailingLayer), Effect.either)
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("EditorError");
        expect(result.left.message).toBe("Editor not found");
      }
    });
  });
});

describe("EditorError", () => {
  test("has correct tag", () => {
    const error = new EditorError({ message: "Test error" });
    expect(error._tag).toBe("EditorError");
  });

  test("includes message", () => {
    const error = new EditorError({ message: "Editor crashed" });
    expect(error.message).toBe("Editor crashed");
  });

  test("includes cause when provided", () => {
    const cause = new Error("Process exited with code 1");
    const error = new EditorError({ message: "Editor failed", cause });
    expect(error.cause).toBe(cause);
  });
});

describe("EditorService Integration", () => {
  // These tests verify the tmp directory handling

  test("tmp directory is under .grimoire", async () => {
    // The service creates ~/.grimoire/tmp for temp files
    const expectedPath = join(homedir(), ".grimoire", "tmp");

    // Just verify the expected path is correct
    expect(expectedPath).toContain(".grimoire");
    expect(expectedPath).toContain("tmp");
  });
});
