/**
 * Versions Command - Manage version history and retention
 *
 * Usage:
 *   grimoire versions cleanup --preview              Preview what would be deleted
 *   grimoire versions cleanup                        Run cleanup based on policy
 *   grimoire versions cleanup <prompt-name>          Clean up specific prompt
 *   grimoire versions tag <prompt-name> <version> <tag>  Tag a version
 *   grimoire versions untag <prompt-name> <version>  Remove tag from version
 *   grimoire versions tags <prompt-name>             List tagged versions
 *   grimoire versions config                         Show retention config
 *   grimoire versions config --set                   Update retention config interactively
 *
 * Subcommands:
 * - cleanup: Clean up old versions based on retention policy
 * - tag: Tag a version to preserve it
 * - untag: Remove tag from a version
 * - tags: List all tagged versions for a prompt
 * - config: Show or update retention configuration
 */

import { Effect } from "effect";
import { StorageService, RetentionService } from "../../services";
import type { ParsedArgs } from "../../cli/parser";

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
  bold: "\x1b[1m",
} as const;

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Format number with color
 */
function formatCount(count: number, color: string): string {
  return `${color}${count}${COLORS.reset}`;
}

/**
 * Cleanup subcommand - preview or run version cleanup
 */
const cleanupSubcommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const retention = yield* RetentionService;

    const promptName = args.positional[1]; // versions cleanup <prompt-name>
    const previewMode = args.flags.preview === true;

    if (previewMode) {
      // Preview mode - show what would be deleted
      console.log(`${COLORS.cyan}${COLORS.bold}Version Cleanup Preview${COLORS.reset}\n`);

      const preview = yield* retention.previewCleanup();

      if (preview.totalVersionsToDelete === 0) {
        console.log(
          `${COLORS.green}No versions to clean up. All versions are within retention policy.${COLORS.reset}`
        );
        return;
      }

      // Show summary
      console.log(
        `Would delete: ${formatCount(preview.totalVersionsToDelete, COLORS.red)} version(s)`
      );
      console.log(`Prompts affected: ${formatCount(preview.promptsAffected, COLORS.yellow)}\n`);

      // Group by prompt
      const byPrompt = new Map<
        string,
        { version: number; createdAt: Date; reason: string }[]
      >();

      for (const v of preview.versionsToDelete) {
        if (!byPrompt.has(v.promptId)) {
          byPrompt.set(v.promptId, []);
        }
        byPrompt.get(v.promptId)!.push({
          version: v.version,
          createdAt: v.createdAt,
          reason: v.reason,
        });
      }

      // Display details
      console.log(`${COLORS.dim}Details:${COLORS.reset}\n`);

      for (const [promptId, versions] of byPrompt) {
        // Get prompt name
        let promptName = promptId;
        try {
          const prompt = yield* storage.getById(promptId);
          promptName = prompt.name;
        } catch {
          // Use ID if name not found
        }

        console.log(`${COLORS.cyan}${promptName}${COLORS.reset}`);
        console.log(`  ${formatCount(versions.length, COLORS.red)} version(s) to delete:\n`);

        versions.sort((a, b) => a.version - b.version);

        for (const v of versions) {
          console.log(`  ${COLORS.red}- v${v.version}${COLORS.reset} (${formatDate(v.createdAt)})`);
          console.log(`    ${COLORS.dim}${v.reason}${COLORS.reset}`);
        }
        console.log();
      }

      console.log(`${COLORS.yellow}Run without --preview to delete these versions${COLORS.reset}`);
    } else if (promptName) {
      // Clean up specific prompt
      const prompt = yield* storage.getByName(promptName);
      const deleted = yield* retention.cleanupVersions(prompt.id);

      if (deleted === 0) {
        console.log(`${COLORS.green}No versions to clean up for: ${promptName}${COLORS.reset}`);
      } else {
        console.log(
          `${COLORS.green}Deleted ${formatCount(deleted, COLORS.red)} version(s) from: ${promptName}${COLORS.reset}`
        );
      }
    } else {
      // Clean up all prompts
      console.log(`${COLORS.cyan}${COLORS.bold}Running Version Cleanup${COLORS.reset}\n`);

      const result = yield* retention.cleanupAll();

      if (result.totalVersionsDeleted === 0) {
        console.log(
          `${COLORS.green}No versions to clean up. All versions are within retention policy.${COLORS.reset}`
        );
      } else {
        console.log(`${COLORS.green}Cleanup complete:${COLORS.reset}`);
        console.log(
          `  Deleted: ${formatCount(result.totalVersionsDeleted, COLORS.red)} version(s)`
        );
        console.log(`  Prompts affected: ${formatCount(result.promptsAffected, COLORS.yellow)}`);
      }
    }
  });

