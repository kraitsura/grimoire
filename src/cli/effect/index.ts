/**
 * Effect CLI - Main CLI definition using @effect/cli
 *
 * This replaces the custom parser with declarative, type-safe command definitions.
 */

import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { MainLive } from "../../services";
import { runInteractive } from "../app";
import { reorderArgv } from "./argv-reorder";

// Import command definitions
import { plCommand } from "./pl";
import { agCommand } from "./ag";
import { wtCommand } from "./wt";
import { stCommand } from "./st";
import { configCommand } from "./config";
import { profileCommand } from "./profile";
import { completionCommand } from "./completion";

/**
 * Root grimoire command
 *
 * When no subcommand is provided and stdin is a TTY, launches interactive mode.
 * Otherwise shows help.
 */
export const grimoire = Command.make(
  "grimoire",
  {},
  () =>
    Effect.gen(function* () {
      // Check if we should launch interactive mode
      if (process.stdin.isTTY) {
        yield* runInteractive();
      } else {
        // Not a TTY - show simple help
        console.log("Grimoire - A CLI tool for storing, editing, and managing prompts\n");
        console.log("USAGE:");
        console.log("  grim <command> [options]\n");
        console.log("COMMANDS:");
        console.log("  pl          Prompt Library - manage prompts");
        console.log("  ag          Agents - spawn agents in current directory");
        console.log("  wt          Worktree - isolated workspaces + agents");
        console.log("  st          Skills/Tools - manage skills, plugins, agents");
        console.log("  config      Configuration and settings");
        console.log("  profile     Profile management");
        console.log("  completion  Generate shell completions\n");
        console.log("Run 'grim --help' for full help or 'grim <command> --help' for command help.");
      }
    })
).pipe(
  Command.withDescription("A CLI tool for storing, editing, and managing prompts"),
  Command.withSubcommands([
    plCommand,
    agCommand,
    wtCommand,
    stCommand,
    configCommand,
    profileCommand,
    completionCommand,
  ])
);

/**
 * Run the CLI
 *
 * Provides MainLive layer for all services.
 * Note: @effect/cli expects full process.argv including program name.
 *
 * We reorder argv to allow options after positional args, matching
 * user expectations from tools like git, npm, docker.
 */
export const runCli = () => {
  const cli = Command.run(grimoire, {
    name: "grimoire",
    version: "0.2.0",
  });

  // Reorder argv: move options before positional args
  // This allows: grim wt rm my-worktree --branch
  // Instead of:  grim wt rm --branch my-worktree
  const reorderedArgv = reorderArgv(process.argv);

  return Effect.scoped(
    cli(reorderedArgv).pipe(Effect.provide(MainLive))
  );
};
