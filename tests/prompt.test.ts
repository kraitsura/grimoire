/**
 * Prompt Schema Tests
 */

import { describe, it, expect } from "bun:test";
import { Schema } from "@effect/schema";
import { FrontmatterSchema, PromptSchema, type Frontmatter, type Prompt } from "../src/models/prompt";

describe("FrontmatterSchema", () => {
  it("should validate valid frontmatter", () => {
    const validFrontmatter = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test Prompt",
      tags: ["test", "example"],
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-02T00:00:00.000Z",
      version: 1,
      isTemplate: false
    };

    const decode = Schema.decodeUnknownSync(FrontmatterSchema);
    const result = decode(validFrontmatter);

    expect(result.id).toBe(validFrontmatter.id);
    expect(result.name).toBe(validFrontmatter.name);
    expect(result.tags).toEqual(validFrontmatter.tags);
    expect(result.created).toBeInstanceOf(Date);
    expect(result.updated).toBeInstanceOf(Date);
    expect(result.version).toBe(1);
    expect(result.isTemplate).toBe(false);
  });

  it("should validate minimal frontmatter", () => {
    const minimalFrontmatter = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Minimal",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-01T00:00:00.000Z"
    };

    const decode = Schema.decodeUnknownSync(FrontmatterSchema);
    const result = decode(minimalFrontmatter);

    expect(result.id).toBe(minimalFrontmatter.id);
    expect(result.name).toBe(minimalFrontmatter.name);
    expect(result.tags).toBeUndefined();
    expect(result.version).toBeUndefined();
    expect(result.isTemplate).toBeUndefined();
  });

  it("should fail on empty name", () => {
    const invalidFrontmatter = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-01T00:00:00.000Z"
    };

    const decode = Schema.decodeUnknownSync(FrontmatterSchema);

    expect(() => decode(invalidFrontmatter)).toThrow();
  });

  it("should handle invalid date strings by creating Invalid Date", () => {
    const invalidFrontmatter = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test",
      created: "not-a-date",
      updated: "2025-01-01T00:00:00.000Z"
    };

    const decode = Schema.decodeUnknownSync(FrontmatterSchema);
    const result = decode(invalidFrontmatter);

    // DateFromString creates Invalid Date for invalid strings
    expect(Number.isNaN(result.created.getTime())).toBe(true);
  });

  it("should fail on non-integer version", () => {
    const invalidFrontmatter = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-01T00:00:00.000Z",
      version: 1.5
    };

    const decode = Schema.decodeUnknownSync(FrontmatterSchema);

    expect(() => decode(invalidFrontmatter)).toThrow();
  });
});

describe("PromptSchema", () => {
  it("should validate valid prompt", () => {
    const validPrompt = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test Prompt",
      tags: ["test"],
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-02T00:00:00.000Z",
      version: 1,
      isTemplate: false,
      content: "This is the prompt content",
      filePath: "/path/to/prompt.md"
    };

    const decode = Schema.decodeUnknownSync(PromptSchema);
    const result = decode(validPrompt);

    expect(result.id).toBe(validPrompt.id);
    expect(result.name).toBe(validPrompt.name);
    expect(result.content).toBe(validPrompt.content);
    expect(result.filePath).toBe(validPrompt.filePath);
  });

  it("should validate minimal prompt", () => {
    const minimalPrompt = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Minimal",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-01T00:00:00.000Z",
      content: "Content"
    };

    const decode = Schema.decodeUnknownSync(PromptSchema);
    const result = decode(minimalPrompt);

    expect(result.id).toBe(minimalPrompt.id);
    expect(result.name).toBe(minimalPrompt.name);
    expect(result.content).toBe(minimalPrompt.content);
    expect(result.filePath).toBeUndefined();
  });

  it("should fail on missing content", () => {
    const invalidPrompt = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-01T00:00:00.000Z"
    };

    const decode = Schema.decodeUnknownSync(PromptSchema);

    expect(() => decode(invalidPrompt)).toThrow();
  });
});

describe("Type exports", () => {
  it("should export Frontmatter type", () => {
    const frontmatter: Frontmatter = {
      id: "123",
      name: "Test",
      created: new Date(),
      updated: new Date()
    };

    expect(frontmatter).toBeDefined();
  });

  it("should export Prompt type", () => {
    const prompt: Prompt = {
      id: "123",
      name: "Test",
      created: new Date(),
      updated: new Date(),
      content: "Content"
    };

    expect(prompt).toBeDefined();
  });
});
