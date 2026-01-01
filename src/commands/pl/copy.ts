/**
 * Copy Command - Copy prompt to clipboard with variable interpolation
 *
 * Usage:
 *   grimoire copy <name-or-id>
 *   grimoire copy <name-or-id> -v key=value -v key2=value2
 *   grimoire copy <name-or-id> --stdout
 *   grimoire copy <name-or-id> --raw
 */

import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { StorageService, Clipboard } from "../../services";
import { CopyCommandArgsSchema, ValidationError } from "../../models";
import type { ParsedArgs } from "../../cli/parser";

/**
 * Parse variables from command line arguments
 *
 * Handles multiple -v flags by looking at the raw args array.
 * The ParsedArgs.flags only stores the last -v flag value,
 * so we need to parse from the original args.
 */
const parseVariables = (args: string[]): Record<string, string> => {
  const vars: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle -v key=value
    if (arg === "-v" || arg === "--vars") {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-") && nextArg.includes("=")) {
        const [key, ...valueParts] = nextArg.split("=");
        const value = valueParts.join("="); // Handle values with = in them
        if (key && value) {
          vars[key] = value;
        }
        i++; // Skip next arg as we consumed it
      }
    }
    // Handle -v=key=value or --vars=key=value
    else if (arg.startsWith("-v=") || arg.startsWith("--vars=")) {
      const parts = arg.split("=").slice(1); // Remove the flag part
      if (parts.length >= 2) {
        const key = parts[0];
        const value = parts.slice(1).join("=");
        if (key && value) {
          vars[key] = value;
        }
      }
    }
  }

  return vars;
};

/**
 * Interpolate variables in content
 *
 * Replaces {{variable}} patterns with values from the vars object.
 * Leaves unmatched patterns unchanged.
 */
const interpolateVariables = (content: string, vars: Record<string, string>): string => {
  return content.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return vars[varName] ?? match;
  });
};

/**
 * Parse raw CLI args into structured format for schema validation
 */
const parseCopyArgs = (args: ParsedArgs) => {
  const rawFlag = args.flags.raw || args.flags.r;
  // Parse variables from process.argv to handle multiple -v flags
  const rawArgs = process.argv.slice(2);
  const vars = parseVariables(rawArgs);

  return {
    nameOrId: args.positional[0],
    raw: rawFlag === true ? true : undefined,
    variables: Object.keys(vars).length > 0 ? vars : undefined,
  };
};

/**
 * Copy command implementation
 *
 * Finds a prompt by name or ID, optionally interpolates variables,
 * and copies to clipboard or outputs to stdout.
 */
export const copyCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const clipboard = yield* Clipboard;

    // Validate arguments with schema
    const rawArgs = parseCopyArgs(args);
    const validatedArgs = yield* Schema.decodeUnknown(CopyCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire copy <name-or-id> [--vars|-v key=value] [--stdout] [--raw|-r]`,
        });
      })
    );

    // Find prompt (try by ID first, then by name)
    const prompt = yield* storage
      .getById(validatedArgs.nameOrId)
      .pipe(
        Effect.catchTag("PromptNotFoundError", () => storage.getByName(validatedArgs.nameOrId))
      );

    let content = prompt.content;

    // Variable interpolation (unless --raw)
    if (!validatedArgs.raw && validatedArgs.variables) {
      // Interpolate {{variable}} patterns
      content = interpolateVariables(content, validatedArgs.variables);
    }

    // Output
    const stdoutFlag = args.flags.stdout;
    if (stdoutFlag) {
      console.log(content);
    } else {
      yield* clipboard.copy(content);
      console.log("Copied to clipboard!");
    }
  });
