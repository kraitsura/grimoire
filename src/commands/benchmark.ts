/**
 * Benchmark Command - Run automated test suites against prompts
 *
 * Loads YAML test files, runs test cases with variable interpolation,
 * validates responses with assertions, and reports results with statistics.
 */

import { Effect } from "effect";
import * as yaml from "js-yaml";
import { StorageService } from "../services";
import { LLMService } from "../services/llm-service";
import { TokenCounterService } from "../services/token-counter-service";
import type { ParsedArgs } from "../cli/parser";
import { Data } from "effect";

/**
 * Benchmark error types
 */
export class BenchmarkError extends Data.TaggedError("BenchmarkError")<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Test case definition
 */
interface TestCase {
  name: string;
  variables?: Record<string, string>;
  expected?: {
    contains?: string[];
    notContains?: string[];
    matches?: string;
  };
}

/**
 * Benchmark suite definition
 */
interface BenchmarkSuite {
  name: string;
  model?: string;
  prompt: string;
  tests: TestCase[];
}

/**
 * Test result
 */
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  response?: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

/**
 * Run assertions on a response
 */
const runAssertions = (
  response: string,
  expected?: TestCase["expected"]
): { passed: boolean; error?: string } => {
  if (!expected) {
    return { passed: true };
  }

  // Check contains assertions
  if (expected.contains) {
    for (const substring of expected.contains) {
      if (!response.includes(substring)) {
        return {
          passed: false,
          error: `missing "${substring}"`,
        };
      }
    }
  }

  // Check notContains assertions
  if (expected.notContains) {
    for (const substring of expected.notContains) {
      if (response.includes(substring)) {
        return {
          passed: false,
          error: `found forbidden "${substring}"`,
        };
      }
    }
  }

  // Check regex match assertion
  if (expected.matches) {
    try {
      const regex = new RegExp(expected.matches);
      if (!regex.test(response)) {
        return {
          passed: false,
          error: `does not match pattern "${expected.matches}"`,
        };
      }
    } catch (error) {
      return {
        passed: false,
        error: `invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return { passed: true };
};

/**
 * Interpolate variables in prompt content
 */
const interpolateVariables = (content: string, variables: Record<string, string>): string => {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    result = result.replace(pattern, value);
  }
  return result;
};

/**
 * Run a single test case
 */
const runTestCase = (testCase: TestCase, promptContent: string, model: string) =>
  Effect.gen(function* () {
    const llm = yield* LLMService;
    const tokenCounter = yield* TokenCounterService;

    // Interpolate variables
    const variables = testCase.variables ?? {};
    const content = interpolateVariables(promptContent, variables);

    const startTime = Date.now();

    try {
      // Run LLM completion (non-streaming for easier assertion)
      const response = yield* llm.complete({
        model,
        messages: [{ role: "user", content }],
        temperature: 0.7,
        maxTokens: 2048,
      });

      const duration = (Date.now() - startTime) / 1000;

      // Run assertions
      const { passed, error } = runAssertions(response.content, testCase.expected);

      // Calculate cost
      const cost = yield* tokenCounter.estimateCost(
        response.usage.inputTokens,
        response.usage.outputTokens,
        model
      );

      return {
        name: testCase.name,
        passed,
        duration,
        error,
        response: response.content,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        cost,
      } as TestResult;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      return {
        name: testCase.name,
        passed: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
        response: "",
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      } as TestResult;
    }
  });

/**
 * Format results as table
 */
const formatTableOutput = (
  suiteName: string,
  results: TestResult[],
  totalTime: number,
  totalCost: number,
  verbose: boolean
): string => {
  const border = "─".repeat(60);
  let output = `\nRunning: ${suiteName} (${results.length} tests)\n\n`;

  for (const result of results) {
    const icon = result.passed ? "✓" : "✗";
    const status = result.passed ? "" : ` - ${result.error}`;
    output += `${icon} ${result.name}${status} (${result.duration.toFixed(1)}s)\n`;

    if (verbose && result.response) {
      output += `  Response: ${result.response.substring(0, 200)}${result.response.length > 200 ? "..." : ""}\n`;
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const percentage = Math.round((passed / results.length) * 100);

  output += `\n${border}\n`;
  output += `Results: ${passed}/${results.length} passed (${percentage}%)\n`;
  output += `Total time: ${totalTime.toFixed(1)}s\n`;
  output += `Total cost: $${totalCost.toFixed(4)}\n`;

  return output;
};

/**
 * Format results as JSON
 */
const formatJsonOutput = (
  suiteName: string,
  results: TestResult[],
  totalTime: number,
  totalCost: number
): string => {
  const passed = results.filter((r) => r.passed).length;
  const output = {
    suite: suiteName,
    results: results.map((r) => ({
      name: r.name,
      passed: r.passed,
      duration: r.duration,
      error: r.error,
      tokens: {
        input: r.inputTokens,
        output: r.outputTokens,
      },
      cost: r.cost,
    })),
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      percentage: Math.round((passed / results.length) * 100),
      totalTime,
      totalCost,
    },
  };

  return JSON.stringify(output, null, 2);
};

/**
 * Format results as JUnit XML
 */
const formatJunitOutput = (suiteName: string, results: TestResult[], totalTime: number): string => {
  const failed = results.filter((r) => !r.passed).length;

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<testsuite name="${suiteName}" tests="${results.length}" failures="${failed}" time="${totalTime.toFixed(3)}">\n`;

  for (const result of results) {
    xml += `  <testcase name="${result.name}" time="${result.duration.toFixed(3)}"`;

    if (result.passed) {
      xml += " />\n";
    } else {
      xml += ">\n";
      xml += `    <failure message="${result.error ?? "Assertion failed"}" />\n`;
      xml += "  </testcase>\n";
    }
  }

  xml += "</testsuite>\n";
  return xml;
};

/**
 * Benchmark command handler
 */
export const benchmarkCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;

    // Parse arguments
    const testFilePath = args.positional[0];
    if (!testFilePath) {
      console.log(`Usage: grimoire benchmark <test-file> [OPTIONS]

OPTIONS:
  -m, --model <model>       Model to use (overrides file config)
  --parallel <n>            Concurrent runs (default: 3)
  --format <fmt>            Output format: table, json, junit (default: table)
  --timeout <seconds>       Test timeout in seconds (default: 60)
  -v, --verbose             Show full responses

EXAMPLES:
  grimoire benchmark tests/coding.yaml
  grimoire benchmark tests/coding.yaml --model gpt-4o-mini
  grimoire benchmark tests/coding.yaml --format json > results.json
  grimoire benchmark tests/coding.yaml --parallel 5 --verbose
`);
      return;
    }

    // Get options from flags
    const modelOverride = (args.flags.model as string) || (args.flags.m as string);
    const parallel = parseInt((args.flags.parallel as string) || "3", 10);
    const format = (args.flags.format as string) || "table";
    const verbose = args.flags.verbose === true || args.flags.v === true;

    // Validate format
    if (!["table", "json", "junit"].includes(format)) {
      console.error(`Error: Invalid format "${format}". Must be: table, json, or junit`);
      return;
    }

    // Read test file
    const testFileContent = yield* Effect.tryPromise({
      try: () => Bun.file(testFilePath).text(),
      catch: (error) =>
        new BenchmarkError({
          message: `Cannot read test file: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          console.error(`Error: ${error.message}`);
          return "";
        })
      )
    );

    if (!testFileContent) {
      return;
    }

    // Parse YAML
    let suite: BenchmarkSuite;
    try {
      suite = yaml.load(testFileContent) as BenchmarkSuite;
    } catch (error) {
      console.error(
        `Error: Invalid YAML: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }

    // Validate suite structure
    if (!suite.name || !suite.prompt || !suite.tests || !Array.isArray(suite.tests)) {
      console.error("Error: Invalid test file structure. Required: name, prompt, tests[]");
      return;
    }

    // Determine model to use
    const model = modelOverride ?? suite.model ?? "gpt-4o";

    // Load prompt from storage
    const prompt = yield* storage.getByName(suite.prompt).pipe(
      Effect.catchTag("PromptNotFoundError", () => storage.getById(suite.prompt)),
      Effect.catchAll((error) =>
        Effect.fail(
          new BenchmarkError({
            message: `Prompt not found: ${suite.prompt}`,
            cause: error,
          })
        )
      )
    );

    // Run tests with controlled concurrency
    const startTime = Date.now();

    const results = yield* Effect.all(
      suite.tests.map((testCase) => runTestCase(testCase, prompt.content, model)),
      { concurrency: parallel }
    );

    const totalTime = (Date.now() - startTime) / 1000;

    // Calculate total cost
    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);

    // Format output
    let output: string;
    switch (format) {
      case "json":
        output = formatJsonOutput(suite.name, results, totalTime, totalCost);
        break;
      case "junit":
        output = formatJunitOutput(suite.name, results, totalTime);
        break;
      default:
        output = formatTableOutput(suite.name, results, totalTime, totalCost, verbose);
    }

    console.log(output);
  });
