/**
 * Example usage of ChainService
 *
 * This file demonstrates how to use the ChainService to create,
 * validate, and manage multi-prompt workflows.
 */

import { Effect, Layer } from "effect";
import {
  ChainService,
  ChainServiceLive,
  type ChainDefinition,
} from "./chain-service";
import { SqlLive } from "./sql-service";

/**
 * Example: Creating a simple research chain
 */
const createResearchChain = (): ChainDefinition => ({
  name: "research-assistant",
  description: "A chain for conducting research on a topic",
  variables: {
    topic: {
      type: "string",
      required: true,
      description: "The topic to research",
    },
    depth: {
      type: "string",
      required: false,
      default: "comprehensive",
      description: "Depth of research (quick, comprehensive, deep)",
    },
  },
  steps: [
    {
      id: "outline",
      prompt: "research-outline",
      variables: {
        topic: "{{input.topic}}",
        depth: "{{input.depth}}",
      },
      output: "outline_result",
      model: "claude-opus-4",
    },
    {
      id: "gather-sources",
      prompt: "find-sources",
      variables: {
        topic: "{{input.topic}}",
        outline: "{{outline_result}}",
      },
      output: "sources",
      dependsOn: ["outline"],
      model: "claude-sonnet-4",
    },
    {
      id: "synthesize",
      prompt: "synthesize-research",
      variables: {
        topic: "{{input.topic}}",
        outline: "{{outline_result}}",
        sources: "{{sources}}",
      },
      output: "final_report",
      dependsOn: ["outline", "gather-sources"],
      model: "claude-opus-4",
    },
  ],
});

/**
 * Example: Creating a code review chain
 */
const createCodeReviewChain = (): ChainDefinition => ({
  name: "code-review",
  description: "Automated code review workflow",
  variables: {
    code: {
      type: "string",
      required: true,
      description: "The code to review",
    },
    language: {
      type: "string",
      required: true,
      description: "Programming language",
    },
  },
  steps: [
    {
      id: "analyze-structure",
      prompt: "analyze-code-structure",
      variables: {
        code: "{{input.code}}",
        language: "{{input.language}}",
      },
      output: "structure_analysis",
    },
    {
      id: "security-check",
      prompt: "security-audit",
      variables: {
        code: "{{input.code}}",
        language: "{{input.language}}",
      },
      output: "security_issues",
    },
    {
      id: "performance-check",
      prompt: "performance-analysis",
      variables: {
        code: "{{input.code}}",
        language: "{{input.language}}",
      },
      output: "performance_issues",
    },
    {
      id: "generate-report",
      prompt: "code-review-report",
      variables: {
        code: "{{input.code}}",
        structure: "{{structure_analysis}}",
        security: "{{security_issues}}",
        performance: "{{performance_issues}}",
      },
      output: "review_report",
      dependsOn: ["analyze-structure", "security-check", "performance-check"],
    },
  ],
});

/**
 * Example: Save and validate a chain
 */
const saveAndValidateChain = (chain: ChainDefinition) =>
  Effect.gen(function* () {
    const chainService = yield* ChainService;

    // Validate the chain
    const validation = yield* chainService.validateChain(chain);

    if (!validation.isValid) {
      console.error("Chain validation failed:");
      validation.errors.forEach((error) => console.error(`  - ${error}`));
      return { success: false, errors: validation.errors };
    }

    if (validation.warnings.length > 0) {
      console.warn("Chain has warnings:");
      validation.warnings.forEach((warning) => console.warn(`  - ${warning}`));
    }

    // Save the chain
    yield* chainService.saveChain(chain);

    console.log(`Chain "${chain.name}" saved successfully`);
    return { success: true, errors: [] };
  });

/**
 * Example: Load and execute a chain (conceptual)
 */
const loadChainExample = (chainName: string) =>
  Effect.gen(function* () {
    const chainService = yield* ChainService;

    // Load the chain
    const chain = yield* chainService.loadChain(chainName);

    console.log(`Loaded chain: ${chain.name}`);
    console.log(`Description: ${chain.description ?? "N/A"}`);
    console.log(`Steps: ${chain.steps.length}`);
    console.log(`Variables: ${Object.keys(chain.variables).join(", ")}`);

    return chain;
  });

/**
 * Example: List all available chains
 */
const listChainsExample = () =>
  Effect.gen(function* () {
    const chainService = yield* ChainService;

    const chains = yield* chainService.listChains();

    console.log(`Available chains (${chains.length}):`);
    chains.forEach((name) => console.log(`  - ${name}`));

    return chains;
  });

/**
 * Example: Delete a chain
 */
const deleteChainExample = (chainName: string) =>
  Effect.gen(function* () {
    const chainService = yield* ChainService;

    yield* chainService.deleteChain(chainName);

    console.log(`Chain "${chainName}" deleted successfully`);
  });

/**
 * Main example program
 */
const exampleProgram = Effect.gen(function* () {
  // Create example chains
  const researchChain = createResearchChain();
  const codeReviewChain = createCodeReviewChain();

  // Save and validate chains
  yield* saveAndValidateChain(researchChain);
  yield* saveAndValidateChain(codeReviewChain);

  // List all chains
  yield* listChainsExample();

  // Load a specific chain
  yield* loadChainExample("research-assistant");

  // Delete a chain
  // yield* deleteChainExample("code-review");
});

/**
 * Run the example (requires proper layer composition)
 */
export const runExample = () => {
  const layer = ChainServiceLive.pipe(Layer.provide(SqlLive));

  return Effect.runPromise(exampleProgram.pipe(Effect.provide(layer)) as Effect.Effect<void, never, never>);
};

// Export example chains for use in tests
export { createResearchChain, createCodeReviewChain };
