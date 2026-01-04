/**
 * Stash Service Tests
 *
 * Comprehensive tests for the StashService which provides
 * stack-based clipboard stash functionality.
 */

import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  StashService,
  StashServiceLive,
} from "../../src/services/stash-service";
import { SqlService } from "../../src/services/sql-service";
import { createTestSqlLayer, runTest } from "../utils";
import { StashEmptyError, StashItemNotFoundError } from "../../src/models";

describe("StashService", () => {
  // Create the test SQL layer (in-memory with migrations)
  const TestSqlLayer = createTestSqlLayer();

  // Helper to run effects with proper layer composition
  // Pattern: provide StashServiceLive first, then TestSqlLayer
  const runEffect = async <A, E>(effect: Effect.Effect<A, E, any>) =>
    runTest(
      effect.pipe(
        Effect.provide(StashServiceLive),
        Effect.provide(TestSqlLayer),
        Effect.scoped
      )
    );

  describe("push", () => {
    test("pushes content onto the stack", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;
        const item = yield* stashService.push("Test content");
        return item;
      });

      const result = await runEffect(program);

      expect(result.content).toBe("Test content");
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.stackOrder).toBe(0);
    });

    test("pushes content with optional name", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;
        const item = yield* stashService.push("Named content", "my-stash");
        return item;
      });

      const result = await runEffect(program);

      expect(result.content).toBe("Named content");
      expect(result.name).toBe("my-stash");
    });

    test("increments stack order for multiple pushes", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        const item1 = yield* stashService.push("First");
        const item2 = yield* stashService.push("Second");
        const item3 = yield* stashService.push("Third");

        return { item1, item2, item3 };
      });

      const result = await runEffect(program);

      expect(result.item1.stackOrder).toBe(0);
      expect(result.item2.stackOrder).toBe(1);
      expect(result.item3.stackOrder).toBe(2);
    });

    test("handles empty content", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;
        const item = yield* stashService.push("");
        return item;
      });

      const result = await runEffect(program);
      expect(result.content).toBe("");
    });

    test("handles content with special characters", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;
        const content = "Special: \n\t\"quotes\" and 'apostrophes' and emoji 🎉";
        const item = yield* stashService.push(content);
        return item;
      });

      const result = await runEffect(program);
      expect(result.content).toContain("quotes");
      expect(result.content).toContain("🎉");
    });
  });

  describe("pop", () => {
    test("pops the most recent item", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push("First");
        yield* stashService.push("Second");
        yield* stashService.push("Third");

        const popped = yield* stashService.pop();
        return popped;
      });

      const result = await runEffect(program);
      expect(result.content).toBe("Third");
    });

    test("removes the popped item from the stack", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push("First");
        yield* stashService.push("Second");

        yield* stashService.pop(); // Remove "Second"

        const remaining = yield* stashService.list();
        return remaining;
      });

      const result = await runEffect(program);
      expect(result.length).toBe(1);
      expect(result[0].content).toBe("First");
    });

    test("fails when stash is empty", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;
        return yield* stashService.pop();
      });

      await expect(runEffect(program)).rejects.toThrow();
    });

    test("correctly pops after some items removed", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push("First");
        yield* stashService.push("Second");
        yield* stashService.push("Third");

        yield* stashService.pop(); // Remove "Third"
        const secondPop = yield* stashService.pop(); // Should remove "Second"

        return secondPop;
      });

      const result = await runEffect(program);
      expect(result.content).toBe("Second");
    });
  });

  describe("popByName", () => {
    test("pops a specific item by name", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push("Anonymous");
        yield* stashService.push("Named content", "target");
        yield* stashService.push("Another anonymous");

        const popped = yield* stashService.popByName("target");
        return popped;
      });

      const result = await runEffect(program);
      expect(result.content).toBe("Named content");
      expect(result.name).toBe("target");
    });

    test("removes the named item from the stack", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push("A", "a");
        yield* stashService.push("B", "b");
        yield* stashService.push("C", "c");

        yield* stashService.popByName("b");

        const remaining = yield* stashService.list();
        return remaining;
      });

      const result = await runEffect(program);
      expect(result.length).toBe(2);
      const names = result.map((r) => r.name);
      expect(names).toContain("a");
      expect(names).toContain("c");
      expect(names).not.toContain("b");
    });

    test("fails when name does not exist", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;
        yield* stashService.push("Named", "existing");
        return yield* stashService.popByName("nonexistent");
      });

      await expect(runEffect(program)).rejects.toThrow();
    });
  });

  describe("peek", () => {
    test("returns the most recent item without removing", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push("First");
        yield* stashService.push("Second");

        const peeked = yield* stashService.peek();
        const list = yield* stashService.list();

        return { peeked, listLength: list.length };
      });

      const result = await runEffect(program);
      expect(result.peeked?.content).toBe("Second");
      expect(result.listLength).toBe(2); // Still both items
    });

    test("returns null when stash is empty", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;
        return yield* stashService.peek();
      });

      const result = await runEffect(program);
      expect(result).toBeNull();
    });
  });

  describe("list", () => {
    test("returns all items in LIFO order", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push("First");
        yield* stashService.push("Second");
        yield* stashService.push("Third");

        const items = yield* stashService.list();
        return items;
      });

      const result = await runEffect(program);
      expect(result.length).toBe(3);
      // Most recent first (LIFO)
      expect(result[0].content).toBe("Third");
      expect(result[1].content).toBe("Second");
      expect(result[2].content).toBe("First");
    });

    test("returns empty array when stash is empty", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;
        return yield* stashService.list();
      });

      const result = await runEffect(program);
      expect(result).toEqual([]);
    });
  });

  describe("getByName", () => {
    test("returns a specific item by name without removing", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push("A", "item-a");
        yield* stashService.push("B", "item-b");

        const item = yield* stashService.getByName("item-a");
        const list = yield* stashService.list();

        return { item, listLength: list.length };
      });

      const result = await runEffect(program);
      expect(result.item.content).toBe("A");
      expect(result.item.name).toBe("item-a");
      expect(result.listLength).toBe(2); // Still both items
    });

    test("fails when name does not exist", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;
        return yield* stashService.getByName("nonexistent");
      });

      await expect(runEffect(program)).rejects.toThrow();
    });
  });

  describe("delete", () => {
    test("deletes a specific item by id", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        const item1 = yield* stashService.push("First");
        yield* stashService.push("Second");

        yield* stashService.delete(item1.id);

        const remaining = yield* stashService.list();
        return remaining;
      });

      const result = await runEffect(program);
      expect(result.length).toBe(1);
      expect(result[0].content).toBe("Second");
    });

    test("fails when id does not exist", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;
        return yield* stashService.delete("nonexistent-id");
      });

      await expect(runEffect(program)).rejects.toThrow();
    });
  });

  describe("clear", () => {
    test("clears all items and returns count", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push("First");
        yield* stashService.push("Second");
        yield* stashService.push("Third");

        const clearedCount = yield* stashService.clear();
        const remaining = yield* stashService.list();

        return { clearedCount, remaining };
      });

      const result = await runEffect(program);
      expect(result.clearedCount).toBe(3);
      expect(result.remaining).toEqual([]);
    });

    test("returns 0 when stash is already empty", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;
        return yield* stashService.clear();
      });

      const result = await runEffect(program);
      expect(result).toBe(0);
    });
  });

  describe("database schema", () => {
    test("creates stash table on initialization", async () => {
      const program = Effect.gen(function* () {
        const sql = yield* SqlService;
        const _ = yield* StashService;

        const tables = yield* sql.query<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='stash'"
        );

        return tables;
      });

      const result = await runEffect(program);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("stash");
    });

    test("creates index on stack_order", async () => {
      const program = Effect.gen(function* () {
        const sql = yield* SqlService;
        const _ = yield* StashService;

        const indexes = yield* sql.query<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_stash_stack_order'"
        );

        return indexes;
      });

      const result = await runEffect(program);
      expect(result.length).toBe(1);
    });
  });

  describe("name uniqueness", () => {
    test("allows multiple items without names", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push("First");
        yield* stashService.push("Second");
        yield* stashService.push("Third");

        const items = yield* stashService.list();
        return items;
      });

      const result = await runEffect(program);
      expect(result.length).toBe(3);
      expect(result.every((i) => i.name === undefined)).toBe(true);
    });

    test("rejects duplicate names", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push("First", "duplicate");
        yield* stashService.push("Second", "duplicate");

        return yield* stashService.list();
      });

      await expect(runEffect(program)).rejects.toThrow();
    });

    test("allows reusing name after item is deleted", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        const first = yield* stashService.push("First", "reusable");
        yield* stashService.delete(first.id);

        const second = yield* stashService.push("Second", "reusable");
        return second;
      });

      const result = await runEffect(program);
      expect(result.name).toBe("reusable");
      expect(result.content).toBe("Second");
    });
  });

  describe("LIFO behavior", () => {
    test("maintains LIFO order after mixed operations", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push("A");
        yield* stashService.push("B");
        yield* stashService.pop(); // Remove B
        yield* stashService.push("C");
        yield* stashService.push("D");

        const items = yield* stashService.list();
        return items.map((i) => i.content);
      });

      const result = await runEffect(program);
      expect(result).toEqual(["D", "C", "A"]);
    });
  });

  describe("edge cases", () => {
    test("handles very long content", async () => {
      const longContent = "x".repeat(100000);

      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        const item = yield* stashService.push(longContent);
        const retrieved = yield* stashService.peek();

        return { item, retrieved };
      });

      const result = await runEffect(program);
      expect(result.item.content.length).toBe(100000);
      expect(result.retrieved?.content.length).toBe(100000);
    });

    test("handles unicode content", async () => {
      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push("Japanese: 日本語");
        yield* stashService.push("Korean: 한국어");
        yield* stashService.push("Emoji: 🎉🚀✨");

        const items = yield* stashService.list();
        return items;
      });

      const result = await runEffect(program);
      expect(result[0].content).toContain("🎉");
      expect(result[1].content).toContain("한국어");
      expect(result[2].content).toContain("日本語");
    });

    test("handles newlines and tabs in content", async () => {
      const content = "Line 1\nLine 2\n\tIndented\n\t\tDouble indented";

      const program = Effect.gen(function* () {
        const stashService = yield* StashService;

        yield* stashService.push(content);
        const retrieved = yield* stashService.peek();

        return retrieved;
      });

      const result = await runEffect(program);
      expect(result?.content).toBe(content);
    });
  });
});
