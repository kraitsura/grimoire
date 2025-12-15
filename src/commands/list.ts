import { Effect } from "effect";
import { StorageService } from "../services";
import type { ParsedArgs } from "../cli/parser";
import type { Prompt } from "../models";

export const listCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;

    const tagsFlag = args.flags["tags"] || args.flags["t"];
    const searchFlag = args.flags["search"] || args.flags["s"];
    const sortFlag = args.flags["sort"] || "date";
    const limitFlag = args.flags["limit"] || args.flags["n"] || 20;

    let prompts: Prompt[];

    // Get prompts based on filters
    if (typeof searchFlag === "string") {
      prompts = yield* storage.search(searchFlag);
    } else if (typeof tagsFlag === "string") {
      const tags = tagsFlag.split(",").map(t => t.trim()).filter(Boolean);
      prompts = yield* storage.findByTags(tags);
    } else {
      prompts = yield* storage.getAll;
    }

    // Sort
    const sortBy = String(sortFlag);
    if (sortBy === "name") {
      prompts.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Default: date (already sorted by updated desc from getAll)
    }

    // Limit
    const limit = typeof limitFlag === "number" ? limitFlag : parseInt(String(limitFlag), 10) || 20;
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
      const tags = (prompt.tags?.join(", ") || "").slice(0, 22) + ((prompt.tags?.join(", ") || "").length > 22 ? "..." : "");
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
