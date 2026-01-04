/**
 * grimoire wt pr - Create pull request for worktree
 */

import { Effect } from "effect";
import { execSync } from "child_process";
import type { ParsedArgs } from "../../cli/parser";
import {
  WorktreeService,
  WorktreeServiceLive,
  WorktreeStateService,
  WorktreeStateServiceLive,
} from "../../services/worktree";
import { requireDependency, checkDependency } from "../../utils/dependency-check";

/**
 * Get current branch name
 */
function getCurrentBranch(): string {
  return execSync("git branch --show-current", { encoding: "utf8" }).trim();
}

/**
 * Get main branch name (main or master)
 */
function getMainBranch(): string {
  try {
    // Try main first
    execSync("git rev-parse --verify main", { stdio: "ignore" });
    return "main";
  } catch {
    try {
      // Fall back to master
      execSync("git rev-parse --verify master", { stdio: "ignore" });
      return "master";
    } catch {
      return "main"; // Default to main if neither exists
    }
  }
}


/**
 * Fetch beads issue details
 */
function fetchBeadsIssue(issueId: string): { title?: string; description?: string } | null {
  try {
    const output = execSync(`bd show ${issueId} --json`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const data = JSON.parse(output);
    // bd show --json returns an array with a single element
    const issue = Array.isArray(data) ? data[0] : data;
    if (!issue) return null;
    return {
      title: issue.title,
      description: issue.description,
    };
  } catch {
    return null;
  }
}

/**
 * Generate PR body from issue
 */
function generatePrBody(issueId: string, issueTitle?: string, issueDescription?: string): string {
  let body = "";

  if (issueTitle) {
    body += `## ${issueTitle}\n\n`;
  }

  if (issueDescription) {
    body += `${issueDescription}\n\n`;
  }

  body += `Resolves ${issueId}\n`;

  return body;
}

export const worktreePr = (args: ParsedArgs) =>
  Effect.gen(function* () {
    // Check for help flag
    if (args.flags.help || args.flags.h) {
      console.log("Usage: grimoire wt pr [options]");
      console.log();
      console.log("Create a GitHub pull request for the current worktree.");
      console.log();
      console.log("Options:");
      console.log("  --title <title>       PR title (default: from linked issue or branch)");
      console.log("  --base <branch>       Base branch (default: main/master)");
      console.log("  --draft               Create as draft PR");
      console.log("  --body <text>         PR body (default: from linked issue)");
      console.log();
      console.log("Examples:");
      console.log("  grimoire wt pr");
      console.log("  grimoire wt pr --draft");
      console.log("  grimoire wt pr --base develop --title 'Add OAuth support'");
      process.exit(0);
    }

    // Check if gh CLI is installed
    requireDependency("gh", "creating pull requests");

    const service = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const cwd = process.cwd();
    const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

    // Get current branch
    const currentBranch = getCurrentBranch();
    if (!currentBranch) {
      console.error("Error: Not on any branch");
      process.exit(1);
    }

    // Get worktree info
    const worktreeContext = yield* service.getWorktreeContext(cwd);
    let linkedIssue: string | undefined;
    let worktreeName: string | undefined;

    if (worktreeContext) {
      linkedIssue = worktreeContext.linkedIssue;
      worktreeName = worktreeContext.name;
    }

    // Parse flags
    const baseBranch = (args.flags.base as string) || getMainBranch();
    const isDraft = args.flags.draft === true;
    const customTitle = args.flags.title as string | undefined;
    const customBody = args.flags.body as string | undefined;

    // Fetch issue details if available
    let prTitle = customTitle;
    let prBody = customBody;

    if (!prTitle || !prBody) {
      if (linkedIssue && linkedIssue.match(/^[a-z]+-[a-z0-9]+$/i)) {
        // Beads issue format - only fetch if bd is installed
        if (checkDependency("bd", "fetching issue details for PR")) {
          const issueDetails = fetchBeadsIssue(linkedIssue);
          if (issueDetails) {
            if (!prTitle && issueDetails.title) {
              prTitle = issueDetails.title;
            }
            if (!prBody) {
              prBody = generatePrBody(linkedIssue, issueDetails.title, issueDetails.description);
            }
          }
        }
      }
    }

    // Fall back to branch name if no title
    if (!prTitle) {
      prTitle = currentBranch.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    }

    // Fall back to empty body
    if (!prBody) {
      prBody = linkedIssue ? `Resolves ${linkedIssue}` : "";
    }

    console.log("Creating pull request:");
    console.log(`  Title: ${prTitle}`);
    console.log(`  Base: ${baseBranch}`);
    console.log(`  Head: ${currentBranch}`);
    if (isDraft) {
      console.log(`  Draft: yes`);
    }
    if (linkedIssue) {
      console.log(`  Linked issue: ${linkedIssue}`);
    }
    console.log();

    // Push current branch to remote
    console.log("Pushing branch to remote...");
    try {
      execSync(`git push -u origin ${currentBranch}`, {
        stdio: "inherit",
      });
    } catch (error) {
      console.error("Error: Failed to push branch to remote");
      process.exit(1);
    }

    // Build gh pr create command
    const ghCmd = ["gh", "pr", "create"];
    ghCmd.push("--title", prTitle);
    ghCmd.push("--base", baseBranch);
    ghCmd.push("--body", prBody);

    if (isDraft) {
      ghCmd.push("--draft");
    }

    console.log();
    console.log("Creating pull request...");

    try {
      const prUrl = execSync(ghCmd.join(" "), {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "inherit"],
      }).trim();

      console.log();
      console.log("+ Pull request created!");
      console.log(`  ${prUrl}`);

      return;
    } catch (error) {
      console.error();
      console.error("Error: Failed to create pull request");
      console.error("Make sure you have gh CLI authenticated and repository access");
      process.exit(1);
    }
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive)
  );
