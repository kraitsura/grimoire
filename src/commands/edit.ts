/**
 * Edit Command - Edit prompt name, tags, or content
 *
 * Usage:
 *   grimoire edit <name-or-id>                    # Open content in editor
 *   grimoire edit <name-or-id> --name <new-name>  # Quick rename
 *   grimoire edit <name-or-id> --tags tag1,tag2   # Replace tags
 *   grimoire edit <name-or-id> --add-tag newtag   # Add a tag
 *   grimoire edit <name-or-id> --remove-tag old   # Remove a tag
 */

import { Effect } from "effect";
import { StorageService, EditorService } from "../services";
import type { ParsedArgs } from "../cli/parser";

/**
 * Edit command handler
 *
 * Allows editing prompts via:
 * 1. Full content editing in external editor (default)
 * 2. Quick name change with --name/-n flag
 * 3. Tag replacement with --tags/-t flag
 * 4. Tag addition with --add-tag flag
 * 5. Tag removal with --remove-tag flag
 */
export const editCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const editor = yield* EditorService;

    const nameOrId = args.positional[0];
    if (!nameOrId) {
      console.log("Usage: grimoire edit <name-or-id> [options]");
      return;
    }

    // Try to find prompt by ID first, then by name
    let prompt = yield* storage.getById(nameOrId).pipe(
      Effect.catchTag("PromptNotFoundError", () => storage.getByName(nameOrId))
    );

    const newNameFlag = args.flags["name"] || args.flags["n"];
    const tagsFlag = args.flags["tags"] || args.flags["t"];
    const addTagFlag = args.flags["add-tag"];
    const removeTagFlag = args.flags["remove-tag"];

    // Build update input
    const updateInput: { name?: string; content?: string; tags?: string[] } = {};

    if (typeof newNameFlag === "string") {
      updateInput.name = newNameFlag;
    }

    if (typeof tagsFlag === "string") {
      updateInput.tags = tagsFlag.split(",").map(t => t.trim()).filter(Boolean);
    } else if (addTagFlag || removeTagFlag) {
      let tags = [...(prompt.tags || [])];
      if (typeof addTagFlag === "string") {
        tags.push(addTagFlag);
      }
      if (typeof removeTagFlag === "string") {
        tags = tags.filter(t => t !== removeTagFlag);
      }
      updateInput.tags = tags;
    }

    // If no quick edit flags, open editor for content
    if (!newNameFlag && !tagsFlag && !addTagFlag && !removeTagFlag) {
      const newContent = yield* editor.open(prompt.content, `${prompt.name}.md`);
      updateInput.content = newContent;
    }

    // Update
    const updated = yield* storage.update(prompt.id, updateInput);
    console.log(`Updated prompt: ${updated.name} (v${updated.version})`);
  });
