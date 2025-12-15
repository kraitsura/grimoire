import { describe, test, expect } from "bun:test";
import { Effect } from "effect";
import {
  FormatService,
  FormatServiceLive,
  type FormattingConfig,
} from "../src/services/format-service";

const defaultConfig: FormattingConfig = {
  trimTrailingWhitespace: true,
  insertFinalNewline: true,
  indentSize: 2,
  maxLineLength: 100,
  normalizeXmlTags: true,
};

describe("FormatService", () => {
  describe("formatPrompt", () => {
    test("trims trailing whitespace", async () => {
      const content = "Hello world   \nAnother line  \n";
      const expected = "Hello world\nAnother line\n";

      const program = Effect.gen(function* () {
        const formatService = yield* FormatService;
        const result = yield* formatService.formatPrompt(content, defaultConfig);
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(FormatServiceLive))
      );

      expect(result.content).toBe(expected);
      expect(result.changes).toBeGreaterThan(0);
    });

    test("inserts final newline", async () => {
      const content = "Hello world";
      const expected = "Hello world\n";

      const program = Effect.gen(function* () {
        const formatService = yield* FormatService;
        const result = yield* formatService.formatPrompt(content, defaultConfig);
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(FormatServiceLive))
      );

      expect(result.content).toBe(expected);
      expect(result.changes).toBeGreaterThan(0);
    });

    test("normalizes XML tags", async () => {
      const content = "<system>You are helpful</system>";
      const expected = "<system>\nYou are helpful\n</system>\n";

      const program = Effect.gen(function* () {
        const formatService = yield* FormatService;
        const result = yield* formatService.formatPrompt(content, defaultConfig);
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(FormatServiceLive))
      );

      expect(result.content).toBe(expected);
      expect(result.changes).toBeGreaterThan(0);
    });
  });

  describe("checkPrompt", () => {
    test("detects empty content", async () => {
      const content = "";

      const program = Effect.gen(function* () {
        const formatService = yield* FormatService;
        const result = yield* formatService.checkPrompt(content, defaultConfig);
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(FormatServiceLive))
      );

      expect(result.isValid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].rule).toBe("no-empty-content");
      expect(result.issues[0].severity).toBe("error");
    });

    test("detects trailing whitespace", async () => {
      const content = "Hello world   \n";

      const program = Effect.gen(function* () {
        const formatService = yield* FormatService;
        const result = yield* formatService.checkPrompt(content, defaultConfig);
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(FormatServiceLive))
      );

      expect(result.isValid).toBe(true); // warnings don't make it invalid
      expect(result.issues.length).toBeGreaterThan(0);
      const trailingWhitespaceIssue = result.issues.find(
        (i) => i.rule === "no-trailing-whitespace"
      );
      expect(trailingWhitespaceIssue).toBeDefined();
      expect(trailingWhitespaceIssue?.severity).toBe("warning");
    });

    test("detects missing final newline", async () => {
      const content = "Hello world";

      const program = Effect.gen(function* () {
        const formatService = yield* FormatService;
        const result = yield* formatService.checkPrompt(content, defaultConfig);
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(FormatServiceLive))
      );

      expect(result.isValid).toBe(true); // info doesn't make it invalid
      const finalNewlineIssue = result.issues.find(
        (i) => i.rule === "final-newline"
      );
      expect(finalNewlineIssue).toBeDefined();
      expect(finalNewlineIssue?.severity).toBe("info");
    });

    test("detects lines too long", async () => {
      const content = "a".repeat(150) + "\n";

      const program = Effect.gen(function* () {
        const formatService = yield* FormatService;
        const result = yield* formatService.checkPrompt(content, defaultConfig);
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(FormatServiceLive))
      );

      expect(result.isValid).toBe(true); // warnings don't make it invalid
      const maxLineLengthIssue = result.issues.find(
        (i) => i.rule === "max-line-length"
      );
      expect(maxLineLengthIssue).toBeDefined();
      expect(maxLineLengthIssue?.severity).toBe("warning");
    });

    test("detects unclosed XML tags", async () => {
      const content = "<system>Hello world\n";

      const program = Effect.gen(function* () {
        const formatService = yield* FormatService;
        const result = yield* formatService.checkPrompt(content, defaultConfig);
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(FormatServiceLive))
      );

      expect(result.isValid).toBe(false);
      const unclosedTagIssue = result.issues.find(
        (i) => i.rule === "no-unclosed-xml-tags"
      );
      expect(unclosedTagIssue).toBeDefined();
      expect(unclosedTagIssue?.severity).toBe("error");
    });
  });

  describe("validateYamlFrontmatter", () => {
    test("accepts content without frontmatter", async () => {
      const content = "Just regular content\n";

      const program = Effect.gen(function* () {
        const formatService = yield* FormatService;
        const result = yield* formatService.validateYamlFrontmatter(content);
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(FormatServiceLive))
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("validates correct YAML frontmatter", async () => {
      const content = `---
name: test
tags:
  - tag1
  - tag2
---
Content here
`;

      const program = Effect.gen(function* () {
        const formatService = yield* FormatService;
        const result = yield* formatService.validateYamlFrontmatter(content);
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(FormatServiceLive))
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("detects unclosed frontmatter", async () => {
      const content = `---
name: test
Content here
`;

      const program = Effect.gen(function* () {
        const formatService = yield* FormatService;
        const result = yield* formatService.validateYamlFrontmatter(content);
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(FormatServiceLive))
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Unclosed YAML frontmatter");
    });

    test("detects invalid YAML", async () => {
      const content = `---
name: test
tags: [invalid yaml
---
Content here
`;

      const program = Effect.gen(function* () {
        const formatService = yield* FormatService;
        const result = yield* formatService.validateYamlFrontmatter(content);
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(FormatServiceLive))
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("YAML parsing error");
    });
  });
});
