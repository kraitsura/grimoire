import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { StorageService } from "../services";
import { ListCommandArgsSchema, ValidationError } from "../models";
import type { ParsedArgs } from "../cli/parser";
import type { Prompt } from "../models";

/**
 * Parse raw CLI args into structured format for schema validation
 */
const parseListArgs = (args: ParsedArgs) => {
  const tagsFlag = args.flags.tags || args.flags.t;
  const searchFlag = args.flags.search || args.flags.s;
  const sortFlag = args.flags.sort;
  const limitFlag = args.flags.limit || args.flags.n;

  return {
    tags:
      typeof tagsFlag === "string"
        ? tagsFlag
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
    search: typeof searchFlag === "string" ? searchFlag : undefined,
    sort:
      typeof sortFlag === "string" && ["name", "created", "updated"].includes(sortFlag)
        ? (sortFlag as "name" | "created" | "updated")
        : undefined,
    limit:
      typeof limitFlag === "string"
        ? parseInt(limitFlag, 10)
        : typeof limitFlag === "number"
          ? limitFlag
          : undefined,
  };
};

export const listCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;

    // Validate arguments with schema
    const rawArgs = parseListArgs(args);
    const validatedArgs = yield* Schema.decodeUnknown(ListCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire list [--tags|-t <tags>] [--search|-s <query>] [--sort <name|created|updated>] [--limit|-n <n>]`,
        });
      })
    );

    let prompts: Prompt[];

    // Get prompts based on filters
    if (validatedArgs.search) {
      prompts = yield* storage.search(validatedArgs.search);
    } else if (validatedArgs.tags && validatedArgs.tags.length > 0) {
      prompts = yield* storage.findByTags([...validatedArgs.tags]);
    } else {
      prompts = yield* storage.getAll;
    }

    // Sort
    if (validatedArgs.sort === "name") {
      prompts.sort((a, b) => a.name.localeCompare(b.name));
    }
    // Default: date (already sorted by updated desc from getAll)

    // Limit
    const limit = validatedArgs.limit ?? 20;
    prompts = prompts.slice(0, limit);

    // Display table
    if (prompts.length === 0) {
      console.log("No prompts found.");
      return;
    }

    // Header
    console.log("NAME".padEnd(25) + "TAGS".padEnd(25) + "UPDATED");
    console.log("-".repeat(70));

    // Rows
    for (const prompt of prompts) {
      const name = prompt.name.slice(0, 22) + (prompt.name.length > 22 ? "..." : "");
      const tags =
        (prompt.tags?.join(", ") ?? "").slice(0, 22) +
        ((prompt.tags?.join(", ") ?? "").length > 22 ? "..." : "");
      const updated = formatRelativeDate(prompt.updated);
      console.log(name.padEnd(25) + tags.padEnd(25) + updated);
    }
  });

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
