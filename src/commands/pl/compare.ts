/**
 * Compare Command - A/B test prompts
 */

import { Effect } from "effect";
import { StorageService } from "../../services";
import { LLMService } from "../../services/llm-service";
import { TokenCounterService } from "../../services/token-counter-service";
import type { ParsedArgs } from "../../cli/parser";
import type { LLMResponse } from "../../services/llm-service";

interface ComparisonResult {
  promptName: string;
  response: LLMResponse;
  duration: number;
  cost: number;
}

/**
 * Compare command handler
 *
 * Compares multiple prompts by sending the same request to each (parallel by default).
 * Displays results side-by-side with timing and cost comparison.
 */
export const compareCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const llm = yield* LLMService;
    const tokenCounter = yield* TokenCounterService;

    // Parse arguments
    const promptNames = args.positional;
    if (promptNames.length < 2) {
      console.log(`Usage: grimoire compare <prompt1> <prompt2> [prompt3...]

Compare multiple prompts by sending the same request to each.

OPTIONS:
  -m, --model <model>       Model to use (default: gpt-4o)
  --parallel <bool>         Run in parallel (default: true)
  --format <format>         Output format: table, json, markdown (default: table)
  --vars <json>             Variables as JSON: '{"name": "value"}'
  -i                        Interactive winner selection

EXAMPLES:
  grimoire compare coding-assistant coding-v2
  grimoire compare v1 v2 v3 --model claude-sonnet-4-20250514
  grimoire compare old new --vars '{"task": "review code"}'
  grimoire compare a b --format json
  grimoire compare a b -i
`);
      return;
    }

    // Get options from flags
    const model = (args.flags.model as string) || (args.flags.m as string) || "gpt-4o";
    const parallel = args.flags.parallel !== "false" && args.flags.parallel !== false;
    const format = (args.flags.format as string) || "table";
    const varsJson = args.flags.vars as string | undefined;
    const interactive = args.flags.i === true || args.flags.interactive === true;

    // Parse variables if provided
    let variables: Record<string, string> = {};
    if (varsJson) {
      try {
        variables = JSON.parse(varsJson);
      } catch (error) {
        console.error("Error: Invalid JSON for --vars flag");
        console.error(error instanceof Error ? error.message : String(error));
        return;
      }
    }

    // Load all prompts
    const prompts = yield* Effect.all(
      promptNames.map((name) =>
        storage.getByName(name).pipe(
          Effect.catchTag("PromptNotFoundError", () => storage.getById(name)),
          Effect.map((prompt) => ({ name, prompt }))
        )
      ),
      { concurrency: 5 }
    );

    // Interpolate variables in content for each prompt
    const processedPrompts = prompts.map(({ name, prompt }) => {
      let content = prompt.content;
      for (const [key, value] of Object.entries(variables)) {
        const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
        content = content.replace(pattern, value);
      }
      return { name, content };
    });

    // Display header
    console.log(`\nComparing ${promptNames.length} prompts with ${model}\n`);

    // Run comparisons
    const results: ComparisonResult[] = yield* Effect.all(
      processedPrompts.map(({ name, content }) =>
        Effect.gen(function* () {
          const startTime = Date.now();

          const response = yield* llm.complete({
            model,
            messages: [{ role: "user", content }],
            temperature: 0.7,
            maxTokens: 1024,
          });

          const duration = (Date.now() - startTime) / 1000;
          const cost = yield* tokenCounter.estimateCost(
            response.usage.inputTokens,
            response.usage.outputTokens,
            model
          );

          return {
            promptName: name,
            response,
            duration,
            cost,
          } as ComparisonResult;
        })
      ),
      { concurrency: parallel ? 5 : 1 }
    );

    // Output results based on format
    if (format === "json") {
      console.log(
        JSON.stringify(
          results.map((r) => ({
            prompt: r.promptName,
            content: r.response.content,
            tokens: {
              input: r.response.usage.inputTokens,
              output: r.response.usage.outputTokens,
              total: r.response.usage.inputTokens + r.response.usage.outputTokens,
            },
            duration: r.duration,
            cost: r.cost,
          })),
          null,
          2
        )
      );
    } else if (format === "markdown") {
      // Markdown table format
      console.log("| Prompt | Response | Tokens | Time | Cost |");
      console.log("|--------|----------|--------|------|------|");
      for (const result of results) {
        const preview = result.response.content.substring(0, 50).replace(/\n/g, " ");
        const totalTokens = result.response.usage.inputTokens + result.response.usage.outputTokens;
        console.log(
          `| ${result.promptName} | ${preview}... | ${totalTokens} | ${result.duration.toFixed(1)}s | $${result.cost.toFixed(4)} |`
        );
      }
    } else {
      // Table format (default) - side-by-side comparison
      displaySideBySide(results);
    }

    // Interactive winner selection
    if (interactive) {
      console.log("\n" + "-".repeat(80));
      console.log("Interactive mode: Winner selection");
      console.log("-".repeat(80));
      console.log("\nPrompts compared:");
      results.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.promptName}`);
      });
      console.log("\nNote: Interactive selection not yet fully implemented");
      console.log("Based on metrics, consider:");

      // Simple recommendations
      const lowestCost = results.reduce((min, r) => (r.cost < min.cost ? r : min));
      const fastest = results.reduce((min, r) => (r.duration < min.duration ? r : min));
      const shortestOutput = results.reduce((min, r) =>
        r.response.usage.outputTokens < min.response.usage.outputTokens ? r : min
      );

      console.log(`  - Lowest cost: ${lowestCost.promptName} ($${lowestCost.cost.toFixed(4)})`);
      console.log(`  - Fastest: ${fastest.promptName} (${fastest.duration.toFixed(1)}s)`);
      console.log(
        `  - Most concise: ${shortestOutput.promptName} (${shortestOutput.response.usage.outputTokens} tokens)`
      );
    }
  });

/**
 * Display results in a side-by-side table format
 */
function displaySideBySide(results: ComparisonResult[]): void {
  const columnWidth = 40;
  const _numColumns = results.length;

  // Create header (using ASCII characters for terminal compatibility)
  const headerLine = results
    .map((r) => {
      const name = r.promptName.substring(0, columnWidth - 2);
      return ` ${name.padEnd(columnWidth - 2)} `;
    })
    .join("|");

  const topBorder = results.map(() => "-".repeat(columnWidth)).join("+");
  const midBorder = results.map(() => "-".repeat(columnWidth)).join("+");
  const bottomBorder = results.map(() => "-".repeat(columnWidth)).join("+");

  console.log("+" + topBorder + "+");
  console.log("|" + headerLine + "|");
  console.log("+" + midBorder + "+");

  // Display response content (line by line)
  const maxLines = Math.max(
    ...results.map((r) => {
      const lines = r.response.content.split("\n");
      return Math.min(lines.length, 10); // Limit to 10 lines per response
    })
  );

  const responsesLines = results.map((r) => {
    const lines = r.response.content.split("\n");
    return lines.slice(0, 10).map((line) => {
      // Truncate long lines
      if (line.length > columnWidth - 4) {
        return line.substring(0, columnWidth - 7) + "...";
      }
      return line;
    });
  });

  for (let i = 0; i < maxLines; i++) {
    const line = results
      .map((r, idx) => {
        const text = responsesLines[idx][i] || "";
        return ` ${text.padEnd(columnWidth - 2)} `;
      })
      .join("|");
    console.log("|" + line + "|");
  }

  // Add ellipsis if responses were truncated
  if (results.some((r) => r.response.content.split("\n").length > 10)) {
    const ellipsisLine = results
      .map(() => {
        return " ...".padEnd(columnWidth);
      })
      .join("|");
    console.log("|" + ellipsisLine + "|");
  }

  console.log("|" + " ".repeat(topBorder.length) + "|");

  // Display stats
  const statsLines = [
    results.map((r) => {
      const totalTokens = r.response.usage.inputTokens + r.response.usage.outputTokens;
      return ` Tokens: ${totalTokens} (${r.response.usage.inputTokens} in / ${r.response.usage.outputTokens} out)`.padEnd(
        columnWidth
      );
    }),
    results.map((r) => ` Time: ${r.duration.toFixed(1)}s`.padEnd(columnWidth)),
    results.map((r) => ` Cost: $${r.cost.toFixed(4)}`.padEnd(columnWidth)),
  ];

  for (const statLine of statsLines) {
    const line = statLine.join("|");
    console.log("|" + line + "|");
  }

  console.log("+" + bottomBorder + "+");
}
