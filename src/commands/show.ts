/**
 * Show Command - Display prompt with metadata
 */

import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { StorageService } from "../services";
import { ShowCommandArgsSchema, ValidationError } from "../models";
import type { ParsedArgs } from "../cli/parser";

/**
 * Parse raw CLI args into structured format for schema validation
 */
const parseShowArgs = (args: ParsedArgs) => ({
  nameOrId: args.positional[0],
  raw: args.flags.raw === true || args.flags.r === true,
  json: args.flags.json === true,
});

/**
 * Show command handler
 *
 * Displays a prompt by name or ID with formatted metadata.
 * Supports --raw for content only and --json for machine-readable output.
 */
export const showCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;

    // Validate arguments with schema
    const rawArgs = parseShowArgs(args);
    const validatedArgs = yield* Schema.decodeUnknown(ShowCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire show <name-or-id> [--raw|-r] [--json]`,
        });
      })
    );

    // Find prompt - try by ID first, then fall back to name
    const prompt = yield* storage
      .getById(validatedArgs.nameOrId)
      .pipe(
        Effect.catchTag("PromptNotFoundError", () => storage.getByName(validatedArgs.nameOrId))
      );

    const rawFlag = validatedArgs.raw;
    const jsonFlag = validatedArgs.json;

    if (jsonFlag) {
      // JSON output for scripting
      console.log(
        JSON.stringify(
          {
            id: prompt.id,
            name: prompt.name,
            tags: prompt.tags ?? [],
            content: prompt.content,
            created: prompt.created.toISOString(),
            updated: prompt.updated.toISOString(),
            version: prompt.version,
            isTemplate: prompt.isTemplate ?? false,
          },
          null,
          2
        )
      );
    } else if (rawFlag) {
      // Raw content only (no metadata)
      console.log(prompt.content);
    } else {
      // Formatted display with metadata
      const border = "─".repeat(50);
      console.log(`╭${border}╮`);
      console.log(`│ ${prompt.name.padEnd(48)} │`);
      console.log(`├${border}┤`);
      console.log(`│ ID: ${prompt.id.slice(0, 42).padEnd(43)} │`);
      console.log(`│ Tags: ${(prompt.tags?.join(", ") ?? "none").slice(0, 40).padEnd(41)} │`);
      console.log(`│ Created: ${prompt.created.toISOString().split("T")[0].padEnd(38)} │`);
      console.log(`│ Updated: ${formatRelativeDate(prompt.updated).padEnd(38)} │`);
      console.log(`│ Version: ${String(prompt.version ?? 1).padEnd(38)} │`);
      console.log(`├${border}┤`);

      // Content (with line wrapping at 48 characters)
      const contentLines = prompt.content.split("\n");
      for (const line of contentLines) {
        // Wrap long lines
        const chunks = [];
        let remaining = line;
        while (remaining.length > 48) {
          chunks.push(remaining.slice(0, 48));
          remaining = remaining.slice(48);
        }
        chunks.push(remaining);
        for (const chunk of chunks) {
          console.log(`│ ${chunk.padEnd(48)} │`);
        }
      }

      console.log(`╰${border}╯`);
    }
  });

/**
 * Format a date as a relative time string
 *
 * Examples:
 * - "just now" (< 1 hour)
 * - "3 hours ago"
 * - "yesterday"
 * - "5 days ago"
 * - "2024-01-15" (>= 7 days)
 */
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  return date.toISOString().split("T")[0];
}
