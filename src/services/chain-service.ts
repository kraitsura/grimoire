/**
 * Chain Service - Manages multi-prompt workflows
 *
 * Chains are stored as YAML files in ~/.grimoire/chains/
 * Each chain defines a sequence of prompts with variable passing and dependencies.
 */

import { Context, Effect, Layer, Data } from "effect";
import * as yaml from "js-yaml";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { StorageError, SqlError } from "../models";
import { SqlService } from "./sql-service";

/**
 * Error for chain not found
 */
export class ChainNotFoundError extends Data.TaggedError("ChainNotFoundError")<{
  name: string;
}> {}

/**
 * Error for chain validation failures
 */
export class ChainValidationError extends Data.TaggedError("ChainValidationError")<{
  message: string;
  errors: string[];
}> {}

/**
 * Variable specification in chain definition
 */
export interface VariableSpec {
  type: "string" | "number" | "boolean";
  required?: boolean;
  default?: unknown;
  description?: string;
}

/**
 * A single step in a chain
 */
export interface ChainStep {
  id: string;
  prompt: string; // Prompt name reference
  variables: Record<string, string>; // Can reference {{previous_output}} or {{input.var}}
  output: string; // Variable name for this step's output
  dependsOn?: string[]; // Step IDs that must complete first
  model?: string;
}

/**
 * Chain definition structure
 */
export interface ChainDefinition {
  name: string;
  description?: string;
  variables: Record<string, VariableSpec>;
  steps: ChainStep[];
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Chain service interface
 */
interface ChainServiceImpl {
  /**
   * Load a chain from YAML file
   */
  readonly loadChain: (
    name: string
  ) => Effect.Effect<ChainDefinition, ChainNotFoundError | StorageError, never>;

  /**
   * Save a chain to YAML file
   */
  readonly saveChain: (chain: ChainDefinition) => Effect.Effect<void, StorageError, never>;

  /**
   * List all available chains
   */
  readonly listChains: () => Effect.Effect<string[], StorageError, never>;

  /**
   * Validate a chain definition
   */
  readonly validateChain: (
    chain: ChainDefinition
  ) => Effect.Effect<ValidationResult, SqlError, never>;

  /**
   * Delete a chain
   */
  readonly deleteChain: (
    name: string
  ) => Effect.Effect<void, ChainNotFoundError | StorageError, never>;
}

/**
 * Chain service tag
 */
export class ChainService extends Context.Tag("ChainService")<ChainService, ChainServiceImpl>() {}

/**
 * Get the chains directory path
 */
const getChainsDir = (): string => {
  return join(homedir(), ".grimoire", "chains");
};

/**
 * Get the path for a specific chain file
 */
const getChainPath = (name: string): string => {
  return join(getChainsDir(), `${name}.yaml`);
};

/**
 * Ensure chains directory exists
 */
const ensureChainsDirectory = (): Effect.Effect<void, StorageError> =>
  Effect.tryPromise({
    try: async () => {
      const chainsDir = getChainsDir();
      await mkdir(chainsDir, { recursive: true });
    },
    catch: (error) =>
      new StorageError({
        message: "Failed to create chains directory",
        cause: error,
      }),
  });

/**
 * Detect cycles in chain step dependencies
 */
const detectCycles = (steps: ChainStep[]): string[] => {
  const errors: string[] = [];
  const stepMap = new Map<string, ChainStep>();

  // Build step lookup map
  for (const step of steps) {
    stepMap.set(step.id, step);
  }

  // Check each step for cycles using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const hasCycle = (stepId: string, path: string[]): boolean => {
    if (recursionStack.has(stepId)) {
      errors.push(`Circular dependency detected: ${[...path, stepId].join(" -> ")}`);
      return true;
    }

    if (visited.has(stepId)) {
      return false;
    }

    visited.add(stepId);
    recursionStack.add(stepId);
    path.push(stepId);

    const step = stepMap.get(stepId);
    if (step?.dependsOn) {
      for (const depId of step.dependsOn) {
        if (!stepMap.has(depId)) {
          errors.push(`Step "${stepId}" depends on non-existent step "${depId}"`);
        } else if (hasCycle(depId, [...path])) {
          return true;
        }
      }
    }

    recursionStack.delete(stepId);
    return false;
  };

  // Check all steps
  for (const step of steps) {
    if (!visited.has(step.id)) {
      hasCycle(step.id, []);
    }
  }

  return errors;
};

/**
 * Validate variable references in step variables
 */
const validateVariableReferences = (
  chain: ChainDefinition
): { errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stepOutputs = new Set<string>();

  // Collect all step outputs
  for (const step of chain.steps) {
    stepOutputs.add(step.output);
  }

  // Check variable references in each step
  for (const step of chain.steps) {
    for (const [_varName, varValue] of Object.entries(step.variables)) {
      // Find all {{...}} references
      const refs = varValue.match(/\{\{([^}]+)\}\}/g) ?? [];

      for (const ref of refs) {
        const refContent = ref.slice(2, -2).trim();

        // Check if it's an input variable reference
        if (refContent.startsWith("input.")) {
          const inputVar = refContent.slice(6);
          if (!chain.variables[inputVar]) {
            errors.push(`Step "${step.id}" references undefined input variable: ${inputVar}`);
          }
        }
        // Check if it's a step output reference
        else if (!stepOutputs.has(refContent)) {
          warnings.push(`Step "${step.id}" references unknown output: ${refContent}`);
        }
      }
    }
  }

  return { errors, warnings };
};

