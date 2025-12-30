/**
 * Config Command - Configure LLM providers and settings
 *
 * API keys are stored in ~/.grimoire/.env with 0600 permissions.
 * Default model/provider stored in ~/.grimoire/config.json.
 */

import React from "react";
import { render } from "ink";
import { Effect } from "effect";
import { Schema } from "@effect/schema";
import { ApiKeyService, LLMService, ConfigService } from "../services";
import { ConfigCommandArgsSchema, ValidationError } from "../models";
import type { ParsedArgs } from "../cli/parser";
import * as readline from "readline";
import { ModelSelector, getDefaultModelForProvider } from "../cli/components/ModelSelector";

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
      console.log("Usage: grimoire config llm <list|add|test|doctor|remove> [provider]");
      console.log("\nManage LLM provider configuration.");
      console.log("\nSubcommands:");
      console.log("  list              List configured providers");
      console.log("  add <provider>    Add or update provider API key");
      console.log("  test [provider]   Quick API key validation");
      console.log("  doctor [provider] Full diagnostic with model tests");
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
        const configService = yield* ConfigService;
        const defaults = yield* configService.getDefaultModel();

        console.log("LLM Provider Configuration\n");

        // Show default model if configured
        if (defaults) {
          console.log(`Default: \x1b[36m${defaults.model}\x1b[0m (${defaults.provider})\n`);
        } else {
          console.log("Default: \x1b[33mNot configured\x1b[0m\n");
        }

        console.log("PROVIDER".padEnd(15) + "STATUS".padEnd(20) + "ENV VAR");
        console.log("-".repeat(60));

        for (const provider of PROVIDERS) {
          const info = PROVIDER_INFO[provider];
          const isConfigured = yield* apiKeyService.validate(provider);

          const isDefault = defaults?.provider === provider;
          const status = isConfigured
            ? `\x1b[32m[ok] Configured${isDefault ? " *" : ""}\x1b[0m`
            : "\x1b[31m[!!] Not set\x1b[0m";

          console.log(`${info.name.padEnd(15)}${status.padEnd(31)}${info.envVar}`);
        }

        console.log("\n* = default provider");
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
        const configService = yield* ConfigService;

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
            console.log(`\n[ok] ${info.name} configured with default host`);
          } else {
            console.log("Cancelled - no API key provided");
            return;
          }
        } else {
          // Basic validation
          if (info.keyPrefix && !apiKey.startsWith(info.keyPrefix)) {
            console.log(`\nWarning: API key doesn't start with expected prefix '${info.keyPrefix}'`);
          }

          yield* apiKeyService.set(provider, apiKey.trim());
          console.log(`\n[ok] ${info.name} API key saved to ~/.grimoire/.env`);
        }

        // Validate the API key
        console.log(`\nValidating ${info.name} API key...`);
        const llmService = yield* LLMService;

        const validationResult = yield* Effect.either(
          Effect.gen(function* () {
            const llmProvider = yield* llmService.getProvider(provider);
            return yield* llmProvider.validateApiKey();
          })
        );

        if (validationResult._tag === "Right" && validationResult.right) {
          console.log(`[ok] API key is valid\n`);
        } else {
          console.log(`[!] Could not validate API key (it may still work)\n`);
        }

        // Show model selection
        const selectedModel = yield* selectModel(provider);

        if (selectedModel) {
          yield* configService.setDefaultModel(provider, selectedModel);
          console.log(`\n[ok] Default model set to: ${selectedModel}`);
        } else {
          // Use default model for provider
          const defaultModel = getDefaultModelForProvider(provider);
          if (defaultModel) {
            yield* configService.setDefaultModel(provider, defaultModel);
            console.log(`\n[ok] Default model set to: ${defaultModel}`);
          }
        }

        // Add provider to config
        yield* configService.addProvider(provider);
        console.log(`[ok] ${info.name} is now your default provider`);
        break;
      }

      case "test":
      case "doctor": {
        const provider = validatedArgs.provider;

        // If no provider specified, test all configured providers
        const providersToTest: Provider[] = provider
          ? [provider]
          : yield* Effect.gen(function* () {
              const configured: Provider[] = [];
              for (const p of PROVIDERS) {
                const hasKey = yield* apiKeyService.validate(p);
                if (hasKey) configured.push(p);
              }
              return configured;
            });

        if (providersToTest.length === 0) {
          console.log("No providers configured.");
          console.log(`Run 'grimoire config llm add <${PROVIDERS.join("|")}>' to configure one.`);
          return;
        }

        const llmService = yield* LLMService;
        const isDoctor = validatedArgs.action === "doctor";

        console.log(isDoctor ? "\n LLM Provider Diagnostics\n" : "\nTesting LLM Provider(s)...\n");
        console.log("─".repeat(60));

        for (const p of providersToTest) {
          const info = PROVIDER_INFO[p];
          console.log(`\n${info.name}:`);

          // Step 1: Check API key
          const hasKey = yield* apiKeyService.validate(p);
          if (!hasKey) {
            console.log("  X API key not configured");
            continue;
          }
          console.log("  + API key configured");

          // Step 2: Get provider and validate key
          const providerResult = yield* Effect.either(llmService.getProvider(p));
          if (providerResult._tag === "Left") {
            console.log(`  X Provider not available: ${providerResult.left.message}`);
            continue;
          }
          const llmProvider = providerResult.right;

          const validResult = yield* Effect.either(llmProvider.validateApiKey());
          if (validResult._tag === "Right" && validResult.right) {
            console.log("  + API key validated");
          } else {
            console.log("  ! API key validation uncertain");
          }

          // Step 3: For doctor mode, test actual model calls
          if (isDoctor) {
            const models = yield* Effect.either(llmProvider.listModels());
            if (models._tag === "Left") {
              console.log(`  X Could not list models`);
              continue;
            }

            console.log(`  📋 Testing ${models.right.length} models...`);

            for (const model of models.right.slice(0, 5)) {
              // Test top 5 models
              const testResult = yield* Effect.either(
                Effect.gen(function* () {
                  const stream = llmService.stream({
                    model,
                    messages: [{ role: "user", content: "Hi" }],
                    maxTokens: 10,
                  });

                  let gotContent = false;
                  let error: string | null = null;

                  yield* Effect.tryPromise({
                    try: async () => {
                      const { Stream } = await import("effect");
                      await Effect.runPromise(
                        Stream.runForEach(stream, (chunk) =>
                          Effect.sync(() => {
                            if (chunk.type === "content" && chunk.content) gotContent = true;
                            if (chunk.type === "done" && chunk.content?.includes("error")) {
                              error = chunk.content;
                            }
                          })
                        )
                      );
                    },
                    catch: (e) => e,
                  });

                  return { gotContent, error };
                }).pipe(Effect.timeout("15 seconds"))
              );

              if (testResult._tag === "Right" && testResult.right.gotContent) {
                console.log(`     + ${model}`);
              } else if (testResult._tag === "Left") {
                const errMsg =
                  testResult.left && typeof testResult.left === "object" && "message" in testResult.left
                    ? (testResult.left as { message: string }).message.slice(0, 50)
                    : "timeout";
                console.log(`     X ${model}: ${errMsg}`);
              } else {
                console.log(`     X ${model}: no response`);
              }
            }

            if (models.right.length > 5) {
              console.log(`     ... and ${models.right.length - 5} more models`);
            }
          }
        }

        console.log("\n" + "─".repeat(60));
        if (isDoctor) {
          console.log("\n+ Diagnostic complete\n");
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
        const configService = yield* ConfigService;

        yield* apiKeyService.remove(provider);
        yield* configService.removeProvider(provider);
        console.log(`[ok] ${info.name} configuration removed`);
        break;
      }

      default:
        console.log("Usage: grimoire config llm <list|add|test|remove> [provider]");
        console.log("\nRun 'grimoire config' for more information");
    }
  });

