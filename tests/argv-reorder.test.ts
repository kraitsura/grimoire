import { describe, it, expect } from "bun:test";
import { reorderArgv } from "../src/cli/effect/argv-reorder";

describe("reorderArgv", () => {
  // Helper: simulate process.argv with node and script prefix
  const argv = (...args: string[]) => ["node", "grim", ...args];

  describe("basic reordering", () => {
    it("moves boolean flag before positional", () => {
      const result = reorderArgv(argv("wt", "rm", "my-worktree", "--branch"));
      expect(result.slice(2)).toEqual(["wt", "rm", "--branch", "my-worktree"]);
    });

    it("keeps options already in correct position", () => {
      const result = reorderArgv(argv("wt", "rm", "--branch", "my-worktree"));
      expect(result.slice(2)).toEqual(["wt", "rm", "--branch", "my-worktree"]);
    });

    it("handles multiple flags", () => {
      const result = reorderArgv(argv("wt", "rm", "my-worktree", "--branch", "--force"));
      expect(result.slice(2)).toEqual(["wt", "rm", "--branch", "--force", "my-worktree"]);
    });
  });

  describe("value options", () => {
    it("keeps value with its option", () => {
      const result = reorderArgv(argv("wt", "spawn", "my-wt", "-p", "do something"));
      expect(result.slice(2)).toEqual(["wt", "spawn", "-p", "do something", "my-wt"]);
    });

    it("handles --option=value format", () => {
      const result = reorderArgv(argv("wt", "spawn", "my-wt", "--prompt=do something"));
      expect(result.slice(2)).toEqual(["wt", "spawn", "--prompt=do something", "my-wt"]);
    });

    it("handles long option with value", () => {
      const result = reorderArgv(argv("wt", "spawn", "my-wt", "--prompt", "do something"));
      expect(result.slice(2)).toEqual(["wt", "spawn", "--prompt", "do something", "my-wt"]);
    });

    it("handles mixed boolean and value options", () => {
      const result = reorderArgv(argv("wt", "spawn", "my-wt", "-p", "prompt text", "--background"));
      expect(result.slice(2)).toEqual(["wt", "spawn", "-p", "prompt text", "--background", "my-wt"]);
    });
  });

  describe("quoted strings with flag-like content", () => {
    // Shell handles quotes - by the time we see argv, quoted strings are single elements
    it("preserves flag-like content in quoted prompt", () => {
      // Shell would parse: -p "Fix the --background issue"
      // As: ["-p", "Fix the --background issue"]
      const result = reorderArgv(argv("wt", "spawn", "my-wt", "-p", "Fix the --background issue"));
      expect(result.slice(2)).toEqual(["wt", "spawn", "-p", "Fix the --background issue", "my-wt"]);
    });
  });

  describe("end-of-options marker", () => {
    it("respects -- as end of options", () => {
      const result = reorderArgv(argv("wt", "exec", "my-wt", "--", "git", "--version"));
      expect(result.slice(2)).toEqual(["wt", "exec", "my-wt", "--", "git", "--version"]);
    });

    it("does not reorder after --", () => {
      const result = reorderArgv(argv("wt", "exec", "--", "--flag", "arg"));
      expect(result.slice(2)).toEqual(["wt", "exec", "--", "--flag", "arg"]);
    });
  });

  describe("subcommands", () => {
    it("handles deeply nested subcommands", () => {
      const result = reorderArgv(argv("st", "skills", "enable", "beads", "-y"));
      expect(result.slice(2)).toEqual(["st", "skills", "enable", "-y", "beads"]);
    });

    it("handles pl list with options", () => {
      const result = reorderArgv(argv("pl", "list", "--tags", "coding", "--sort", "name"));
      expect(result.slice(2)).toEqual(["pl", "list", "--tags", "coding", "--sort", "name"]);
    });
  });

  describe("edge cases", () => {
    it("handles empty args", () => {
      const result = reorderArgv(argv());
      expect(result.slice(2)).toEqual([]);
    });

    it("handles only subcommands, no options", () => {
      const result = reorderArgv(argv("wt", "ps"));
      expect(result.slice(2)).toEqual(["wt", "ps"]);
    });

    it("handles short options that are not in registry", () => {
      // -x is not in VALUE_OPTIONS, so treat as boolean
      // Using known subcommand "wt" + "rm"
      const result = reorderArgv(argv("wt", "rm", "arg", "-x"));
      expect(result.slice(2)).toEqual(["wt", "rm", "-x", "arg"]);
    });

    it("preserves node and script path", () => {
      const result = reorderArgv(["custom-node", "/path/to/script.js", "cmd", "--flag"]);
      expect(result[0]).toBe("custom-node");
      expect(result[1]).toBe("/path/to/script.js");
    });

    it("handles single dash as positional", () => {
      // Single dash often means stdin
      // Using known subcommand "pl" + "import"
      const result = reorderArgv(argv("pl", "import", "-", "--merge"));
      expect(result.slice(2)).toEqual(["pl", "import", "--merge", "-"]);
    });
  });

  describe("real-world scenarios", () => {
    it("grim wt spawn with all options after name", () => {
      const result = reorderArgv(argv("wt", "spawn", "fix-auth", "-p", "Fix auth bug", "--background", "-i", "beads-123"));
      expect(result.slice(2)).toEqual([
        "wt", "spawn",
        "-p", "Fix auth bug",
        "--background",
        "-i", "beads-123",
        "fix-auth"
      ]);
    });

    it("grim pl export with options after names", () => {
      const result = reorderArgv(argv("pl", "export", "prompt1", "prompt2", "-o", "out.json", "--format", "json"));
      expect(result.slice(2)).toEqual([
        "pl", "export",
        "-o", "out.json",
        "--format", "json",
        "prompt1", "prompt2"
      ]);
    });

    it("grim config llm add with provider after command", () => {
      const result = reorderArgv(argv("config", "llm", "add", "openai"));
      expect(result.slice(2)).toEqual(["config", "llm", "add", "openai"]);
    });
  });
});
