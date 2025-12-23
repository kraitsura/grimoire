/**
 * grimoire wt new - Create a new worktree
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { WorktreeService, WorktreeServiceLive } from "../../services/worktree";
import type { WorktreeInfo } from "../../models/worktree";

export const worktreeNew = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const branch = args.positional[1];
    if (!branch) {
      console.log("Usage: grimoire wt new <branch> [options]");
      console.log();
      console.log("Options:");
      console.log("  --name, -n <name>     Custom directory name");
      console.log("  --issue, -i <id>      Link to beads issue");
      console.log("  --no-copy             Skip copying config files");
      console.log("  --no-hooks            Skip running post-create hooks");
      console.log("  -b                    Create new branch if doesn't exist");
      process.exit(1);
    }

    const name = (args.flags["name"] as string) || (args.flags["n"] as string);
    const linkedIssue = (args.flags["issue"] as string) || (args.flags["i"] as string);
    const skipCopy = args.flags["no-copy"] === true;
    const skipHooks = args.flags["no-hooks"] === true;
    const createBranch = args.flags["b"] === true;

    const service = yield* WorktreeService;
    const cwd = process.cwd();

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
        console.log("Use -b to create a new branch.");
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

    console.log(`Created worktree '${result.name}' at ${result.path}`);
    console.log(`  Branch: ${result.branch}`);
    if (result.linkedIssue) {
      console.log(`  Linked issue: ${result.linkedIssue}`);
    }
    console.log();
    console.log(`  cd ${result.path}`);
  }).pipe(Effect.provide(WorktreeServiceLive));
