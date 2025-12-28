import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { AgentService } from "../../services/agents";
import type { AgentValidationIssue, AgentValidationResult } from "../../models/agent-errors";

// ANSI color codes
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

// Valid tool names
const VALID_TOOLS = new Set([
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
  "AskUserQuestion",
]);

// Valid model names
const VALID_MODELS = new Set([
  "haiku",
  "sonnet",
  "opus",
  "claude-3-5-haiku",
  "claude-3-5-sonnet",
  "claude-3-opus",
]);

/**
 * Validate an agent definition
 */
const validateAgent = (
  name: string,
  description: string,
  tools?: readonly string[],
  model?: string,
  content?: string
): AgentValidationResult => {
  const issues: AgentValidationIssue[] = [];

  // Name validation
  if (!name || name.length === 0) {
    issues.push({
      field: "name",
      message: "Name is required",
      severity: "error",
    });
  } else if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name) && name.length > 1) {
    issues.push({
      field: "name",
      message: "Name must be kebab-case (lowercase letters, numbers, hyphens)",
      severity: "error",
      value: name,
    });
  }

  // Description validation
  if (!description || description.length === 0) {
    issues.push({
      field: "description",
      message: "Description is required for agent discovery",
      severity: "error",
    });
  } else if (description.length < 20) {
    issues.push({
      field: "description",
      message: "Description should be at least 20 characters for effective auto-invocation",
      severity: "warning",
      value: description,
    });
  } else if (!description.toLowerCase().includes("use") && !description.toLowerCase().includes("invoke")) {
    issues.push({
      field: "description",
      message: "Description should include trigger words like 'Use when...' or 'Invoke when...'",
      severity: "warning",
    });
  }

  // Tools validation
  if (tools && tools.length > 0) {
    for (const tool of tools) {
      if (!VALID_TOOLS.has(tool)) {
        issues.push({
          field: "tools",
          message: `Unknown tool: ${tool}`,
          severity: "warning",
          value: tool,
        });
      }
    }
  }

  // Model validation
  if (model && !VALID_MODELS.has(model)) {
    issues.push({
      field: "model",
      message: `Unknown model: ${model}. Valid models: ${Array.from(VALID_MODELS).join(", ")}`,
      severity: "warning",
      value: model,
    });
  }

  // Content validation
  if (!content || content.trim().length === 0) {
    issues.push({
      field: "content",
      message: "System prompt content is empty",
      severity: "error",
    });
  } else if (content.length < 50) {
    issues.push({
      field: "content",
      message: "System prompt is very short. Consider adding more instructions.",
      severity: "warning",
    });
  }

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
 * agents validate - Validate agent definition
 *
 * Checks agent definition for:
 * - Name format (kebab-case)
 * - Description present and descriptive
 * - Tools are valid tool names
 * - Model is valid identifier
 * - Content not empty
 * - Platform-specific field validation
 *
 * Usage:
 *   grimoire agents validate <name>      # Validate cached agent
 *   grimoire agents validate ./my-agent  # Validate local path
 */
export const agentsValidate = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const nameOrPath = args.positional[1];
    const jsonOutput = args.flags.json === true;

    if (!nameOrPath) {
      console.log("Usage: grimoire agents validate <name|path>");
      console.log("");
      console.log("Options:");
      console.log("  --json    Output as JSON");
      process.exit(1);
    }

    const agentService = yield* AgentService;

    // Try to get from cache first
    const cachedAgent = yield* agentService.getCached(nameOrPath).pipe(
      Effect.catchTag("AgentNotCachedError", () => Effect.succeed(null))
    );

    if (!cachedAgent) {
      console.log(`${colors.red}Error:${colors.reset} Agent '${nameOrPath}' not found in cache.`);
      console.log("Path-based validation not yet implemented.");
      process.exit(1);
    }

    const def = cachedAgent.definition;
    const result = validateAgent(def.name, def.description, def.tools, def.model, def.content);

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    }

    console.log(`${colors.bold}Validating: ${def.name}${colors.reset}\n`);

    if (result.valid && result.warnings.length === 0) {
      console.log(`${colors.green}✓ Agent is valid${colors.reset}`);
      return;
    }

    if (result.errors.length > 0) {
      console.log(`${colors.red}Errors:${colors.reset}`);
      for (const error of result.errors) {
        console.log(`  ${colors.red}✗${colors.reset} ${error.field}: ${error.message}`);
        if (error.value !== undefined) {
          console.log(`    ${colors.dim}Value: ${error.value}${colors.reset}`);
        }
      }
      console.log("");
    }

    if (result.warnings.length > 0) {
      console.log(`${colors.yellow}Warnings:${colors.reset}`);
      for (const warning of result.warnings) {
        console.log(`  ${colors.yellow}!${colors.reset} ${warning.field}: ${warning.message}`);
        if (warning.value !== undefined) {
          console.log(`    ${colors.dim}Value: ${warning.value}${colors.reset}`);
        }
      }
      console.log("");
    }

    if (result.valid) {
      console.log(`${colors.green}✓ Agent is valid${colors.reset} (with ${result.warnings.length} warning(s))`);
    } else {
      console.log(`${colors.red}✗ Agent has ${result.errors.length} error(s)${colors.reset}`);
      process.exit(1);
    }
  }).pipe(
    Effect.catchAll((error: unknown) =>
      Effect.sync(() => {
        let message = "Unknown error";
        if (error && typeof error === "object" && "message" in error) {
          message = String((error as { message: unknown }).message);
        } else if (typeof error === "string") {
          message = error;
        }
        console.error(`Error: ${message}`);
        process.exit(1);
      })
    )
  );
