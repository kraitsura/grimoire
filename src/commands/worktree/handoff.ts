/**
 * grimoire wt handoff - Convenience command for release + notification
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
import type { WorktreeLog, WorktreeLogType } from "../../models/worktree";

export const worktreeHandoff = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const name = args.positional[1];
    const toAgent = args.flags.to as string | undefined;
    const message = (args.flags.message || args.flags.m) as string | undefined;
    const nextStage = args.flags.next as string | undefined;
    const urgent = args.flags.urgent === true;
    const provider = (args.flags.provider as string) || "beads";

    if (!name) {
      console.log("Usage: grimoire wt handoff <name> --to <agent>");
      console.log();
      console.log("Release worktree and notify target agent.");
      console.log();
      console.log("Options:");
      console.log("  --to <agent>        Target agent identity (required)");
      console.log("  --message, -m <msg> Handoff message");
      console.log("  --next <stage>      Pipeline stage (implement, test, review)");
      console.log("  --urgent            Mark as P0 urgent");
      console.log("  --provider <type>   Mail provider: beads (default) or mcp");
      console.log();
      console.log("Examples:");
      console.log("  grimoire wt handoff feature-auth --to agent-2");
      console.log('  grimoire wt handoff feature-auth --to agent-2 -m "Tests passing"');
      console.log("  grimoire wt handoff feature-auth --to agent-2 --next=test --urgent");
      process.exit(1);
    }

    if (!toAgent) {
      console.error("Error: --to <agent> is required");
      process.exit(1);
    }

    const service = yield* WorktreeService;
    const stateService = yield* WorktreeStateService;
    const cwd = process.cwd();

    // Verify worktree exists
    const infoResult = yield* Effect.either(service.get(cwd, name));
    if (infoResult._tag === "Left") {
      console.error(`Error: Worktree '${name}' not found`);
      process.exit(1);
    }

    const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
    const state = yield* stateService.getState(repoRoot);
    const entry = state.worktrees.find((w) => w.name === name);

    if (!entry) {
      console.error(`Error: Worktree '${name}' not in state`);
      process.exit(1);
    }

    const author = (args.flags.author as string) || "human";
    const now = new Date().toISOString();

    // Build handoff message
    const handoffMessage = message || `Handoff to ${toAgent}${nextStage ? ` for ${nextStage}` : ""}`;

    // Create handoff log entry
    const handoffLog: WorktreeLog = {
      time: now,
      message: handoffMessage,
      author,
      type: "handoff" as WorktreeLogType,
      metadata: {
        nextStage,
      },
    };

    const currentLogs = (entry.logs || []) as WorktreeLog[];

    // Build update object
    const updates: Record<string, unknown> = {
      claimedBy: undefined,
      claimedAt: undefined,
      logs: [...currentLogs, handoffLog],
    };

    // Update stage if specified
    if (nextStage && ["plan", "implement", "test", "review"].includes(nextStage)) {
      const stageHistory = entry.stageHistory || [];
      updates.currentStage = nextStage;
      updates.stageHistory = [
        ...stageHistory,
        {
          from: entry.currentStage || "unknown",
          to: nextStage,
          time: now,
          agent: author,
        },
      ];
    }

    // Update state
    yield* stateService.updateWorktree(repoRoot, name, updates as any);

    console.log(`+ Released ${name}`);

    // Send notification via beads mail
    if (provider === "beads") {
      try {
        const priority = urgent ? "p0" : "p2";
        const subject = `[handoff] ${name}${nextStage ? ` -> ${nextStage}` : ""}`;
        const body = [
          `Worktree: ${name}`,
          entry.linkedIssue ? `Issue: ${entry.linkedIssue}` : null,
          nextStage ? `Stage: ${nextStage}` : null,
          message ? `\nMessage: ${message}` : null,
          `\nFrom: ${author}`,
        ]
          .filter(Boolean)
          .join("\n");

        execSync(
          `bd mail send ${toAgent} --subject "${subject}" --priority ${priority} --body "${body.replace(/"/g, '\\"')}"`,
          { stdio: "ignore" }
        );
        console.log(`+ Notified ${toAgent} via beads mail`);
      } catch {
        console.log(`! Could not send mail (beads mail not available)`);
      }
    } else if (provider === "mcp") {
      // MCP mail integration placeholder
      console.log(`! MCP mail provider not yet implemented`);
    }

    // Update beads issue if linked
    if (entry.linkedIssue) {
      try {
        execSync(`bd update ${entry.linkedIssue} --assignee=""`, { stdio: "ignore" });
      } catch {
        // Ignore
      }
    }

    console.log();
    console.log(`Handoff complete:`);
    console.log(`  From: ${author}`);
    console.log(`  To: ${toAgent}`);
    if (nextStage) {
      console.log(`  Stage: ${nextStage}`);
    }
    if (urgent) {
      console.log(`  Priority: URGENT`);
    }
  }).pipe(
    Effect.provide(WorktreeServiceLive),
    Effect.provide(WorktreeStateServiceLive)
  );
