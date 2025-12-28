/**
 * Enhance Command - AI-powered prompt enhancement
 *
 * Enhances prompts using LLM providers with built-in or custom templates.
 * Supports auto mode, streaming output, and cost estimation.
 */

import { Effect, Stream, pipe } from "effect";
import {
  StorageService,
  EnhancementService,
  TokenCounterService,
} from "../services";
import { BUILTIN_TEMPLATES, getDefaultTemplate } from "../models/enhancement-template";
import type { ParsedArgs } from "../cli/parser";

const USAGE = `Usage: grimoire enhance <prompt-name> [OPTIONS]

MODES:
  -a, --auto              Auto-enhance with defaults (no prompts)
  -i, --interactive       Launch full TUI for template/model selection

SELECTION:
  -t, --template <name>   Template: general|technical|concise|role|format
  -c, --custom <text>     Custom enhancement instruction
  -m, --model <model>     Model to use (e.g., claude-sonnet-4, gpt-4o)

OUTPUT:
  --save-as <name>        Save as new prompt instead of versioning
  --preview               Show result without applying
  --stdout                Output enhanced content to stdout only
  --list-templates        List available enhancement templates

EXAMPLES:
  grimoire enhance my-prompt --auto          # Quick enhance with defaults
  grimoire enhance my-prompt -t concise      # Make prompt more concise
  grimoire enhance my-prompt -c "Add examples"  # Custom enhancement
  grimoire enhance my-prompt --auto --preview   # Preview without saving
`;

/**
 * Parse enhance command arguments
 */
const parseEnhanceArgs = (args: ParsedArgs) => {
  return {
    promptName: args.positional[0],
    auto: !!args.flags.auto || !!args.flags.a,
    interactive: !!args.flags.interactive || !!args.flags.i,
    template: (args.flags.template as string) || (args.flags.t as string),
    custom: (args.flags.custom as string) || (args.flags.c as string),
    model: (args.flags.model as string) || (args.flags.m as string),
    saveAs: args.flags["save-as"] as string | undefined,
    preview: !!args.flags.preview,
    stdout: !!args.flags.stdout,
    listTemplates: !!args.flags["list-templates"],
  };
};

/**
 * Display available templates
 */
const listTemplates = () => {
  console.log("\nAvailable Enhancement Templates:\n");
  console.log("  ID            NAME                   DESCRIPTION");
  console.log("  ─".repeat(35));

  BUILTIN_TEMPLATES.forEach((t, i) => {
    const id = t.type.padEnd(12);
    const name = t.name.padEnd(22);
    console.log(`  ${i + 1}. ${id} ${name} ${t.description}`);
  });

  console.log("\nUsage:");
  console.log("  grimoire enhance my-prompt -t general     # By type");
  console.log("  grimoire enhance my-prompt -t concise     # By type");
  console.log('  grimoire enhance my-prompt -c "custom"    # Custom instruction\n');
};

/**
 * Format cost for display
 */
const formatCost = (cost: number): string => {
  if (cost === 0) return "Unknown";
  if (cost < 0.0001) return "<$0.0001";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
};

/**
 * Enhance command handler
 */
