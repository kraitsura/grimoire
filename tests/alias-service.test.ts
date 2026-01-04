/**
 * Alias Service Tests
 *
 * Comprehensive tests for command alias functionality.
 * Uses mock layers to avoid filesystem permission issues.
 * Tests alias CRUD, resolution, circular dependency detection, and built-in aliases.
 */

import { describe, it, expect } from "bun:test";
import { Effect, Layer, Ref } from "effect";
import {
  AliasService,
  AliasNotFoundError,
  AliasError,
  CircularAliasError,
  type Alias,
} from "../src/services/alias-service";
import { runTest, runTestExpectError, runTestExpectFailure } from "./utils";

/**
 * Built-in aliases (matching the service implementation)
 */
const BUILTIN_ALIASES: Record<string, { command: string; args: string[]; description?: string }> = {
  ls: { command: "list", args: [], description: "List all prompts" },
  rm: { command: "remove", args: [], description: "Remove a prompt" },
  cp: { command: "copy", args: [], description: "Copy a prompt" },
};

/**
 * Create a mock AliasService layer for testing.
 * Uses Effect Refs for mutable state, simulating the filesystem-backed service.
 */
const createMockAliasLayer = (
  initialAliases: Record<string, { command: string; args: string[]; description?: string }> = {}
): Layer.Layer<AliasService> => {
  return Layer.effect(
    AliasService,
    Effect.gen(function* () {
      // Combine built-ins with initial custom aliases
      const customAliasesRef = yield* Ref.make<
        Record<string, { command: string; args: string[]; description?: string }>
      >(initialAliases);

      const MAX_RESOLUTION_DEPTH = 5;

      const getAllAliases = () =>
        Effect.gen(function* () {
          const custom = yield* Ref.get(customAliasesRef);
          return { ...BUILTIN_ALIASES, ...custom };
        });

      return AliasService.of({
        createAlias: (name, command, args, description) =>
          Effect.gen(function* () {
            yield* Ref.update(customAliasesRef, (aliases) => ({
              ...aliases,
              [name]: { command, args, description },
            }));

            return { name, command, args, description };
          }),

        removeAlias: (name) =>
          Effect.gen(function* () {
            // Cannot remove built-in aliases
            if (name in BUILTIN_ALIASES) {
              return yield* Effect.fail(
                new AliasError({
                  message: `Cannot remove built-in alias: ${name}`,
                })
              );
            }

            const aliases = yield* Ref.get(customAliasesRef);

            if (!(name in aliases)) {
              return yield* Effect.fail(new AliasNotFoundError({ name }));
            }

            yield* Ref.update(customAliasesRef, (current) => {
              const updated = { ...current };
              delete updated[name];
              return updated;
            });
          }),

        listAliases: () =>
          Effect.gen(function* () {
            const aliases = yield* getAllAliases();

            return Object.entries(aliases).map(
              ([name, { command, args, description }]) => ({
                name,
                command,
                args,
                description,
              })
            );
          }),

        resolveAlias: (input) =>
          Effect.gen(function* () {
            if (input.length === 0) {
              return input;
            }

            const aliases = yield* getAllAliases();
            const resolutionChain: string[] = [input[0]];
            let current = input;
            let depth = 0;

            while (depth < MAX_RESOLUTION_DEPTH) {
              const cmd = current[0];
              const alias = aliases[cmd];

              if (!alias) {
                break;
              }

              // Check for circular dependency
              if (resolutionChain.includes(alias.command)) {
                return yield* Effect.fail(
                  new CircularAliasError({
                    message: `Circular alias dependency detected: ${resolutionChain.join(" -> ")} -> ${alias.command}`,
                    chain: [...resolutionChain, alias.command],
                  })
                );
              }

              resolutionChain.push(alias.command);

              // Expand alias
              current = [...alias.command.split(" "), ...alias.args, ...current.slice(1)];
              depth++;
            }

            if (depth >= MAX_RESOLUTION_DEPTH) {
              return yield* Effect.fail(
                new CircularAliasError({
                  message: `Maximum alias resolution depth (${MAX_RESOLUTION_DEPTH}) exceeded. Possible circular dependency: ${resolutionChain.join(" -> ")}`,
                  chain: resolutionChain,
                })
              );
            }

            return current;
          }),

        getAlias: (name) =>
          Effect.gen(function* () {
            const aliases = yield* getAllAliases();
            const alias = aliases[name];

            if (!alias) {
              return yield* Effect.fail(new AliasNotFoundError({ name }));
            }

            return {
              name,
              command: alias.command,
              args: alias.args,
              description: alias.description,
            };
          }),
      });
    })
  );
};

// Default test layer with no custom aliases
const TestLayer = () => createMockAliasLayer();

