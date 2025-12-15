/**
 * Config Command - Configure LLM providers and settings
 *
 * API keys are stored in ~/.grimoire/.env with 0600 permissions.
 */

import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { ApiKeyService, LLMService } from "../services";
import { ConfigCommandArgsSchema, ValidationError } from "../models";
import type { ParsedArgs } from "../cli/parser";
import * as readline from "readline";

// Supported providers
const PROVIDERS = ["openai", "anthropic", "google", "ollama"] as const;
type Provider = (typeof PROVIDERS)[number];

const PROVIDER_INFO: Record<Provider, { name: string; envVar: string; keyPrefix?: string }> = {
  openai: { name: "OpenAI", envVar: "OPENAI_API_KEY", keyPrefix: "sk-" },
  anthropic: { name: "Anthropic", envVar: "ANTHROPIC_API_KEY", keyPrefix: "sk-ant-" },
  google: { name: "Google Gemini", envVar: "GOOGLE_API_KEY" },
  ollama: { name: "Ollama", envVar: "OLLAMA_HOST" },
};

/**
 * Parse raw CLI args into structured format for schema validation
 */
const parseConfigArgs = (args: ParsedArgs) => {
  const subcommand = args.positional[0];
  const action = args.positional[1];
  const target = args.positional[2];

  return {
    subcommand,
    // Default to "list" when no action is provided
    action: action ?? "list",
    provider: target && PROVIDERS.includes(target as Provider) ? target : undefined,
    model: undefined, // Not currently used in config command
  };
};

/**
 * Config command handler
 */
export const configCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    // Check for help case first (no subcommand or invalid subcommand)
    if (!args.positional[0] || args.positional[0] !== "llm") {
      console.log("Usage: grimoire config llm <list|add|test|remove> [provider]");
      console.log("\nManage LLM provider configuration.");
      console.log("\nSubcommands:");
      console.log("  list              List configured providers");
      console.log("  add <provider>    Add or update provider API key");
      console.log("  test <provider>   Test provider API key");
      console.log("  remove <provider> Remove provider configuration");
      console.log("\nProviders: openai, anthropic, google, ollama");
      console.log("\nKeys are stored in ~/.grimoire/.env with secure permissions (0600).");
      return;
    }

    // Validate arguments with schema
    const rawArgs = parseConfigArgs(args);
    const validatedArgs = yield* Schema.decodeUnknown(ConfigCommandArgsSchema)(rawArgs).pipe(
      Effect.mapError((error) => {
        const message = error.message || "Invalid arguments";
        return new ValidationError({
          field: "args",
          message: `Invalid arguments: ${message}. Usage: grimoire config llm <list|add|test|remove> [provider]`,
        });
      })
    );

    const apiKeyService = yield* ApiKeyService;

    switch (validatedArgs.action) {
      case "list": {
        console.log("LLM Provider Configuration\n");
        console.log("PROVIDER".padEnd(15) + "STATUS".padEnd(20) + "ENV VAR");
        console.log("-".repeat(60));

        for (const provider of PROVIDERS) {
          const info = PROVIDER_INFO[provider];
          const isConfigured = yield* apiKeyService.validate(provider);

          const status = isConfigured ? "\x1b[32m✓ Configured\x1b[0m" : "\x1b[31m✗ Not set\x1b[0m";

          console.log(`${info.name.padEnd(15)}${status.padEnd(31)}${info.envVar}`);
        }

        console.log("\nUse 'grimoire config llm add <provider>' to configure a provider");
        console.log("Keys are stored in ~/.grimoire/.env");
        break;
      }

      case "add": {
        if (!validatedArgs.provider) {
          console.log(`Usage: grimoire config llm add <${PROVIDERS.join("|")}>`);
          return;
        }

        const provider = validatedArgs.provider;
        const info = PROVIDER_INFO[provider];

        // Check if already configured
        const isConfigured = yield* apiKeyService.validate(provider);
        if (isConfigured) {
          console.log(`Note: ${info.name} is already configured. This will update the key.\n`);
        }

        // Prompt for API key
        const apiKey = yield* promptForInput(
          provider === "ollama"
            ? `Enter Ollama host URL (default: http://localhost:11434): `
            : `Enter ${info.name} API key: `,
          true
        );

        if (!apiKey.trim()) {
          if (provider === "ollama") {
            yield* apiKeyService.set(provider, "http://localhost:11434");
            console.log(`\n✓ ${info.name} configured with default host`);
          } else {
            console.log("Cancelled - no API key provided");
          }
          return;
        }

        // Basic validation
        if (info.keyPrefix && !apiKey.startsWith(info.keyPrefix)) {
          console.log(`\nWarning: API key doesn't start with expected prefix '${info.keyPrefix}'`);
        }

        yield* apiKeyService.set(provider, apiKey.trim());
        console.log(`\n✓ ${info.name} API key saved to ~/.grimoire/.env`);
        console.log("Tip: Run 'grimoire config llm test " + provider + "' to verify the key works");
        break;
      }

      case "test": {
        if (!validatedArgs.provider) {
          console.log(`Usage: grimoire config llm test <${PROVIDERS.join("|")}>`);
          return;
        }

        const provider = validatedArgs.provider;
        const info = PROVIDER_INFO[provider];

        console.log(`Testing ${info.name} configuration...`);

        // Check if key exists
        const hasKey = yield* apiKeyService.validate(provider);
        if (!hasKey) {
          console.log(`\n✗ ${info.name} is not configured`);
          console.log(`Run 'grimoire config llm add ${provider}' to configure it`);
          return;
        }

        // Try to use the LLM service to validate
        const llmService = yield* LLMService;

        const testResult = yield* Effect.either(
          Effect.gen(function* () {
            const llmProvider = yield* llmService.getProvider(provider);
            return yield* llmProvider.validateApiKey();
          })
        );

        if (testResult._tag === "Right" && testResult.right) {
          console.log(`\n✓ ${info.name} API key is valid`);
        } else {
          console.log(`\n? ${info.name} key exists but validation failed`);
          console.log("The key may still work - try 'grimoire test <prompt>' to verify");
        }
        break;
      }

      case "remove": {
        if (!validatedArgs.provider) {
          console.log(`Usage: grimoire config llm remove <${PROVIDERS.join("|")}>`);
          return;
        }

        const provider = validatedArgs.provider;
        const info = PROVIDER_INFO[provider];

        yield* apiKeyService.remove(provider);
        console.log(`✓ ${info.name} configuration removed from ~/.grimoire/.env`);
        break;
      }

      default:
        console.log("Usage: grimoire config llm <list|add|test|remove> [provider]");
        console.log("\nRun 'grimoire config' for more information");
    }
  });

/**
 * Prompt user for input (synchronous for simplicity)
 */
function promptForInput(prompt: string, _hideInput = false): Effect.Effect<string> {
  return Effect.async<string>((resume) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Note: hiding input in Node.js readline is complex, just show the prompt
    process.stdout.write(prompt);

    rl.question("", (answer) => {
      rl.close();
      resume(Effect.succeed(answer));
    });
  });
}