export const enhanceCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const enhancementService = yield* EnhancementService;
    const storage = yield* StorageService;
    const tokenCounter = yield* TokenCounterService;

    const opts = parseEnhanceArgs(args);

    // Handle --list-templates
    if (opts.listTemplates) {
      listTemplates();
      return;
    }

    // Require prompt name
    if (!opts.promptName) {
      console.log(USAGE);
      return;
    }

    // Load prompt
    const prompt = yield* storage
      .getByName(opts.promptName)
      .pipe(
        Effect.catchTag("PromptNotFoundError", () => storage.getById(opts.promptName))
      );

    // If no flags provided, show help (or could default to interactive)
    if (!opts.auto && !opts.interactive && !opts.template && !opts.custom) {
      console.log(USAGE);
      console.log(`Tip: Use --auto for quick enhancement or --interactive for full TUI.\n`);
      return;
    }

    // Build enhancement request
    const request = {
      promptContent: prompt.content,
      template: opts.template,
      customInstruction: opts.custom,
      model: opts.model,
    };

    // Get estimate first
    const estimate = yield* enhancementService.estimate(request).pipe(
      Effect.catchAll((e) => {
        // If estimation fails, continue with defaults
        return Effect.succeed({
          inputTokens: Math.ceil(prompt.content.length / 4),
          estimatedOutputTokens: Math.ceil(prompt.content.length / 4 * 1.5),
          estimatedCost: 0,
          model: opts.model || "default",
          template: getDefaultTemplate(),
          formattedCost: "Unknown",
        });
      })
    );

    // Show header unless stdout mode
    if (!opts.stdout) {
      const border = "─".repeat(60);
      console.log(`\nEnhancing: ${prompt.name}`);
      console.log(`Template: ${estimate.template.name}`);
      console.log(`Model: ${estimate.model}`);
      console.log(`Estimated: ${estimate.inputTokens} input tokens, ~${formatCost(estimate.estimatedCost)}`);
      console.log(`\n${border}\n`);
    }

    const startTime = Date.now();
    let enhancedContent = "";

    // Stream the enhancement
    const responseStream = enhancementService.enhance(request);

    yield* pipe(
      responseStream,
      Stream.runForEach((chunk) =>
        Effect.sync(() => {
          if (!chunk.done && chunk.content) {
            if (opts.stdout) {
              process.stdout.write(chunk.content);
            } else {
              process.stdout.write(chunk.content);
            }
            enhancedContent += chunk.content;
          }
        })
      )
    );

    // Clean up the enhanced content
    enhancedContent = enhancedContent.trim();

    if (!opts.stdout) {
      const border = "─".repeat(60);
      console.log(`\n\n${border}`);

      // Calculate actual stats
      const duration = (Date.now() - startTime) / 1000;
      const outputTokens = yield* tokenCounter
        .count(enhancedContent, estimate.model)
        .pipe(Effect.catchAll(() => Effect.succeed(Math.ceil(enhancedContent.length / 4))));

      const actualCost = yield* tokenCounter
        .estimateCost(estimate.inputTokens, outputTokens, estimate.model)
        .pipe(Effect.catchAll(() => Effect.succeed(0)));

      console.log(`\nTokens: ${estimate.inputTokens} in / ${outputTokens} out`);
      console.log(`Cost: ${formatCost(actualCost)}`);
      console.log(`Time: ${duration.toFixed(1)}s`);
    }

    // Handle output options
    if (opts.preview || opts.stdout) {
      // Preview mode - don't save
      if (!opts.stdout) {
        console.log(`\n[Preview mode - not saved]`);
      }
      return;
    }

    // Save the enhanced prompt
    if (opts.saveAs) {
      // Save as new prompt
      yield* storage.create({
        name: opts.saveAs,
        content: enhancedContent,
        tags: prompt.tags ? [...prompt.tags] : undefined,
      });
      console.log(`\nSaved as new prompt: ${opts.saveAs}`);
    } else {
      // Update existing prompt (auto-versions)
      yield* storage.update(prompt.id, {
        content: enhancedContent,
      });
      console.log(`\nUpdated: ${prompt.name} (version incremented)`);
    }

    console.log("");
  }).pipe(
    Effect.catchTag("PromptNotFoundError", (e) => {
      console.error(`Error: Prompt not found: ${args.positional[0]}`);
      return Effect.void;
    }),
    Effect.catchTag("NoDefaultModelError", (e) => {
      console.error(`\nError: ${e.message}`);
      console.error(`\nRun 'grimoire config llm add <provider>' to configure a provider.`);
      console.error(`Providers: openai, anthropic, google\n`);
      return Effect.void;
    }),
    Effect.catchTag("TemplateNotFoundError", (e) => {
      console.error(`Error: Template not found: ${e.templateId}`);
      listTemplates();
      return Effect.void;
    }),
    Effect.catchAll((e) => {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      return Effect.void;
    })
  );
