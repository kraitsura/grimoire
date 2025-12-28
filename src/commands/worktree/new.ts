/**
 * grimoire wt new - Create a new worktree
 *
 * Smart behavior:
 * - If branch exists: create worktree from it
 * - If branch doesn't exist: create branch + worktree (auto -b)
 * - If worktree already exists: just print its path
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { WorktreeService, WorktreeServiceLive } from "../../services/worktree";
import type { WorktreeInfo } from "../../models/worktree";

export const worktreeNew = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const branch = args.positional[1];
    if (!branch) {
      console.log("Usage: grimoire wt new <name> [options]");
      console.log();
      console.log("Creates a worktree. Automatically creates branch if needed.");
      console.log();
      console.log("Options:");
      console.log("  --name, -n <name>     Custom directory name (default: branch name)");
      console.log("  --issue, -i <id>      Link to beads issue");
      console.log("  --no-copy             Skip copying config files");
      console.log("  --no-hooks            Skip running post-create hooks");
      console.log("  --no-create           Don't create branch if missing (error instead)");
      console.log("  -o, --output-path     Output only the path (for cd integration)");
      console.log();
      console.log("Integration:");
      console.log("  cd $(grimoire wt new -o <name>)    Create and cd into worktree");
      process.exit(1);
    }

    const name = (args.flags["name"] as string) || (args.flags["n"] as string);
    const linkedIssue = (args.flags["issue"] as string) || (args.flags["i"] as string);
    const skipCopy = args.flags["no-copy"] === true;
    const skipHooks = args.flags["no-hooks"] === true;
    const noCreate = args.flags["no-create"] === true;
    const outputPath = args.flags["output-path"] === true || args.flags["o"] === true;
    // Default: create branch if it doesn't exist (unless --no-create)
    const createBranch = !noCreate;

    const service = yield* WorktreeService;
    const cwd = process.cwd();

    // First check if worktree already exists
    const existingResult = yield* Effect.either(service.get(cwd, name || branch));
    if (existingResult._tag === "Right") {
      const existing = existingResult.right as WorktreeInfo;
      if (outputPath) {
        // -o flag: output only the path for shell integration
        console.log(existing.path);
      } else {
        console.log(`Worktree '${existing.name}' already exists at ${existing.path}`);
        console.log(`  Branch: ${existing.branch}`);
        console.log();
        console.log(`  cd ${existing.path}`);
      }
      return;
    }

    const createResult = yield* Effect.either(service.create(cwd, {
      branch,
      name,
      linkedIssue,
      skipCopy,
      skipHooks,
      createBranch,
      createdBy: "user",
    }));

    if (createResult._tag === "Left") {
      const e = createResult.left as { _tag?: string; message?: string };
      if (e._tag === "BranchNotFoundError") {
        console.log(`Error: ${e.message}`);
        console.log("Use without --no-create to auto-create the branch.");
      } else if (e._tag === "HookExecutionError") {
        // Hook failed but worktree may have been created
        console.log(`Warning: Post-create hook failed: ${e.message}`);
        return;
      } else {
        console.log(`Error: ${e.message || String(createResult.left)}`);
      }
      process.exit(1);
    }

    const result = createResult.right as WorktreeInfo;

    if (outputPath) {
      // -o flag: output only the path for shell integration
      console.log(result.path);
    } else {
      console.log(`Created worktree '${result.name}' at ${result.path}`);
      console.log(`  Branch: ${result.branch}`);
      if (result.linkedIssue) {
        console.log(`  Linked issue: ${result.linkedIssue}`);
      }
      console.log();
      console.log(`  cd ${result.path}`);
    }
  }).pipe(Effect.provide(WorktreeServiceLive));
