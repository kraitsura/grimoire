/**
 * Sync Command - Git-based remote synchronization
 */

import { Effect } from "effect";
import { RemoteSyncService } from "../services";
import type { ParsedArgs } from "../cli/parser";

/**
 * Helper to format relative time
 */
function _formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} months ago`;

  return `${Math.floor(months / 12)} years ago`;
}

/**
 * Prompt for user input
 */
function prompt(message: string): Effect.Effect<string, never> {
  return Effect.promise(() => {
    return new Promise((resolve) => {
      process.stdout.write(message);
      process.stdin.once("data", (data) => {
        resolve(data.toString().trim());
      });
    });
  });
}

/**
 * Sync command handler
 *
 * Manages git-based synchronization with remote repositories.
 * Supports push, pull, status checking, and initial setup.
 */
export const syncCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const syncService = yield* RemoteSyncService;

    const statusFlag = args.flags.status;
    const setupFlag = args.flags.setup;
    const pushFlag = args.flags.push;
    const pullFlag = args.flags.pull;

    // --setup: Configure remote sync
    if (setupFlag) {
      console.log("\nConfiguring git sync...\n");

      const remoteUrl = yield* prompt("Enter remote URL: ");

      if (!remoteUrl) {
        console.log("Error: Remote URL is required");
        process.exit(1);
      }

      yield* syncService
        .configure({
          provider: "git",
          remote: remoteUrl,
          branch: "main",
        })
        .pipe(
          Effect.catchAll((error) =>
            Effect.sync(() => {
              console.log(`\nError: ${error.message}`);
              process.exit(1);
            })
          )
        );

      console.log("\nSync configured successfully!");
      console.log(`Remote: ${remoteUrl}`);
      console.log(`Branch: main\n`);
      return;
    }

    // --status: Show sync status
    if (statusFlag) {
      const status = yield* syncService.getStatus().pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            console.log(`Error: ${error.message}`);
            process.exit(1);
          })
        )
      );

      if (!status.isConfigured) {
        console.log("\nSync not configured. Run: grimoire sync --setup\n");
        return;
      }

      console.log("\nSync Status\n");
      console.log(`Remote: ${status.remote} (${status.branch})`);

      // Show local/remote status
      if (status.ahead > 0) {
        console.log(`Local ahead: ${status.ahead} commit${status.ahead > 1 ? "s" : ""}`);
      }
      if (status.behind > 0) {
        console.log(`Remote ahead: ${status.behind} commit${status.behind > 1 ? "s" : ""}`);
      }

      if (status.ahead === 0 && status.behind === 0) {
        console.log("Status: Up to date");
      }

      if (status.hasConflicts) {
        console.log("\nWarning: Conflicts detected. Resolve them before syncing.");
      } else if (status.ahead > 0 || status.behind > 0) {
        console.log("\nRun 'grimoire sync' to synchronize.");
      }

      console.log();
      return;
    }

    // --push: Force push
    if (pushFlag) {
      console.log("\nPushing changes...");

      const result = yield* syncService.push().pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            if (error.message.includes("not configured")) {
              console.log("\nSync not configured. Run: grimoire sync --setup\n");
            } else {
              console.log(`\nError: ${error.message}\n`);
            }
            process.exit(1);
          })
        )
      );

      if (result.filesChanged === 0) {
        console.log("No changes to push.\n");
      } else {
        console.log(
          `Pushed ${result.filesChanged} file${result.filesChanged > 1 ? "s" : ""} to remote.\n`
        );
      }
      return;
    }

    // --pull: Force pull
    if (pullFlag) {
      console.log("\nPulling changes...");

      const result = yield* syncService.pull().pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            if (error.message.includes("not configured")) {
              console.log("\nSync not configured. Run: grimoire sync --setup\n");
            } else {
              console.log(`\nError: ${error.message}\n`);
            }
            process.exit(1);
          })
        )
      );

      if (result.conflicts.length > 0) {
        console.log("\nConflicts detected in the following files:");
        for (const file of result.conflicts) {
          console.log(`  - ${file}`);
        }
        console.log("\nResolve conflicts manually and run 'grimoire sync --push'.\n");
        process.exit(1);
      }

      if (result.filesChanged === 0) {
        console.log("No changes to pull.\n");
      } else {
        console.log(
          `Pulled ${result.filesChanged} file${result.filesChanged > 1 ? "s" : ""} from remote.\n`
        );
      }
      return;
    }

    // Default: Auto-detect based on status
    const status = yield* syncService.getStatus().pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          console.log(`Error: ${error.message}`);
          process.exit(1);
        })
      )
    );

    if (!status.isConfigured) {
      console.log("\nSync not configured. Run: grimoire sync --setup\n");
      return;
    }

    // Check for conflicts first
    if (status.hasConflicts) {
      console.log("\nConflicts detected. Resolve them before syncing.\n");
      process.exit(1);
    }

    // Both ahead and behind - warn about potential conflicts
    if (status.ahead > 0 && status.behind > 0) {
      console.log("\nBoth local and remote have changes.");
      console.log("This may cause conflicts. Recommended actions:");
      console.log("  1. Run 'grimoire sync --pull' to merge remote changes");
      console.log("  2. Resolve any conflicts");
      console.log("  3. Run 'grimoire sync --push' to push your changes\n");
      return;
    }

    // Only local changes - push
    if (status.ahead > 0) {
      console.log("\nPushing local changes...");

      const result = yield* syncService.push().pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            console.log(`\nError: ${error.message}\n`);
            process.exit(1);
          })
        )
      );

      if (result.filesChanged === 0) {
        console.log("No changes to push.\n");
      } else {
        console.log(
          `Pushed ${result.filesChanged} file${result.filesChanged > 1 ? "s" : ""} to remote.\n`
        );
      }
      return;
    }

    // Only remote changes - pull
    if (status.behind > 0) {
      console.log("\nPulling remote changes...");

      const result = yield* syncService.pull().pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            console.log(`\nError: ${error.message}\n`);
            process.exit(1);
          })
        )
      );

      if (result.conflicts.length > 0) {
        console.log("\nConflicts detected in the following files:");
        for (const file of result.conflicts) {
          console.log(`  - ${file}`);
        }
        console.log("\nResolve conflicts manually and run 'grimoire sync --push'.\n");
        process.exit(1);
      }

      if (result.filesChanged === 0) {
        console.log("No changes to pull.\n");
      } else {
        console.log(
          `Pulled ${result.filesChanged} file${result.filesChanged > 1 ? "s" : ""} from remote.\n`
        );
      }
      return;
    }

    // No changes in either direction
    console.log("\nAlready up to date.\n");
  });
