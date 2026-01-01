/**
 * Archive Command - Archive, restore, and purge prompts
 *
 * Usage:
 *   grimoire archive add <name...>
 *   grimoire archive list
 *   grimoire archive restore <name...>
 *   grimoire archive purge [--older-than 30d] [--yes]
 */

import { Effect } from "effect";
import { ArchiveService } from "../../services/archive-service";
import type { ParsedArgs } from "../../cli/parser";

/**
 * Format relative date for display
 */
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return date.toISOString().split("T")[0];
}

/**
 * Parse --older-than flag (e.g., "30d" = 30 days)
 * Returns a Date threshold
 */
function parseOlderThan(value: string | boolean): Date | null {
  if (typeof value !== "string") return null;

  const match = /^(\d+)([dwmy])$/.exec(value);
  if (!match) {
    console.log(`Invalid --older-than format: ${value}`);
    console.log('Expected format: <number><unit> (e.g., "30d", "2w", "3m", "1y")');
    return null;
  }

  const [, num, unit] = match;
  const amount = parseInt(num, 10);
  const now = new Date();

  switch (unit) {
    case "d": // days
      now.setDate(now.getDate() - amount);
      break;
    case "w": // weeks
      now.setDate(now.getDate() - amount * 7);
      break;
    case "m": // months
      now.setMonth(now.getMonth() - amount);
      break;
    case "y": // years
      now.setFullYear(now.getFullYear() - amount);
      break;
  }

  return now;
}

/**
 * Prompt for yes/no confirmation
 */
function confirmAction(message: string): boolean {
  // In a real CLI, we'd use readline or a similar library
  // For now, we'll just return false to require --yes flag
  console.log(message);
  console.log("Use --yes flag to confirm this action.");
  return false;
}

/**
 * Archive command - add subcommand
 * Archive prompts (soft delete)
 */
const archiveAddCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const archive = yield* ArchiveService;

    const promptNames = args.positional.slice(1); // Skip "add" subcommand
    if (promptNames.length === 0) {
      console.log("Usage: grimoire archive add <name...>");
      return;
    }

    // Archive prompts
    const _count = yield* archive.archive(promptNames);

    // Print confirmation for each
    for (const name of promptNames) {
      console.log(`Archived: ${name}`);
    }
  });

/**
 * Archive command - list subcommand
 * Show archived prompts
 */
const archiveListCommand = (_args: ParsedArgs) =>
  Effect.gen(function* () {
    const archive = yield* ArchiveService;

    const archived = yield* archive.list();

    if (archived.length === 0) {
      console.log("No archived prompts.");
      return;
    }

    // Display table
    console.log("NAME".padEnd(30) + "ARCHIVED");
    console.log("-".repeat(50));

    for (const prompt of archived) {
      const name = prompt.name.slice(0, 27) + (prompt.name.length > 27 ? "..." : "");
      const archivedDate = formatRelativeDate(prompt.archivedAt);
      console.log(name.padEnd(30) + archivedDate);
    }
  });

/**
 * Archive command - restore subcommand
 * Restore from archive
 */
const archiveRestoreCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const archive = yield* ArchiveService;

    const promptNames = args.positional.slice(1); // Skip "restore" subcommand
    if (promptNames.length === 0) {
      console.log("Usage: grimoire archive restore <name...>");
      return;
    }

    // Restore prompts
    const _count = yield* archive.restore(promptNames);

    // Print confirmation for each
    for (const name of promptNames) {
      console.log(`Restored: ${name}`);
    }
  });

/**
 * Archive command - purge subcommand
 * Permanently delete old archives
 */
const archivePurgeCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const archive = yield* ArchiveService;

    // Parse --older-than flag
    const olderThanFlag = args.flags["older-than"];
    let olderThan: Date | undefined;

    if (olderThanFlag) {
      const parsed = parseOlderThan(olderThanFlag);
      if (!parsed) {
        return; // Error already printed in parseOlderThan
      }
      olderThan = parsed;
    }

    // Check for --yes flag
    const yesFlag = args.flags.yes || args.flags.y;

    // Require confirmation unless --yes
    if (!yesFlag) {
      const message = olderThan
        ? `This will permanently delete all prompts archived before ${olderThan.toISOString().split("T")[0]}.`
        : "This will permanently delete ALL archived prompts.";

      const confirmed = confirmAction(message);
      if (!confirmed) {
        console.log("Purge cancelled.");
        return;
      }
    }

    // Purge archives
    const count = yield* archive.purge(olderThan);

    console.log(`Purged ${count} archived prompt${count !== 1 ? "s" : ""}.`);
  });

/**
 * Archive command - main entry point
 */
export const archiveCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0];

    switch (subcommand) {
      case "add":
        yield* archiveAddCommand(args);
        break;

      case "list":
        yield* archiveListCommand(args);
        break;

      case "restore":
        yield* archiveRestoreCommand(args);
        break;

      case "purge":
        yield* archivePurgeCommand(args);
        break;

      default:
        console.log("Usage:");
        console.log("  grimoire archive add <name...>");
        console.log("  grimoire archive list");
        console.log("  grimoire archive restore <name...>");
        console.log("  grimoire archive purge [--older-than 30d] [--yes]");
        break;
    }
  });
