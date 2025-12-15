/**
 * History Command - Display version history for a prompt
 *
 * Usage:
 *   grimoire history <prompt-name>              Show last 10 versions (default)
 *   grimoire history <prompt-name> -n 5         Show last 5 versions
 *   grimoire history <prompt-name> --limit 20   Show last 20 versions
 *   grimoire history <prompt-name> --all        Show all versions
 *   grimoire history <prompt-name> --diff       Include inline diffs
 *   grimoire history <prompt-name> --oneline    Compact single-line format
 *   grimoire history <prompt-name> -i           Interactive mode (stub for now)
 *
 * Output:
 * - Version number with HEAD marker for latest
 * - Creation date/time
 * - Change reason (if provided)
 * - Line additions/deletions count
 * - Optional inline diff with --diff flag
 */

import { Effect } from "effect";
import { StorageService, VersionService } from "../services";
import type { ParsedArgs } from "../cli/parser";
import type { PromptVersion } from "../services/version-service";

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
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Display version in default format
 */
function displayDefaultVersion(
  version: PromptVersion,
  isHead: boolean,
  additions: number,
  deletions: number
): void {
  const headLabel = isHead ? ` ${COLORS.yellow}(HEAD)${COLORS.reset}` : "";
  const versionLabel = `${COLORS.cyan}v${version.version}${COLORS.reset}${headLabel}`;
  const dateStr = COLORS.dim + formatDate(version.createdAt) + COLORS.reset;

  console.log(`${versionLabel} - ${dateStr}`);

  if (version.changeReason) {
    console.log(`  "${version.changeReason}"`);
  }

  if (version.version === 1) {
    console.log(`  Created`);
  } else {
    const addStr = additions > 0 ? `${COLORS.green}+${additions}${COLORS.reset}` : "";
    const delStr = deletions > 0 ? `${COLORS.red}-${deletions}${COLORS.reset}` : "";
    const sep = additions > 0 && deletions > 0 ? " " : "";
    console.log(`  ${addStr}${sep}${delStr} lines`);
  }

  console.log(); // Empty line between versions
}

/**
 * Display version in oneline format
 */
function displayOnelineVersion(
  version: PromptVersion,
  isHead: boolean,
  additions: number,
  deletions: number
): void {
  const headLabel = isHead ? " (HEAD)" : "";
  const reason = version.changeReason ? ` - ${version.changeReason}` : "";
  const changeStr = version.version === 1
    ? " [Created]"
    : ` [+${additions} -${deletions}]`;

  console.log(
    `v${version.version}${headLabel} - ${formatDate(version.createdAt)}${reason}${changeStr}`
  );
}

/**
 * Display diff text with colors
 */
function displayDiff(diffText: string): void {
  const lines = diffText.split("\n");
  for (const line of lines) {
    if (line.startsWith("+")) {
      console.log(COLORS.green + line + COLORS.reset);
    } else if (line.startsWith("-")) {
      console.log(COLORS.red + line + COLORS.reset);
    } else {
      console.log(line);
    }
  }
}

/**
 * History command implementation
 */
export const historyCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const versionService = yield* VersionService;

    // Parse arguments
    const promptName = args.positional[0];
    if (!promptName) {
      console.error("Error: Prompt name is required");
      console.error("Usage: grimoire history <prompt-name> [options]");
      return;
    }

    // Parse flags
    const limitFlag = args.flags["limit"] || args.flags["n"];
    const allFlag = args.flags["all"];
    const diffFlag = args.flags["diff"];
    const onelineFlag = args.flags["oneline"];

    // Determine limit
    const limit = allFlag
      ? undefined
      : typeof limitFlag === "number"
      ? limitFlag
      : typeof limitFlag === "string"
      ? parseInt(limitFlag, 10)
      : 10;

    // Get prompt by name
    const prompt = yield* storage.getByName(promptName);

    // Get version history
    const versions = yield* versionService.listVersions(prompt.id, {
      limit,
      branch: "main", // Default to main branch for now
    });

    if (versions.length === 0) {
      console.log(`No version history found for: ${promptName}`);
      return;
    }

    // Display header
    if (!onelineFlag) {
      console.log(`History for: ${COLORS.cyan}${promptName}${COLORS.reset}`);
      console.log();
    }

    // Display each version
    for (let i = 0; i < versions.length; i++) {
      const version = versions[i];
      const isHead = i === 0; // First version is HEAD

      // Calculate diff stats (compare to previous version)
      let additions = 0;
      let deletions = 0;
      let diffText = "";

      if (version.version > 1) {
        const prevVersion = version.version - 1;
        const diffResult = yield* versionService.diff(
          prompt.id,
          prevVersion,
          version.version
        );
        additions = diffResult.additions;
        deletions = diffResult.deletions;
        diffText = diffResult.changes;
      }

      // Display version info
      if (onelineFlag) {
        displayOnelineVersion(version, isHead, additions, deletions);
      } else {
        displayDefaultVersion(version, isHead, additions, deletions);
      }

      // Display diff if requested
      if (diffFlag && version.version > 1) {
        console.log(`${COLORS.dim}Diff:${COLORS.reset}`);
        displayDiff(diffText);
        console.log();
      }
    }
  });
