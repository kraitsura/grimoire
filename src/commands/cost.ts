/**
 * Cost Command - Estimate token costs for prompts
 */

import { Effect } from "effect";
import { TokenCounterService, StorageService } from "../services";
import type { ParsedArgs } from "../cli/parser";

/**
 * Model pricing information (per 1M tokens)
 */
const MODEL_PRICING: Record<
  string,
  { input: number; output: number; contextWindow?: number }
> = {
  "gpt-4o": { input: 2.5, output: 10.0, contextWindow: 128000 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, contextWindow: 128000 },
  "claude-sonnet-4": { input: 3.0, output: 15.0, contextWindow: 200000 },
  "claude-3.5-haiku": { input: 0.8, output: 4.0, contextWindow: 200000 },
  "o1": { input: 15.0, output: 60.0, contextWindow: 200000 },
  "o1-mini": { input: 3.0, output: 12.0, contextWindow: 128000 },
};

/**
 * Default model for cost estimation
 */
const DEFAULT_MODEL = "gpt-4o";

/**
 * Default estimated output tokens
 */
const DEFAULT_OUTPUT_TOKENS = 500;

/**
 * Cost command handler
 *
 * Estimates token costs for a prompt with various models.
 * Supports --model, --all-models, --batch, and --output-tokens flags.
 */
export const costCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const tokenCounter = yield* TokenCounterService;

    const nameOrId = args.positional[0];
    if (!nameOrId) {
      console.log(
        "Usage: grimoire cost <name-or-id> [--model|-m MODEL] [--all-models] [--batch N] [--output-tokens N]"
      );
      return;
    }

    // Parse flags
    const modelFlag = (args.flags["model"] || args.flags["m"]) as
      | string
      | undefined;
    const allModelsFlag = args.flags["all-models"] as boolean | undefined;
    const batchFlag = args.flags["batch"] as string | undefined;
    const outputTokensFlag = args.flags["output-tokens"] as string | undefined;

    const selectedModel = modelFlag || DEFAULT_MODEL;
    const outputTokens = outputTokensFlag
      ? parseInt(outputTokensFlag, 10)
      : DEFAULT_OUTPUT_TOKENS;
    const batchSize = batchFlag ? parseInt(batchFlag, 10) : null;

    // Validate model
    if (!allModelsFlag && !MODEL_PRICING[selectedModel]) {
      console.error(
        `Error: Unknown model '${selectedModel}'. Supported models: ${Object.keys(MODEL_PRICING).join(", ")}`
      );
      return;
    }

    // Find prompt
    const prompt = yield* storage.getById(nameOrId).pipe(
      Effect.catchTag("PromptNotFoundError", () => storage.getByName(nameOrId))
    );

    // Count tokens - use gpt-4o for consistent counting across all models
    const tokenCount = yield* tokenCounter.count(prompt.content, "gpt-4o");

    // Display header
    console.log(`Cost estimate for: ${prompt.name}\n`);
    console.log(`Input tokens: ${formatNumber(tokenCount)}`);

    // Check context window warnings
    if (!allModelsFlag) {
      const contextWindow = MODEL_PRICING[selectedModel].contextWindow;
      if (contextWindow && tokenCount > contextWindow) {
        console.log(
          `\n⚠️  Warning: Prompt exceeds ${selectedModel} context window (${formatNumber(contextWindow)} tokens)`
        );
      }
    }

    console.log();

    // Calculate costs
    if (allModelsFlag) {
      // Show all models
      displayCostTable(
        Object.keys(MODEL_PRICING),
        tokenCount,
        outputTokens,
        MODEL_PRICING
      );

      // Show context window warnings for models that exceed
      const exceededModels = Object.entries(MODEL_PRICING)
        .filter(
          ([, pricing]) =>
            pricing.contextWindow && tokenCount > pricing.contextWindow
        )
        .map(([model]) => model);

      if (exceededModels.length > 0) {
        console.log(
          `\n⚠️  Warning: Prompt exceeds context window for: ${exceededModels.join(", ")}`
        );
      }
    } else {
      // Show single model
      displayCostTable(
        [selectedModel],
        tokenCount,
        outputTokens,
        MODEL_PRICING
      );
    }

    // Show batch estimate if requested
    if (batchSize) {
      console.log();
      const pricing = MODEL_PRICING[selectedModel];
      const costPerRun =
        (tokenCount / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output;
      const batchCost = costPerRun * batchSize;

      console.log(
        `For ${formatNumber(batchSize)} runs with ${selectedModel}: ~${formatCurrency(batchCost)}`
      );
    }
  });

/**
 * Display a formatted cost table
 */
function displayCostTable(
  models: string[],
  inputTokens: number,
  outputTokens: number,
  pricing: Record<string, { input: number; output: number }>
): void {
  // Calculate column widths
  const modelColWidth = Math.max(
    ...models.map((m) => m.length),
    "Model".length
  );
  const costColWidth = 10;

  // Header
  const border = "─";
  const rowSeparator = `┼${border.repeat(modelColWidth + 2)}┼${border.repeat(costColWidth)}┼${border.repeat(costColWidth)}┼${border.repeat(costColWidth)}┤`;

  console.log(
    `┌${border.repeat(modelColWidth + 2)}┬${border.repeat(costColWidth)}┬${border.repeat(costColWidth)}┬${border.repeat(costColWidth)}┐`
  );
  console.log(
    `│ ${"Model".padEnd(modelColWidth)} │ ${"Input".padStart(costColWidth - 2)} │ ${"Output".padStart(costColWidth - 2)} │ ${"Total".padStart(costColWidth - 2)} │`
  );
  console.log(rowSeparator);

  // Rows
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const modelPricing = pricing[model];

    const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
    const outputCost = (outputTokens / 1_000_000) * modelPricing.output;
    const totalCost = inputCost + outputCost;

    console.log(
      `│ ${model.padEnd(modelColWidth)} │ ${formatCurrency(inputCost).padStart(costColWidth - 2)} │ ${formatCurrency(outputCost).padStart(costColWidth - 2)} │ ${formatCurrency(totalCost).padStart(costColWidth - 2)} │`
    );
  }

  console.log(
    `└${border.repeat(modelColWidth + 2)}┴${border.repeat(costColWidth)}┴${border.repeat(costColWidth)}┴${border.repeat(costColWidth)}┘`
  );
}

/**
 * Format a number with thousand separators
 */
function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

/**
 * Format a cost as currency
 */
function formatCurrency(amount: number): string {
  return `$${amount.toFixed(4)}`;
}
