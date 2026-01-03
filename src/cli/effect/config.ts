/**
 * Config Command - Configure LLM providers and settings
 */

import { Args, Command, Options } from "@effect/cli";
import { Effect, Stream } from "effect";
import React from "react";
import { render } from "ink";
import * as readline from "readline";
import { ApiKeyService, LLMService, ConfigService } from "../../services";
import { ModelSelector, getDefaultModelForProvider } from "../components/ModelSelector";
import { dotCommand as dotCommandHandler } from "../../commands/dot";

// Supported providers
const PROVIDERS = ["openai", "anthropic", "google", "ollama"] as const;
type Provider = (typeof PROVIDERS)[number];

const PROVIDER_INFO: Record<Provider, { name: string; envVar: string; keyPrefix?: string }> = {
  openai: { name: "OpenAI", envVar: "OPENAI_API_KEY", keyPrefix: "sk-" },
  anthropic: { name: "Anthropic", envVar: "ANTHROPIC_API_KEY", keyPrefix: "sk-ant-" },
  google: { name: "Google Gemini", envVar: "GOOGLE_API_KEY" },
  ollama: { name: "Ollama", envVar: "OLLAMA_HOST" },
};

const isProvider = (s: string): s is Provider => PROVIDERS.includes(s as Provider);

// Helper for prompting input
function promptForInput(prompt: string, hideInput = false): Effect.Effect<string> {
  return Effect.async<string>((resume) => {
    process.stdout.write(prompt);

    if (!hideInput) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question("", (answer) => {
        rl.close();
        resume(Effect.succeed(answer));
      });
    } else {
      let input = "";
      if (!process.stdin.isTTY) {
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
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resume(Effect.succeed(input));
        } else if (charCode === 3) {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          process.exit(0);
        } else if (charCode === 127 || charCode === 8) {
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (charCode >= 32) {
          input += char;
          process.stdout.write("*");
        }
      };
      process.stdin.on("data", onData);
    }
  });
}

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

// LLM subcommands

const llmList = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const configService = yield* ConfigService;
    const apiKeyService = yield* ApiKeyService;
    const defaults = yield* configService.getDefaultModel();

    console.log("LLM Provider Configuration\n");

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
  })
).pipe(Command.withDescription("List configured providers"));

const llmAdd = Command.make(
  "add",
  {
    provider: Args.text({ name: "provider" }).pipe(
      Args.withDescription("Provider: openai, anthropic, google, ollama")
    ),
  },
  ({ provider: providerRaw }) =>
    Effect.gen(function* () {
      if (!isProvider(providerRaw)) {
        console.log(`Unknown provider: ${providerRaw}`);
        console.log(`Valid providers: ${PROVIDERS.join(", ")}`);
        return;
      }
      const provider = providerRaw;
      const info = PROVIDER_INFO[provider];
      const apiKeyService = yield* ApiKeyService;
      const configService = yield* ConfigService;
      const llmService = yield* LLMService;

      const isConfigured = yield* apiKeyService.validate(provider);
      if (isConfigured) {
        console.log(`Note: ${info.name} is already configured. This will update the key.\n`);
      }

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
        if (info.keyPrefix && !apiKey.startsWith(info.keyPrefix)) {
          console.log(`\nWarning: API key doesn't start with expected prefix '${info.keyPrefix}'`);
        }
        yield* apiKeyService.set(provider, apiKey.trim());
        console.log(`\n[ok] ${info.name} API key saved to ~/.grimoire/.env`);
      }

      console.log(`\nValidating ${info.name} API key...`);
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

      const selectedModel = yield* selectModel(provider);
      if (selectedModel) {
        yield* configService.setDefaultModel(provider, selectedModel);
        console.log(`\n[ok] Default model set to: ${selectedModel}`);
      } else {
        const defaultModel = getDefaultModelForProvider(provider);
        if (defaultModel) {
          yield* configService.setDefaultModel(provider, defaultModel);
          console.log(`\n[ok] Default model set to: ${defaultModel}`);
        }
      }

      yield* configService.addProvider(provider);
      console.log(`[ok] ${info.name} is now your default provider`);
    })
).pipe(Command.withDescription("Add or update API key"));