/**
 * Tag subcommand - tag a version to preserve it
 */
const tagSubcommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const retention = yield* RetentionService;

    const promptName = args.positional[1]; // versions tag <prompt-name>
    const versionStr = args.positional[2]; // versions tag <prompt-name> <version>
    const tag = args.positional[3]; // versions tag <prompt-name> <version> <tag>

    if (!promptName || !versionStr || !tag) {
      console.error("Error: Missing arguments");
      console.error("Usage: grimoire versions tag <prompt-name> <version> <tag>");
      return;
    }

    const version = parseInt(versionStr, 10);
    if (isNaN(version)) {
      console.error(`Error: Invalid version number: ${versionStr}`);
      return;
    }

    const prompt = yield* storage.getByName(promptName);
    yield* retention.tagVersion(prompt.id, version, tag);

    console.log(
      `${COLORS.green}Tagged version ${version} of "${promptName}" as "${tag}"${COLORS.reset}`
    );
  });

/**
 * Untag subcommand - remove tag from a version
 */
const untagSubcommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const retention = yield* RetentionService;

    const promptName = args.positional[1]; // versions untag <prompt-name>
    const versionStr = args.positional[2]; // versions untag <prompt-name> <version>

    if (!promptName || !versionStr) {
      console.error("Error: Missing arguments");
      console.error("Usage: grimoire versions untag <prompt-name> <version>");
      return;
    }

    const version = parseInt(versionStr, 10);
    if (isNaN(version)) {
      console.error(`Error: Invalid version number: ${versionStr}`);
      return;
    }

    const prompt = yield* storage.getByName(promptName);
    yield* retention.untagVersion(prompt.id, version);

    console.log(
      `${COLORS.green}Removed tag from version ${version} of "${promptName}"${COLORS.reset}`
    );
  });

/**
 * Tags subcommand - list tagged versions for a prompt
 */
const tagsSubcommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const retention = yield* RetentionService;

    const promptName = args.positional[1]; // versions tags <prompt-name>

    if (!promptName) {
      console.error("Error: Prompt name is required");
      console.error("Usage: grimoire versions tags <prompt-name>");
      return;
    }

    const prompt = yield* storage.getByName(promptName);
    const taggedVersions = yield* retention.getTaggedVersions(prompt.id);

    if (taggedVersions.length === 0) {
      console.log(`No tagged versions for: ${promptName}`);
      return;
    }

    console.log(`${COLORS.cyan}Tagged versions for: ${promptName}${COLORS.reset}\n`);

    for (const tv of taggedVersions) {
      console.log(
        `  ${COLORS.yellow}v${tv.version}${COLORS.reset} - ${COLORS.green}${tv.tag}${COLORS.reset}`
      );
      console.log(`    ${COLORS.dim}${formatDate(tv.createdAt)}${COLORS.reset}`);
    }
  });

/**
 * Config subcommand - show or update retention configuration
 */
const configSubcommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const retention = yield* RetentionService;

    const setMode = args.flags.set === true;

    if (setMode) {
      // Interactive config update
      console.log(`${COLORS.cyan}${COLORS.bold}Update Retention Configuration${COLORS.reset}\n`);

      // Get current config
      const currentConfig = yield* retention.getConfig();

      // For now, just show instructions - full interactive mode would require readline
      console.log(
        `${COLORS.yellow}Note: Interactive config update not yet implemented${COLORS.reset}`
      );
      console.log(
        `${COLORS.dim}Use the API or directly modify the database to update config${COLORS.reset}\n`
      );

      console.log(`Current configuration:`);
      console.log(JSON.stringify(currentConfig, null, 2));

      // Example of how to update (for now users would need to do this programmatically)
      console.log(`\n${COLORS.dim}Example update code:${COLORS.reset}`);
      console.log(`  const newConfig = {`);
      console.log(`    maxVersionsPerPrompt: 100,`);
      console.log(`    retentionDays: 180,`);
      console.log(`    strategy: "both",`);
      console.log(`    preserveTaggedVersions: true`);
      console.log(`  };`);
      console.log(`  await retention.setConfig(newConfig);`);
    } else {
      // Show current config
      const config = yield* retention.getConfig();

      console.log(`${COLORS.cyan}${COLORS.bold}Retention Configuration${COLORS.reset}\n`);

      console.log(
        `${COLORS.dim}Strategy:${COLORS.reset} ${COLORS.yellow}${config.strategy}${COLORS.reset}`
      );
      console.log(
        `${COLORS.dim}Max versions per prompt:${COLORS.reset} ${config.maxVersionsPerPrompt}`
      );
      console.log(`${COLORS.dim}Retention days:${COLORS.reset} ${config.retentionDays}`);
      console.log(
        `${COLORS.dim}Preserve tagged versions:${COLORS.reset} ${config.preserveTaggedVersions ? COLORS.green + "yes" + COLORS.reset : COLORS.red + "no" + COLORS.reset}`
      );

      console.log(`\n${COLORS.dim}Strategy meanings:${COLORS.reset}`);
      console.log(`  ${COLORS.yellow}count${COLORS.reset} - Keep only the last N versions`);
      console.log(`  ${COLORS.yellow}days${COLORS.reset} - Delete versions older than N days`);
      console.log(`  ${COLORS.yellow}both${COLORS.reset} - Delete if either limit is exceeded`);

      console.log(`\n${COLORS.dim}Protected versions:${COLORS.reset}`);
      console.log(`  - Version 1 (initial) is always kept`);
      console.log(`  - HEAD (latest) is always kept`);
      if (config.preserveTaggedVersions) {
        console.log(`  - Tagged versions are preserved`);
      }
    }
  });

/**
 * Versions command implementation
 */
export const versionsCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0]; // versions <subcommand>

    switch (subcommand) {
      case "cleanup":
        yield* cleanupSubcommand(args);
        break;

      case "tag":
        yield* tagSubcommand(args);
        break;

      case "untag":
        yield* untagSubcommand(args);
        break;

      case "tags":
        yield* tagsSubcommand(args);
        break;

      case "config":
        yield* configSubcommand(args);
        break;

      default:
        console.error(`Error: Unknown subcommand: ${subcommand}`);
        console.error(`\nAvailable subcommands:`);
        console.error(`  cleanup   - Clean up old versions`);
        console.error(`  tag       - Tag a version to preserve it`);
        console.error(`  untag     - Remove tag from a version`);
        console.error(`  tags      - List tagged versions`);
        console.error(`  config    - Show/update retention config`);
        console.error(`\nUsage examples:`);
        console.error(`  grimoire versions cleanup --preview`);
        console.error(`  grimoire versions cleanup`);
        console.error(`  grimoire versions cleanup <prompt-name>`);
        console.error(`  grimoire versions tag <prompt-name> <version> <tag>`);
        console.error(`  grimoire versions config`);
        break;
    }
  });
