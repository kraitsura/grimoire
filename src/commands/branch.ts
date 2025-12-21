/**
 * Branch Command - Manage prompt branches for A/B testing
 *
 * Usage:
 *   grimoire branch <prompt-name> list
 *   grimoire branch <prompt-name> create <branch-name>
 *   grimoire branch <prompt-name> switch <branch-name>
 *   grimoire branch <prompt-name> compare <branch-a> <branch-b>
 *   grimoire branch <prompt-name> merge <source> [target]
 *   grimoire branch <prompt-name> delete <branch-name>
 */

import { Effect } from "effect";
import { StorageService, BranchService, VersionService } from "../services";
import type { ParsedArgs } from "../cli/parser";
import type { Branch } from "../services/branch-service";

/**
 * ANSI color codes
 */
const COLORS = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
  dim: "\x1b[2m",
} as const;

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Display branch list in table format
 */
function displayBranchList(branches: Branch[], activeBranchId: string): void {
  console.log("");
  console.log("BRANCH".padEnd(20) + "HEAD".padEnd(10) + "CREATED");
  console.log("-".repeat(50));

  for (const branch of branches) {
    const marker = branch.id === activeBranchId ? "* " : "  ";
    const name = marker + branch.name;
    const head = branch.createdFromVersion ? `v${branch.createdFromVersion}` : "-";
    const created = formatDate(branch.createdAt);

    console.log(name.padEnd(20) + head.padEnd(10) + created);
  }
  console.log("");
}

/**
 * Branch command handler
 */
export const branchCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const branchService = yield* BranchService;
    const _versionService = yield* VersionService;

    const promptName = args.positional[0];
    const subcommand = args.positional[1];

    if (!promptName || !subcommand) {
      console.log("Usage: grimoire branch <prompt-name> <subcommand> [args]");
      console.log("");
      console.log("Subcommands:");
      console.log("  list                         List all branches");
      console.log("  create <branch-name>         Create new branch from current version");
      console.log("  switch <branch-name>         Switch to a different branch");
      console.log("  compare <branch-a> <branch-b> Show diff between two branches");
      console.log("  merge <source> [target]      Merge source branch into target (default: main)");
      console.log("  delete <branch-name>         Delete a branch");
      return;
    }

    // Get prompt by name
    const prompt = yield* storage.getByName(promptName);

    // Subcommand: list
    if (subcommand === "list") {
      const branches = yield* branchService.listBranches(prompt.id);

      if (branches.length === 0) {
        console.log(`No branches found for: ${promptName}`);
        return;
      }

      // Get active branch
      const activeBranch = yield* branchService.getActiveBranch(prompt.id);

      displayBranchList(branches, activeBranch.id);
      return;
    }

    // Subcommand: create
    if (subcommand === "create") {
      const branchName = args.positional[2];

      if (!branchName) {
        console.log("Usage: grimoire branch <prompt-name> create <branch-name>");
        return;
      }

      const newBranch = yield* branchService.createBranch({
        promptId: prompt.id,
        name: branchName,
      });

      console.log(
        `${COLORS.green}Created branch '${branchName}'${COLORS.reset} from v${newBranch.createdFromVersion}`
      );
      return;
    }

    // Subcommand: switch
    if (subcommand === "switch") {
      const branchName = args.positional[2];

      if (!branchName) {
        console.log("Usage: grimoire branch <prompt-name> switch <branch-name>");
        return;
      }

      const switchedBranch = yield* branchService.switchBranch(prompt.id, branchName);

      console.log(`${COLORS.green}Switched to branch '${switchedBranch.name}'${COLORS.reset}`);
      return;
    }

    // Subcommand: compare
    if (subcommand === "compare") {
      const branchA = args.positional[2];
      const branchB = args.positional[3];

      if (!branchA || !branchB) {
        console.log("Usage: grimoire branch <prompt-name> compare <branch-a> <branch-b>");
        return;
      }

      const comparison = yield* branchService.compareBranches(prompt.id, branchA, branchB);

      console.log("");
      console.log(
        `Comparing ${COLORS.cyan}${branchA}${COLORS.reset} with ${COLORS.cyan}${branchB}${COLORS.reset}`
      );
      console.log("");
      console.log(
        `  ${COLORS.green}${branchA}${COLORS.reset} is ${comparison.ahead} version(s) ahead`
      );
      console.log(
        `  ${COLORS.green}${branchA}${COLORS.reset} is ${comparison.behind} version(s) behind`
      );
      console.log("");

      if (comparison.canMerge) {
        console.log(`  ${COLORS.green}[ok]${COLORS.reset} Can merge`);
      } else {
        console.log(`  ${COLORS.yellow}!${COLORS.reset} May have conflicts`);
      }
      console.log("");
      return;
    }

    // Subcommand: merge
    if (subcommand === "merge") {
      const sourceBranch = args.positional[2];
      const targetBranch = args.positional[3] || "main";

      if (!sourceBranch) {
        console.log("Usage: grimoire branch <prompt-name> merge <source> [target]");
        return;
      }

      // Attempt to merge
      const mergeResult = yield* Effect.either(
        branchService.mergeBranch({
          promptId: prompt.id,
          sourceBranch,
          targetBranch,
        })
      );

      if (mergeResult._tag === "Left") {
        const error = mergeResult.left;

        // Handle MergeConflictError
        if (error._tag === "MergeConflictError") {
          console.log(`${COLORS.red}Merge conflict:${COLORS.reset} ${error.message}`);
          console.log("");
          console.log(`Cannot automatically merge '${sourceBranch}' into '${targetBranch}'.`);
          console.log("Manual conflict resolution is required.");
          return;
        }

        // Re-throw other errors
        yield* Effect.fail(error);
        return;
      }

      const mergedVersion = mergeResult.right;
      console.log(
        `${COLORS.green}Merged '${sourceBranch}' into '${targetBranch}'${COLORS.reset} → v${mergedVersion.version}`
      );
      return;
    }

    // Subcommand: delete
    if (subcommand === "delete") {
      const branchName = args.positional[2];

      if (!branchName) {
        console.log("Usage: grimoire branch <prompt-name> delete <branch-name>");
        return;
      }

      // Attempt to delete
      const deleteResult = yield* Effect.either(branchService.deleteBranch(prompt.id, branchName));

      if (deleteResult._tag === "Left") {
        const error = deleteResult.left;

        // Handle BranchError
        if (error._tag === "BranchError") {
          console.log(`${COLORS.red}Error:${COLORS.reset} ${error.message}`);
          return;
        }

        // Re-throw other errors
        yield* Effect.fail(error);
        return;
      }

      console.log(`${COLORS.green}Deleted branch '${branchName}'${COLORS.reset}`);
      return;
    }

    // Unknown subcommand
    console.log(`Unknown subcommand: ${subcommand}`);
    console.log("Valid subcommands: list, create, switch, compare, merge, delete");
  });
