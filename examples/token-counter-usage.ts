/**
 * Token Counter Service - Usage Examples
 *
 * This file demonstrates how to use the TokenCounterService
 * for counting tokens and estimating costs.
 */

import { Effect } from "effect";
import {
  TokenCounterService,
  TokenCounterServiceLive,
  type Message,
} from "../src/services/token-counter-service";

// Helper to run effects with the service layer
const runExample = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TokenCounterServiceLive)));

/**
 * Example 1: Count tokens in a simple string
 */
async function example1() {
  const program = Effect.gen(function* () {
    const service = yield* TokenCounterService;

    const text = "Hello, world! This is a test of the token counter.";
    const tokenCount = yield* service.count(text, "gpt-4o");

    console.log("Example 1: Simple token counting");
    console.log(`Text: "${text}"`);
    console.log(`Tokens (GPT-4o): ${tokenCount}`);
    console.log();

    return tokenCount;
  });

  return runExample(program);
}

/**
 * Example 2: Count tokens in a conversation
 */
async function example2() {
  const program = Effect.gen(function* () {
    const service = yield* TokenCounterService;

    const messages: Message[] = [
      { role: "system", content: "You are a helpful coding assistant." },
      { role: "user", content: "How do I create a React component?" },
      {
        role: "assistant",
        content:
          "Here's a simple example:\n\nfunction MyComponent() {\n  return <div>Hello!</div>;\n}",
      },
    ];

    const tokenCount = yield* service.countMessages(messages, "gpt-4o");

    console.log("Example 2: Message token counting");
    console.log(`Messages: ${messages.length}`);
    console.log(`Total tokens (GPT-4o): ${tokenCount}`);
    console.log();

    return tokenCount;
  });

  return runExample(program);
}

/**
 * Example 3: Estimate cost for a conversation
 */
async function example3() {
  const program = Effect.gen(function* () {
    const service = yield* TokenCounterService;

    const messages: Message[] = [
      {
        role: "system",
        content: "You are a helpful assistant that writes technical documentation.",
      },
      {
        role: "user",
        content: "Write a README for a TypeScript library that uses Effect.",
      },
    ];

    // Count input tokens
    const inputTokens = yield* service.countMessages(messages, "gpt-4o");

    // Estimate ~500 tokens for the response
    const estimatedOutputTokens = 500;

    // Calculate cost
    const cost = yield* service.estimateCost(
      inputTokens,
      estimatedOutputTokens,
      "gpt-4o"
    );

    console.log("Example 3: Cost estimation");
    console.log(`Input tokens: ${inputTokens}`);
    console.log(`Estimated output tokens: ${estimatedOutputTokens}`);
    console.log(`Total estimated cost: $${cost.toFixed(4)}`);
    console.log();

    return { inputTokens, estimatedOutputTokens, cost };
  });

  return runExample(program);
}

/**
 * Example 4: Compare costs across models
 */
async function example4() {
  const program = Effect.gen(function* () {
    const service = yield* TokenCounterService;

    const inputTokens = 1000;
    const outputTokens = 1000;

    const gpt4oCost = yield* service.estimateCost(
      inputTokens,
      outputTokens,
      "gpt-4o"
    );
    const gpt4oMiniCost = yield* service.estimateCost(
      inputTokens,
      outputTokens,
      "gpt-4o-mini"
    );
    const claudeCost = yield* service.estimateCost(
      inputTokens,
      outputTokens,
      "claude-sonnet-4-20250514"
    );

    console.log("Example 4: Cost comparison");
    console.log(`Tokens: ${inputTokens} input, ${outputTokens} output`);
    console.log(`GPT-4o: $${gpt4oCost.toFixed(4)}`);
    console.log(`GPT-4o-mini: $${gpt4oMiniCost.toFixed(4)}`);
    console.log(`Claude Sonnet 4: $${claudeCost.toFixed(4)}`);
    console.log();

    return { gpt4oCost, gpt4oMiniCost, claudeCost };
  });

  return runExample(program);
}

/**
 * Example 5: Count tokens for a prompt template
 */
async function example5() {
  const program = Effect.gen(function* () {
    const service = yield* TokenCounterService;

    const promptTemplate = `You are a helpful assistant that specializes in {{domain}}.

User Question: {{question}}

Please provide a detailed, accurate answer based on your knowledge.`;

    // Count base template tokens
    const baseTokens = yield* service.count(promptTemplate, "gpt-4o");

    // Simulate filled template
    const filledPrompt = promptTemplate
      .replace("{{domain}}", "machine learning")
      .replace("{{question}}", "What is gradient descent?");

    const filledTokens = yield* service.count(filledPrompt, "gpt-4o");

    console.log("Example 5: Prompt template tokens");
    console.log(`Template tokens: ${baseTokens}`);
    console.log(`Filled template tokens: ${filledTokens}`);
    console.log(`Variable tokens: ${filledTokens - baseTokens}`);
    console.log();

    return { baseTokens, filledTokens };
  });

  return runExample(program);
}

/**
 * Run all examples
 */
async function main() {
  console.log("=".repeat(60));
  console.log("Token Counter Service - Usage Examples");
  console.log("=".repeat(60));
  console.log();

  await example1();
  await example2();
  await example3();
  await example4();
  await example5();

  console.log("=".repeat(60));
  console.log("All examples completed!");
  console.log("=".repeat(60));
}

// Run examples if this file is executed directly
if (import.meta.main) {
  main().catch(console.error);
}
