/**
 * Agent Command - Spawn agents in current directory
 *
 * Delegates to existing command handlers for implementation.
 */

import { Args, Command, Options } from "@effect/cli";
import { Effect } from "effect";

// Import the actual command handlers (they handle their own logic)
import { agSpawnCommand as spawnHandler } from "../../commands/ag/spawn";
import { agScoutCommand as scoutHandler } from "../../commands/ag/scout";

// Import the full ag command for ps/kill/wait (it handles the service internally)
import { agCommand as agCommandHandler } from "../../commands/ag";

// Helper to build ParsedArgs
const buildParsedArgs = (
  positional: string[],
  flags: Record<string, string | boolean>
): { command: string; positional: string[]; flags: Record<string, string | boolean> } => ({
  command: positional[0] || "",
  positional,
  flags,
});

// Spawn command
const spawnCommand = Command.make(
  "spawn",
  {
    prompt: Args.text({ name: "prompt" }).pipe(
      Args.optional,
      Args.withDescription("Initial prompt for Claude")
    ),
    promptFlag: Options.text("prompt").pipe(
      Options.withAlias("p"),
      Options.optional,
      Options.withDescription("Initial prompt for Claude")
    ),
    background: Options.boolean("background").pipe(
      Options.withAlias("bg"),
      Options.withDefault(false),
      Options.withDescription("Run in background (headless mode)")
    ),
    headless: Options.boolean("headless").pipe(
      Options.withAlias("H"),
      Options.withDefault(false),
      Options.withDescription("Run Claude in background (--print mode)")
    ),
    srt: Options.boolean("srt").pipe(
      Options.withDefault(false),
      Options.withDescription("Sandboxed autonomous execution")
    ),
    newTab: Options.boolean("new-tab").pipe(
      Options.withDefault(false),
      Options.withDescription("Open in new terminal tab/window")
    ),
    dangerouslySkipPermissions: Options.boolean("dangerously-skip-permissions").pipe(
      Options.withDefault(false),
      Options.withDescription("Autonomous without sandbox")
    ),
  },
  (args) => {
    const flags: Record<string, string | boolean> = {};
    if (args.background) flags.background = true;
    if (args.headless) flags.headless = true;
    if (args.srt) flags.srt = true;
    if (args.newTab) flags["new-tab"] = true;
    if (args.dangerouslySkipPermissions) flags["dangerously-skip-permissions"] = true;
    if (args.promptFlag._tag === "Some") flags.prompt = args.promptFlag.value;

    const positional: string[] = [];
    if (args.prompt._tag === "Some") positional.push(args.prompt.value);

    return spawnHandler({ command: "spawn", flags, positional });
  }
).pipe(Command.withDescription("Spawn a worker agent in current directory"));

// Scout command
const scoutCommand = Command.make(
  "scout",
  {
    nameOrCmd: Args.text({ name: "name" }).pipe(
      Args.optional,
      Args.withDescription("Scout name or subcommand (list, show, cancel, clear, watch)")
    ),
    question: Args.text({ name: "question" }).pipe(
      Args.optional,
      Args.withDescription("Question to explore")
    ),
    depth: Options.text("depth").pipe(
      Options.optional,
      Options.withDescription("Exploration depth: shallow, medium, deep")
    ),
    focus: Options.text("focus").pipe(
      Options.optional,
      Options.withDescription("Focus on specific directory")
    ),
    timeout: Options.integer("timeout").pipe(
      Options.optional,
      Options.withDescription("Max exploration time in seconds")
    ),
    model: Options.text("model").pipe(
      Options.optional,
      Options.withDescription("Model: haiku, sonnet, opus")
    ),
    json: Options.boolean("json").pipe(
      Options.withDefault(false),
      Options.withDescription("Output as JSON")
    ),
    summary: Options.boolean("summary").pipe(
      Options.withDefault(false),
      Options.withDescription("Show only summary")
    ),
    raw: Options.boolean("raw").pipe(
      Options.withDefault(false),
      Options.withDescription("Show raw log output")
    ),
    all: Options.boolean("all").pipe(
      Options.withDefault(false),
      Options.withDescription("Include running scouts (for clear)")
    ),
  },
  (args) => {
    const flags: Record<string, string | boolean> = {};
    if (args.depth._tag === "Some") flags.depth = args.depth.value;
    if (args.focus._tag === "Some") flags.focus = args.focus.value;
    if (args.timeout._tag === "Some") flags.timeout = String(args.timeout.value);
    if (args.model._tag === "Some") flags.model = args.model.value;
    if (args.json) flags.json = true;
    if (args.summary) flags.summary = true;
    if (args.raw) flags.raw = true;
    if (args.all) flags.all = true;

    const positional: string[] = [];
    if (args.nameOrCmd._tag === "Some") positional.push(args.nameOrCmd.value);
    if (args.question._tag === "Some") positional.push(args.question.value);

    return scoutHandler({ command: "scout", flags, positional });
  }
).pipe(Command.withDescription("Spawn an exploration agent"));

// PS command - delegates to original handler
const psCommand = Command.make("ps", {}, () =>
  agCommandHandler(buildParsedArgs(["ps"], {}))
).pipe(Command.withDescription("Show running agents"));

// Kill command - delegates to original handler
const killCommand = Command.make(
  "kill",
  {
    nameOrId: Args.text({ name: "name" }).pipe(
      Args.withDescription("Agent name or ID to kill")
    ),
  },
  ({ nameOrId }) => agCommandHandler(buildParsedArgs(["kill", nameOrId], {}))
).pipe(Command.withDescription("Kill a running agent"));

// Wait command - delegates to original handler
const waitCommand = Command.make(
  "wait",
  {
    nameOrId: Args.text({ name: "name" }).pipe(
      Args.withDescription("Agent name or ID to wait for")
    ),
  },
  ({ nameOrId }) => agCommandHandler(buildParsedArgs(["wait", nameOrId], {}))
).pipe(Command.withDescription("Wait for agent to complete"));

/**
 * Agent command with subcommands
 */
export const agCommand = Command.make("ag", {}, () =>
  Effect.sync(() => {
    console.log("Agent Operations (current directory)\n");
    console.log("USAGE:");
    console.log("  grim ag <command> [options]\n");
    console.log("COMMANDS:");
    console.log("  spawn \"<task>\"      Spawn a worker agent");
    console.log("  scout \"<question>\"  Spawn an exploration agent");
    console.log("  ps                  Show running agents");
    console.log("  kill <name|id>      Kill a running agent");
    console.log("  wait <name|id>      Wait for agent to complete\n");
    console.log("Run 'grim ag <command> --help' for command-specific help.");
  })
).pipe(
  Command.withDescription("Agents - spawn agents in current directory"),
  Command.withSubcommands([spawnCommand, scoutCommand, psCommand, killCommand, waitCommand])
);
