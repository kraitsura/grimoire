/**
 * Chain Command - Manage multi-prompt workflows
 *
 * Usage:
 *   grimoire chain list
 *   grimoire chain show <chain-name>
 *   grimoire chain create <chain-name>
 *   grimoire chain run <chain-name> [--var key=value] [--dry-run] [--verbose]
 *   grimoire chain validate <chain-name>
 *   grimoire chain delete <chain-name>
 */

import { Effect, Stream } from "effect";
import {
  ChainService,
  StorageService,
  EditorService,
  LLMService,
  type ChainDefinition,
  type ChainStep,
  type LLMRequest,
} from "../services";
import type { ParsedArgs } from "../cli/parser";

/**
 * Chain command implementation with subcommands
 */
export const chainCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0];

    // Route to appropriate subcommand
    switch (subcommand) {
      case "list":
        return yield* listChains(args);
      case "show":
        return yield* showChain(args);
      case "create":
        return yield* createChain(args);
      case "run":
        return yield* runChain(args);
      case "validate":
        return yield* validateChain(args);
      case "delete":
        return yield* deleteChain(args);
      default:
        showHelp();
        return;
    }
  });

/**
 * List all available chains
 */
const listChains = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const chainService = yield* ChainService;

    const chains = yield* chainService.listChains().pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          console.error(`Error listing chains: ${error}`);
          return [] as string[];
        })
      )
    );

    if (chains.length === 0) {
      console.log("No chains found.");
      console.log("\nCreate a chain with: grimoire chain create <chain-name>");
      return;
    }

    console.log(`Available chains (${chains.length}):\n`);

    // Sort alphabetically
    const sorted = [...chains].sort((a, b) => a.localeCompare(b));

    for (const name of sorted) {
      console.log(`  ${name}`);
    }

    console.log("\nUse: grimoire chain show <chain-name> to view details");
  });

/**
 * Show details of a specific chain
 */
const showChain = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const chainService = yield* ChainService;
    const name = args.positional[1];

    if (!name) {
      console.log("Usage: grimoire chain show <chain-name>");
      return;
    }

    const chain = yield* chainService.loadChain(name).pipe(
      Effect.catchTags({
        ChainNotFoundError: (error) =>
          Effect.sync(() => {
            console.log(`Chain not found: ${error.name}`);
            process.exit(1);
          }),
        StorageError: (error) =>
          Effect.sync(() => {
            console.log(`Error loading chain: ${error.message}`);
            process.exit(1);
          }),
      })
    );

    // Display chain details
    console.log(`Chain: ${chain.name}`);
    if (chain.description) {
      console.log(`Description: ${chain.description}`);
    }

    // Show variables
    console.log(`\nVariables:`);
    const varEntries = Object.entries(chain.variables);
    if (varEntries.length === 0) {
      console.log("  (none)");
    } else {
      for (const [varName, spec] of varEntries) {
        const required = spec.required ? " (required)" : "";
        const defaultVal = spec.default !== undefined ? ` [default: ${spec.default}]` : "";
        const desc = spec.description ? ` - ${spec.description}` : "";
        console.log(`  ${varName}: ${spec.type}${required}${defaultVal}${desc}`);
      }
    }

    // Show steps
    console.log(`\nSteps (${chain.steps.length}):`);
    for (let i = 0; i < chain.steps.length; i++) {
      const step = chain.steps[i];
      const deps = step.dependsOn && step.dependsOn.length > 0
        ? ` [depends on: ${step.dependsOn.join(", ")}]`
        : "";
      const model = step.model ? ` (${step.model})` : "";
      console.log(`  ${i + 1}. ${step.id}: ${step.prompt}${model}${deps}`);
      console.log(`     Output: ${step.output}`);
    }
  });

/**
 * Create a new chain (opens editor)
 */
