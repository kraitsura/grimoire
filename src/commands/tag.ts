/**
 * Tag Command - Manage tags on prompts
 */

import { Effect } from "effect";
import { StorageService, TagService } from "../services";
import type { ParsedArgs } from "../cli/parser";

/**
 * Tag command handler
 *
 * Manages tags across prompts with subcommands:
 * - add: Add a tag to a prompt
 * - remove: Remove a tag from a prompt
 * - list: List all tags with usage counts
 * - rename: Rename a tag globally
 */
export const tagCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const tagService = yield* TagService;

    const subcommand = args.positional[0];

    // Handle interactive mode (stubbed for now)
    if (args.flags["interactive"] || args.flags["i"]) {
      console.log("Interactive tag manager is not yet implemented.");
      console.log("Use subcommands instead: add, remove, list, rename");
      return;
    }

    if (!subcommand) {
      console.log("Usage: grimoire tag <subcommand> [args]");
      console.log("");
      console.log("Subcommands:");
      console.log("  add <prompt> <tag>      Add tag to prompt");
      console.log("  remove <prompt> <tag>   Remove tag from prompt");
      console.log("  list                    Show all tags with counts");
      console.log("  rename <old> <new>      Rename tag globally");
      console.log("");
      console.log("Options:");
      console.log("  -i, --interactive       Interactive tag manager (not yet implemented)");
      return;
    }

    // Subcommand: add
    if (subcommand === "add") {
      const promptNameOrId = args.positional[1];
      const tagName = args.positional[2];

      if (!promptNameOrId || !tagName) {
        console.log("Usage: grimoire tag add <prompt> <tag>");
        return;
      }

      // Find prompt by ID or name
      const prompt = yield* storage.getById(promptNameOrId).pipe(
        Effect.catchTag("PromptNotFoundError", () =>
          storage.getByName(promptNameOrId)
        )
      );

      // Add tag to prompt
      yield* tagService.addTag(prompt.id, tagName);

      console.log(`Added tag '${tagName}' to prompt '${prompt.name}'`);
      return;
    }

    // Subcommand: remove
    if (subcommand === "remove") {
      const promptNameOrId = args.positional[1];
      const tagName = args.positional[2];

      if (!promptNameOrId || !tagName) {
        console.log("Usage: grimoire tag remove <prompt> <tag>");
        return;
      }

      // Find prompt by ID or name
      const prompt = yield* storage.getById(promptNameOrId).pipe(
        Effect.catchTag("PromptNotFoundError", () =>
          storage.getByName(promptNameOrId)
        )
      );

      // Remove tag from prompt
      yield* tagService.removeTag(prompt.id, tagName);

      console.log(`Removed tag '${tagName}' from prompt '${prompt.name}'`);
      return;
    }

    // Subcommand: list
    if (subcommand === "list") {
      const tags = yield* tagService.listTags();

      if (tags.length === 0) {
        console.log("No tags found.");
        return;
      }

      // Display table
      console.log("TAG".padEnd(30) + "COUNT");
      console.log("-".repeat(40));

      for (const tag of tags) {
        console.log(tag.name.padEnd(30) + String(tag.count));
      }

      return;
    }

    // Subcommand: rename
    if (subcommand === "rename") {
      const oldName = args.positional[1];
      const newName = args.positional[2];

      if (!oldName || !newName) {
        console.log("Usage: grimoire tag rename <old> <new>");
        return;
      }

      // Rename tag globally
      const affectedCount = yield* tagService.renameTag(oldName, newName);

      console.log(`Renamed tag '${oldName}' to '${newName}'`);
      console.log(`${affectedCount} prompt(s) affected`);
      return;
    }

    // Unknown subcommand
    console.log(`Unknown subcommand: ${subcommand}`);
    console.log("Valid subcommands: add, remove, list, rename");
  });
