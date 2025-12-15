/**
 * Skill Injection Utilities
 *
 * Utilities for managing skill injections in agent MD files.
 * Handles managed sections with markers for tracking and updating skill content.
 */

import { Effect } from "effect";
import { InjectionError } from "../../models/skill-errors";

/**
 * Marker constants for managed sections and skill injections
 */
const MANAGED_START = "<!-- skills:managed:start -->";
const MANAGED_END = "<!-- skills:managed:end -->";
const SKILL_START = (skillName: string) => `<!-- skill:${skillName}:start -->`;
const SKILL_END = (skillName: string) => `<!-- skill:${skillName}:end -->`;

/**
 * Regular expressions for marker detection
 */
const MANAGED_SECTION_REGEX = /<!-- skills:managed:start -->([\s\S]*?)<!-- skills:managed:end -->/;
const SKILL_INJECTION_REGEX = (skillName: string) =>
  new RegExp(
    `<!-- skill:${escapeRegex(skillName)}:start -->[\\s\\S]*?<!-- skill:${escapeRegex(skillName)}:end -->`,
    "g"
  );
const ALL_SKILLS_REGEX = /<!-- skill:([^:]+):start -->/g;

/**
 * Escape special regex characters in skill names
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if a managed section exists in the content
 *
 * @param content - The markdown content to check
 * @returns true if a managed section exists, false otherwise
 */
export const hasManagedSection = (content: string): boolean => {
  return MANAGED_SECTION_REGEX.test(content);
};

/**
 * Add a managed section to the content
 *
 * The managed section is added at the end of the file if it doesn't exist.
 * If the content is empty or ends with newlines, the section is appended cleanly.
 *
 * @param content - The markdown content
 * @returns The content with a managed section added
 */
export const addManagedSection = (content: string): string => {
  // Check if managed section already exists
  if (hasManagedSection(content)) {
    return content;
  }

  // Ensure content ends with exactly one newline before adding section
  const trimmed = content.trimEnd();
  const prefix = trimmed.length > 0 ? "\n\n" : "";

  return `${trimmed}${prefix}${MANAGED_START}\n${MANAGED_END}\n`;
};

/**
 * Check if a specific skill is injected in the content
 *
 * @param content - The markdown content to check
 * @param skillName - The name of the skill
 * @returns true if the skill is injected, false otherwise
 */
export const hasSkillInjection = (content: string, skillName: string): boolean => {
  const regex = SKILL_INJECTION_REGEX(skillName);
  return regex.test(content);
};

/**
 * Extract the managed section content from the file
 *
 * @param content - The markdown content
 * @returns The managed section content or null if not found
 */
function extractManagedSection(content: string): { section: string; match: RegExpMatchArray } | null {
  const match = content.match(MANAGED_SECTION_REGEX);
  if (!match) {
    return null;
  }
  return { section: match[1], match };
}

/**
 * Validate that the managed section has proper end marker
 *
 * @param content - The markdown content
 * @returns Effect that succeeds if valid, fails with InjectionError if invalid
 */
function validateManagedSection(content: string, file: string): Effect.Effect<void, InjectionError> {
  const startIndex = content.indexOf(MANAGED_START);
  if (startIndex === -1) {
    return Effect.void; // No managed section, validation passes
  }

  const endIndex = content.indexOf(MANAGED_END, startIndex);
  if (endIndex === -1) {
    return Effect.fail(
      new InjectionError({
        file,
        message: "Managed section is missing end marker (<!-- skills:managed:end -->)",
      })
    );
  }

  return Effect.void;
}

/**
 * Validate that a skill injection has proper end marker
 *
 * @param content - The markdown content
 * @param skillName - The name of the skill
 * @param file - The file path for error reporting
 * @returns Effect that succeeds if valid, fails with InjectionError if invalid
 */
function validateSkillMarkers(
  content: string,
  skillName: string,
  file: string
): Effect.Effect<void, InjectionError> {
  const startMarker = SKILL_START(skillName);
  const endMarker = SKILL_END(skillName);

  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) {
    return Effect.void; // No skill injection, validation passes
  }

  const endIndex = content.indexOf(endMarker, startIndex);
  if (endIndex === -1) {
    return Effect.fail(
      new InjectionError({
        file,
        message: `Skill "${skillName}" is missing end marker (${endMarker})`,
      })
    );
  }

  // Check for duplicate skill injections
  const lastStartIndex = content.lastIndexOf(startMarker);
  if (lastStartIndex !== startIndex) {
    return Effect.fail(
      new InjectionError({
        file,
        message: `Multiple injections of skill "${skillName}" found. Only one injection per skill is allowed.`,
      })
    );
  }

  return Effect.void;
}

