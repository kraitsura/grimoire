import { Effect, Stream, Either } from "effect"
import { chat } from "@tanstack/ai"
import { createAnthropic } from "@tanstack/ai-anthropic"
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  StreamChunk,
} from "../llm-service"
import { LLMError } from "../llm-service"
import { ApiKeyService, ApiKeyNotFoundError } from "../api-key-service"

// Supported models (TanStack AI format)
const SUPPORTED_MODELS = [
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-opus-4",
  "claude-sonnet-4",
  "claude-3-7-sonnet",
  "claude-3-5-haiku",
  "claude-3-haiku",
] as const

type AnthropicModel = (typeof SUPPORTED_MODELS)[number]

// Map from full model names (used in requests) to TanStack AI model names
const MODEL_ALIASES: Record<string, AnthropicModel> = {
  "claude-sonnet-4-20250514": "claude-sonnet-4",
  "claude-opus-4-20250514": "claude-opus-4",
  "claude-3-5-sonnet-20241022": "claude-3-7-sonnet",
  "claude-3-5-haiku-20241022": "claude-3-5-haiku",
  "claude-opus-4-5-20251101": "claude-opus-4-5",
  "claude-sonnet-4-5-20250929": "claude-sonnet-4-5",
}

// Helper to extract system prompts from messages
const extractSystemPrompts = (
  messages: Array<{ role: string; content: string }>
): string[] => {
  return messages
    .filter((msg) => msg.role === "system")
    .map((msg) => msg.content)
}

// Helper to convert our messages to TanStack AI format (excluding system messages)
const convertMessages = (
  messages: Array<{ role: string; content: string }>
): Array<{ role: "user" | "assistant"; content: string }> => {
  return messages
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }))
}

// Helper to resolve model name to TanStack AI format
const resolveModel = (model: string): AnthropicModel => {
  // Check if it's already a valid TanStack AI model
  if (SUPPORTED_MODELS.includes(model as AnthropicModel)) {
    return model as AnthropicModel
  }
  // Check if it has an alias
  if (model in MODEL_ALIASES) {
    return MODEL_ALIASES[model]
  }
  // Default to claude-sonnet-4
  return "claude-sonnet-4"
}

// Create the Anthropic provider
export const makeAnthropicProvider = Effect.gen(function* () {
  const apiKeyService = yield* ApiKeyService

  const getApiKey = (): Effect.Effect<string, LLMError> =>
    apiKeyService.get("anthropic").pipe(
      Effect.mapError((error) => {
        if (error instanceof ApiKeyNotFoundError) {
          return new LLMError({
            message:
              "Anthropic API key not found. Set it using ANTHROPIC_API_KEY environment variable or grimoire config.",
            provider: "anthropic",
            cause: error,
          })
        }
        return new LLMError({
          message: "Failed to retrieve Anthropic API key",
          provider: "anthropic",
          cause: error,
        })
      })
    )

  const complete = (
    request: LLMRequest
  ): Effect.Effect<LLMResponse, LLMError, never> =>
    Effect.gen(function* () {
      const apiKey = yield* getApiKey()

      // Resolve model name to TanStack AI format
      const modelToUse = resolveModel(request.model)

      const systemPrompts = extractSystemPrompts(request.messages)
      const messages = convertMessages(request.messages)

      const result = yield* Effect.tryPromise({
        try: async () => {
          const adapter = createAnthropic(apiKey)

          const chatStream = chat({
            adapter,
            model: modelToUse,
            messages,
            systemPrompts: systemPrompts.length > 0 ? systemPrompts : undefined,
          })

          // Collect all chunks for non-streaming response
          let content = ""
          let inputTokens = 0
          let outputTokens = 0

          for await (const chunk of chatStream) {
            if (chunk.type === "content" && chunk.content) {
              content += chunk.content
            }
            if (chunk.type === "done" && chunk.usage) {
              // TanStack AI uses promptTokens/completionTokens
              inputTokens = chunk.usage.promptTokens ?? 0
              outputTokens = chunk.usage.completionTokens ?? 0
            }
          }

          return {
            content,
            model: request.model,
            usage: {
              inputTokens,
              outputTokens,
            },
            finishReason: "stop" as const,
          }
        },
        catch: (error) =>
          new LLMError({
            message: `Anthropic API error: ${error instanceof Error ? error.message : String(error)}`,
            provider: "anthropic",
            cause: error,
          }),
      })

      return result
    })

  const stream = (
    request: LLMRequest
  ): Stream.Stream<StreamChunk, LLMError, never> =>
    Stream.asyncEffect<StreamChunk, LLMError>((emit) =>
      Effect.gen(function* () {
        const apiKey = yield* getApiKey()

        // Resolve model name to TanStack AI format
        const modelToUse = resolveModel(request.model)

        const systemPrompts = extractSystemPrompts(request.messages)
        const messages = convertMessages(request.messages)

        yield* Effect.tryPromise({
          try: async () => {
            const adapter = createAnthropic(apiKey)

            const chatStream = chat({
              adapter,
              model: modelToUse,
              messages,
              systemPrompts: systemPrompts.length > 0 ? systemPrompts : undefined,
            })

            for await (const chunk of chatStream) {
              if (chunk.type === "content" && chunk.content) {
                await emit.single({
                  content: chunk.content,
                  done: false,
                })
              }
              if (chunk.type === "done") {
                await emit.single({ content: "", done: true })
              }
            }
          },
          catch: (error) =>
            new LLMError({
              message: `Anthropic streaming error: ${error instanceof Error ? error.message : String(error)}`,
              provider: "anthropic",
              cause: error,
            }),
        })
      }) as Effect.Effect<void, LLMError>
    )

  const listModels = (): Effect.Effect<string[], LLMError> =>
    Effect.succeed([...SUPPORTED_MODELS])

  const validateApiKey = (): Effect.Effect<boolean, LLMError, never> =>
    Effect.gen(function* () {
      // Try to get API key
      const apiKeyResult = yield* Effect.either(getApiKey())

      if (Either.isLeft(apiKeyResult)) {
        return false
      }

      const apiKey = apiKeyResult.right

      // Make a minimal request to validate the key
      const result = yield* Effect.tryPromise({
        try: async () => {
          const adapter = createAnthropic(apiKey)

          const stream = chat({
            adapter,
            model: "claude-3-5-haiku",
            messages: [{ role: "user", content: "test" }],
          })

          // Just try to get first chunk to validate
          for await (const _ of stream) {
            break
          }

          return true
        },
        catch: () => false as boolean,
      })

      return result
    }).pipe(Effect.catchAll(() => Effect.succeed(false)))

  return {
    name: "anthropic",
    complete,
    stream,
    listModels,
    validateApiKey,
  } as const satisfies LLMProvider
})

// Layer for the Anthropic provider
export const AnthropicProviderLive = Effect.gen(function* () {
  return yield* makeAnthropicProvider
}).pipe(Effect.withSpan("AnthropicProvider.make"))