/**
 * Chain service implementation
 */
export const ChainServiceLive = Layer.effect(
  ChainService,
  Effect.gen(function* () {
    // Get service dependencies
    const sql = yield* SqlService;

    // Ensure chains directory exists on initialization
    yield* ensureChainsDirectory();

    return ChainService.of({
      loadChain: (name: string) =>
        Effect.gen(function* () {
          const chainPath = getChainPath(name);
          const file = Bun.file(chainPath);

          // Check if file exists
          const exists = yield* Effect.tryPromise({
            try: () => file.exists(),
            catch: (error) =>
              new StorageError({
                message: `Failed to check chain file: ${chainPath}`,
                cause: error,
              }),
          });

          if (!exists) {
            return yield* Effect.fail(new ChainNotFoundError({ name }));
          }

          // Read and parse YAML
          const content = yield* Effect.tryPromise({
            try: () => file.text(),
            catch: (error) =>
              new StorageError({
                message: `Failed to read chain file: ${chainPath}`,
                cause: error,
              }),
          });

          try {
            const parsed = yaml.load(content) as ChainDefinition;

            // Basic structure validation
            if (!parsed.name || !parsed.steps || !parsed.variables) {
              return yield* Effect.fail(
                new StorageError({
                  message: `Invalid chain structure in: ${name}`,
                })
              );
            }

            return parsed;
          } catch (error) {
            return yield* Effect.fail(
              new StorageError({
                message: `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              })
            );
          }
        }),

      saveChain: (chain: ChainDefinition) =>
        Effect.gen(function* () {
          yield* ensureChainsDirectory();

          const chainPath = getChainPath(chain.name);

          // Convert to YAML
          const yamlContent = yaml.dump(chain, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
          });

          // Write file
          yield* Effect.tryPromise({
            try: () => Bun.write(chainPath, yamlContent),
            catch: (error) =>
              new StorageError({
                message: `Failed to write chain file: ${chainPath}`,
                cause: error,
              }),
          });
        }),

      listChains: () =>
        Effect.gen(function* () {
          yield* ensureChainsDirectory();

          const chainsDir = getChainsDir();

          // Read directory
          const files = yield* Effect.tryPromise({
            try: () => readdir(chainsDir),
            catch: (error) =>
              new StorageError({
                message: `Failed to read chains directory: ${chainsDir}`,
                cause: error,
              }),
          });

          // Filter for .yaml files and remove extension
          const chains = files
            .filter((file) => file.endsWith(".yaml"))
            .map((file) => file.slice(0, -5));

          return chains;
        }),

      validateChain: (chain: ChainDefinition) =>
        Effect.gen(function* () {
          const errors: string[] = [];
          const warnings: string[] = [];

          // Validate basic structure
          if (!chain.name || chain.name.trim() === "") {
            errors.push("Chain name is required");
          }

          if (!chain.steps || chain.steps.length === 0) {
            errors.push("Chain must have at least one step");
          }

          if (!chain.variables) {
            errors.push("Chain must define variables object (can be empty)");
          }

          // Validate step IDs are unique
          const stepIds = new Set<string>();
          for (const step of chain.steps) {
            if (!step.id || step.id.trim() === "") {
              errors.push("All steps must have an ID");
            } else if (stepIds.has(step.id)) {
              errors.push(`Duplicate step ID: ${step.id}`);
            } else {
              stepIds.add(step.id);
            }

            if (!step.prompt || step.prompt.trim() === "") {
              errors.push(`Step "${step.id}" must reference a prompt`);
            }

            if (!step.output || step.output.trim() === "") {
              errors.push(`Step "${step.id}" must define an output variable`);
            }
          }

          // Check for cycles in dependencies
          if (chain.steps.length > 0) {
            const cycleErrors = detectCycles(chain.steps);
            errors.push(...cycleErrors);
          }

          // Validate variable references
          const varValidation = validateVariableReferences(chain);
          errors.push(...varValidation.errors);
          warnings.push(...varValidation.warnings);

          // Validate that referenced prompts exist
          for (const step of chain.steps) {
            const promptRows = yield* sql.query<{ id: string }>(
              "SELECT id FROM prompts WHERE name = ?",
              [step.prompt]
            );

            if (promptRows.length === 0) {
              errors.push(`Step "${step.id}" references non-existent prompt: ${step.prompt}`);
            }
          }

          return {
            isValid: errors.length === 0,
            errors,
            warnings,
          };
        }),

      deleteChain: (name: string) =>
        Effect.gen(function* () {
          const chainPath = getChainPath(name);

          // Check if file exists
          const exists = yield* Effect.tryPromise({
            try: async () => {
              try {
                await stat(chainPath);
                return true;
              } catch {
                return false;
              }
            },
            catch: (error) =>
              new StorageError({
                message: `Failed to check chain file: ${chainPath}`,
                cause: error,
              }),
          });

          if (!exists) {
            return yield* Effect.fail(new ChainNotFoundError({ name }));
          }

          // Delete file
          yield* Effect.tryPromise({
            try: () => rm(chainPath),
            catch: (error) =>
              new StorageError({
                message: `Failed to delete chain file: ${chainPath}`,
                cause: error,
              }),
          });
        }),
    });
  })
);
