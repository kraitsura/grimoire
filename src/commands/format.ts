/**
 * Format Command - Format and lint prompt content
 */

import { Effect, Context } from "effect";
import { FormatService, StorageService } from "../services";
import type { ParsedArgs } from "../cli/parser";
import type { FormattingConfig, LintIssue } from "../services";

/**
 * Default formatting configuration
 */
const DEFAULT_CONFIG: FormattingConfig = {
  trimTrailingWhitespace: true,
  insertFinalNewline: true,
  indentSize: 2,
  normalizeXmlTags: true,
};

/**
 * Format command handler
 *
 * Formats prompt content according to configuration.
 * Supports:
 * - --check: Lint mode (no changes)
 * - --fix: Auto-fix issues (default)
 * - --all: Format all prompts
 */
export const formatCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const formatService = yield* FormatService;
    const storage = yield* StorageService;

    const checkMode = args.flags["check"];
    const fixMode = args.flags["fix"] || !checkMode; // default to fix mode
    const allFlag = args.flags["all"];

    // Get prompts to format
    let promptsToFormat: Array<{ id: string; name: string; content: string }>;

    if (allFlag) {
      // Format all prompts
      const prompts = yield* storage.getAll;
      promptsToFormat = prompts.map((p) => ({
        id: p.id,
        name: p.name,
        content: p.content,
      }));
    } else {
      // Format single prompt
      const nameOrId = args.positional[0];
      if (!nameOrId) {
        console.log("Usage: grimoire format <prompt-name>");
        console.log("       grimoire format --all");
        console.log("       grimoire format --check <prompt-name>");
        return;
      }

      // Find prompt - try by ID first, then fall back to name
      const prompt = yield* storage.getById(nameOrId).pipe(
        Effect.catchTag("PromptNotFoundError", () =>
          storage.getByName(nameOrId)
        )
      );

      promptsToFormat = [
        { id: prompt.id, name: prompt.name, content: prompt.content },
      ];
    }

    if (checkMode) {
      // Check mode - lint without modifying
      yield* checkPrompts(formatService, promptsToFormat);
    } else if (fixMode) {
      // Fix mode - format and update
      yield* fixPrompts(formatService, storage, promptsToFormat);
    }
  });

/**
 * Check prompts for issues without modifying them
 */
const checkPrompts = (
  formatService: Context.Tag.Service<FormatService>,
  prompts: Array<{ id: string; name: string; content: string }>
) =>
  Effect.gen(function* () {
    let totalIssues = 0;

    for (const prompt of prompts) {
      const result = yield* formatService.checkPrompt(
        prompt.content,
        DEFAULT_CONFIG
      );

      if (result.issues.length > 0) {
        console.log(`\nChecking: ${prompt.name}\n`);

        // Group issues by line
        const issuesByLine = new Map<number, LintIssue[]>();
        for (const issue of result.issues) {
          if (!issuesByLine.has(issue.line)) {
            issuesByLine.set(issue.line, []);
          }
          issuesByLine.get(issue.line)!.push(issue);
        }

        // Display issues
        const sortedLines = Array.from(issuesByLine.keys()).sort((a, b) => a - b);
        for (const line of sortedLines) {
          const lineIssues = issuesByLine.get(line)!;
          for (const issue of lineIssues) {
            console.log(`  Line ${issue.line}: ${issue.message}`);
          }
        }

        totalIssues += result.issues.length;
      }
    }

    if (totalIssues > 0) {
      console.log(
        `\nFound ${totalIssues} issue${totalIssues === 1 ? "" : "s"}. Run with --fix to auto-fix.`
      );
    } else {
      console.log("\nAll prompts are properly formatted.");
    }
  });

/**
 * Fix prompts by formatting them and updating storage
 */
const fixPrompts = (
  formatService: Context.Tag.Service<FormatService>,
  storage: Context.Tag.Service<StorageService>,
  prompts: Array<{ id: string; name: string; content: string }>
) =>
  Effect.gen(function* () {
    for (const prompt of prompts) {
      console.log(`\nFormatting: ${prompt.name}\n`);

      // Format the content
      const result = yield* formatService.formatPrompt(
        prompt.content,
        DEFAULT_CONFIG
      );

      if (result.changes === 0) {
        console.log("No changes needed.\n");
        continue;
      }

      // Check what was fixed
      const checkBefore = yield* formatService.checkPrompt(
        prompt.content,
        DEFAULT_CONFIG
      );
      const checkAfter = yield* formatService.checkPrompt(
        result.content,
        DEFAULT_CONFIG
      );

      // Display what was fixed
      console.log("Fixed:");

      // Count fixes by rule
      const fixesByRule = new Map<string, number>();
      for (const issue of checkBefore.issues) {
        fixesByRule.set(issue.rule, (fixesByRule.get(issue.rule) || 0) + 1);
      }

      // Display friendly messages for each fix
      const ruleMessages: Record<string, (count: number) => string> = {
        "no-trailing-whitespace": (count) =>
          `  \u2713 Removed trailing whitespace (${count} line${count === 1 ? "" : "s"})`,
        "final-newline": () => `  \u2713 Added final newline`,
        "indent-consistency": (count) =>
          `  \u2713 Fixed indentation (${count} line${count === 1 ? "" : "s"})`,
        "indent-size": (count) =>
          `  \u2713 Normalized indentation (${count} line${count === 1 ? "" : "s"})`,
      };

      for (const [rule, count] of fixesByRule.entries()) {
        if (ruleMessages[rule]) {
          console.log(ruleMessages[rule](count));
        }
      }

      // Check if XML normalization happened
      if (DEFAULT_CONFIG.normalizeXmlTags && result.content !== prompt.content) {
        // Simple heuristic: if content has XML tags and changed, mention it
        if (prompt.content.includes("<") && prompt.content.includes(">")) {
          console.log(`  \u2713 Normalized XML tag spacing`);
        }
      }

      // Update the prompt in storage
      yield* storage.update(prompt.id, { content: result.content });

      console.log("\nPrompt formatted successfully.");
    }
  });
