/**
 * Skill Validation Service
 *
 * Validates skills against the agentskills.io standard specification.
 * https://agentskills.io/specification
 *
 * Validation Rules:
 * - Name: 1-64 chars, lowercase alphanumeric + hyphens, no leading/trailing/consecutive hyphens
 * - Description: 1-1024 chars
 * - Compatibility: 1-500 chars (optional)
 * - allowed-tools: Supports both space-delimited string and array formats
 * - Size warnings: SKILL.md should be < 500 lines, < ~5000 tokens
 */

import { Context, Effect, Layer } from "effect";
import { join } from "path";
import type { SkillManifest, InferredManifest } from "../../models/skill";
import type { ValidationIssue, ValidationResult } from "../../models/skill-errors";

/**
 * Name validation regex pattern
 * - Lowercase alphanumeric and hyphens only
 * - Cannot start or end with hyphen
 * - No consecutive hyphens
 */
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 64;

/**
 * Description length limits
 */
const DESCRIPTION_MIN_LENGTH = 1;
const DESCRIPTION_MAX_LENGTH = 1024;

/**
 * Compatibility length limits
 */
const COMPATIBILITY_MIN_LENGTH = 1;
const COMPATIBILITY_MAX_LENGTH = 500;

/**
 * SKILL.md size thresholds
 */
const SKILL_MD_LINE_WARNING = 500;
const SKILL_MD_TOKEN_WARNING = 5000;

/**
 * Approximate token count (rough estimate: ~4 chars per token)
 */
const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

/**
 * Count lines in text
 */
const countLines = (text: string): number => {
  return text.split("\n").length;
};

/**
 * Validate skill name against agentskills.io standard
 */
export const validateName = (name: string | undefined): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (!name) {
    issues.push({
      field: "name",
      message: "Name is required",
      severity: "error",
    });
    return issues;
  }

  if (name.length < NAME_MIN_LENGTH) {
    issues.push({
      field: "name",
      message: `Name must be at least ${NAME_MIN_LENGTH} character`,
      severity: "error",
      value: name,
    });
  }

  if (name.length > NAME_MAX_LENGTH) {
    issues.push({
      field: "name",
      message: `Name must be at most ${NAME_MAX_LENGTH} characters (got ${name.length})`,
      severity: "error",
      value: name,
    });
  }

  if (name !== name.toLowerCase()) {
    issues.push({
      field: "name",
      message: "Name must be lowercase",
      severity: "error",
      value: name,
    });
  }

  if (name.startsWith("-")) {
    issues.push({
      field: "name",
      message: "Name cannot start with a hyphen",
      severity: "error",
      value: name,
    });
  }

  if (name.endsWith("-")) {
    issues.push({
      field: "name",
      message: "Name cannot end with a hyphen",
      severity: "error",
      value: name,
    });
  }

  if (name.includes("--")) {
    issues.push({
      field: "name",
      message: "Name cannot contain consecutive hyphens",
      severity: "error",
      value: name,
    });
  }

  if (!NAME_PATTERN.test(name) && issues.length === 0) {
    issues.push({
      field: "name",
      message: "Name must contain only lowercase alphanumeric characters and hyphens",
      severity: "error",
      value: name,
    });
  }

  return issues;
};

/**
 * Validate that skill name matches parent directory
 */
export const validateNameMatchesDirectory = (
  name: string,
  directoryName: string
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (name !== directoryName) {
    issues.push({
      field: "name",
      message: `Name "${name}" does not match parent directory "${directoryName}"`,
      severity: "warning",
      value: { name, directoryName },
    });
  }

  return issues;
};

/**
 * Validate description against agentskills.io standard
 */
