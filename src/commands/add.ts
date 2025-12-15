/**
 * Add Command - Create new prompts
 */

import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { StorageService, EditorService } from "../services";
import { AddCommandArgsSchema, ValidationError } from "../models";
import type { ParsedArgs } from "../cli/parser";

/**
 * Parse raw CLI args into structured format for schema validation
 */
const parseAddArgs = (args: ParsedArgs) => {
  const contentFlag = args.flags.content || args.flags.c;
  const tagsFlag = args.flags.tags || args.flags.t;

  return {
    name: args.positional[0],
    content: typeof contentFlag === "string" ? contentFlag : undefined,
    tags:
      typeof tagsFlag === "string"
        ? tagsFlag
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
    template: args.flags.template === true,
  };
};

export const addCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const editor = yield* EditorService;

    // Validate arguments with schema
    const rawArgs = parseAddArgs(args);
    const validatedArgs = yield* Schema.decodeUnknown(AddCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        // Extract field and message from schema error
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire add <name> [--content|-c <content>] [--tags|-t <tags>]`,
        });
      })
    );

    // Get content - from flag or open editor
    let content: string;
    if (validatedArgs.content) {
      content = validatedArgs.content;
    } else {
      // Open editor for content entry
      content = yield* editor.open("", `${validatedArgs.name}.md`);
    }

    // Create prompt
    const prompt = yield* storage.create({
      name: validatedArgs.name,
      content,
      tags: validatedArgs.tags ? [...validatedArgs.tags] : undefined,
      isTemplate: validatedArgs.template,
    });

    console.log(`Created prompt: ${prompt.name} (${prompt.id})`);
  });