const createChain = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const chainService = yield* ChainService;
    const editorService = yield* EditorService;
    const name = args.positional[1];

    if (!name) {
      console.log("Usage: grimoire chain create <chain-name>");
      return;
    }

    // Create template YAML content
    const template = `name: ${name}
description: A description of this chain
variables:
  example_var:
    type: string
    required: true
    description: Description of this variable

steps:
  - id: step1
    prompt: prompt-name
    variables:
      input: "{{input.example_var}}"
    output: step1_result

  - id: step2
    prompt: another-prompt
    variables:
      previous: "{{step1_result}}"
    output: final_result
    dependsOn: [step1]
`;

    // Open in editor
    const edited = yield* editorService.open(template, `${name}.yaml`).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          console.error(`Error opening editor: ${error.message}`);
          process.exit(1);
        })
      )
    );

    // Parse the edited YAML
    const yaml = yield* Effect.tryPromise({
      try: async () => {
        const yamlModule = await import("js-yaml");
        return yamlModule.load(edited) as ChainDefinition;
      },
      catch: (error) =>
        Effect.sync(() => {
          console.error(`Invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }),
    });

    // Validate the chain
    const validation = yield* chainService.validateChain(yaml);

    if (!validation.isValid) {
      console.error("Chain validation failed:");
      for (const error of validation.errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }

    if (validation.warnings.length > 0) {
      console.warn("Warnings:");
      for (const warning of validation.warnings) {
        console.warn(`  - ${warning}`);
      }
    }

    // Save the chain
    yield* chainService.saveChain(yaml);

    console.log(`Chain '${yaml.name}' created successfully`);
  });

/**
 * Validate a chain definition
 */
const validateChain = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const chainService = yield* ChainService;
    const name = args.positional[1];

    if (!name) {
      console.log("Usage: grimoire chain validate <chain-name>");
      return;
    }

    const chain = yield* chainService.loadChain(name).pipe(
      Effect.catchTags({
        ChainNotFoundError: (error) =>
          Effect.sync(() => {
            console.log(`Chain not found: ${error.name}`);
            process.exit(1);
          }),
        StorageError: (error) =>
          Effect.sync(() => {
            console.log(`Error loading chain: ${error.message}`);
            process.exit(1);
          }),
      })
    );

    const validation = yield* chainService.validateChain(chain);

    if (validation.isValid) {
      console.log(`✓ Chain '${name}' is valid`);
      if (validation.warnings.length > 0) {
        console.warn("\nWarnings:");
        for (const warning of validation.warnings) {
          console.warn(`  - ${warning}`);
        }
      }
    } else {
      console.error(`✗ Chain '${name}' has validation errors:`);
      for (const error of validation.errors) {
        console.error(`  - ${error}`);
      }
      if (validation.warnings.length > 0) {
        console.warn("\nWarnings:");
        for (const warning of validation.warnings) {
          console.warn(`  - ${warning}`);
        }
      }
      process.exit(1);
    }
  });

/**
 * Delete a chain
 */
const deleteChain = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const chainService = yield* ChainService;
    const name = args.positional[1];

    if (!name) {
      console.log("Usage: grimoire chain delete <chain-name>");
      return;
    }

    yield* chainService.deleteChain(name).pipe(
      Effect.catchTags({
        ChainNotFoundError: (error) =>
          Effect.sync(() => {
            console.log(`Chain not found: ${error.name}`);
            process.exit(1);
          }),
        StorageError: (error) =>
          Effect.sync(() => {
            console.log(`Error deleting chain: ${error.message}`);
            process.exit(1);
          }),
      })
    );

    console.log(`Chain '${name}' deleted successfully`);
  });

/**
 * Parse variable flags from command line
 * Format: --var key=value
 */
const parseVariables = (args: ParsedArgs): Record<string, string> => {
  const variables: Record<string, string> = {};
  const varFlag = args.flags["var"];

  if (typeof varFlag === "string") {
    // Single --var key=value
    const [key, value] = varFlag.split("=", 2);
    if (key && value !== undefined) {
      variables[key] = value;
    }
  } else if (Array.isArray(varFlag)) {
    // Multiple --var flags (if parser supports this)
    for (const v of varFlag) {
      const [key, value] = v.split("=", 2);
      if (key && value !== undefined) {
        variables[key] = value;
      }
    }
  }

  // Also check positional args for var=value format
  for (const arg of args.positional.slice(2)) {
    if (arg.includes("=")) {
      const [key, value] = arg.split("=", 2);
      if (key && value !== undefined) {
        variables[key] = value;
      }
    }
  }

  return variables;
};

/**
 * Substitute variables in a string template
 * Supports {{input.varName}} and {{stepOutput}} formats
 */
const substituteVariables = (
  template: string,
  inputVars: Record<string, string>,
  stepOutputs: Record<string, string>
): string => {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, content) => {
    const trimmed = content.trim();

    // Check for input variable reference
    if (trimmed.startsWith("input.")) {
      const varName = trimmed.slice(6);
      return inputVars[varName] ?? match;
    }

    // Otherwise, it's a step output reference
    return stepOutputs[trimmed] ?? match;
  });
};

/**
 * Build execution plan (topological sort of steps)
 */
const buildExecutionPlan = (steps: ChainStep[]): ChainStep[] => {
  const plan: ChainStep[] = [];
  const completed = new Set<string>();
  const stepMap = new Map<string, ChainStep>();

  // Build step lookup
  for (const step of steps) {
    stepMap.set(step.id, step);
  }

  // Helper to check if step can be executed
  const canExecute = (step: ChainStep): boolean => {
    if (!step.dependsOn || step.dependsOn.length === 0) {
      return true;
    }
    return step.dependsOn.every((dep) => completed.has(dep));
  };

  // Build plan
  while (plan.length < steps.length) {
    let added = false;

    for (const step of steps) {
      if (!completed.has(step.id) && canExecute(step)) {
        plan.push(step);
        completed.add(step.id);
        added = true;
      }
    }

    if (!added) {
      // No progress - circular dependency (should be caught by validation)
      throw new Error("Circular dependency detected in chain steps");
    }
  }

  return plan;
};

/**
 * Run a chain
 */
const runChain = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const chainService = yield* ChainService;
    const storageService = yield* StorageService;
    const llmService = yield* LLMService;

    const name = args.positional[1];
    const dryRun = args.flags["dry-run"] || args.flags["n"];
    const verbose = args.flags["verbose"] || args.flags["v"];

    if (!name) {
      console.log("Usage: grimoire chain run <chain-name> [--var key=value] [--dry-run] [--verbose]");
      return;
    }

    // Load chain
    const chain = yield* chainService.loadChain(name).pipe(
      Effect.catchTags({
        ChainNotFoundError: (error) =>
          Effect.sync(() => {
            console.log(`Chain not found: ${error.name}`);
            process.exit(1);
          }),
        StorageError: (error) =>
          Effect.sync(() => {
            console.log(`Error loading chain: ${error.message}`);
            process.exit(1);
          }),
      })
    );

    // Validate chain
    const validation = yield* chainService.validateChain(chain);
    if (!validation.isValid) {
      console.error("Chain validation failed:");
      for (const error of validation.errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }

    // Parse input variables
    const inputVars = parseVariables(args);

    // Validate required variables
    for (const [varName, spec] of Object.entries(chain.variables)) {
      if (spec.required && !inputVars[varName]) {
        if (spec.default !== undefined) {
          inputVars[varName] = String(spec.default);
        } else {
          console.error(`Missing required variable: ${varName}`);
          console.error(`Use: --var ${varName}=value`);
          process.exit(1);
        }
      }
    }

    // Build execution plan
    const executionPlan = buildExecutionPlan(chain.steps);

    // Show execution plan header
    console.log(`Running chain: ${chain.name}`);
    if (chain.description) {
      console.log(chain.description);
    }
    console.log();

    // Show input variables
    if (Object.keys(inputVars).length > 0) {
      console.log("Variables:");
      for (const [key, value] of Object.entries(inputVars)) {
        console.log(`  ${key}: ${value}`);
      }
      console.log();
    }

    if (dryRun) {
      console.log("Execution plan (dry run):\n");
      for (let i = 0; i < executionPlan.length; i++) {
        const step = executionPlan[i];
        console.log(`Step ${i + 1}/${executionPlan.length}: ${step.id}`);
        console.log(`  Prompt: ${step.prompt}`);
        console.log(`  Model: ${step.model || "default"}`);
        console.log(`  Variables:`);
        for (const [key, value] of Object.entries(step.variables)) {
          const substituted = substituteVariables(value, inputVars, {});
          console.log(`    ${key}: ${substituted}`);
        }
        console.log(`  Output: ${step.output}`);
        if (step.dependsOn && step.dependsOn.length > 0) {
          console.log(`  Depends on: ${step.dependsOn.join(", ")}`);
        }
        console.log();
      }
      return;
    }

    // Execute steps
    const stepOutputs: Record<string, string> = {};
    const startTime = Date.now();
    let totalTokens = 0;

    for (let i = 0; i < executionPlan.length; i++) {
      const step = executionPlan[i];
      const stepNum = i + 1;

      console.log(`Step ${stepNum}/${executionPlan.length}: ${step.id}`);

      // Load the prompt
      const prompt = yield* storageService.getByName(step.prompt).pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            console.error(`Error loading prompt '${step.prompt}': ${error}`);
            process.exit(1);
          })
        )
      );

      // Substitute variables in step variables
      const substitutedVars: Record<string, string> = {};
      for (const [key, value] of Object.entries(step.variables)) {
        substitutedVars[key] = substituteVariables(value, inputVars, stepOutputs);
      }

      // Build prompt content with variable substitution
      let promptContent = prompt.content;
      for (const [key, value] of Object.entries(substitutedVars)) {
        promptContent = promptContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
      }

      if (verbose) {
        console.log(`  Prompt content (${promptContent.length} chars):`);
        console.log(`  ${promptContent.slice(0, 100)}${promptContent.length > 100 ? "..." : ""}`);
      }

      // Create LLM request
      const llmRequest: LLMRequest = {
        model: step.model || "claude-sonnet-4",
        messages: [
          {
            role: "user",
            content: promptContent,
          },
        ],
      };

      // Execute with streaming
      const stepStartTime = Date.now();
      let stepOutput = "";

      console.log("  ");

      yield* Stream.runForEach(
        llmService.stream(llmRequest),
        (chunk) =>
          Effect.sync(() => {
            if (!chunk.done) {
              process.stdout.write(chunk.content);
              stepOutput += chunk.content;
            }
          })
      ).pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            console.error(`\n  Error: ${error}`);
            process.exit(1);
          })
        )
      );

      console.log(); // New line after streaming

      const stepDuration = ((Date.now() - stepStartTime) / 1000).toFixed(1);

      // Store output
      stepOutputs[step.output] = stepOutput;

      console.log(`  ✓ Complete (${stepDuration}s, ${stepOutput.length} chars)`);
      console.log();
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`Chain complete! Total: ${totalDuration}s`);
    console.log();

    // Show final output
    const finalStep = executionPlan[executionPlan.length - 1];
    console.log(`Final output (${finalStep.output}):`);
    console.log("-".repeat(70));
    console.log(stepOutputs[finalStep.output]);
    console.log("-".repeat(70));
  });

/**
 * Show help message
 */
const showHelp = () => {
  console.log(`
Chain Commands - Manage multi-prompt workflows

USAGE:
  grimoire chain <subcommand> [options]

SUBCOMMANDS:
  list                       List all available chains
  show <chain-name>          Show chain details
  create <chain-name>        Create a new chain (opens editor)
  run <chain-name>           Execute a chain
    --var key=value          Set input variable (can be repeated)
    --dry-run, -n            Show execution plan without running
    --verbose, -v            Show detailed output
  validate <chain-name>      Validate chain definition
  delete <chain-name>        Delete a chain

EXAMPLES:
  grimoire chain list
  grimoire chain show research-to-article
  grimoire chain create my-workflow
  grimoire chain run research-to-article --var topic="Effect-TS"
  grimoire chain run my-chain --var input="test" --dry-run
  grimoire chain validate my-workflow
  grimoire chain delete old-chain
  `);
};