/**
 * Prompt user for input with optional hidden/masked input for sensitive data
 */
function promptForInput(prompt: string, hideInput = false): Effect.Effect<string> {
  return Effect.async<string>((resume) => {
    process.stdout.write(prompt);

    if (!hideInput) {
      // Normal visible input
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question("", (answer) => {
        rl.close();
        resume(Effect.succeed(answer));
      });
    } else {
      // Hidden input - show asterisks instead of characters
      let input = "";

      if (!process.stdin.isTTY) {
        // Non-TTY mode (piped input), just read normally
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question("", (answer) => {
          rl.close();
          resume(Effect.succeed(answer));
        });
        return;
      }

      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");

      const onData = (char: string) => {
        const charCode = char.charCodeAt(0);

        if (char === "\r" || char === "\n") {
          // Enter pressed - done
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resume(Effect.succeed(input));
        } else if (charCode === 3) {
          // Ctrl+C - exit
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          process.exit(0);
        } else if (charCode === 127 || charCode === 8) {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write("\b \b"); // Erase the asterisk
          }
        } else if (charCode >= 32) {
          // Printable character
          input += char;
          process.stdout.write("*");
        }
      };

      process.stdin.on("data", onData);
    }
  });
}

/**
 * Show model selection UI and return selected model
 */
function selectModel(provider: string): Effect.Effect<string | null> {
  return Effect.async<string | null>((resume) => {
    const { unmount } = render(
      React.createElement(ModelSelector, {
        provider,
        onSelect: (model: string) => {
          unmount();
          resume(Effect.succeed(model));
        },
        onCancel: () => {
          unmount();
          resume(Effect.succeed(null));
        },
      })
    );
  });
}