/**
 * Add a skill injection to the managed section
 *
 * If the managed section doesn't exist, it will be created first.
 * If the skill is already injected, an error is returned.
 *
 * @param content - The markdown content
 * @param skillName - The name of the skill
 * @param injectionContent - The content to inject
 * @returns Effect that succeeds with the updated content or fails with InjectionError
 */
export const addSkillInjection = (
  content: string,
  skillName: string,
  injectionContent: string
): Effect.Effect<string, InjectionError> => {
  return Effect.gen(function* () {
    const file = "agent-md-file"; // Generic file name for error reporting

    // Validate existing markers
    yield* validateManagedSection(content, file);

    // Check if skill is already injected
    if (hasSkillInjection(content, skillName)) {
      return yield* Effect.fail(
        new InjectionError({
          file,
          message: `Skill "${skillName}" is already injected. Use replaceSkillInjection to update it.`,
        })
      );
    }

    // Ensure managed section exists
    let updatedContent = content;
    if (!hasManagedSection(content)) {
      updatedContent = addManagedSection(content);
    }

    // Extract managed section
    const extracted = extractManagedSection(updatedContent);
    if (!extracted) {
      return yield* Effect.fail(
        new InjectionError({
          file,
          message: "Failed to extract managed section after creation",
        })
      );
    }

    // Create skill injection block
    const skillBlock = `${SKILL_START(skillName)}\n${injectionContent.trimEnd()}\n${SKILL_END(skillName)}`;

    // Insert skill block at the end of the managed section (before the end marker)
    const { section } = extracted;
    const newSection = section.trimEnd() + (section.trim().length > 0 ? "\n\n" : "") + skillBlock + "\n";

    // Replace the managed section with the updated one
    const result = updatedContent.replace(
      MANAGED_SECTION_REGEX,
      `${MANAGED_START}${newSection}${MANAGED_END}`
    );

    return result;
  });
};

/**
 * Remove a skill injection from the managed section
 *
 * If the skill is not injected, the content is returned unchanged.
 *
 * @param content - The markdown content
 * @param skillName - The name of the skill to remove
 * @returns The content with the skill injection removed
 */
export const removeSkillInjection = (content: string, skillName: string): string => {
  if (!hasSkillInjection(content, skillName)) {
    return content;
  }

  // Remove the skill block (including surrounding whitespace)
  const regex = new RegExp(
    `\\n?${escapeRegex(SKILL_START(skillName))}[\\s\\S]*?${escapeRegex(SKILL_END(skillName))}\\n?`,
    "g"
  );

  return content.replace(regex, "");
};

/**
 * Replace an existing skill injection with new content
 *
 * If the skill is not already injected, an error is returned.
 *
 * @param content - The markdown content
 * @param skillName - The name of the skill
 * @param newContent - The new content to inject
 * @returns Effect that succeeds with the updated content or fails with InjectionError
 */
export const replaceSkillInjection = (
  content: string,
  skillName: string,
  newContent: string
): Effect.Effect<string, InjectionError> => {
  return Effect.gen(function* () {
    const file = "agent-md-file"; // Generic file name for error reporting

    // Validate existing markers
    yield* validateSkillMarkers(content, skillName, file);

    // Check if skill is injected
    if (!hasSkillInjection(content, skillName)) {
      return yield* Effect.fail(
        new InjectionError({
          file,
          message: `Skill "${skillName}" is not injected. Use addSkillInjection to add it first.`,
        })
      );
    }

    // Create new skill block
    const newSkillBlock = `${SKILL_START(skillName)}\n${newContent.trimEnd()}\n${SKILL_END(skillName)}`;

    // Replace the existing skill block
    const regex = new RegExp(
      `${escapeRegex(SKILL_START(skillName))}[\\s\\S]*?${escapeRegex(SKILL_END(skillName))}`,
      "g"
    );

    return content.replace(regex, newSkillBlock);
  });
};

/**
 * List all injected skills in the content
 *
 * @param content - The markdown content
 * @returns Array of skill names that are injected
 */
export const listInjectedSkills = (content: string): string[] => {
  const skills: string[] = [];
  const matches = content.matchAll(ALL_SKILLS_REGEX);

  for (const match of matches) {
    if (match[1]) {
      skills.push(match[1]);
    }
  }

  // Remove duplicates and sort
  return Array.from(new Set(skills)).sort();
};
