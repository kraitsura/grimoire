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
import { Schema } from "@effect/schema";
import { StorageService, EditorService } from "../services";
import { EditCommandArgsSchema, ValidationError } from "../models";
import type { ParsedArgs } from "../cli/parser";

/**
 * Parse raw CLI args into structured format for schema validation
 */
const parseEditArgs = (args: ParsedArgs) => {
  const newNameFlag = args.flags.name || args.flags.n;
  const tagsFlag = args.flags.tags || args.flags.t;
  const addTagFlag = args.flags["add-tag"];
  const removeTagFlag = args.flags["remove-tag"];
  const contentFlag = args.flags.content || args.flags.c;

  return {
    nameOrId: args.positional[0],
    name: typeof newNameFlag === "string" ? newNameFlag : undefined,
    content: typeof contentFlag === "string" ? contentFlag : undefined,
    tags:
      typeof tagsFlag === "string"
        ? tagsFlag
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
    addTags: typeof addTagFlag === "string" ? [addTagFlag] : undefined,
    removeTags: typeof removeTagFlag === "string" ? [removeTagFlag] : undefined,
  };
};

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

    // Validate arguments with schema
    const rawArgs = parseEditArgs(args);
    const validatedArgs = yield* Schema.decodeUnknown(EditCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire edit <name-or-id> [options]`,
        });
      })
    );

    // Try to find prompt by ID first, then by name
    const prompt = yield* storage
      .getById(validatedArgs.nameOrId)
      .pipe(
        Effect.catchTag("PromptNotFoundError", () => storage.getByName(validatedArgs.nameOrId))
      );

    // Build update input
    const updateInput: { name?: string; content?: string; tags?: string[] } = {};

    if (validatedArgs.name) {
      updateInput.name = validatedArgs.name;
    }

    if (validatedArgs.tags) {
      updateInput.tags = [...validatedArgs.tags];
    } else if (validatedArgs.addTags || validatedArgs.removeTags) {
      let tags = [...(prompt.tags ?? [])];
      if (validatedArgs.addTags) {
        tags.push(...validatedArgs.addTags);
      }
      if (validatedArgs.removeTags) {
        tags = tags.filter((t) => !validatedArgs.removeTags?.includes(t));
      }
      updateInput.tags = tags;
    }

    // If no quick edit flags, open editor for content
    if (
      !validatedArgs.name &&
      !validatedArgs.tags &&
      !validatedArgs.addTags &&
      !validatedArgs.removeTags
    ) {
      const newContent = yield* editor.open(prompt.content, `${prompt.name}.md`);
      // Only set content if it actually changed
      if (newContent !== prompt.content) {
        updateInput.content = newContent;
      }
    }

    // Check if there are any actual changes to apply
    const hasChanges =
      (updateInput.name !== undefined && updateInput.name !== prompt.name) ||
      (updateInput.content !== undefined && updateInput.content !== prompt.content) ||
      (updateInput.tags !== undefined &&
        JSON.stringify([...updateInput.tags].sort()) !== JSON.stringify([...(prompt.tags ?? [])].sort()));

    if (!hasChanges) {
      console.log(`No changes made to: ${prompt.name}`);
      return;
    }

    // Update
    const updated = yield* storage.update(prompt.id, updateInput);
    console.log(`Updated prompt: ${updated.name} (v${updated.version})`);
  });
