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
import { StorageService, Clipboard } from "../services";
import type { ParsedArgs } from "../cli/parser";

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
const interpolateVariables = (
  content: string,
  vars: Record<string, string>
): string => {
  return content.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return vars[varName] ?? match;
  });
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

    const nameOrId = args.positional[0];
    if (!nameOrId) {
      console.log(
        "Usage: grimoire copy <name-or-id> [--vars|-v key=value] [--stdout] [--raw|-r]"
      );
      return;
    }

    // Find prompt (try by ID first, then by name)
    const prompt = yield* storage.getById(nameOrId).pipe(
      Effect.catchTag("PromptNotFoundError", () => storage.getByName(nameOrId))
    );

    let content = prompt.content;

    // Variable interpolation (unless --raw)
    const rawFlag = args.flags["raw"] || args.flags["r"];
    if (!rawFlag) {
      // Parse variables from process.argv to handle multiple -v flags
      // Skip the first two args (node path and script path)
      const rawArgs = process.argv.slice(2);
      const vars = parseVariables(rawArgs);

      // Interpolate {{variable}} patterns
      content = interpolateVariables(content, vars);
    }

    // Output
    const stdoutFlag = args.flags["stdout"];
    if (stdoutFlag) {
      console.log(content);
    } else {
      yield* clipboard.copy(content);
      console.log("Copied to clipboard!");
    }
  });
