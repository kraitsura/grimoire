/**
 * Tests for Skill Injection Utilities
 */

import { describe, it, expect } from "bun:test";
import { Effect } from "effect";
import {
  hasManagedSection,
  addManagedSection,
  hasSkillInjection,
  addSkillInjection,
  removeSkillInjection,
  replaceSkillInjection,
  listInjectedSkills,
} from "./injection-utils";
import { InjectionError } from "../../models/skill-errors";

describe("injection-utils", () => {
  describe("hasManagedSection", () => {
    it("should return false for content without managed section", () => {
      const content = "# My Project\n\nSome content here.";
      expect(hasManagedSection(content)).toBe(false);
    });

    it("should return true for content with managed section", () => {
      const content = `# My Project

<!-- skills:managed:start -->
<!-- skills:managed:end -->
`;
      expect(hasManagedSection(content)).toBe(true);
    });

    it("should return true for managed section with skills", () => {
      const content = `# My Project

<!-- skills:managed:start -->
<!-- skill:beads:start -->
## Beads
<!-- skill:beads:end -->
<!-- skills:managed:end -->
`;
      expect(hasManagedSection(content)).toBe(true);
    });
  });

  describe("addManagedSection", () => {
    it("should add managed section to empty content", () => {
      const content = "";
      const result = addManagedSection(content);
      expect(result).toBe("<!-- skills:managed:start -->\n<!-- skills:managed:end -->\n");
    });

    it("should add managed section to content without one", () => {
      const content = "# My Project\n\nSome content.";
      const result = addManagedSection(content);
      expect(result).toContain("<!-- skills:managed:start -->");
      expect(result).toContain("<!-- skills:managed:end -->");
      expect(result).toStartWith("# My Project");
    });

    it("should not duplicate managed section if it already exists", () => {
      const content = `# My Project

<!-- skills:managed:start -->
<!-- skills:managed:end -->
`;
      const result = addManagedSection(content);
      expect(result).toBe(content);
    });

    it("should handle content with trailing whitespace", () => {
      const content = "# My Project\n\n   \n";
      const result = addManagedSection(content);
      expect(result).toContain("<!-- skills:managed:start -->");
      expect(result).not.toContain("   \n\n<!--");
    });
  });

  describe("hasSkillInjection", () => {
    it("should return false for content without skill injection", () => {
      const content = `<!-- skills:managed:start -->
<!-- skills:managed:end -->`;
      expect(hasSkillInjection(content, "beads")).toBe(false);
    });

    it("should return true for content with skill injection", () => {
      const content = `<!-- skills:managed:start -->
<!-- skill:beads:start -->
## Beads
<!-- skill:beads:end -->
<!-- skills:managed:end -->`;
      expect(hasSkillInjection(content, "beads")).toBe(true);
    });

    it("should handle skill names with special characters", () => {
      const content = `<!-- skills:managed:start -->
<!-- skill:my-skill-v2.0:start -->
## My Skill
<!-- skill:my-skill-v2.0:end -->
<!-- skills:managed:end -->`;
      expect(hasSkillInjection(content, "my-skill-v2.0")).toBe(true);
    });
  });

  describe("addSkillInjection", () => {
    it("should add skill injection to managed section", async () => {
      const content = `# My Project

<!-- skills:managed:start -->
<!-- skills:managed:end -->
`;
      const injectionContent = "## Beads\n\nUse beads for task tracking.";
      const result = await Effect.runPromise(addSkillInjection(content, "beads", injectionContent));

      expect(result).toContain("<!-- skill:beads:start -->");
      expect(result).toContain("<!-- skill:beads:end -->");
      expect(result).toContain("## Beads");
      expect(result).toContain("Use beads for task tracking.");
    });

    it("should create managed section if it doesn't exist", async () => {
      const content = "# My Project\n\nSome content.";
      const injectionContent = "## Beads";
      const result = await Effect.runPromise(addSkillInjection(content, "beads", injectionContent));

      expect(result).toContain("<!-- skills:managed:start -->");
      expect(result).toContain("<!-- skill:beads:start -->");
      expect(result).toContain("<!-- skill:beads:end -->");
      expect(result).toContain("<!-- skills:managed:end -->");
    });

    it("should fail if skill is already injected", async () => {
      const content = `<!-- skills:managed:start -->
<!-- skill:beads:start -->
## Beads
<!-- skill:beads:end -->
<!-- skills:managed:end -->`;

      const exit = await Effect.runPromiseExit(addSkillInjection(content, "beads", "New content"));
      expect(exit._tag).toBe("Failure");
    });

    it("should add multiple skills to managed section", async () => {
      let content = `<!-- skills:managed:start -->
<!-- skills:managed:end -->`;

      content = await Effect.runPromise(addSkillInjection(content, "beads", "## Beads"));
      content = await Effect.runPromise(addSkillInjection(content, "roo", "## Roo"));

      expect(content).toContain("<!-- skill:beads:start -->");
      expect(content).toContain("<!-- skill:roo:start -->");
    });

    it("should trim trailing whitespace from injection content", async () => {
      const content = `<!-- skills:managed:start -->
<!-- skills:managed:end -->`;
      const injectionContent = "## Beads\n\n   \n";
      const result = await Effect.runPromise(addSkillInjection(content, "beads", injectionContent));

      expect(result).toContain("## Beads\n<!-- skill:beads:end -->");
      expect(result).not.toContain("   \n<!-- skill:beads:end -->");
    });

    it("should fail if managed section is missing end marker", async () => {
      const content = "<!-- skills:managed:start -->\nSome content";
      const exit = await Effect.runPromiseExit(addSkillInjection(content, "beads", "## Beads"));

      expect(exit._tag).toBe("Failure");
    });
  });

  describe("removeSkillInjection", () => {
    it("should remove skill injection from managed section", () => {
      const content = `<!-- skills:managed:start -->
<!-- skill:beads:start -->
## Beads
<!-- skill:beads:end -->
<!-- skills:managed:end -->`;

      const result = removeSkillInjection(content, "beads");
      expect(result).not.toContain("<!-- skill:beads:start -->");
      expect(result).not.toContain("## Beads");
      expect(result).toContain("<!-- skills:managed:start -->");
      expect(result).toContain("<!-- skills:managed:end -->");
    });

    it("should not modify content if skill is not injected", () => {
      const content = `<!-- skills:managed:start -->
<!-- skill:beads:start -->
## Beads
<!-- skill:beads:end -->
<!-- skills:managed:end -->`;

      const result = removeSkillInjection(content, "roo");
      expect(result).toBe(content);
    });

    it("should handle removing one skill while keeping others", () => {
      const content = `<!-- skills:managed:start -->
<!-- skill:beads:start -->
## Beads
<!-- skill:beads:end -->

<!-- skill:roo:start -->
## Roo
<!-- skill:roo:end -->
<!-- skills:managed:end -->`;

      const result = removeSkillInjection(content, "beads");
      expect(result).not.toContain("<!-- skill:beads:start -->");
      expect(result).toContain("<!-- skill:roo:start -->");
    });
  });

  describe("replaceSkillInjection", () => {
    it("should replace existing skill injection", async () => {
      const content = `<!-- skills:managed:start -->
<!-- skill:beads:start -->
## Beads
Old content
<!-- skill:beads:end -->
<!-- skills:managed:end -->`;

      const newContent = "## Beads\nNew updated content";
      const result = await Effect.runPromise(replaceSkillInjection(content, "beads", newContent));

      expect(result).toContain("New updated content");
      expect(result).not.toContain("Old content");
      expect(result).toContain("<!-- skill:beads:start -->");
      expect(result).toContain("<!-- skill:beads:end -->");
    });

    it("should fail if skill is not injected", async () => {
      const content = `<!-- skills:managed:start -->
<!-- skills:managed:end -->`;

      const exit = await Effect.runPromiseExit(replaceSkillInjection(content, "beads", "New content"));
      expect(exit._tag).toBe("Failure");
    });

    it("should fail if skill has missing end marker", async () => {
      const content = `<!-- skills:managed:start -->
<!-- skill:beads:start -->
## Beads
Missing end marker`;

      const exit = await Effect.runPromiseExit(replaceSkillInjection(content, "beads", "New content"));
      expect(exit._tag).toBe("Failure");
    });

    it("should trim trailing whitespace from new content", async () => {
      const content = `<!-- skills:managed:start -->
<!-- skill:beads:start -->
Old content
<!-- skill:beads:end -->
<!-- skills:managed:end -->`;

      const newContent = "New content\n\n   \n";
      const result = await Effect.runPromise(replaceSkillInjection(content, "beads", newContent));

      expect(result).toContain("New content\n<!-- skill:beads:end -->");
      expect(result).not.toContain("   \n<!-- skill:beads:end -->");
    });
  });

  describe("listInjectedSkills", () => {
    it("should return empty array for content without skills", () => {
      const content = `<!-- skills:managed:start -->
<!-- skills:managed:end -->`;
      expect(listInjectedSkills(content)).toEqual([]);
    });

    it("should return array of injected skill names", () => {
      const content = `<!-- skills:managed:start -->
<!-- skill:beads:start -->
## Beads
<!-- skill:beads:end -->

<!-- skill:roo:start -->
## Roo
<!-- skill:roo:end -->
<!-- skills:managed:end -->`;

      const skills = listInjectedSkills(content);
      expect(skills).toEqual(["beads", "roo"]);
    });

    it("should handle skills outside managed section", () => {
      const content = `<!-- skill:beads:start -->
## Beads
<!-- skill:beads:end -->

<!-- skills:managed:start -->
<!-- skill:roo:start -->
## Roo
<!-- skill:roo:end -->
<!-- skills:managed:end -->`;

      const skills = listInjectedSkills(content);
      expect(skills).toEqual(["beads", "roo"]);
    });

    it("should remove duplicates and sort alphabetically", () => {
      const content = `<!-- skill:zebra:start -->
Content
<!-- skill:zebra:end -->

<!-- skill:alpha:start -->
Content
<!-- skill:alpha:end -->

<!-- skill:beta:start -->
Content
<!-- skill:beta:end -->`;

      const skills = listInjectedSkills(content);
      expect(skills).toEqual(["alpha", "beta", "zebra"]);
    });
  });

  describe("edge cases", () => {
    it("should handle skills with special regex characters in names", async () => {
      const content = `<!-- skills:managed:start -->
<!-- skills:managed:end -->`;

      const skillName = "my-skill.v2.0+beta";
      const result = await Effect.runPromise(
        addSkillInjection(content, skillName, "## Special Skill")
      );

      expect(result).toContain(`<!-- skill:${skillName}:start -->`);
      expect(hasSkillInjection(result, skillName)).toBe(true);

      const removed = removeSkillInjection(result, skillName);
      expect(hasSkillInjection(removed, skillName)).toBe(false);
    });

    it("should prevent duplicate skill injections", async () => {
      const content = `<!-- skills:managed:start -->
<!-- skill:beads:start -->
First
<!-- skill:beads:end -->
<!-- skill:beads:start -->
Second
<!-- skill:beads:end -->
<!-- skills:managed:end -->`;

      const exit = await Effect.runPromiseExit(replaceSkillInjection(content, "beads", "New"));
      expect(exit._tag).toBe("Failure");
    });

    it("should handle empty injection content", async () => {
      const content = `<!-- skills:managed:start -->
<!-- skills:managed:end -->`;

      const result = await Effect.runPromise(addSkillInjection(content, "beads", ""));
      expect(result).toContain("<!-- skill:beads:start -->");
      expect(result).toContain("<!-- skill:beads:end -->");
    });

    it("should handle multiline injection content", async () => {
      const content = `<!-- skills:managed:start -->
<!-- skills:managed:end -->`;

      const injectionContent = `## Beads

This is a multi-line
injection with several
lines of content.

- Item 1
- Item 2`;

      const result = await Effect.runPromise(addSkillInjection(content, "beads", injectionContent));
      expect(result).toContain("This is a multi-line");
      expect(result).toContain("- Item 1");
    });
  });
});
