import { Context, Effect, Layer, Data } from "effect";
import { join } from "path";
import { homedir } from "os";

// Error types
export class ApiKeyNotFoundError extends Data.TaggedError("ApiKeyNotFoundError")<{
  provider: string;
}> {}

export class EnvFileWriteError extends Data.TaggedError("EnvFileWriteError")<{
  message: string;
}> {}

// Environment variable mapping
const ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  ollama: "OLLAMA_HOST",
  google: "GOOGLE_API_KEY",
};

/**
 * Get the environment variable name for a provider
 */
export const getEnvVarName = (provider: string): string | undefined => {
  return ENV_KEYS[provider.toLowerCase()];
};

/**
 * Get the .env file path
 */
const getEnvFilePath = (): string => {
  return join(homedir(), ".grimoire", ".env");
};

/**
 * Parse .env file content into a Map
 */
const parseEnvFile = (content: string): Map<string, string> => {
  const entries = new Map<string, string>();
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      entries.set(key, value);
    }
  }

  return entries;
};

/**
 * Serialize Map back to .env file format
 */
const serializeEnvFile = (entries: Map<string, string>): string => {
  const lines: string[] = [
    "# Grimoire API Keys",
    "# This file is auto-generated. You can also edit it manually.",
    "",
  ];

  for (const [key, value] of entries) {
    // Quote values that contain spaces or special characters
    const needsQuotes = /[\s#=]/.test(value);
    const formattedValue = needsQuotes ? `"${value}"` : value;
    lines.push(`${key}=${formattedValue}`);
  }

  return lines.join("\n") + "\n";
};

// Service interface
interface ApiKeyServiceImpl {
  readonly get: (provider: string) => Effect.Effect<string, ApiKeyNotFoundError>;
  readonly set: (provider: string, key: string) => Effect.Effect<void, EnvFileWriteError>;
  readonly remove: (provider: string) => Effect.Effect<void, EnvFileWriteError>;
  readonly list: () => Effect.Effect<string[]>;
  readonly validate: (provider: string) => Effect.Effect<boolean>;
  readonly mask: (key: string) => string;
}

// Service tag
export class ApiKeyService extends Context.Tag("ApiKeyService")<
  ApiKeyService,
  ApiKeyServiceImpl
>() {}

// Helper functions
const getFromEnv = (provider: string): string | undefined => {
  const envKey = ENV_KEYS[provider.toLowerCase()];
  return envKey ? process.env[envKey] : undefined;
};

const maskKey = (key: string): string => {
  if (key.length <= 8) {
    return "***";
  }

  const start = key.slice(0, 4);
  const end = key.slice(-4);
  return `${start}...${end}`;
};

/**
 * Read and parse the .env file
 */
const readEnvFile = (): Effect.Effect<Map<string, string>> =>
  Effect.gen(function* () {
    const envPath = getEnvFilePath();
    const file = Bun.file(envPath);

    const exists = yield* Effect.promise(() => file.exists());
    if (!exists) {
      return new Map<string, string>();
    }

    const content = yield* Effect.promise(() => file.text());
    return parseEnvFile(content);
  }).pipe(Effect.catchAll(() => Effect.succeed(new Map<string, string>())));

/**
 * Write the .env file with proper permissions
 */
const writeEnvFile = (entries: Map<string, string>): Effect.Effect<void, EnvFileWriteError> =>
  Effect.gen(function* () {
    const envPath = getEnvFilePath();
    const envDir = join(homedir(), ".grimoire");

    try {
      // Ensure directory exists
      yield* Effect.promise(() =>
        import("fs/promises").then((fs) => fs.mkdir(envDir, { recursive: true }))
      );

      // Write .env file
      const content = serializeEnvFile(entries);
      yield* Effect.promise(() => Bun.write(envPath, content));

      // Set file permissions to 0600 (user read/write only) for security
      yield* Effect.promise(() => import("fs/promises").then((fs) => fs.chmod(envPath, 0o600)));
    } catch (error) {
      return yield* Effect.fail(
        new EnvFileWriteError({
          message: `Failed to write .env file: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
  });

// Service implementation
const makeApiKeyService = (): ApiKeyServiceImpl => ({
  get: (provider: string) =>
    Effect.gen(function* () {
      // Check environment variables (includes those loaded from .env at startup)
      const envValue = getFromEnv(provider);
      if (envValue) {
        return envValue;
      }

      // Not found in environment
      return yield* Effect.fail(new ApiKeyNotFoundError({ provider }));
    }),

  set: (provider: string, key: string) =>
    Effect.gen(function* () {
      const envKey = ENV_KEYS[provider.toLowerCase()];
      if (!envKey) {
        return yield* Effect.fail(
          new EnvFileWriteError({ message: `Unknown provider: ${provider}` })
        );
      }

      // Read existing .env file
      const entries = yield* readEnvFile();

      // Update or add the key
      entries.set(envKey, key);

      // Write back to .env file
      yield* writeEnvFile(entries);

      // Also update process.env so the key is immediately available
      process.env[envKey] = key;
    }),

  remove: (provider: string) =>
    Effect.gen(function* () {
      const envKey = ENV_KEYS[provider.toLowerCase()];
      if (!envKey) {
        return; // Unknown provider, nothing to remove
      }

      // Read existing .env file
      const entries = yield* readEnvFile();

      // Remove the key if it exists
      if (entries.has(envKey)) {
        entries.delete(envKey);
        yield* writeEnvFile(entries);
      }

      // Also remove from process.env
      delete process.env[envKey];
    }),

  list: () =>
    Effect.sync(() => {
      const providers: string[] = [];

      // Return providers configured via environment variables
      for (const [provider, envKey] of Object.entries(ENV_KEYS)) {
        if (process.env[envKey]) {
          providers.push(provider);
        }
      }

      return providers.sort();
    }),

  validate: (provider: string) =>
    Effect.sync(() => {
      const envValue = getFromEnv(provider);
      return !!envValue;
    }),

  mask: maskKey,
});

// Live layer
export const ApiKeyServiceLive = Layer.succeed(ApiKeyService, makeApiKeyService());
