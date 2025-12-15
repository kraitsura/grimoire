import { Context, Effect, Layer, Data } from "effect"
import * as yaml from "js-yaml"
import { join } from "path"
import { homedir } from "os"

// Error types
export class ApiKeyNotFoundError extends Data.TaggedError("ApiKeyNotFoundError")<{
  provider: string
}> {}

export class ConfigReadError extends Data.TaggedError("ConfigReadError")<{
  message: string
}> {}

export class ConfigWriteError extends Data.TaggedError("ConfigWriteError")<{
  message: string
}> {}

// Environment variable mapping
const ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  ollama: "OLLAMA_HOST"
}

// Config file structure
interface Config {
  api_keys?: Record<string, string>
}

// Service interface
interface ApiKeyServiceImpl {
  readonly get: (provider: string) => Effect.Effect<string, ApiKeyNotFoundError>
  readonly set: (provider: string, key: string) => Effect.Effect<void, ConfigReadError | ConfigWriteError>
  readonly remove: (provider: string) => Effect.Effect<void, ConfigReadError | ConfigWriteError>
  readonly list: () => Effect.Effect<string[]>
  readonly validate: (provider: string) => Effect.Effect<boolean>
  readonly mask: (key: string) => string
}

// Service tag
export class ApiKeyService extends Context.Tag("ApiKeyService")<
  ApiKeyService,
  ApiKeyServiceImpl
>() {}

// Helper functions
const getConfigPath = (): string => {
  return join(homedir(), ".grimoire", "config.yaml")
}

const readConfig = (): Effect.Effect<Config, ConfigReadError> =>
  Effect.gen(function* () {
    const configPath = getConfigPath()
    const file = Bun.file(configPath)

    try {
      const exists = yield* Effect.promise(() => file.exists())

      if (!exists) {
        return { api_keys: {} }
      }

      const content = yield* Effect.promise(() => file.text())

      if (!content.trim()) {
        return { api_keys: {} }
      }

      const parsed = yaml.load(content) as Config | null
      return parsed ?? { api_keys: {} }
    } catch (error) {
      return yield* Effect.fail(
        new ConfigReadError({
          message: `Failed to read config: ${error instanceof Error ? error.message : String(error)}`
        })
      )
    }
  })

const writeConfig = (config: Config): Effect.Effect<void, ConfigWriteError> =>
  Effect.gen(function* () {
    const configPath = getConfigPath()
    const configDir = join(homedir(), ".grimoire")

    try {
      // Ensure directory exists
      yield* Effect.promise(() =>
        Bun.write(configDir + "/.keep", "").catch(() => {
          // Directory might not exist, try to create it
          return import("fs/promises").then(fs =>
            fs.mkdir(configDir, { recursive: true })
          )
        })
      )

      // Write config file
      const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: 120,
        noRefs: true
      })

      yield* Effect.promise(() => Bun.write(configPath, yamlContent))

      // Set file permissions to 0600 (user read/write only)
      yield* Effect.promise(() =>
        import("fs/promises").then(fs => fs.chmod(configPath, 0o600))
      )
    } catch (error) {
      return yield* Effect.fail(
        new ConfigWriteError({
          message: `Failed to write config: ${error instanceof Error ? error.message : String(error)}`
        })
      )
    }
  })

const getFromEnv = (provider: string): string | undefined => {
  const envKey = ENV_KEYS[provider.toLowerCase()]
  return envKey ? process.env[envKey] : undefined
}

const maskKey = (key: string): string => {
  if (key.length <= 8) {
    return "***"
  }

  const start = key.slice(0, 4)
  const end = key.slice(-4)
  return `${start}...${end}`
}

// Service implementation
const makeApiKeyService = (): ApiKeyServiceImpl => ({
  get: (provider: string) =>
    Effect.gen(function* () {
      // 1. Check environment variable first
      const envValue = getFromEnv(provider)
      if (envValue) {
        return envValue
      }

      // 2. Check config file
      const config = yield* readConfig().pipe(
        Effect.catchAll(() => Effect.succeed({ api_keys: {} as Record<string, string> }))
      )

      const apiKeys: Record<string, string> = config.api_keys ?? {}
      const key = apiKeys[provider.toLowerCase()]

      if (key) {
        return key
      }

      // Not found in either location
      return yield* Effect.fail(
        new ApiKeyNotFoundError({ provider })
      )
    }),

  set: (provider: string, key: string) =>
    Effect.gen(function* () {
      const config = yield* readConfig().pipe(
        Effect.catchAll(() => Effect.succeed({ api_keys: {} as Record<string, string> }))
      )

      const apiKeys: Record<string, string> = config.api_keys ?? {}
      apiKeys[provider.toLowerCase()] = key
      config.api_keys = apiKeys

      yield* writeConfig(config)
    }),

  remove: (provider: string) =>
    Effect.gen(function* () {
      const config = yield* readConfig().pipe(
        Effect.catchAll(() => Effect.succeed({ api_keys: {} as Record<string, string> }))
      )

      const apiKeys: Record<string, string> = config.api_keys ?? {}
      delete apiKeys[provider.toLowerCase()]
      config.api_keys = apiKeys

      yield* writeConfig(config)
    }),

  list: () =>
    Effect.gen(function* () {
      const providers: string[] = []

      // Add providers from environment variables
      for (const [provider, envKey] of Object.entries(ENV_KEYS)) {
        if (process.env[envKey]) {
          providers.push(provider)
        }
      }

      // Add providers from config file
      const config = yield* readConfig().pipe(
        Effect.catchAll(() => Effect.succeed({ api_keys: {} }))
      )

      if (config.api_keys) {
        for (const provider of Object.keys(config.api_keys)) {
          if (!providers.includes(provider)) {
            providers.push(provider)
          }
        }
      }

      return providers.sort()
    }),

  validate: (provider: string) =>
    Effect.gen(function* () {
      const result = yield* Effect.either(
        makeApiKeyService().get(provider)
      )

      return result._tag === "Right"
    }),

  mask: maskKey
})

// Live layer
export const ApiKeyServiceLive = Layer.effect(
  ApiKeyService,
  Effect.gen(function* () {
    return makeApiKeyService()
  })
)
