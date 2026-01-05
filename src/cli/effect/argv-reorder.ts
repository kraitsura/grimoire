/**
 * Argv Reorder - Preprocess argv to move options before positional args
 *
 * Effect CLI requires options before positional arguments. This utility
 * reorders argv to match that expectation, allowing users to write:
 *   grim wt rm my-worktree --branch
 * instead of:
 *   grim wt rm --branch my-worktree
 *
 * The shell handles quote parsing, so quoted strings with flag-like content
 * are safe (they arrive as single argv elements).
 */

/**
 * Known subcommands at each level of the command tree.
 * Used to identify where the command path ends and user args begin.
 */
const KNOWN_SUBCOMMANDS = new Set([
  // Level 1 (after grim)
  "pl", "ag", "wt", "st", "config", "profile", "completion",

  // Level 2 - pl subcommands
  "list", "show", "rm", "copy", "search", "tag", "history", "versions",
  "rollback", "archive", "branch", "alias", "favorite", "pin", "format",
  "export", "import", "reindex", "stats", "templates", "test", "cost",
  "compare", "benchmark", "enhance", "sync", "stash", "pop",

  // Level 2 - ag subcommands
  "spawn", "scout", "ps", "kill", "wait",

  // Level 2 - wt subcommands
  "new", "from-issue", "status", "path", "exec", "open", "clean",
  "adopt", "each", "log", "checkpoint", "claim", "release", "handoff",
  "available", "children", "collect", "commit", "merge", "pr", "auth",
  "kill", "wait",  // Also available in wt context

  // Level 2 - st subcommands
  "skills", "plugins", "agents", "add",

  // Level 3 - st skills subcommands
  "init", "enable", "disable", "info", "update", "validate", "doctor",
  "install",

  // Level 3 - st plugins subcommands
  "marketplace", "uninstall",

  // Level 3 - st agents subcommands
  "create",

  // Level 2 - config subcommands
  "llm", "dot",

  // Level 3 - config llm subcommands
  "remove",

  // Level 2 - profile subcommands
  "delete", "apply", "harnesses", "diff",
]);

/**
 * Registry of options that take values (not boolean flags).
 * These need their following argument kept together during reordering.
 *
 * Format: Map of option name -> true
 * Includes both long and short forms.
 */
const VALUE_OPTIONS = new Set([
  // wt.ts
  "-p", "--prompt",
  "-i", "--issue",
  "--timeout",
  "--strategy",
  "-m", "--message",
  "--title",
  "--body",
  "--to",

  // ag.ts
  "--depth",
  "--focus",
  "--model",

  // pl.ts
  "-t", "--tags",
  "-s", "--search",
  "--sort",
  "-n", "--limit",
  "--add",
  "--remove",
  "-o", "--output",
  "--format",
  "--input",
  "--aspect",
  "-c", "--content",
  "--name",

  // st.ts
  "--target",
  "--agent",
  "--trigger",
  "--allowed-tools",
  "--description",
  "--marketplace",
  "--cli",

  // config.ts
  "--editor",
  "--set-editor",

  // profile.ts
  "--desc",
  "--from",
  "--harness",

  // Common aliases
  "-bg", // alias for --background that some users might try with value
]);

/**
 * Check if an argument looks like an option (starts with -)
 */
const isOption = (arg: string): boolean => arg.startsWith("-") && arg !== "-" && arg !== "--";

/**
 * Check if an option takes a value
 */
const takesValue = (option: string): boolean => {
  // Handle --option=value format (already contains value)
  if (option.includes("=")) return false;

  // Check registry
  return VALUE_OPTIONS.has(option);
};

/**
 * Reorder argv to place options before positional arguments.
 *
 * Key insight: subcommand names (wt, rm, spawn, etc.) come first and should
 * stay in order. Options should be moved to just after the subcommands but
 * before the "true" positional arguments.
 *
 * The algorithm:
 * 1. Identify subcommands using KNOWN_SUBCOMMANDS (keep at front)
 * 2. Collect all options (with values) and positional args separately
 * 3. Result: subcommands + options + positional args
 *
 * Handles:
 * - Boolean flags (--flag)
 * - Value options (--option value)
 * - End-of-options marker (--)
 * - Options with = (--option=value)
 *
 * @param argv Full process.argv (including node and script path)
 * @returns Reordered argv with options moved before positional args
 */
export function reorderArgv(argv: readonly string[]): string[] {
  // Keep the first 2 elements (node path, script path) unchanged
  if (argv.length <= 2) return [...argv];

  const prefix = argv.slice(0, 2);
  const args = argv.slice(2);

  const subcommands: string[] = [];  // Known subcommands
  const options: string[] = [];       // Options with their values
  const positional: string[] = [];    // User positional args
  let inSubcommands = true;           // Are we still in subcommand territory?
  let endOfOptions = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // -- marks end of options
    if (arg === "--") {
      endOfOptions = true;
      positional.push(arg);
      i++;
      continue;
    }

    // After --, everything is positional
    if (endOfOptions) {
      positional.push(arg);
      i++;
      continue;
    }

    // Options
    if (isOption(arg)) {
      inSubcommands = false;  // Options mark end of subcommand path
      options.push(arg);

      // If this option takes a value, include the next arg with it
      if (takesValue(arg) && i + 1 < args.length && !isOption(args[i + 1])) {
        options.push(args[i + 1]);
        i++;
      }
    } else {
      // Non-option: either a subcommand or a positional arg
      if (inSubcommands && KNOWN_SUBCOMMANDS.has(arg)) {
        subcommands.push(arg);
      } else {
        inSubcommands = false;  // First non-subcommand positional ends subcommand path
        positional.push(arg);
      }
    }

    i++;
  }

  // Reconstruct: prefix + subcommands + options + positional
  return [...prefix, ...subcommands, ...options, ...positional];
}

/**
 * Debug helper to visualize reordering
 */
export function debugReorder(argv: readonly string[]): void {
  const original = argv.slice(2).join(" ");
  const reordered = reorderArgv(argv).slice(2).join(" ");

  if (original !== reordered) {
    console.error(`[argv-reorder] "${original}" → "${reordered}"`);
  }
}
