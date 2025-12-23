/**
 * grimoire wt open - Open a shell in a worktree directory
 */

import { Effect } from "effect";
import { spawn } from "child_process";
import type { ParsedArgs } from "../../cli/parser";
import { WorktreeService, WorktreeServiceLive } from "../../services/worktree";

export const worktreeOpen = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];

    if (!name) {
      console.log("Usage: grimoire wt open <name>");
      console.log();
      console.log("Open a shell in a worktree directory.");
      console.log();
      console.log("Examples:");
      console.log("  grimoire wt open feature-auth");
      console.log();
      console.log("Environment variables set:");
      console.log("  GRIMOIRE_WORKTREE        Worktree name");
      console.log("  GRIMOIRE_WORKTREE_PATH   Absolute path to worktree");
      console.log();
      console.log("Exit the shell (Ctrl+D or 'exit') to return.");
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

    // Determine shell to use
    const shell = process.env.SHELL || "/bin/sh";

    // Build environment with worktree context
    const env = {
      ...process.env,
      GRIMOIRE_WORKTREE: name,
      GRIMOIRE_WORKTREE_PATH: info.path,
    };

    console.log(`Opening shell in ${info.path}`);
    console.log(`(exit or Ctrl+D to return)`);
    console.log();

    // Spawn interactive shell
    const child = spawn(shell, {
      cwd: info.path,
      env,
      stdio: "inherit",
    });

    // Wait for shell to exit
    yield* Effect.promise(
      () =>
        new Promise<void>((resolve) => {
          child.on("close", (code) => {
            console.log();
            console.log(`Returned from worktree '${name}'`);
            process.exitCode = code ?? 0;
            resolve();
          });
          child.on("error", (err) => {
            console.error(`Error opening shell: ${err.message}`);
            process.exitCode = 1;
            resolve();
          });
        })
    );
  }).pipe(Effect.provide(WorktreeServiceLive));
