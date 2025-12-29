/**
 * CLI Argument Parser
 *
 * Parses command-line arguments into a structured format for command routing.
 */

export interface ParsedArgs {
  command: string | null;
  flags: Record<string, string | boolean>;
  positional: string[];
}

/**
 * Parse command-line arguments
 *
 * Supports:
 * - Commands: First non-flag argument (e.g., "list", "add", "edit")
 * - Flags: Arguments starting with - or -- (e.g., --interactive, -i, --name=value)
 * - Positional: Remaining non-flag arguments
 *
 * Examples:
 *   parseArgs([]) => { command: null, flags: {}, positional: [] }
 *   parseArgs(['list']) => { command: 'list', flags: {}, positional: [] }
 *   parseArgs(['-i']) => { command: null, flags: { i: true, interactive: true }, positional: [] }
 *   parseArgs(['--interactive']) => { command: null, flags: { interactive: true }, positional: [] }
 *   parseArgs(['add', 'my-prompt', '--name=test']) => { command: 'add', flags: { name: 'test' }, positional: ['my-prompt'] }
 */
export function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle flags
    if (arg.startsWith("-")) {
      // Long flag with value: --name=value
      if (arg.startsWith("--") && arg.includes("=")) {
        const [key, value] = arg.slice(2).split("=", 2);
        flags[key] = value;
      }
      // Long flag: --flag
      else if (arg.startsWith("--")) {
        const key = arg.slice(2);
        // Check if next arg is a value (not a flag)
        if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
          flags[key] = args[i + 1];
          i++; // Skip next arg as we consumed it
        } else {
          flags[key] = true;
        }
      }
      // Short flag(s): -i or -abc
      else {
        const shortFlags = arg.slice(1).split("");
        // Short flags that take a value
        const valueFlags = new Set(["c", "t", "n", "I", "p", "b"]);
        for (let j = 0; j < shortFlags.length; j++) {
          const flag = shortFlags[j];
          // If this is a value flag and it's the last in the group
          if (valueFlags.has(flag) && j === shortFlags.length - 1) {
            // Check if next arg is a value (not a flag)
            if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
              flags[flag] = args[i + 1];
              i++; // Skip next arg as we consumed it
            } else {
              flags[flag] = true;
            }
          } else {
            flags[flag] = true;
          }
          // Map common short flags to long forms
          if (flag === "i") {
            flags.interactive = true;
          }
          if (flag === "h") {
            flags.help = true;
          }
          if (flag === "v") {
            flags.version = true;
          }
        }
      }
    }
    // First non-flag is the command
    else if (command === null) {
      command = arg;
    }
    // Rest are positional arguments
    else {
      positional.push(arg);
    }
  }

  return { command, flags, positional };
}
