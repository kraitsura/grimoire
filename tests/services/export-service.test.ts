/**
 * Export Service Tests
 *
 * Comprehensive tests for the ExportService which handles exporting
 * prompts to JSON/YAML formats for backup, sharing, and migration.
 */

import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  ExportService,
  ExportServiceLive,
  type ExportBundle,
} from "../../src/services/export-service";
import { StorageService } from "../../src/services/storage-service";
import { runTest } from "../utils";

describe("ExportService", () => {
  // Mock storage service that returns test prompts
  const MockStorageServiceLive = Layer.succeed(StorageService, {
    getAll: Effect.succeed([
      {
        id: "prompt-1",
        name: "Test Prompt 1",
        content: "Content for prompt 1",
        tags: ["tag1", "tag2"],
        created: new Date("2025-01-01T00:00:00Z"),
        updated: new Date("2025-01-02T00:00:00Z"),
        version: 1,
        isTemplate: false,
      },
      {
        id: "prompt-2",
        name: "Test Prompt 2",
        content: "Content for prompt 2",
        tags: ["tag2", "tag3"],
        created: new Date("2025-01-03T00:00:00Z"),
        updated: new Date("2025-01-04T00:00:00Z"),
        version: 2,
        isTemplate: true,
      },
    ]),
    getById: (id: string) =>
      Effect.succeed({
        id,
        name: `Prompt ${id}`,
        content: `Content for ${id}`,
        tags: ["tag1"],
        created: new Date("2025-01-01T00:00:00Z"),
        updated: new Date("2025-01-01T00:00:00Z"),
        version: 1,
        isTemplate: false,
      }),
    getByName: () => Effect.die("Not implemented"),
    create: () => Effect.die("Not implemented"),
    update: () => Effect.die("Not implemented"),
    delete: () => Effect.die("Not implemented"),
    findByTags: (tags: string[]) =>
      Effect.succeed([
        {
          id: "prompt-tagged",
          name: "Tagged Prompt",
          content: "Content with matching tags",
          tags,
          created: new Date("2025-01-01T00:00:00Z"),
          updated: new Date("2025-01-01T00:00:00Z"),
          version: 1,
          isTemplate: false,
        },
      ]),
    search: () => Effect.die("Not implemented"),
  });

  // Helper to run effects with proper layer composition
  const runEffect = async <A, E>(effect: Effect.Effect<A, E, any>) =>
    runTest(
      effect.pipe(
        Effect.provide(ExportServiceLive),
        Effect.provide(MockStorageServiceLive)
      )
    );

  describe("exportAll", () => {
    test("exports all prompts as JSON", async () => {
      const program = Effect.gen(function* () {
        const exportService = yield* ExportService;

        const exported = yield* exportService.exportAll({
          format: "json",
          prettyPrint: true,
        });

        return exported;
      });

      const result = await runEffect(program);

      const parsed = JSON.parse(result) as ExportBundle;

      expect(parsed.version).toBe("1.0");
      expect(parsed.source).toBe("grimoire@0.1.0");
      expect(parsed.prompts.length).toBe(2);
      expect(parsed.prompts[0].id).toBe("prompt-1");
      expect(parsed.prompts[0].name).toBe("Test Prompt 1");
      expect(parsed.prompts[0].content).toBe("Content for prompt 1");
      expect(parsed.prompts[0].tags).toEqual(["tag1", "tag2"]);
      expect(parsed.prompts[1].id).toBe("prompt-2");
      expect(parsed.prompts[1].isTemplate).toBe(true);
    });

    test("exports all prompts as YAML", async () => {
      const program = Effect.gen(function* () {
        const exportService = yield* ExportService;

        const exported = yield* exportService.exportAll({
          format: "yaml",
          prettyPrint: true,
        });

        return exported;
      });

      const result = await runEffect(program);

      expect(result).toContain("version: '1.0'");
      expect(result).toContain("prompts:");
      expect(result).toContain("name: Test Prompt 1");
      expect(result).toContain("name: Test Prompt 2");
    });

    test("exports with minified JSON when prettyPrint is false", async () => {
      const program = Effect.gen(function* () {
        const exportService = yield* ExportService;

        const exported = yield* exportService.exportAll({
          format: "json",
          prettyPrint: false,
        });

        return exported;
      });

      const result = await runEffect(program);

      // Minified JSON has no newlines
      expect(result.includes("\n")).toBe(false);
      // Still valid JSON
      const parsed = JSON.parse(result);
      expect(parsed.version).toBe("1.0");
    });

    test("includes exportedAt timestamp", async () => {
      const before = new Date();

      const program = Effect.gen(function* () {
        const exportService = yield* ExportService;

        const exported = yield* exportService.exportAll({
          format: "json",
        });

        return exported;
      });

      const result = await runEffect(program);

      const after = new Date();
      const parsed = JSON.parse(result) as ExportBundle;
      const exportedAt = new Date(parsed.exportedAt);

      expect(exportedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(exportedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("exportByTags", () => {
    test("exports prompts matching tags", async () => {
      const program = Effect.gen(function* () {
        const exportService = yield* ExportService;

        const exported = yield* exportService.exportByTags(["coding"], {
          format: "json",
        });

        return exported;
      });

      const result = await runEffect(program);

      const parsed = JSON.parse(result) as ExportBundle;

      expect(parsed.prompts.length).toBe(1);
      expect(parsed.prompts[0].name).toBe("Tagged Prompt");
      expect(parsed.prompts[0].tags).toContain("coding");
    });

    test("exports to YAML format", async () => {
      const program = Effect.gen(function* () {
        const exportService = yield* ExportService;

        const exported = yield* exportService.exportByTags(["work"], {
          format: "yaml",
        });

        return exported;
      });

      const result = await runEffect(program);

      expect(result).toContain("version: '1.0'");
      expect(result).toContain("Tagged Prompt");
    });
  });

  describe("exportByIds", () => {
    test("exports specific prompts by ID", async () => {
      const program = Effect.gen(function* () {
        const exportService = yield* ExportService;

        const exported = yield* exportService.exportByIds(["id-1", "id-2"], {
          format: "json",
        });

        return exported;
      });

      const result = await runEffect(program);

      const parsed = JSON.parse(result) as ExportBundle;

      expect(parsed.prompts.length).toBe(2);
      expect(parsed.prompts[0].id).toBe("id-1");
      expect(parsed.prompts[1].id).toBe("id-2");
    });

    test("exports single prompt by ID", async () => {
      const program = Effect.gen(function* () {
        const exportService = yield* ExportService;

        const exported = yield* exportService.exportByIds(["single-id"], {
          format: "json",
        });

        return exported;
      });

      const result = await runEffect(program);

      const parsed = JSON.parse(result) as ExportBundle;

      expect(parsed.prompts.length).toBe(1);
      expect(parsed.prompts[0].id).toBe("single-id");
    });
  });

  describe("export bundle format", () => {
    test("includes all required fields in exported prompts", async () => {
      const program = Effect.gen(function* () {
        const exportService = yield* ExportService;

        const exported = yield* exportService.exportAll({
          format: "json",
        });

        return exported;
      });

      const result = await runEffect(program);

      const parsed = JSON.parse(result) as ExportBundle;
      const prompt = parsed.prompts[0];

      expect(prompt).toHaveProperty("id");
      expect(prompt).toHaveProperty("name");
      expect(prompt).toHaveProperty("content");
      expect(prompt).toHaveProperty("tags");
      expect(prompt).toHaveProperty("created");
      expect(prompt).toHaveProperty("updated");
    });

    test("dates are serialized as ISO strings", async () => {
      const program = Effect.gen(function* () {
        const exportService = yield* ExportService;

        const exported = yield* exportService.exportAll({
          format: "json",
        });

        return exported;
      });

      const result = await runEffect(program);

      const parsed = JSON.parse(result) as ExportBundle;
      const prompt = parsed.prompts[0];

      // Should be valid ISO date strings
      expect(new Date(prompt.created).toISOString()).toBe(prompt.created);
      expect(new Date(prompt.updated).toISOString()).toBe(prompt.updated);
    });

    test("includes version and isTemplate fields", async () => {
      const program = Effect.gen(function* () {
        const exportService = yield* ExportService;

        const exported = yield* exportService.exportAll({
          format: "json",
        });

        return exported;
      });

      const result = await runEffect(program);

      const parsed = JSON.parse(result) as ExportBundle;

      expect(parsed.prompts[0].version).toBe(1);
      expect(parsed.prompts[0].isTemplate).toBe(false);
      expect(parsed.prompts[1].version).toBe(2);
      expect(parsed.prompts[1].isTemplate).toBe(true);
    });
  });
});
