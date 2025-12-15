/**
 * Config Command - Configure LLM providers and settings
 */

import { Effect } from "effect";
import { ApiKeyService, LLMService } from "../services";
import type { ParsedArgs } from "../cli/parser";
import * as readline from "readline";

// Supported providers
const PROVIDERS = ["openai", "anthropic", "ollama"] as const;
type Provider = (typeof PROVIDERS)[number];

const PROVIDER_INFO: Record<Provider, { name: string; envVar: string; keyPrefix?: string }> = {
  openai: { name: "OpenAI", envVar: "OPENAI_API_KEY", keyPrefix: "sk-" },
  anthropic: { name: "Anthropic", envVar: "ANTHROPIC_API_KEY", keyPrefix: "sk-ant-" },
  ollama: { name: "Ollama", envVar: "OLLAMA_HOST" },
};

/**
 * Config command handler
 */
export const configCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0]; // "llm"
    const action = args.positional[1]; // "list", "add", etc.
    const target = args.positional[2]; // provider name or model

    if (subcommand !== "llm") {
      console.log("Usage: grimoire config llm <list|add|test|remove> [provider]");
      console.log("\nManage LLM provider configuration.");
      console.log("\nSubcommands:");
      console.log("  list              List configured providers");
      console.log("  add <provider>    Add or update provider API key");
      console.log("  test <provider>   Test provider API key");
      console.log("  remove <provider> Remove provider configuration");
      console.log("\nProviders: openai, anthropic, ollama");
      return;
    }

    const apiKeyService = yield* ApiKeyService;

    switch (action) {
      case "list": {
        console.log("LLM Provider Configuration\n");
        console.log("PROVIDER".padEnd(15) + "STATUS".padEnd(15) + "SOURCE");
        console.log("-".repeat(50));

        for (const provider of PROVIDERS) {
          const info = PROVIDER_INFO[provider];
          const hasEnv = !!process.env[info.envVar];
          const hasConfig = yield* apiKeyService.validate(provider);

          let status = "\x1b[31m✗ Not configured\x1b[0m";
          let source = "-";

          if (hasEnv) {
            status = "\x1b[32m✓ Configured\x1b[0m";
            source = `env (${info.envVar})`;
          } else if (hasConfig) {
            status = "\x1b[32m✓ Configured\x1b[0m";
            source = "config file";
          }

          console.log(`${info.name.padEnd(15)}${status.padEnd(26)}${source}`);
        }

        console.log("\nTip: Use 'grimoire config llm add <provider>' to configure a provider");
        break;
      }

      case "add": {
        if (!target || !PROVIDERS.includes(target as Provider)) {
          console.log(`Usage: grimoire config llm add <${PROVIDERS.join("|")}>`);
          return;
        }

        const provider = target as Provider;
        const info = PROVIDER_INFO[provider];

        // Check if already configured via env
        if (process.env[info.envVar]) {
          console.log(`Note: ${info.name} is already configured via environment variable ${info.envVar}`);
          console.log("Config file settings will be used as fallback.\n");
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
        console.log(`\n✓ ${info.name} API key saved to config file`);
        console.log("Tip: Run 'grimoire config llm test " + provider + "' to verify the key works");
        break;
      }

      case "test": {
        if (!target || !PROVIDERS.includes(target as Provider)) {
          console.log(`Usage: grimoire config llm test <${PROVIDERS.join("|")}>`);
          return;
        }

        const provider = target as Provider;
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
        if (!target || !PROVIDERS.includes(target as Provider)) {
          console.log(`Usage: grimoire config llm remove <${PROVIDERS.join("|")}>`);
          return;
        }

        const provider = target as Provider;
        const info = PROVIDER_INFO[provider];

        if (process.env[info.envVar]) {
          console.log(`Note: ${info.name} is configured via environment variable ${info.envVar}`);
          console.log("This command only removes the config file entry.\n");
        }

        yield* apiKeyService.remove(provider);
        console.log(`✓ ${info.name} configuration removed from config file`);
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
function promptForInput(prompt: string, hideInput: boolean = false): Effect.Effect<string> {
  return Effect.async<string>((resume) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // For hiding input (passwords/keys), we can't easily do this in Node
    // So we just show a note
    if (hideInput) {
      process.stdout.write(prompt);
    }

    rl.question(hideInput ? "" : prompt, (answer) => {
      rl.close();
      resume(Effect.succeed(answer));
    });
  });
}
