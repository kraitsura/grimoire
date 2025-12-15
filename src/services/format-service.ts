/**
 * Format Service - Formats and lints prompt content
 *
 * Provides formatting and linting capabilities for prompt files,
 * including whitespace normalization, XML tag validation, and
 * YAML frontmatter validation.
 */

import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import * as yaml from "js-yaml";

/**
 * Error for formatting/linting operations
 */
export class FormatError extends Data.TaggedError("FormatError")<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Configuration for formatting operations
 */
export interface FormattingConfig {
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
  indentSize: number;
  maxLineLength?: number;
  normalizeXmlTags: boolean;
}

/**
 * Result of a formatting operation
 */
export interface FormatResult {
  content: string;
  changes: number;
}

/**
 * A single linting issue
 */
export interface LintIssue {
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
  rule: string;
  fix?: string;
}

/**
 * Result of a linting operation
 */
export interface LintResult {
  isValid: boolean;
  issues: LintIssue[];
}

/**
 * Result of YAML frontmatter validation
 */
export interface FrontmatterResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Format service interface
 */
interface FormatServiceImpl {
  /**
   * Format prompt content according to configuration
   */
  readonly formatPrompt: (
    content: string,
    config: FormattingConfig
  ) => Effect.Effect<FormatResult, FormatError>;

  /**
   * Check prompt content for issues without modifying
   */
  readonly checkPrompt: (
    content: string,
    config: FormattingConfig
  ) => Effect.Effect<LintResult, FormatError>;

  /**
   * Validate YAML frontmatter in prompt content
   */
  readonly validateYamlFrontmatter: (
    content: string
  ) => Effect.Effect<FrontmatterResult, FormatError>;
}

/**
 * Format service tag
 */
export class FormatService extends Context.Tag("FormatService")<
  FormatService,
  FormatServiceImpl
>() {}

/**
 * Extract YAML frontmatter from content
 */
const extractFrontmatter = (
  content: string
): { frontmatter: string | null; hasDelimiters: boolean } => {
  const lines = content.split("\n");

  // Check if content starts with frontmatter delimiter
  if (lines[0] !== "---") {
    return { frontmatter: null, hasDelimiters: false };
  }

  // Find closing delimiter
  const endIndex = lines.slice(1).findIndex((line) => line === "---");

  if (endIndex === -1) {
    return { frontmatter: null, hasDelimiters: true };
  }

  // Extract frontmatter content (between delimiters)
  const frontmatter = lines.slice(1, endIndex + 1).join("\n");
  return { frontmatter, hasDelimiters: true };
};

/**
 * Find unclosed XML tags in content
 */
const findUnclosedXmlTags = (content: string): string[] => {
  const tagStack: string[] = [];
  const unclosed: string[] = [];

  // Simple regex to find XML-like tags (not perfect but good enough)
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    const fullTag = match[0];
    const tagName = match[1];

    if (fullTag.startsWith("</")) {
      // Closing tag
      if (tagStack.length === 0 || tagStack[tagStack.length - 1] !== tagName) {
        unclosed.push(tagName);
      } else {
        tagStack.pop();
      }
    } else if (!fullTag.endsWith("/>")) {
      // Opening tag (not self-closing)
      tagStack.push(tagName);
    }
  }

  // Add any remaining unclosed tags
  unclosed.push(...tagStack);

  return unclosed;
};

/**
 * Normalize XML tags spacing
 */
const normalizeXmlTags = (content: string): string => {
  // Ensure proper spacing around XML tags
  let normalized = content;

  // Add newline after opening tags if not present
  normalized = normalized.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>(?!\n)/g,
    "<$1$2>\n"
  );

  // Add newline before closing tags if not present
  normalized = normalized.replace(
    /(?<!\n)<\/([a-zA-Z][a-zA-Z0-9]*)>/g,
    "\n</$1>"
  );

  // Remove extra blank lines around tags (max 1 blank line)
  normalized = normalized.replace(/\n{3,}/g, "\n\n");

  return normalized;
};

/**
 * Check indentation consistency
 */
const checkIndentation = (
  content: string,
  expectedSize: number
): LintIssue[] => {
  const issues: LintIssue[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;

    // Skip lines that are just whitespace
    if (line.trim().length === 0) continue;

    // Count leading whitespace
    const leadingSpaces = line.match(/^[ ]*/)?.[0].length ?? 0;
    const leadingTabs = line.match(/^\t*/)?.[0].length ?? 0;

    // Check for mixed spaces and tabs
    if (leadingSpaces > 0 && leadingTabs > 0) {
      issues.push({
        line: i + 1,
        column: 1,
        severity: "warning",
        message: "Mixed spaces and tabs in indentation",
        rule: "indent-consistency",
      });
    }

    // Check if spaces are multiples of expected indent size
    if (leadingSpaces > 0 && leadingSpaces % expectedSize !== 0) {
      issues.push({
        line: i + 1,
        column: 1,
        severity: "warning",
        message: `Indentation should be a multiple of ${expectedSize} spaces`,
        rule: "indent-size",
      });
    }
  }

  return issues;
};

