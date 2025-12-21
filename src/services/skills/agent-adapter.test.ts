/**
 * Agent Adapter Tests
 */

import { describe, test, expect } from "bun:test";
import { Effect } from "effect";
import {
  AgentAdapterService,
  AgentAdapterServiceLive,
  getAgentAdapter,
  detectAgent,
  hasYamlFrontmatter,
  generateSkillFrontmatter,
  ensureSkillFrontmatter,
} from "./agent-adapter";

describe("AgentAdapter", () => {
  describe("getAgentAdapter", () => {
    test("should return Claude Code adapter", () => {
      const adapter = getAgentAdapter("claude_code");
      expect(adapter.name).toBe("claude_code");
    });

    test("should return OpenCode adapter", () => {
      const adapter = getAgentAdapter("opencode");
      expect(adapter.name).toBe("opencode");
    });

    test("should return Generic adapter", () => {
      const adapter = getAgentAdapter("generic");
      expect(adapter.name).toBe("generic");
    });
  });

  describe("AgentAdapter interface", () => {
    test("Claude Code adapter should have correct paths", () => {
      const adapter = getAgentAdapter("claude_code");
      const projectPath = "/test/project";

      expect(adapter.getSkillsDir(projectPath)).toContain(".claude/skills");
      expect(adapter.getAgentMdPath(projectPath)).toContain("CLAUDE.md");
    });

    test("OpenCode adapter should have correct paths", () => {
      const adapter = getAgentAdapter("opencode");
      const projectPath = "/test/project";

      expect(adapter.getSkillsDir(projectPath)).toContain(".opencode/skills");
      expect(adapter.getAgentMdPath(projectPath)).toContain("AGENTS.md");
    });

    test("Generic adapter should have correct paths", () => {
      const adapter = getAgentAdapter("generic");
      const projectPath = "/test/project";

      expect(adapter.getSkillsDir(projectPath)).toContain(".skills");
      expect(adapter.getAgentMdPath(projectPath)).toContain("AGENTS.md");
    });

    test("Claude Code adapter should have installPlugin method", () => {
      const adapter = getAgentAdapter("claude_code");
      expect(adapter.installPlugin).toBeDefined();
    });

    test("OpenCode adapter should not have installPlugin method", () => {
      const adapter = getAgentAdapter("opencode");
      expect(adapter.installPlugin).toBeUndefined();
    });

    test("Generic adapter should not have installPlugin method", () => {
      const adapter = getAgentAdapter("generic");
      expect(adapter.installPlugin).toBeUndefined();
    });

    test("all adapters should have configureMcp method", () => {
      const claudeAdapter = getAgentAdapter("claude_code");
      const openAdapter = getAgentAdapter("opencode");
      const genericAdapter = getAgentAdapter("generic");

      expect(claudeAdapter.configureMcp).toBeDefined();
      expect(openAdapter.configureMcp).toBeDefined();
      expect(genericAdapter.configureMcp).toBeUndefined();
    });
  });

  describe("detectAgent", () => {
    test("should return null when no agent detected", async () => {
      const result = await Effect.runPromise(detectAgent("/nonexistent/path"));
      expect(result).toBeNull();
    });
  });

  describe("AgentAdapterService", () => {
    test("should provide getAdapter method", async () => {
      const program = Effect.gen(function* () {
        const service = yield* AgentAdapterService;
        const adapter = service.getAdapter("claude_code");
        return adapter;
      });

      const adapter = await Effect.runPromise(
        program.pipe(Effect.provide(AgentAdapterServiceLive))
      );

      expect(adapter.name).toBe("claude_code");
    });

    test("should provide detectAgent method", async () => {
      const program = Effect.gen(function* () {
        const service = yield* AgentAdapterService;
        const detected = yield* service.detectAgent("/test/path");
        return detected;
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(AgentAdapterServiceLive))
      );

      expect(result).toBeNull();
    });
  });

  describe("real implementations", () => {
    test("enableSkill should return result", async () => {
      const adapter = getAgentAdapter("claude_code");
      const result = await Effect.runPromise(
        adapter.enableSkill("/test/path", {
          manifest: {
            name: "test-skill",
            description: "Test skill",
          },
          cachedAt: new Date(),
          source: "test",
        })
      );

      expect(result).toHaveProperty("injected");
      expect(result).toHaveProperty("skillFileCopied");
    });

    test("disableSkill should succeed for non-existent skill", async () => {
      const adapter = getAgentAdapter("claude_code");
      await Effect.runPromise(adapter.disableSkill("/test/path", "test-skill"));
      // Should not throw when skill doesn't exist
    });

    test("detect should return false for non-existent directory", async () => {
      const adapter = getAgentAdapter("claude_code");
      const result = await Effect.runPromise(adapter.detect("/test/path"));
      expect(result).toBe(false);
    });

    test("init should fail for non-existent path", async () => {
      const adapter = getAgentAdapter("claude_code");
      // Should fail because /test/path doesn't exist
      await expect(Effect.runPromise(adapter.init("/test/path"))).rejects.toThrow();
    });
  });

  describe("YAML Frontmatter Utilities", () => {
    describe("hasYamlFrontmatter", () => {
      test("should detect frontmatter at start of content", () => {
        const content = `---
name: test
---
# Content`;
        expect(hasYamlFrontmatter(content)).toBe(true);
      });

      test("should detect frontmatter with leading whitespace", () => {
        const content = `  ---
name: test
---
# Content`;
        expect(hasYamlFrontmatter(content)).toBe(true);
      });

      test("should return false for content without frontmatter", () => {
        const content = `# Skill
Some content here`;
        expect(hasYamlFrontmatter(content)).toBe(false);
      });

      test("should return false for content with --- later in document", () => {
        const content = `# Skill

---

Some separator`;
        expect(hasYamlFrontmatter(content)).toBe(false);
      });
    });

    describe("generateSkillFrontmatter", () => {
      test("should generate frontmatter with name and description", () => {
        const manifest = {
          name: "test-skill",
          description: "A test skill for testing",
        };

        const frontmatter = generateSkillFrontmatter(manifest);

        expect(frontmatter).toContain("---");
        expect(frontmatter).toContain("name: test-skill");
        expect(frontmatter).toContain("description: A test skill for testing");
      });

      test("should use description in frontmatter", () => {
        const manifest = {
          name: "test-skill",
          description: "Use when testing skills",
        };

        const frontmatter = generateSkillFrontmatter(manifest);

        expect(frontmatter).toContain("description: Use when testing skills");
      });

      test("should include allowed-tools when specified", () => {
        const manifest = {
          name: "test-skill",
          description: "Test",
          allowed_tools: ["Read", "Write", "Bash"],
        };

        const frontmatter = generateSkillFrontmatter(manifest);

        expect(frontmatter).toContain("allowed-tools: Read, Write, Bash");
      });

      test("should handle multi-line descriptions", () => {
        const manifest = {
          name: "test-skill",
          description: "Line 1\nLine 2\nLine 3",
        };

        const frontmatter = generateSkillFrontmatter(manifest);

        expect(frontmatter).toContain("description: |");
        expect(frontmatter).toContain("  Line 1");
        expect(frontmatter).toContain("  Line 2");
      });
    });

    describe("ensureSkillFrontmatter", () => {
      test("should prepend frontmatter to content without it", () => {
        const content = `# My Skill

Instructions here.`;
        const manifest = {
          name: "my-skill",
          description: "A great skill",
        };

        const result = ensureSkillFrontmatter(content, manifest);

        expect(result).toMatch(/^---\n/);
        expect(result).toContain("name: my-skill");
        expect(result).toContain("# My Skill");
      });

      test("should not double-add frontmatter", () => {
        const content = `---
name: existing
---
# My Skill`;
        const manifest = {
          name: "my-skill",
          description: "A great skill",
        };

        const result = ensureSkillFrontmatter(content, manifest);

        // Should return original content unchanged
        expect(result).toBe(content);
        expect(result).toContain("name: existing");
        expect(result).not.toContain("name: my-skill");
      });
    });
  });
});
