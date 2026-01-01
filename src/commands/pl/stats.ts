/**
 * Stats Command - Display usage statistics
 */

import { Effect } from "effect";
import { StatsService, StorageService } from "../../services";
import type { ParsedArgs } from "../../cli/parser";

/**
 * Stats command handler
 *
 * Displays statistics for a specific prompt or for the entire collection.
 * Supports --json for machine-readable output.
 */
export const statsCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const stats = yield* StatsService;
    const storage = yield* StorageService;

    const promptName = args.positional[0];
    const jsonFlag = args.flags.json;

    if (promptName) {
      // Show stats for a specific prompt
      // Find prompt by name
      const prompt = yield* storage.getByName(promptName);

      // Get stats for the prompt
      const promptStats = yield* stats.getPromptStats(prompt.id);

      if (jsonFlag) {
        // JSON output
        console.log(
          JSON.stringify(
            {
              prompt: prompt.name,
              content: {
                characters: promptStats.characterCount,
                words: promptStats.wordCount,
                lines: promptStats.lineCount,
              },
              usage: {
                copies: promptStats.copyCount,
                tests: promptStats.testCount,
                views: promptStats.viewCount,
                edits: promptStats.editCount,
                lastUsed: promptStats.lastUsed?.toISOString() ?? null,
              },
            },
            null,
            2
          )
        );
      } else {
        // Formatted output
        console.log(`Stats for: ${prompt.name}\n`);

        console.log("Content:");
        console.log(`  Characters: ${formatNumber(promptStats.characterCount)}`);
        console.log(`  Words: ${formatNumber(promptStats.wordCount)}`);
        console.log(`  Lines: ${formatNumber(promptStats.lineCount)}`);

        console.log("\nUsage:");
        console.log(`  Copies: ${formatNumber(promptStats.copyCount)}`);
        console.log(`  Tests: ${formatNumber(promptStats.testCount)}`);
        console.log(`  Views: ${formatNumber(promptStats.viewCount)}`);
        console.log(`  Edits: ${formatNumber(promptStats.editCount)}`);

        if (promptStats.lastUsed) {
          console.log(`  Last used: ${formatRelativeDate(promptStats.lastUsed)}`);
        } else {
          console.log(`  Last used: never`);
        }
      }
    } else {
      // Show collection stats
      const collectionStats = yield* stats.getCollectionStats();

      if (jsonFlag) {
        // JSON output
        console.log(
          JSON.stringify(
            {
              collection: {
                prompts: collectionStats.totalPrompts,
                templates: collectionStats.totalTemplates,
              },
              mostUsed: collectionStats.mostUsed,
              tags: collectionStats.tagDistribution,
              recentlyEdited: collectionStats.recentlyEdited.map((item) => ({
                promptId: item.promptId,
                name: item.name,
                editedAt: item.editedAt.toISOString(),
              })),
            },
            null,
            2
          )
        );
      } else {
        // Formatted output
        console.log("Grimoire Statistics\n");

        console.log("Collection:");
        console.log(`  Prompts: ${formatNumber(collectionStats.totalPrompts)}`);
        console.log(`  Templates: ${formatNumber(collectionStats.totalTemplates)}`);

        if (collectionStats.mostUsed.length > 0) {
          console.log("\nMost Used:");
          const displayCount = Math.min(3, collectionStats.mostUsed.length);
          for (let i = 0; i < displayCount; i++) {
            const item = collectionStats.mostUsed[i];
            console.log(
              `  ${i + 1}. ${item.name} (${formatNumber(item.count)} ${item.count === 1 ? "copy" : "copies"})`
            );
          }
        }

        const tagEntries = Object.entries(collectionStats.tagDistribution);
        if (tagEntries.length > 0) {
          console.log("\nTags:");
          // Sort by count descending
          const sortedTags = tagEntries.sort((a, b) => b[1] - a[1]);
          for (const [tag, count] of sortedTags) {
            console.log(`  ${tag}: ${formatNumber(count)} ${count === 1 ? "prompt" : "prompts"}`);
          }
        }

        if (collectionStats.recentlyEdited.length > 0) {
          console.log("\nRecently Edited:");
          const displayCount = Math.min(5, collectionStats.recentlyEdited.length);
          for (let i = 0; i < displayCount; i++) {
            const item = collectionStats.recentlyEdited[i];
            console.log(`  - ${item.name} (${formatRelativeDate(item.editedAt)})`);
          }
        }
      }
    }
  });

/**
 * Format a number with thousand separators
 *
 * Examples:
 * - 1247 -> "1,247"
 * - 42 -> "42"
 */
function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

/**
 * Format a date as a relative time string
 *
 * Examples:
 * - "2 hours ago" (< 1 day)
 * - "yesterday"
 * - "5 days ago"
 * - "2024-01-15" (>= 7 days)
 */
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) return "just now";
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  return date.toISOString().split("T")[0];
}