/**
 * Format service implementation
 */
export const FormatServiceLive = Layer.succeed(
  FormatService,
  FormatService.of({
    formatPrompt: (content: string, config: FormattingConfig) =>
      Effect.gen(function* () {
        let formatted = content;
        let changeCount = 0;

        try {
          // 1. Trim trailing whitespace from each line
          if (config.trimTrailingWhitespace) {
            const beforeTrim = formatted;
            const lines = formatted.split("\n");
            formatted = lines.map((line) => line.trimEnd()).join("\n");
            if (beforeTrim !== formatted) changeCount++;
          }

          // 2. Normalize XML tags spacing
          if (config.normalizeXmlTags) {
            const beforeNormalize = formatted;
            formatted = normalizeXmlTags(formatted);
            if (beforeNormalize !== formatted) changeCount++;
          }

          // 3. Insert final newline
          if (config.insertFinalNewline) {
            if (!formatted.endsWith("\n")) {
              formatted += "\n";
              changeCount++;
            }
          }

          return { content: formatted, changes: changeCount };
        } catch (error) {
          return yield* Effect.fail(
            new FormatError({
              message: "Failed to format prompt",
              cause: error,
            })
          );
        }
      }),

    checkPrompt: (content: string, config: FormattingConfig) =>
      Effect.gen(function* () {
        const issues: LintIssue[] = [];

        try {
          // 1. Check for empty content
          if (content.trim().length === 0) {
            issues.push({
              line: 1,
              column: 1,
              severity: "error",
              message: "Prompt content is empty",
              rule: "no-empty-content",
            });
            return { isValid: false, issues };
          }

          const lines = content.split("\n");

          // 2. Check trailing whitespace
          if (config.trimTrailingWhitespace) {
            lines.forEach((line, index) => {
              if (line !== line.trimEnd()) {
                issues.push({
                  line: index + 1,
                  column: line.trimEnd().length + 1,
                  severity: "warning",
                  message: "Trailing whitespace",
                  rule: "no-trailing-whitespace",
                  fix: line.trimEnd(),
                });
              }
            });
          }

          // 3. Check final newline
          if (config.insertFinalNewline && !content.endsWith("\n")) {
            issues.push({
              line: lines.length,
              column: lines[lines.length - 1].length + 1,
              severity: "info",
              message: "Missing final newline",
              rule: "final-newline",
              fix: content + "\n",
            });
          }

          // 4. Check line length
          if (config.maxLineLength) {
            lines.forEach((line, index) => {
              if (line.length > config.maxLineLength!) {
                issues.push({
                  line: index + 1,
                  column: config.maxLineLength! + 1,
                  severity: "warning",
                  message: `Line exceeds maximum length of ${config.maxLineLength} characters`,
                  rule: "max-line-length",
                });
              }
            });
          }

          // 5. Check indentation consistency
          const indentIssues = checkIndentation(content, config.indentSize);
          issues.push(...indentIssues);

          // 6. Check for unclosed XML tags
          const unclosedTags = findUnclosedXmlTags(content);
          if (unclosedTags.length > 0) {
            issues.push({
              line: 1,
              column: 1,
              severity: "error",
              message: `Unclosed XML tags: ${unclosedTags.join(", ")}`,
              rule: "no-unclosed-xml-tags",
            });
          }

          // Determine if content is valid (no errors)
          const isValid = !issues.some((issue) => issue.severity === "error");

          return { isValid, issues };
        } catch (error) {
          return yield* Effect.fail(
            new FormatError({
              message: "Failed to check prompt",
              cause: error,
            })
          );
        }
      }),

    validateYamlFrontmatter: (content: string) =>
      Effect.gen(function* () {
        const errors: string[] = [];

        try {
          const { frontmatter, hasDelimiters } = extractFrontmatter(content);

          // If no frontmatter delimiters, it's valid (frontmatter is optional)
          if (!hasDelimiters) {
            return { isValid: true, errors: [] };
          }

          // If has opening delimiter but no closing, that's an error
          if (frontmatter === null) {
            errors.push("Unclosed YAML frontmatter (missing closing ---)");
            return { isValid: false, errors };
          }

          // Try to parse YAML
          try {
            yaml.load(frontmatter);
          } catch (parseError) {
            if (parseError instanceof Error) {
              errors.push(`YAML parsing error: ${parseError.message}`);
            } else {
              errors.push("Unknown YAML parsing error");
            }
          }

          return { isValid: errors.length === 0, errors };
        } catch (error) {
          return yield* Effect.fail(
            new FormatError({
              message: "Failed to validate YAML frontmatter",
              cause: error,
            })
          );
        }
      }),
  })
);
