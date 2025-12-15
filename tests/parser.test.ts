/**
 * Tests for CLI argument parser
 */

import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli/parser";

describe("parseArgs", () => {
  test("handles empty args", () => {
    const result = parseArgs([]);
    expect(result).toEqual({
      command: null,
      flags: {},
      positional: [],
    });
  });

  test("parses simple command", () => {
    const result = parseArgs(["list"]);
    expect(result).toEqual({
      command: "list",
      flags: {},
      positional: [],
    });
  });

  test("parses command with positional args", () => {
    const result = parseArgs(["edit", "prompt-id"]);
    expect(result).toEqual({
      command: "edit",
      flags: {},
      positional: ["prompt-id"],
    });
  });

  test("parses short flag", () => {
    const result = parseArgs(["-i"]);
    expect(result).toEqual({
      command: null,
      flags: { i: true, interactive: true },
      positional: [],
    });
  });

  test("parses long flag", () => {
    const result = parseArgs(["--interactive"]);
    expect(result).toEqual({
      command: null,
      flags: { interactive: true },
      positional: [],
    });
  });

  test("parses long flag with equals value", () => {
    const result = parseArgs(["--name=test-prompt"]);
    expect(result).toEqual({
      command: null,
      flags: { name: "test-prompt" },
      positional: [],
    });
  });

  test("parses long flag with space value", () => {
    const result = parseArgs(["--name", "test-prompt"]);
    expect(result).toEqual({
      command: null,
      flags: { name: "test-prompt" },
      positional: [],
    });
  });

  test("parses multiple short flags", () => {
    const result = parseArgs(["-hv"]);
    expect(result).toEqual({
      command: null,
      flags: { h: true, help: true, v: true, version: true },
      positional: [],
    });
  });

  test("parses command with flags and positional args", () => {
    const result = parseArgs(["add", "my-prompt", "--name=test", "--tag", "work"]);
    expect(result).toEqual({
      command: "add",
      flags: { name: "test", tag: "work" },
      positional: ["my-prompt"],
    });
  });

  test("parses complex mix", () => {
    const result = parseArgs(["-i", "list", "--filter=recent", "arg1", "arg2"]);
    expect(result).toEqual({
      command: "list",
      flags: { i: true, interactive: true, filter: "recent" },
      positional: ["arg1", "arg2"],
    });
  });
});