const llmTest = Command.make(
  "test",
  {
    provider: Args.text({ name: "provider" }).pipe(
      Args.optional,
      Args.withDescription("Provider to test (or all if omitted)")
    ),
  },
  ({ provider: providerOpt }) =>
    Effect.gen(function* () {
      const apiKeyService = yield* ApiKeyService;
      const llmService = yield* LLMService;

      let providersToTest: Provider[];
      if (providerOpt._tag === "Some") {
        if (!isProvider(providerOpt.value)) {
          console.log(`Unknown provider: ${providerOpt.value}`);
          return;
        }
        providersToTest = [providerOpt.value];
      } else {
        providersToTest = [];
        for (const p of PROVIDERS) {
          const hasKey = yield* apiKeyService.validate(p);
          if (hasKey) providersToTest.push(p);
        }
      }

      if (providersToTest.length === 0) {
        console.log("No providers configured.");
        console.log(`Run 'grimoire config llm add <${PROVIDERS.join("|")}>' to configure one.`);
        return;
      }

      console.log("\nTesting LLM Provider(s)...\n");
      console.log("─".repeat(60));

      for (const p of providersToTest) {
        const info = PROVIDER_INFO[p];
        console.log(`\n${info.name}:`);

        const hasKey = yield* apiKeyService.validate(p);
        if (!hasKey) {
          console.log("  X API key not configured");
          continue;
        }
        console.log("  + API key configured");

        const providerResult = yield* Effect.either(llmService.getProvider(p));
        if (providerResult._tag === "Left") {
          console.log(`  X Provider not available: ${providerResult.left.message}`);
          continue;
        }

        const validResult = yield* Effect.either(providerResult.right.validateApiKey());
        if (validResult._tag === "Right" && validResult.right) {
          console.log("  + API key validated");
        } else {
          console.log("  ! API key validation uncertain");
        }
      }

      console.log("\n" + "─".repeat(60));
    })
).pipe(Command.withDescription("Quick API key validation"));

const llmDoctor = Command.make(
  "doctor",
  {
    provider: Args.text({ name: "provider" }).pipe(
      Args.optional,
      Args.withDescription("Provider to diagnose (or all if omitted)")
    ),
  },
  ({ provider: providerOpt }) =>
    Effect.gen(function* () {
      const apiKeyService = yield* ApiKeyService;
      const llmService = yield* LLMService;

      let providersToTest: Provider[];
      if (providerOpt._tag === "Some") {
        if (!isProvider(providerOpt.value)) {
          console.log(`Unknown provider: ${providerOpt.value}`);
          return;
        }
        providersToTest = [providerOpt.value];
      } else {
        providersToTest = [];
        for (const p of PROVIDERS) {
          const hasKey = yield* apiKeyService.validate(p);
          if (hasKey) providersToTest.push(p);
        }
      }

      if (providersToTest.length === 0) {
        console.log("No providers configured.");
        return;
      }

      console.log("\nLLM Provider Diagnostics\n");
      console.log("─".repeat(60));

      for (const p of providersToTest) {
        const info = PROVIDER_INFO[p];
        console.log(`\n${info.name}:`);

        const hasKey = yield* apiKeyService.validate(p);
        if (!hasKey) {
          console.log("  X API key not configured");
          continue;
        }
        console.log("  + API key configured");

        const providerResult = yield* Effect.either(llmService.getProvider(p));
        if (providerResult._tag === "Left") {
          console.log(`  X Provider not available`);
          continue;
        }
        const llmProvider = providerResult.right;

        const validResult = yield* Effect.either(llmProvider.validateApiKey());
        if (validResult._tag === "Right" && validResult.right) {
          console.log("  + API key validated");
        } else {
          console.log("  ! API key validation uncertain");
        }

        const models = yield* Effect.either(llmProvider.listModels());
        if (models._tag === "Left") {
          console.log(`  X Could not list models`);
          continue;
        }

        console.log(`  Testing ${models.right.length} models...`);
        for (const model of models.right.slice(0, 5)) {
          const testResult = yield* Effect.either(
            Effect.gen(function* () {
              const stream = llmService.stream({
                model,
                messages: [{ role: "user", content: "Hi" }],
                maxTokens: 10,
              });

              let gotContent = false;
              yield* Stream.runForEach(stream, (chunk) =>
                Effect.sync(() => {
                  if (chunk.type === "content" && chunk.content) gotContent = true;
                })
              ).pipe(Effect.timeout("15 seconds"));

              return { gotContent };
            })
          );

          if (testResult._tag === "Right" && testResult.right.gotContent) {
            console.log(`     + ${model}`);
          } else {
            console.log(`     X ${model}`);
          }
        }

        if (models.right.length > 5) {
          console.log(`     ... and ${models.right.length - 5} more models`);
        }
      }

      console.log("\n" + "─".repeat(60));
      console.log("\n+ Diagnostic complete\n");
    })
).pipe(Command.withDescription("Full diagnostic with model tests"));

