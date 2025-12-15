/**
 * Test Command - Test prompts with LLMs
 */

import { Effect, Stream, pipe } from "effect";
import { StorageService } from "../services";
import { LLMService } from "../services/llm-service";
import { TokenCounterService } from "../services/token-counter-service";
import type { ParsedArgs } from "../cli/parser";

/**
 * Test command handler
 *
 * Tests a prompt with an LLM provider, streaming the output to the terminal.
 * Supports variable interpolation and displays usage statistics at the end.
 */
export const testCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const llm = yield* LLMService;
    const tokenCounter = yield* TokenCounterService;

    // Parse arguments
    const promptName = args.positional[0];
    if (!promptName) {
      console.log(`Usage: grimoire test <prompt-name> [OPTIONS]

OPTIONS:
  -m, --model <model>       Model to use (default: gpt-4o)
  -p, --provider <provider> Provider: openai, anthropic, ollama
  --temperature <temp>      Temperature 0-2 (default: 0.7)
  --max-tokens <tokens>     Max output tokens (default: 1024)
  --vars <json>             Variables as JSON: '{"name": "value"}'
  --no-stream               Disable streaming output
  --save                    Save result to prompt history
  -i                        Interactive mode

EXAMPLES:
  grimoire test coding-assistant
  grimoire test my-prompt --model claude-sonnet-4-20250514
  grimoire test template --vars '{"name": "John", "task": "review"}'
`);
      return;
    }

    // Get options from flags
    const model = (args.flags["model"] as string) || (args.flags["m"] as string) || "gpt-4o";
    const temperature = parseFloat((args.flags["temperature"] as string) || "0.7");
    const maxTokens = parseInt((args.flags["max-tokens"] as string) || "1024", 10);
    const noStream = args.flags["no-stream"] === true;
    const varsJson = args.flags["vars"] as string | undefined;

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

    // Load prompt from storage
    const prompt = yield* storage.getByName(promptName).pipe(
      Effect.catchTag("PromptNotFoundError", () =>
        storage.getById(promptName)
      )
    );

    // Interpolate variables in content
    let content = prompt.content;
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
      content = content.replace(pattern, value);
    }

    // Display header
    const border = "─".repeat(60);
    console.log(`\nTesting: ${prompt.name}`);
    console.log(`Model: ${model} | Temperature: ${temperature}`);
    console.log(`\n${border}`);

    const startTime = Date.now();
    let fullResponse = "";

    if (noStream) {
      // Non-streaming mode
      const response = yield* llm.complete({
        model,
        messages: [{ role: "user", content }],
        temperature,
        maxTokens,
      });

      console.log(response.content);
      console.log(border);

      fullResponse = response.content;

      // Display stats
      const duration = (Date.now() - startTime) / 1000;
      const cost = yield* tokenCounter.estimateCost(
        response.usage.inputTokens,
        response.usage.outputTokens,
        model
      );

      console.log(`\nTokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
      console.log(`Cost: $${cost.toFixed(4)}`);
      console.log(`Time: ${duration.toFixed(1)}s\n`);
    } else {
      // Streaming mode
      const responseStream = llm.stream({
        model,
        messages: [{ role: "user", content }],
        temperature,
        maxTokens,
      });

      // Process the stream
      yield* pipe(
        responseStream,
        Stream.runForEach((chunk) =>
          Effect.sync(() => {
            if (!chunk.done && chunk.content) {
              process.stdout.write(chunk.content);
              fullResponse += chunk.content;
            }
          })
        )
      );

      console.log(`\n${border}`);

      // Calculate stats for streaming mode
      // Count tokens for input and output
      const inputTokens = yield* tokenCounter.countMessages(
        [{ role: "user", content }],
        model
      );
      const outputTokens = yield* tokenCounter.count(fullResponse, model);
      const duration = (Date.now() - startTime) / 1000;
      const cost = yield* tokenCounter.estimateCost(inputTokens, outputTokens, model);

      console.log(`\nTokens: ${inputTokens} in / ${outputTokens} out`);
      console.log(`Cost: $${cost.toFixed(4)}`);
      console.log(`Time: ${duration.toFixed(1)}s\n`);
    }

    // TODO: Implement --save flag to save result to prompt history
    if (args.flags["save"]) {
      console.log("\nNote: --save flag not yet implemented");
    }

    // TODO: Implement -i interactive mode
    if (args.flags["i"] || args.flags["interactive"]) {
      console.log("\nNote: Interactive mode not yet implemented");
    }
  });
