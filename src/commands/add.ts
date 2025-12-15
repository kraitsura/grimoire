/**
 * Add Command - Create new prompts
 */

import { Effect } from "effect";
import { StorageService, EditorService } from "../services";
import type { ParsedArgs } from "../cli/parser";

export const addCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const editor = yield* EditorService;

    const name = args.positional[0];
    const contentFlag = args.flags["content"] || args.flags["c"];
    const tagsFlag = args.flags["tags"] || args.flags["t"];

    // Validate name is provided
    if (!name || typeof name !== "string") {
      console.log("Usage: grimoire add <name> [--content|-c <content>] [--tags|-t <tags>]");
      return;
    }

    // Get content
    let content: string;
    if (typeof contentFlag === "string") {
      content = contentFlag;
    } else {
      // Open editor for content entry
      content = yield* editor.open("", `${name}.md`);
    }

    // Parse tags
    const tags = typeof tagsFlag === "string"
      ? tagsFlag.split(",").map(t => t.trim()).filter(Boolean)
      : undefined;

    // Create prompt
    const prompt = yield* storage.create({
      name,
      content,
      tags,
    });

    console.log(`Created prompt: ${prompt.name} (${prompt.id})`);
  });
