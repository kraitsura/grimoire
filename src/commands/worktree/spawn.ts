/**
 * grimoire wt spawn - Create a worktree and launch a sandboxed Claude session
 *
 * This command:
 * 1. Creates a new worktree (reusing grim wt new logic)
 * 2. Generates SRT config scoped to the worktree
 * 3. Launches Claude Code in a sandboxed environment
 */

import { Effect } from "effect";
import { spawn } from "child_process";
import { join } from "path";
import { randomUUID } from "crypto";
import type { ParsedArgs } from "../../cli/parser";
import { WorktreeService, WorktreeServiceLive } from "../../services/worktree";
import {
  SrtService,
  SrtServiceLive,
  SrtConfigService,
  SrtConfigServiceLive,
} from "../../services/srt";
import type { WorktreeInfo } from "../../models/worktree";

/**
 * Print usage and exit
 */
const printUsage = () => {
  console.log("Usage: grimoire wt spawn <name> [options]");
  console.log();
  console.log("Create a worktree and launch a sandboxed Claude session.");
  console.log();
  console.log("Arguments:");
  console.log("  <name>                 Worktree/branch name");
  console.log();
  console.log("Options:");
  console.log("  --branch, -b <name>    Use different branch name");
  console.log("  --prompt, -p <text>    Initial prompt for Claude");
  console.log("  --issue, -i <id>       Link to beads issue");
  console.log("  --no-sandbox           Skip SRT sandboxing (for debugging)");
  console.log("  --no-copy              Skip copying config files");
  console.log("  --no-hooks             Skip running post-create hooks");
  console.log("  --create-branch        Create new branch if doesn't exist");
  console.log();
  console.log("Examples:");
  console.log('  grimoire wt spawn auth-feature --prompt "Implement OAuth2"');
  console.log("  grimoire wt spawn --issue BD-15");
  console.log("  grimoire wt spawn fix-bug --no-sandbox");
  process.exit(1);
};

