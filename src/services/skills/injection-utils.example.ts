/**
 * Example usage of injection utilities
 *
 * This demonstrates how to use the skill injection utilities
 * to manage skill sections in agent MD files.
 */

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

/**
 * Example 1: Creating a managed section and adding skills
 */
export const example1CreateAndAddSkills = Effect.gen(function* () {
  // Start with basic agent MD content
  let content = `# My Agent

This is my agent's custom instructions.

## Configuration

Some configuration here.
`;

  // Check if managed section exists
  console.log("Has managed section:", hasManagedSection(content)); // false

  // Add managed section
  content = addManagedSection(content);
  console.log("Has managed section:", hasManagedSection(content)); // true

  // Add beads skill
  const beadsContent = `## Issue Tracking (Beads)

Use \`bd\` for task management:
- \`bd ready\` - Find available work
- \`bd create\` - File new issues
- \`bd close <id>\` - Mark complete`;

  content = yield* addSkillInjection(content, "beads", beadsContent);

  // Add roo skill
  const rooContent = `## Code Analysis (Roo)

Use \`roo\` for codebase analysis:
- \`roo analyze\` - Analyze code patterns
- \`roo search\` - Search codebase`;

  content = yield* addSkillInjection(content, "roo", rooContent);

  // List injected skills
  const skills = listInjectedSkills(content);
  console.log("Injected skills:", skills); // ["beads", "roo"]

  return content;
});

/**
 * Example 2: Updating an existing skill injection
 */
export const example2UpdateSkill = Effect.gen(function* () {
  let content = `# My Agent

<!-- skills:managed:start -->
<!-- skill:beads:start -->
## Issue Tracking (Beads)

Old content here.
<!-- skill:beads:end -->
<!-- skills:managed:end -->
`;

  // Check if skill is injected
  console.log("Has beads skill:", hasSkillInjection(content, "beads")); // true

  // Update the skill content
  const newBeadsContent = `## Issue Tracking (Beads)

Updated content with new commands:
- \`bd sync\` - Sync with remote
- \`bv --robot-insights\` - Get graph analysis`;

  content = yield* replaceSkillInjection(content, "beads", newBeadsContent);

  return content;
});

/**
 * Example 3: Removing a skill injection
 */
export const example3RemoveSkill = Effect.gen(function* () {
  let content = `# My Agent

<!-- skills:managed:start -->
<!-- skill:beads:start -->
## Issue Tracking (Beads)
Content here.
<!-- skill:beads:end -->

<!-- skill:roo:start -->
## Code Analysis (Roo)
Content here.
<!-- skill:roo:end -->
<!-- skills:managed:end -->
`;

  console.log("Injected skills before:", listInjectedSkills(content)); // ["beads", "roo"]

  // Remove beads skill
  content = removeSkillInjection(content, "beads");

  console.log("Injected skills after:", listInjectedSkills(content)); // ["roo"]

  return content;
});

/**
 * Example 4: Error handling - trying to add duplicate skill
 */
export const example4ErrorHandling = Effect.gen(function* () {
  const content = `<!-- skills:managed:start -->
<!-- skill:beads:start -->
## Beads
<!-- skill:beads:end -->
<!-- skills:managed:end -->`;

  // This will fail because beads is already injected
  const result = yield* addSkillInjection(content, "beads", "New content").pipe(
    Effect.catchAll((error) =>
      Effect.succeed(`Error: ${error._tag} - ${error.message}`)
    )
  );

  console.log(result); // "Error: InjectionError - Skill "beads" is already injected..."

  return result;
});

/**
 * Example 5: Complete workflow for managing agent skills
 */
export const example5CompleteWorkflow = Effect.gen(function* () {
  // 1. Read agent MD file (simulated)
  let agentContent = `# Claude Agent

Custom instructions for my project.
`;

  // 2. Ensure managed section exists
  if (!hasManagedSection(agentContent)) {
    agentContent = addManagedSection(agentContent);
  }

  // 3. Add or update skills based on enabled skills list
  const enabledSkills = [
    { name: "beads", content: "## Beads\nTask tracking..." },
    { name: "roo", content: "## Roo\nCode analysis..." },
  ];

  for (const skill of enabledSkills) {
    if (hasSkillInjection(agentContent, skill.name)) {
      // Update existing skill
      agentContent = yield* replaceSkillInjection(
        agentContent,
        skill.name,
        skill.content
      );
    } else {
      // Add new skill
      agentContent = yield* addSkillInjection(
        agentContent,
        skill.name,
        skill.content
      );
    }
  }

  // 4. Remove skills that are no longer enabled
  const currentSkills = listInjectedSkills(agentContent);
  const enabledSkillNames = enabledSkills.map((s) => s.name);

  for (const skillName of currentSkills) {
    if (!enabledSkillNames.includes(skillName)) {
      agentContent = removeSkillInjection(agentContent, skillName);
    }
  }

  // 5. Write back to file (simulated)
  console.log("Updated agent content:");
  console.log(agentContent);

  return agentContent;
});

/**
 * Run examples (for demonstration purposes)
 */
if (import.meta.main) {
  // Example 1
  Effect.runPromise(example1CreateAndAddSkills).then((content) => {
    console.log("\n=== Example 1 Result ===");
    console.log(content);
  });

  // Example 2
  Effect.runPromise(example2UpdateSkill).then((content) => {
    console.log("\n=== Example 2 Result ===");
    console.log(content);
  });

  // Example 3
  Effect.runPromise(example3RemoveSkill).then((content) => {
    console.log("\n=== Example 3 Result ===");
    console.log(content);
  });

  // Example 4
  Effect.runPromise(example4ErrorHandling).then((result) => {
    console.log("\n=== Example 4 Result ===");
    console.log(result);
  });

  // Example 5
  Effect.runPromise(example5CompleteWorkflow).then((content) => {
    console.log("\n=== Example 5 Result ===");
    console.log(content);
  });
}
