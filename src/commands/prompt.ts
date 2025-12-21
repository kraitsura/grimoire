/**
 * Prompt Command - Unified create/edit prompt workflow
 *
 * Usage:
 *   grimoire <prompt-name>                 # Vim-first: create or edit
 *   grimoire <prompt-name> -c <content>    # Direct content
 *   grimoire <prompt-name> -p              # Paste from clipboard
 *   grimoire <prompt-name> -t tag1,tag2    # With tags
 *   grimoire <prompt-name> -i              # Interactive Ink editor
 *   grimoire <prompt-name> --name <new>    # Rename (edit mode only)
 */

import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { StorageService, EditorService, Clipboard } from "../services";
import { PromptCommandArgsSchema, ValidationError } from "../models";
import type { ParsedArgs } from "../cli/parser";

/**
 * Parse raw CLI args into structured format for the unified prompt command
 */
const parsePromptArgs = (args: ParsedArgs) => {
  const contentFlag = args.flags.content || args.flags.c;
  const tagsFlag = args.flags.tags || args.flags.t;
  const pasteFlag = args.flags.paste || args.flags.p;
  const newNameFlag = args.flags.name || args.flags.n;
  const addTagFlag = args.flags["add-tag"];
  const removeTagFlag = args.flags["remove-tag"];
  const templateFlag = args.flags.template;

  return {
    // The prompt name comes from the command itself (grimoire <name>)
    name: args.command,
    content: typeof contentFlag === "string" ? contentFlag : undefined,
    paste: pasteFlag === true,
    tags:
      typeof tagsFlag === "string"
        ? tagsFlag
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
    newName: typeof newNameFlag === "string" ? newNameFlag : undefined,
    addTags: typeof addTagFlag === "string" ? [addTagFlag] : undefined,
    removeTags: typeof removeTagFlag === "string" ? [removeTagFlag] : undefined,
    template: templateFlag === true,
  };
};

/**
 * Unified prompt command handler
 *
 * - If prompt doesn't exist: creates new prompt
 * - If prompt exists: edits existing prompt
 * - Empty content on new prompt: aborts creation
 */
export const promptCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const editor = yield* EditorService;
    const clipboard = yield* Clipboard;

    const rawArgs = parsePromptArgs(args);

    // Validate arguments with schema
    const validatedArgs = yield* Schema.decodeUnknown(PromptCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire <prompt-name> [-c <content>] [-p] [-t <tags>]`,
        });
      })
    );

    // Validate: can't use both -c and -p
    if (validatedArgs.content !== undefined && validatedArgs.paste) {
      return yield* Effect.fail(
        new ValidationError({
          field: "args",
          message: "Cannot use both --content and --paste flags",
        })
      );
    }

    // Check if prompt exists
    const existingResult = yield* storage
      .getByName(validatedArgs.name)
      .pipe(
        Effect.map((p) => ({ exists: true as const, prompt: p })),
        Effect.catchTag("PromptNotFoundError", () =>
          Effect.succeed({ exists: false as const, prompt: null })
        )
      );

    // Get content from appropriate source
    let content: string | undefined;

    if (validatedArgs.paste) {
      // Paste from clipboard
      content = yield* clipboard.paste;
    } else if (validatedArgs.content !== undefined) {
      // Direct content flag
      content = validatedArgs.content;
    } else {
      // Check if this is a quick edit (only valid for existing prompts)
      const isQuickEdit =
        existingResult.exists &&
        (validatedArgs.newName || validatedArgs.tags || validatedArgs.addTags || validatedArgs.removeTags);

      if (!isQuickEdit) {
        // Open vim for content entry/editing
        const initialContent = existingResult.exists ? existingResult.prompt.content : "";
        content = yield* editor.open(initialContent, `${validatedArgs.name}.md`);
      }
    }

    if (existingResult.exists) {
      // === EDIT MODE ===
      yield* handleEdit(storage, existingResult.prompt, validatedArgs, content);
    } else {
      // === CREATE MODE ===
      yield* handleCreate(storage, validatedArgs, content);
    }
  });

/**
 * Handle creating a new prompt
 */
const handleCreate = (
  storage: Effect.Effect.Success<typeof StorageService>,
  args: {
    name: string;
    tags?: readonly string[];
    template?: boolean;
  },
  content: string | undefined
) =>
  Effect.gen(function* () {
    // Check for empty content (vim save with nothing)
    if (content !== undefined && content.trim() === "") {
      console.log("Prompt not created (empty content)");
      return;
    }

    // Content is required for create
    if (content === undefined) {
      return yield* Effect.fail(
        new ValidationError({
          field: "content",
          message: "Content is required to create a prompt",
        })
      );
    }

    const prompt = yield* storage.create({
      name: args.name,
      content,
      tags: args.tags ? [...args.tags] : undefined,
      isTemplate: args.template,
    });

    console.log(`Created prompt: ${prompt.name} (${prompt.id})`);
  });

/**
 * Handle editing an existing prompt
 */
const handleEdit = (
  storage: Effect.Effect.Success<typeof StorageService>,
  prompt: { id: string; name: string; content: string; tags?: readonly string[] },
  args: {
    newName?: string;
    tags?: readonly string[];
    addTags?: readonly string[];
    removeTags?: readonly string[];
  },
  content: string | undefined
) =>
  Effect.gen(function* () {
    const updateInput: { name?: string; content?: string; tags?: string[] } = {};

    // Handle rename
    if (args.newName) {
      updateInput.name = args.newName;
    }

    // Handle tags
    if (args.tags) {
      updateInput.tags = [...args.tags];
    } else if (args.addTags || args.removeTags) {
      let tags = [...(prompt.tags ?? [])];
      if (args.addTags) {
        tags.push(...args.addTags);
      }
      if (args.removeTags) {
        tags = tags.filter((t) => !args.removeTags?.includes(t));
      }
      updateInput.tags = tags;
    }

    // Handle content update
    if (content !== undefined && content !== prompt.content) {
      updateInput.content = content;
    }

    // Check if there are any actual changes
    const hasChanges =
      (updateInput.name !== undefined && updateInput.name !== prompt.name) ||
      (updateInput.content !== undefined && updateInput.content !== prompt.content) ||
      (updateInput.tags !== undefined &&
        JSON.stringify([...updateInput.tags].sort()) !==
          JSON.stringify([...(prompt.tags ?? [])].sort()));

    if (!hasChanges) {
      console.log(`No changes made to: ${prompt.name}`);
      return;
    }

    const updated = yield* storage.update(prompt.id, updateInput);
    console.log(`Updated prompt: ${updated.name} (v${updated.version})`);
  });
