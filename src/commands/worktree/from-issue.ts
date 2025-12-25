/**
 * grimoire wt from-issue - Create worktree from issue ID
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
import type { WorktreeLog, IssueProvider } from "../../models/worktree";

/**
 * Get author identifier
 */
function getAuthor(): string {
  return (
    process.env.CLAUDE_SESSION_ID ||
    process.env.GRIMOIRE_SESSION ||
    "human"
  );
}

/**
 * Sanitize string for use as branch/worktree name
 */
function sanitize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/**
 * Detect issue provider from ID format
 */
function detectProvider(issueId: string): IssueProvider {
  if (issueId.startsWith("github:") || issueId.includes("#")) return "github";
  if (issueId.startsWith("linear:") || issueId.match(/^[A-Z]+-\d+$/)) return "linear";
  if (issueId.startsWith("jira:")) return "jira";
  if (issueId.match(/^[a-z]+-[a-z0-9]+$/i)) return "beads"; // bd-xxx, grimoire-xxx
  return "none";
}

/**
 * Fetch beads issue details
 */
function fetchBeadsIssue(issueId: string): { title?: string; priority?: number; status?: string } | null {
  try {
    const output = execSync(`bd show ${issueId} --json`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const data = JSON.parse(output);
    return {
      title: data.title,
      priority: data.priority,
      status: data.status,
    };
  } catch {
    return null;
  }
}

export const worktreeFromIssue = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const issueId = args.positional[1];
    const customName = args.flags["name"] as string | undefined;
    const noClaim = args.flags["no-claim"] === true;

    if (!issueId) {
      console.log("Usage: grimoire wt from-issue <issue-id>");
      console.log();
      console.log("Create a worktree linked to an issue.");
      console.log();
      console.log("Options:");
      console.log("  --name <name>   Custom worktree name");
      console.log("  --no-claim      Don't auto-claim the worktree");
      console.log();
      console.log("Examples:");
      console.log("  grimoire wt from-issue grimoire-123");
      console.log("  grimoire wt from-issue grimoire-123 --name oauth-impl");
      console.log("  grimoire wt from-issue github:owner/repo#456");
      process.exit(1);
    }

    const service = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const cwd = process.cwd();
    const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

    // Detect provider
    const provider = detectProvider(issueId);
    console.log(`Issue: ${issueId} (${provider})`);

    // Try to fetch issue details
    let issueTitle: string | undefined;
    let issuePriority: number | undefined;

    if (provider === "beads") {
      const details = fetchBeadsIssue(issueId);
      if (details) {
        issueTitle = details.title;
        issuePriority = details.priority;
        console.log(`  Title: ${issueTitle}`);
        if (issuePriority !== undefined) {
          console.log(`  Priority: P${issuePriority}`);
        }
      }
    }

    // Generate worktree name
    const worktreeName = customName || (issueTitle
      ? `${issueId}-${sanitize(issueTitle)}`
      : issueId);

    // Generate branch name
    const branchName = worktreeName;

    console.log();
    console.log(`Creating worktree: ${worktreeName}`);
    console.log(`  Branch: ${branchName}`);

    // Check if worktree already exists
    const existingResult = yield* Effect.either(service.get(cwd, worktreeName));
    if (existingResult._tag === "Right") {
      console.error(`Error: Worktree '${worktreeName}' already exists`);
      process.exit(1);
    }

    // Create the worktree
    const createResult = yield* Effect.either(
      service.create(cwd, {
        branch: branchName,
        name: worktreeName,
        linkedIssue: issueId,
        createBranch: true,
        createdBy: "agent",
        sessionId: getAuthor(),
      })
    );

    if (createResult._tag === "Left") {
      const e = createResult.left as { message?: string };
      console.error(`Error: ${e.message || "Failed to create worktree"}`);
      process.exit(1);
    }

    const info = createResult.right;
    const author = getAuthor();
    const now = new Date().toISOString();

    // Update state with provider and claim info
    const updates: Record<string, unknown> = {
      issueProvider: provider,
    };

    const logs: WorktreeLog[] = [
      {
        time: now,
        message: `Created from issue ${issueId}`,
        author,
        type: "log",
      },
    ];

    if (!noClaim) {
      updates.claimedBy = author;
      updates.claimedAt = now;
      logs.push({
        time: now,
        message: `Claimed by ${author}`,
        author,
        type: "log",
      });
    }

    updates.logs = logs;

    yield* stateService.updateWorktree(repoRoot, worktreeName, updates as any);

    console.log();
    console.log(`✓ Created worktree: ${worktreeName}`);
    console.log(`  Path: ${info.path}`);
    console.log(`  Issue: ${issueId}`);
    if (!noClaim) {
      console.log(`  Claimed: yes`);
    }

    // Update beads issue status if available
    if (provider === "beads" && !noClaim) {
      try {
        execSync(`bd update ${issueId} --status=in_progress`, { stdio: "ignore" });
        console.log(`  Updated issue status: in_progress`);
      } catch {
        // Beads not available - ignore
      }
    }

    // Print next steps
    console.log();
    console.log("Next steps:");
    console.log(`  cd ${info.path}`);
    console.log(`  # or: grimoire wt exec ${worktreeName} <command>`);
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive)
  );
