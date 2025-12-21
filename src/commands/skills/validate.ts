/**
 * Skills Validate Command
 *
 * Validate a skill against the agentskills.io standard specification.
 * https://agentskills.io/specification
 */

import { Effect } from "effect";
import { join } from "path";
import { homedir } from "os";
import type { ParsedArgs } from "../../cli/parser";
import { SkillCacheService, validateSkillAtPath } from "../../services/skills";
import type { ValidationResult, ValidationIssue } from "../../models/skill-errors";

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
};

/**
 * Format a validation issue for display
 */
const formatIssue = (issue: ValidationIssue): string => {
  const icon = issue.severity === "error" ? `${colors.red}[!!]${colors.reset}` : `${colors.yellow}[!]${colors.reset}`;
  const color = issue.severity === "error" ? colors.red : colors.yellow;

  return `  ${icon} ${color}${issue.field}${colors.reset}: ${issue.message}`;
};

/**
 * Format validation result for display
 */
const formatResult = (result: ValidationResult): void => {
  if (result.valid && result.warnings.length === 0) {
    console.log(`${colors.green}[ok] Valid${colors.reset} - Skill passes agentskills.io standard validation`);
    return;
  }

  if (result.valid) {
    console.log(`${colors.green}[ok] Valid${colors.reset} ${colors.yellow}(with warnings)${colors.reset}`);
  } else {
    console.log(`${colors.red}[!!] Invalid${colors.reset} - Skill does not pass agentskills.io standard validation`);
  }

  console.log();

  // Show errors first
  if (result.errors.length > 0) {
    console.log(`${colors.bold}Errors (${result.errors.length}):${colors.reset}`);
    for (const issue of result.errors) {
      console.log(formatIssue(issue));
    }
    console.log();
  }

  // Then warnings
  if (result.warnings.length > 0) {
    console.log(`${colors.bold}Warnings (${result.warnings.length}):${colors.reset}`);
    for (const issue of result.warnings) {
      console.log(formatIssue(issue));
    }
    console.log();
  }
};

/**
 * Resolve skill path from name or path argument
 */
const resolveSkillPath = (
  target: string
): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    const fs = yield* Effect.promise(() => import("fs/promises"));

    // Check if it's an absolute or relative path
    if (target.startsWith("/") || target.startsWith("./") || target.startsWith("..")) {
      const absolutePath = target.startsWith("/") ? target : join(process.cwd(), target);

      try {
        const stat = yield* Effect.promise(() => fs.stat(absolutePath));
        if (stat.isDirectory()) {
          return absolutePath;
        }
      } catch {
        // Not a valid directory
      }

      return yield* Effect.fail(new Error(`Path not found: ${target}`));
    }

    // Check if it's a cached skill name
    const cacheDir = join(homedir(), ".grimoire", "cache", target);
    try {
      const stat = yield* Effect.promise(() => fs.stat(cacheDir));
      if (stat.isDirectory()) {
        return cacheDir;
      }
    } catch {
      // Not in cache
    }

    // Check if it's a skill in current directory
    const localPath = join(process.cwd(), target);
    try {
      const stat = yield* Effect.promise(() => fs.stat(localPath));
      if (stat.isDirectory()) {
        return localPath;
      }
    } catch {
      // Not a local directory
    }

    // Check if current directory is the skill
    if (target === ".") {
      return process.cwd();
    }

    return yield* Effect.fail(
      new Error(`Skill not found: ${target}. Provide a path or cached skill name.`)
    );
  });

/**
 * Skills validate command implementation
 */
export const skillsValidate = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const target = args.positional[1];
    const jsonFlag = args.flags.json === true;

    // Validate arguments
    if (!target) {
      console.log(`${colors.yellow}Error:${colors.reset} No skill specified`);
      console.log();
      console.log("Usage: grimoire skills validate <name|path>");
      console.log();
      console.log("Validates a skill against the agentskills.io standard.");
      console.log("https://agentskills.io/specification");
      console.log();
      console.log("Arguments:");
      console.log("  <name|path>  Cached skill name or path to skill directory");
      console.log();
      console.log("Flags:");
      console.log("  --json       Output validation result as JSON");
      console.log();
      console.log("Examples:");
      console.log("  grimoire skills validate beads           # Validate cached skill");
      console.log("  grimoire skills validate ./my-skill      # Validate local skill");
      console.log("  grimoire skills validate .               # Validate current directory");
      console.log("  grimoire skills validate beads --json    # JSON output");
      console.log();
      console.log("Validation Rules (agentskills.io standard):");
      console.log("  Name:");
      console.log("    - 1-64 characters, lowercase alphanumeric + hyphens");
      console.log("    - Cannot start/end with hyphen, no consecutive hyphens");
      console.log("    - Must match parent directory name");
      console.log("  Description: 1-1024 characters");
      console.log("  Compatibility: 1-500 characters (optional)");
      console.log("  SKILL.md: Recommend < 500 lines, < 5000 tokens");
      process.exit(1);
    }

    // Resolve skill path
    const pathResult = yield* resolveSkillPath(target).pipe(Effect.either);

    if (pathResult._tag === "Left") {
      console.log(`${colors.red}Error:${colors.reset} ${pathResult.left.message}`);
      console.log();
      console.log("To validate a cached skill, run:");
      console.log(`  grimoire skills add github:owner/${target}`);
      console.log(`  grimoire skills validate ${target}`);
      process.exit(1);
    }

    const skillPath = pathResult.right;
    const skillName = skillPath.split("/").pop() || target;

    // Validate the skill
    const result = yield* validateSkillAtPath(skillPath);

    // Output result
    if (jsonFlag) {
      console.log(JSON.stringify({
        path: skillPath,
        name: skillName,
        ...result,
      }, null, 2));
    } else {
      console.log(`${colors.bold}Validating:${colors.reset} ${skillName}`);
      console.log(`${colors.gray}Path:${colors.reset} ${skillPath}`);
      console.log();
      formatResult(result);
    }

    // Exit with error code if validation failed
    if (!result.valid) {
      process.exit(1);
    }
  });