export const validateDescription = (description: string | undefined): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (!description) {
    issues.push({
      field: "description",
      message: "Description is required",
      severity: "error",
    });
    return issues;
  }

  if (description.length < DESCRIPTION_MIN_LENGTH) {
    issues.push({
      field: "description",
      message: `Description must be at least ${DESCRIPTION_MIN_LENGTH} character`,
      severity: "error",
      value: description,
    });
  }

  if (description.length > DESCRIPTION_MAX_LENGTH) {
    issues.push({
      field: "description",
      message: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters (got ${description.length})`,
      severity: "error",
      value: description.slice(0, 100) + "...",
    });
  }

  return issues;
};

/**
 * Validate compatibility field against agentskills.io standard
 */
export const validateCompatibility = (compatibility: string | undefined): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (!compatibility) {
    // Compatibility is optional
    return issues;
  }

  if (compatibility.length < COMPATIBILITY_MIN_LENGTH) {
    issues.push({
      field: "compatibility",
      message: `Compatibility must be at least ${COMPATIBILITY_MIN_LENGTH} character if provided`,
      severity: "error",
      value: compatibility,
    });
  }

  if (compatibility.length > COMPATIBILITY_MAX_LENGTH) {
    issues.push({
      field: "compatibility",
      message: `Compatibility must be at most ${COMPATIBILITY_MAX_LENGTH} characters (got ${compatibility.length})`,
      severity: "error",
      value: compatibility.slice(0, 100) + "...",
    });
  }

  return issues;
};

/**
 * Parse allowed-tools from various formats
 * Supports:
 * - Space-delimited string: "Bash(git:*) Read Write"
 * - Array: ["Bash", "Read", "Write"]
 */
export const parseAllowedTools = (
  value: unknown
): { tools: string[]; issues: ValidationIssue[] } => {
  const issues: ValidationIssue[] = [];

  if (!value) {
    return { tools: [], issues };
  }

  if (typeof value === "string") {
    // Space-delimited format (agentskills.io standard)
    const tools = value.split(/\s+/).filter((t) => t.length > 0);
    return { tools, issues };
  }

  if (Array.isArray(value)) {
    // Array format
    const tools = value.map(String);
    return { tools, issues };
  }

  issues.push({
    field: "allowed-tools",
    message: "allowed-tools must be a space-delimited string or array",
    severity: "error",
    value,
  });

  return { tools: [], issues };
};

/**
 * Validate SKILL.md content size
 */
export const validateSkillMdSize = (content: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  const lines = countLines(content);
  if (lines > SKILL_MD_LINE_WARNING) {
    issues.push({
      field: "SKILL.md",
      message: `SKILL.md has ${lines} lines (recommended: < ${SKILL_MD_LINE_WARNING}). Consider moving detailed content to reference files.`,
      severity: "warning",
      value: { lines },
    });
  }

  const tokens = estimateTokens(content);
  if (tokens > SKILL_MD_TOKEN_WARNING) {
    issues.push({
      field: "SKILL.md",
      message: `SKILL.md has approximately ${tokens} tokens (recommended: < ${SKILL_MD_TOKEN_WARNING}). Consider moving detailed content to reference files.`,
      severity: "warning",
      value: { tokens },
    });
  }

  return issues;
};

/**
 * Validate a complete skill manifest against agentskills.io standard
 */
export const validateManifest = (
  manifest: SkillManifest | InferredManifest,
  options?: { directoryName?: string; skillMdContent?: string }
): ValidationResult => {
  const issues: ValidationIssue[] = [];

  // Validate name
  issues.push(...validateName(manifest.name));

  // Validate name matches directory
  if (options?.directoryName) {
    issues.push(...validateNameMatchesDirectory(manifest.name, options.directoryName));
  }

  // Validate description
  issues.push(...validateDescription(manifest.description));

  // Validate compatibility if present (only on full manifests)
  if ("compatibility" in manifest && manifest.compatibility) {
    issues.push(...validateCompatibility(manifest.compatibility));
  }

  // Validate SKILL.md size if content provided
  if (options?.skillMdContent) {
    issues.push(...validateSkillMdSize(options.skillMdContent));
  }

  // Parse and store allowed tools (validation is just parsing here)
  if ("allowed_tools" in manifest && manifest.allowed_tools) {
    // Already parsed as array, no additional validation needed
  }

  // Split into errors and warnings
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return {
    valid: errors.length === 0,
    issues,
    errors,
    warnings,
  };
};

/**
 * Validate skill at a given path
 */
export const validateSkillAtPath = (
  skillPath: string
): Effect.Effect<ValidationResult, never> =>
  Effect.gen(function* () {
    const fs = yield* Effect.promise(() => import("fs/promises"));
    const yaml = yield* Effect.promise(() => import("js-yaml"));

    const issues: ValidationIssue[] = [];
    let manifest: SkillManifest | InferredManifest | null = null;

    // Get directory name for comparison
    const directoryName = skillPath.split("/").pop() || "";

    // Check for skill.yaml
    const manifestPath = join(skillPath, "skill.yaml");
    const skillMdPath = join(skillPath, "SKILL.md");

    const manifestFile = Bun.file(manifestPath);
    const skillMdFile = Bun.file(skillMdPath);

    const hasManifest = yield* Effect.promise(() => manifestFile.exists());
    const hasSkillMd = yield* Effect.promise(() => skillMdFile.exists());

    if (!hasManifest && !hasSkillMd) {
      issues.push({
        field: "files",
        message: "Skill must have either skill.yaml or SKILL.md",
        severity: "error",
      });
      return {
        valid: false,
        issues,
        errors: issues,
        warnings: [],
      };
    }

    let skillMdContent: string | undefined;

    // Parse manifest
    if (hasManifest) {
      try {
        const content = yield* Effect.promise(() => manifestFile.text());
        manifest = yaml.default.load(content) as SkillManifest;
      } catch (error) {
        issues.push({
          field: "skill.yaml",
          message: `Failed to parse skill.yaml: ${error instanceof Error ? error.message : String(error)}`,
          severity: "error",
        });
      }
    }

    // Parse SKILL.md frontmatter if no manifest
    if (!manifest && hasSkillMd) {
      try {
        skillMdContent = yield* Effect.promise(() => skillMdFile.text());

        if (skillMdContent.startsWith("---")) {
          const endMarker = skillMdContent.indexOf("---", 3);
          if (endMarker !== -1) {
            const frontmatter = skillMdContent.slice(3, endMarker).trim();
            const parsed = yaml.default.load(frontmatter) as Record<string, unknown>;

            manifest = {
              name: typeof parsed.name === "string" ? parsed.name : directoryName,
              description: typeof parsed.description === "string" ? parsed.description : "",
              version: typeof parsed.version === "string" ? parsed.version : "1.0.0",
              type: "prompt" as const,
            };
          }
        }
      } catch (error) {
        issues.push({
          field: "SKILL.md",
          message: `Failed to parse SKILL.md frontmatter: ${error instanceof Error ? error.message : String(error)}`,
          severity: "error",
        });
      }
    } else if (hasSkillMd) {
      skillMdContent = yield* Effect.promise(() => skillMdFile.text());
    }

    // If we still don't have a manifest, return early with errors
    if (!manifest) {
      return {
        valid: false,
        issues,
        errors: issues,
        warnings: [],
      };
    }

    // Validate the manifest
    const manifestResult = validateManifest(manifest, {
      directoryName,
      skillMdContent,
    });

    // Combine all issues
    issues.push(...manifestResult.issues);

    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");

    return {
      valid: errors.length === 0,
      issues,
      errors,
      warnings,
    };
  });

// Service interface
interface SkillValidationServiceImpl {
  readonly validateName: (name: string | undefined) => ValidationIssue[];
  readonly validateDescription: (description: string | undefined) => ValidationIssue[];
  readonly validateCompatibility: (compatibility: string | undefined) => ValidationIssue[];
  readonly validateSkillMdSize: (content: string) => ValidationIssue[];
  readonly validateManifest: (
    manifest: SkillManifest | InferredManifest,
    options?: { directoryName?: string; skillMdContent?: string }
  ) => ValidationResult;
  readonly validateSkillAtPath: (path: string) => Effect.Effect<ValidationResult, never>;
  readonly parseAllowedTools: (value: unknown) => { tools: string[]; issues: ValidationIssue[] };
}

// Service tag
export class SkillValidationService extends Context.Tag("SkillValidationService")<
  SkillValidationService,
  SkillValidationServiceImpl
>() {}

// Service implementation
const makeSkillValidationService = (): SkillValidationServiceImpl => ({
  validateName,
  validateDescription,
  validateCompatibility,
  validateSkillMdSize,
  validateManifest,
  validateSkillAtPath,
  parseAllowedTools,
});

// Live layer
export const SkillValidationServiceLive = Layer.succeed(
  SkillValidationService,
  makeSkillValidationService()
);