export const worktreeSpawn = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    if (!name) {
      printUsage();
      return;
    }

    // Parse options
    const branchName =
      (args.flags["branch"] as string) || (args.flags["b"] as string) || name;
    const prompt = (args.flags["prompt"] as string) || (args.flags["p"] as string);
    const linkedIssue =
      (args.flags["issue"] as string) || (args.flags["i"] as string);
    const noSandbox = args.flags["no-sandbox"] === true;
    const skipCopy = args.flags["no-copy"] === true;
    const skipHooks = args.flags["no-hooks"] === true;
    const createBranch = args.flags["create-branch"] === true;

    const worktreeService = yield* WorktreeService;
    const srtService = yield* SrtService;
    const srtConfigService = yield* SrtConfigService;
    const cwd = process.cwd();

    // Step 1: Check SRT availability (unless --no-sandbox)
    if (!noSandbox) {
      const platformInfo = yield* srtService.checkPlatform();
      if (!platformInfo.srtAvailable) {
        console.log("Warning: SRT sandboxing not available");
        if (platformInfo.instructions) {
          console.log();
          console.log("To enable sandboxing:");
          console.log(platformInfo.instructions);
        }
        console.log();
        console.log("Continuing without sandbox (use --no-sandbox to suppress this warning)");
        console.log();
      }
    }

    // Step 2: Create the worktree
    console.log(`Creating worktree '${name}'...`);

    const createResult = yield* Effect.either(
      worktreeService.create(cwd, {
        branch: branchName,
        name,
        linkedIssue,
        skipCopy,
        skipHooks,
        createBranch,
        createdBy: "agent",
        sessionId: randomUUID(),
      })
    );

    if (createResult._tag === "Left") {
      const e = createResult.left as { _tag?: string; message?: string };
      if (e._tag === "WorktreeAlreadyExistsError") {
        // Worktree exists, try to use it
        console.log(`Worktree '${name}' already exists, using existing...`);
      } else if (e._tag === "BranchNotFoundError") {
        console.log(`Error: ${e.message}`);
        console.log("Use --create-branch to create a new branch.");
        process.exit(1);
      } else {
        console.log(`Error creating worktree: ${e.message || String(createResult.left)}`);
        process.exit(1);
      }
    }

    // Get worktree info (either newly created or existing)
    const worktreeResult = yield* Effect.either(worktreeService.get(cwd, name));
    if (worktreeResult._tag === "Left") {
      console.log("Error: Failed to get worktree info");
      process.exit(1);
    }

    const worktree = worktreeResult.right as WorktreeInfo;
    console.log(`  Branch: ${worktree.branch}`);
    console.log(`  Path: ${worktree.path}`);
    if (linkedIssue) {
      console.log(`  Issue: ${linkedIssue}`);
    }
    console.log();

    // Step 3: Generate SRT config
    const useSandbox = !noSandbox && (yield* srtService.isAvailable());

    if (useSandbox) {
      console.log("Generating sandbox configuration...");
      const resolved = yield* srtConfigService.resolveConfig(worktree.path, cwd);
      console.log(`  Write access: ${worktree.path}`);
      console.log(`  Network: ${resolved.config.network.allowedDomains.slice(0, 3).join(", ")}...`);
      console.log();

      // Write config to temp file
      const configPath = yield* srtService.writeConfigFile(resolved.config);

      // Step 4: Build and launch Claude command
      console.log("Launching Claude Code session...");
      const sessionId = randomUUID().slice(0, 8);
      console.log(`  Session ID: sess_${sessionId}`);
      console.log();

      // Build the claude command
      let claudeCommand = "claude";
      if (prompt) {
        // Escape the prompt for shell
        const escapedPrompt = prompt.replace(/'/g, "'\\''");
        claudeCommand = `claude --prompt '${escapedPrompt}'`;
      }

      // Wrap with SRT
      const fullCommand = srtService.wrapCommand(claudeCommand, configPath);

      // Spawn the process
      const child = spawn("sh", ["-c", fullCommand], {
        cwd: worktree.path,
        env: {
          ...process.env,
          GRIMOIRE_WORKTREE: name,
          GRIMOIRE_WORKTREE_PATH: worktree.path,
          GRIMOIRE_SESSION_ID: `sess_${sessionId}`,
        },
        stdio: "inherit",
      });

      // Wait for process to exit
      yield* Effect.promise(
        () =>
          new Promise<void>((resolve) => {
            child.on("close", (code) => {
              // Cleanup config file
              import("fs/promises")
                .then((fs) => fs.unlink(configPath).catch(() => {}))
                .finally(() => {
                  process.exitCode = code ?? 0;
                  resolve();
                });
            });
            child.on("error", (err) => {
              console.error(`Error launching Claude: ${err.message}`);
              process.exitCode = 1;
              resolve();
            });
          })
      );
    } else {
      // No sandbox - launch Claude directly
      if (noSandbox) {
        console.log("Launching Claude Code session (sandbox disabled)...");
      } else {
        console.log("Launching Claude Code session (sandbox not available)...");
      }

      const sessionId = randomUUID().slice(0, 8);
      console.log(`  Session ID: sess_${sessionId}`);
      console.log();

      // Build the claude command
      const claudeArgs: string[] = [];
      if (prompt) {
        claudeArgs.push("--prompt", prompt);
      }

      const child = spawn("claude", claudeArgs, {
        cwd: worktree.path,
        env: {
          ...process.env,
          GRIMOIRE_WORKTREE: name,
          GRIMOIRE_WORKTREE_PATH: worktree.path,
          GRIMOIRE_SESSION_ID: `sess_${sessionId}`,
        },
        stdio: "inherit",
      });

      // Wait for process to exit
      yield* Effect.promise(
        () =>
          new Promise<void>((resolve) => {
            child.on("close", (code) => {
              process.exitCode = code ?? 0;
              resolve();
            });
            child.on("error", (err) => {
              console.error(`Error launching Claude: ${err.message}`);
              console.error("Make sure 'claude' CLI is installed and in your PATH");
              process.exitCode = 1;
              resolve();
            });
          })
      );
    }
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(SrtServiceLive),
    Effect.provide(SrtConfigServiceLive)
  );
