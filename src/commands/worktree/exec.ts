/**
 * grimoire wt exec - Execute a command in a worktree context
 */

import { Effect } from "effect";
import { spawn } from "child_process";
import type { ParsedArgs } from "../../cli/parser";
import { WorktreeService, WorktreeServiceLive } from "../../services/worktree";

export const worktreeExec = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    const commandArgs = args.positional.slice(2);

    if (!name || commandArgs.length === 0) {
      console.log("Usage: grimoire wt exec <name> <command...>");
      console.log();
      console.log("Execute a command in a worktree context.");
      console.log();
      console.log("Examples:");
      console.log("  grimoire wt exec feature-auth bun test");
      console.log("  grimoire wt exec feature-auth git status");
      console.log();
      console.log("Environment variables set:");
      console.log("  GRIMOIRE_WORKTREE        Worktree name");
      console.log("  GRIMOIRE_WORKTREE_PATH   Absolute path to worktree");
      process.exit(1);
    }

    const service = yield* WorktreeService;
    const cwd = process.cwd();

    // Get worktree info
    const infoResult = yield* Effect.either(service.get(cwd, name));

    if (infoResult._tag === "Left") {
      const e = infoResult.left as { _tag?: string; message?: string };
      console.error(`Error: ${e.message || String(infoResult.left)}`);
      process.exit(1);
    }

    const info = infoResult.right;

    // Build environment with worktree context
    const env = {
      ...process.env,
      GRIMOIRE_WORKTREE: name,
      GRIMOIRE_WORKTREE_PATH: info.path,
    };

    // Execute the command
    const command = commandArgs.join(" ");
    const child = spawn(command, {
      cwd: info.path,
      env,
      shell: true,
      stdio: "inherit",
    });

    // Wait for process to exit and propagate exit code
    yield* Effect.promise(
      () =>
        new Promise<void>((resolve) => {
          child.on("close", (code) => {
            process.exitCode = code ?? 0;
            resolve();
          });
          child.on("error", (err) => {
            console.error(`Error executing command: ${err.message}`);
            process.exitCode = 1;
            resolve();
          });
        })
    );
  }).pipe(Effect.provide(WorktreeServiceLive));