const llmRemove = Command.make(
  "remove",
  {
    provider: Args.text({ name: "provider" }).pipe(
      Args.withDescription("Provider to remove: openai, anthropic, google, ollama")
    ),
  },
  ({ provider: providerRaw }) =>
    Effect.gen(function* () {
      if (!isProvider(providerRaw)) {
        console.log(`Unknown provider: ${providerRaw}`);
        console.log(`Valid providers: ${PROVIDERS.join(", ")}`);
        return;
      }
      const provider = providerRaw;
      const info = PROVIDER_INFO[provider];
      const apiKeyService = yield* ApiKeyService;
      const configService = yield* ConfigService;

      yield* apiKeyService.remove(provider);
      yield* configService.removeProvider(provider);
      console.log(`[ok] ${info.name} configuration removed`);
    })
).pipe(Command.withDescription("Remove provider"));

const llmCommand = Command.make("llm", {}, () =>
  Effect.sync(() => {
    console.log("LLM Configuration\n");
    console.log("USAGE:");
    console.log("  grim config llm <command> [provider]\n");
    console.log("COMMANDS:");
    console.log("  list              List configured providers");
    console.log("  add <provider>    Add or update API key");
    console.log("  test [provider]   Quick API key validation");
    console.log("  doctor [provider] Full diagnostic with model tests");
    console.log("  remove <provider> Remove provider\n");
    console.log("Providers: openai, anthropic, google, ollama");
  })
).pipe(
  Command.withDescription("Manage LLM provider configuration"),
  Command.withSubcommands([llmList, llmAdd, llmTest, llmDoctor, llmRemove])
);

// Dot command (delegates to existing handler)
const dotCommand = Command.make(
  "dot",
  {
    path: Args.directory({ name: "path" }).pipe(
      Args.optional,
      Args.withDescription("Directory to browse")
    ),
    editor: Options.text("editor").pipe(
      Options.optional,
      Options.withDescription("Editor to use")
    ),
    setEditor: Options.text("set-editor").pipe(
      Options.optional,
      Options.withDescription("Set default editor")
    ),
  },
  ({ path, editor, setEditor }) =>
    Effect.promise(async () => {
      const flags: Record<string, string | boolean> = {};
      if (editor._tag === "Some") flags.editor = editor.value;
      if (setEditor._tag === "Some") flags["set-editor"] = setEditor.value;

      await dotCommandHandler({
        command: "dot",
        flags,
        positional: path._tag === "Some" ? [path.value] : [],
      });
    })
).pipe(Command.withDescription("Browse and edit dotfiles interactively"));

/**
 * Config command with subcommands
 */
export const configCommand = Command.make("config", {}, () =>
  Effect.sync(() => {
    console.log("Configuration and Settings\n");
    console.log("USAGE:");
    console.log("  grim config <subcommand> [options]\n");
    console.log("SUBCOMMANDS:");
    console.log("  llm             Manage LLM provider configuration");
    console.log("  dot             Browse and edit dotfiles interactively\n");
    console.log("Run 'grim config <command> --help' for command-specific help.");
  })
).pipe(
  Command.withDescription("Configuration and settings"),
  Command.withSubcommands([llmCommand, dotCommand])
);