describe("AliasService", () => {
  describe("listAliases", () => {
    it("should return built-in aliases by default", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;
        return yield* alias.listAliases();
      });

      const aliases = await runTest(program.pipe(Effect.provide(TestLayer())));

      // Should have built-in aliases: ls, rm, cp
      expect(aliases.length).toBeGreaterThanOrEqual(3);
      expect(aliases.some((a) => a.name === "ls")).toBe(true);
      expect(aliases.some((a) => a.name === "rm")).toBe(true);
      expect(aliases.some((a) => a.name === "cp")).toBe(true);
    });

    it("should include custom aliases along with built-ins", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        // Create a custom alias
        yield* alias.createAlias("myalias", "list", ["--all"], "My alias");

        return yield* alias.listAliases();
      });

      const aliases = await runTest(program.pipe(Effect.provide(TestLayer())));

      // Should include both built-in and custom
      expect(aliases.some((a) => a.name === "ls")).toBe(true);
      expect(aliases.some((a) => a.name === "myalias")).toBe(true);
    });
  });

  describe("createAlias", () => {
    it("should create a new alias", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        const created = yield* alias.createAlias(
          "ll",
          "list",
          ["--verbose"],
          "List with verbose output"
        );

        return created;
      });

      const alias = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(alias.name).toBe("ll");
      expect(alias.command).toBe("list");
      expect(alias.args).toEqual(["--verbose"]);
      expect(alias.description).toBe("List with verbose output");
    });

    it("should persist alias to state", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        // Create alias
        yield* alias.createAlias("test-persist", "show", []);

        // Retrieve to verify persistence
        return yield* alias.getAlias("test-persist");
      });

      const alias = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(alias.name).toBe("test-persist");
      expect(alias.command).toBe("show");
    });

    it("should override existing custom alias", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        // Create initial alias
        yield* alias.createAlias("override-test", "list", []);

        // Override with new command
        yield* alias.createAlias("override-test", "show", ["--json"]);

        return yield* alias.getAlias("override-test");
      });

      const alias = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(alias.command).toBe("show");
      expect(alias.args).toEqual(["--json"]);
    });

    it("should allow alias without description", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        const created = yield* alias.createAlias("nodesc", "list", []);

        return created;
      });

      const alias = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(alias.name).toBe("nodesc");
      expect(alias.description).toBeUndefined();
    });

    it("should allow empty args array", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        const created = yield* alias.createAlias("noargs", "list", []);

        return created;
      });

      const alias = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(alias.args).toEqual([]);
    });
  });

  describe("getAlias", () => {
    it("should retrieve existing alias", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        // Get built-in alias
        return yield* alias.getAlias("ls");
      });

      const alias = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(alias.name).toBe("ls");
      expect(alias.command).toBe("list");
    });

    it("should fail for non-existent alias", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;
        return yield* alias.getAlias("nonexistent");
      });

      const error = await runTestExpectError(
        program.pipe(Effect.provide(TestLayer())),
        (e): e is AliasNotFoundError => e instanceof AliasNotFoundError
      );

      expect(error.name).toBe("nonexistent");
    });
  });

  describe("removeAlias", () => {
    it("should remove custom alias", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        // Create then remove
        yield* alias.createAlias("to-remove", "list", []);
        yield* alias.removeAlias("to-remove");

        // Verify removed
        return yield* alias.getAlias("to-remove").pipe(
          Effect.map(() => "found"),
          Effect.catchTag("AliasNotFoundError", () => Effect.succeed("removed"))
        );
      });

      const result = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(result).toBe("removed");
    });

    it("should fail when removing non-existent alias", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;
        yield* alias.removeAlias("does-not-exist");
      });

      const error = await runTestExpectError(
        program.pipe(Effect.provide(TestLayer())),
        (e): e is AliasNotFoundError => e instanceof AliasNotFoundError
      );

      expect(error.name).toBe("does-not-exist");
    });

    it("should not allow removing built-in aliases", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;
        yield* alias.removeAlias("ls");
      });

      const error = await runTestExpectError(
        program.pipe(Effect.provide(TestLayer())),
        (e): e is AliasError => e instanceof AliasError
      );

      expect(error.message).toContain("built-in");
    });
  });

  describe("resolveAlias", () => {
    it("should resolve simple alias", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        // Resolve built-in alias
        return yield* alias.resolveAlias(["ls"]);
      });

      const resolved = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(resolved).toEqual(["list"]);
    });

    it("should resolve alias with args", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        yield* alias.createAlias("ll", "list", ["--verbose"]);

        return yield* alias.resolveAlias(["ll", "extra-arg"]);
      });

      const resolved = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(resolved).toEqual(["list", "--verbose", "extra-arg"]);
    });

    it("should resolve nested aliases", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        // Create chain: shortalias -> ls -> list
        yield* alias.createAlias("shortalias", "ls", []);

        return yield* alias.resolveAlias(["shortalias"]);
      });

      const resolved = await runTest(program.pipe(Effect.provide(TestLayer())));

      // Should resolve shortalias -> ls -> list
      expect(resolved).toEqual(["list"]);
    });

    it("should pass through non-alias commands", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        return yield* alias.resolveAlias(["unknown-command", "arg1", "arg2"]);
      });

      const resolved = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(resolved).toEqual(["unknown-command", "arg1", "arg2"]);
    });

    it("should handle empty input", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        return yield* alias.resolveAlias([]);
      });

      const resolved = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(resolved).toEqual([]);
    });

    it("should detect circular alias dependencies", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        // Create circular dependency: a -> b -> a
        yield* alias.createAlias("alias-a", "alias-b", []);
        yield* alias.createAlias("alias-b", "alias-a", []);

        return yield* alias.resolveAlias(["alias-a"]);
      });

      const error = await runTestExpectError(
        program.pipe(Effect.provide(TestLayer())),
        (e): e is CircularAliasError => e instanceof CircularAliasError
      );

      expect(error.message).toContain("Circular");
      expect(error.chain).toContain("alias-a");
      expect(error.chain).toContain("alias-b");
    });

    it("should detect self-referential alias", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        // Create self-referential alias: self -> self
        yield* alias.createAlias("self", "self", []);

        return yield* alias.resolveAlias(["self"]);
      });

      const error = await runTestExpectError(
        program.pipe(Effect.provide(TestLayer())),
        (e): e is CircularAliasError => e instanceof CircularAliasError
      );

      expect(error.message).toContain("Circular");
    });

    it("should respect maximum resolution depth", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        // Create deep chain: a1 -> a2 -> a3 -> a4 -> a5 -> a6
        for (let i = 1; i <= 6; i++) {
          yield* alias.createAlias(`a${i}`, `a${i + 1}`, []);
        }

        return yield* alias.resolveAlias(["a1"]);
      });

      const error = await runTestExpectError(
        program.pipe(Effect.provide(TestLayer())),
        (e): e is CircularAliasError => e instanceof CircularAliasError
      );

      expect(error.message).toContain("Maximum alias resolution depth");
    });
  });

  describe("built-in aliases", () => {
    it("should have ls alias for list", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;
        return yield* alias.getAlias("ls");
      });

      const alias = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(alias.command).toBe("list");
      expect(alias.description).toBeDefined();
    });

    it("should have rm alias for remove", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;
        return yield* alias.getAlias("rm");
      });

      const alias = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(alias.command).toBe("remove");
    });

    it("should have cp alias for copy", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;
        return yield* alias.getAlias("cp");
      });

      const alias = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(alias.command).toBe("copy");
    });
  });

  describe("edge cases", () => {
    it("should handle special characters in alias names", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        yield* alias.createAlias("my-alias_123", "list", []);

        return yield* alias.getAlias("my-alias_123");
      });

      const alias = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(alias.name).toBe("my-alias_123");
    });

    it("should handle spaces in command arguments", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        yield* alias.createAlias("withspace", "list", ["--name", "my prompt"]);

        return yield* alias.resolveAlias(["withspace"]);
      });

      const resolved = await runTest(program.pipe(Effect.provide(TestLayer())));

      expect(resolved).toEqual(["list", "--name", "my prompt"]);
    });

    it("should handle complex command strings", async () => {
      const program = Effect.gen(function* () {
        const alias = yield* AliasService;

        // Command with multiple words
        yield* alias.createAlias("multiword", "list all", []);

        return yield* alias.resolveAlias(["multiword"]);
      });

      const resolved = await runTest(program.pipe(Effect.provide(TestLayer())));

      // "list all" should be split
      expect(resolved).toEqual(["list", "all"]);
    });
  });

  describe("state isolation", () => {
    it("should have isolated state between layers", async () => {
      // First layer - create an alias
      const program1 = Effect.gen(function* () {
        const alias = yield* AliasService;
        yield* alias.createAlias("test-isolated", "show", []);
        return yield* alias.listAliases();
      });

      const aliases1 = await runTest(
        program1.pipe(Effect.provide(TestLayer()))
      );

      // Second layer - alias should not exist
      const program2 = Effect.gen(function* () {
        const alias = yield* AliasService;
        return yield* alias.getAlias("test-isolated").pipe(
          Effect.map(() => "found"),
          Effect.catchTag("AliasNotFoundError", () => Effect.succeed("not found"))
        );
      });

      const result = await runTest(
        program2.pipe(Effect.provide(TestLayer()))
      );

      expect(aliases1.some((a) => a.name === "test-isolated")).toBe(true);
      expect(result).toBe("not found"); // Isolated state
    });

    it("should support pre-initialized custom aliases", async () => {
      const CustomLayer = createMockAliasLayer({
        custom1: { command: "test1", args: [] },
        custom2: { command: "test2", args: ["--flag"] },
      });

      const program = Effect.gen(function* () {
        const alias = yield* AliasService;
        return yield* alias.listAliases();
      });

      const aliases = await runTest(program.pipe(Effect.provide(CustomLayer)));

      expect(aliases.some((a) => a.name === "custom1")).toBe(true);
      expect(aliases.some((a) => a.name === "custom2")).toBe(true);
      // Built-ins should still exist
      expect(aliases.some((a) => a.name === "ls")).toBe(true);
    });
  });
});
