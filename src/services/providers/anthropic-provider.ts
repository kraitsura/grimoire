import { Effect, Stream, Data, Either, Option } from "effect"
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  StreamChunk,
  Message,
} from "../llm-service"
import { LLMError } from "../llm-service"
import { ApiKeyService, ApiKeyNotFoundError } from "../api-key-service"

// Anthropic API types
interface AnthropicMessage {
  role: "user" | "assistant"
  content: string
}

interface AnthropicRequest {
  model: string
  messages: AnthropicMessage[]
  max_tokens: number
  temperature?: number
  stop_sequences?: string[]
  stream: boolean
  system?: string
}

interface AnthropicResponse {
  id: string
  type: "message"
  role: "assistant"
  content: Array<{ type: "text"; text: string }>
  model: string
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | null
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

interface AnthropicError {
  type: "error"
  error: {
    type: string
    message: string
  }
}

// SSE event types
interface SSEMessageStart {
  type: "message_start"
  message: {
    id: string
    type: "message"
    role: "assistant"
    content: []
    model: string
    usage: {
      input_tokens: number
      output_tokens: number
    }
  }
}

interface SSEContentBlockDelta {
  type: "content_block_delta"
  index: number
  delta: {
    type: "text_delta"
    text: string
  }
}

interface SSEMessageDelta {
  type: "message_delta"
  delta: {
    stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | null
  }
  usage: {
    output_tokens: number
  }
}

interface SSEMessageStop {
  type: "message_stop"
}

type SSEEvent =
  | SSEMessageStart
  | SSEContentBlockDelta
  | SSEMessageDelta
  | SSEMessageStop
  | { type: "ping" }
  | { type: "content_block_start" }
  | { type: "content_block_stop" }

// Supported models
const SUPPORTED_MODELS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
] as const

const API_BASE_URL = "https://api.anthropic.com/v1"
const ANTHROPIC_VERSION = "2023-06-01"
const DEFAULT_MAX_TOKENS = 4096

// Helper to convert OpenAI-style messages to Anthropic format
const convertMessages = (
  messages: Message[]
): { system?: string; messages: AnthropicMessage[] } => {
  let system: string | undefined
  const anthropicMessages: AnthropicMessage[] = []

  for (const msg of messages) {
    if (msg.role === "system") {
      // Combine multiple system messages if present
      system = system ? `${system}\n\n${msg.content}` : msg.content
    } else {
      anthropicMessages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })
    }
  }

  return { system, messages: anthropicMessages }
}

// Helper to parse SSE stream
const parseSSELine = (line: string): SSEEvent | null => {
  if (!line.startsWith("data: ")) {
    return null
  }

  const data = line.slice(6).trim()

  if (data === "[DONE]") {
    return null
  }

  try {
    return JSON.parse(data) as SSEEvent
  } catch {
    return null
  }
}

// Helper to handle rate limit errors
const handleRateLimitError = (
  response: Response
): Effect.Effect<never, LLMError> => {
  const retryAfterHeader = response.headers.get("retry-after")
  let retryAfter: Date | undefined

  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10)
    if (!isNaN(seconds)) {
      retryAfter = new Date(Date.now() + seconds * 1000)
    }
  }

  return Effect.fail(
    new LLMError({
      provider: "anthropic",
      message: `Rate limit exceeded. ${retryAfter ? `Retry after ${retryAfter.toISOString()}` : "Please try again later."}`,
    })
  )
}

// Helper to parse error response
const parseErrorResponse = (
  body: unknown
): Effect.Effect<never, LLMError> => {
  const errorBody = body as AnthropicError

  if (errorBody?.error?.type === "rate_limit_error") {
    return Effect.fail(
      new LLMError({
        provider: "anthropic",
        message: errorBody.error.message,
      })
    )
  }

  return Effect.fail(
    new LLMError({
      message: errorBody?.error?.message || "Unknown error from Anthropic API",
      provider: "anthropic",
      cause: body,
    })
  )
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
      const { system, messages } = convertMessages(request.messages)

      const anthropicRequest: AnthropicRequest = {
        model: request.model,
        messages,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: request.temperature,
        stop_sequences: request.stopSequences,
        stream: false,
        system,
      }

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`${API_BASE_URL}/messages`, {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": ANTHROPIC_VERSION,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(anthropicRequest),
          }),
        catch: (error) =>
          new LLMError({
            message: `Failed to call Anthropic API: ${error instanceof Error ? error.message : String(error)}`,
            provider: "anthropic",
            cause: error,
          }),
      })

      if (response.status === 429) {
        return yield* handleRateLimitError(response)
      }

      if (!response.ok) {
        const errorBody = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: (error) =>
            new LLMError({
              message: "Failed to parse error response",
              provider: "anthropic",
              cause: error,
            }),
        }).pipe(Effect.catchAll(() => Effect.succeed({})))
        return yield* parseErrorResponse(errorBody)
      }

      const data = (yield* Effect.tryPromise({
        try: () => response.json(),
        catch: (error) =>
          new LLMError({
            message: "Failed to parse Anthropic API response",
            provider: "anthropic",
            cause: error,
          }),
      })) as AnthropicResponse

      const content = data.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")

      const finishReason: "stop" | "length" | "error" =
        data.stop_reason === "end_turn"
          ? "stop"
          : data.stop_reason === "max_tokens"
            ? "length"
            : "stop"

      return {
        content,
        model: data.model,
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        },
        finishReason,
      }
    })

  const stream = (
    request: LLMRequest
  ): Stream.Stream<StreamChunk, LLMError, never> =>
    Stream.asyncEffect<StreamChunk, LLMError>((emit) =>
      Effect.gen(function* () {
        const apiKey = yield* getApiKey()
        const { system, messages } = convertMessages(request.messages)

        const anthropicRequest: AnthropicRequest = {
          model: request.model,
          messages,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: request.temperature,
          stop_sequences: request.stopSequences,
          stream: true,
          system,
        }

        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(`${API_BASE_URL}/messages`, {
              method: "POST",
              headers: {
                "x-api-key": apiKey,
                "anthropic-version": ANTHROPIC_VERSION,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(anthropicRequest),
            }),
          catch: (error) =>
            new LLMError({
              message: `Failed to call Anthropic API: ${error instanceof Error ? error.message : String(error)}`,
              provider: "anthropic",
              cause: error,
            }),
        })

        if (response.status === 429) {
          return yield* handleRateLimitError(response)
        }

        if (!response.ok) {
          const errorBody = yield* Effect.tryPromise({
            try: () => response.json(),
            catch: (error) =>
              new LLMError({
                message: "Failed to parse error response",
                provider: "anthropic",
                cause: error,
              }),
          }).pipe(Effect.catchAll(() => Effect.succeed({})))
          return yield* parseErrorResponse(errorBody)
        }

        if (!response.body) {
          return yield* Effect.fail(
            new LLMError({
              message: "No response body from Anthropic API",
              provider: "anthropic",
            })
          )
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        try {
          while (true) {
            const result = yield* Effect.promise(() => reader.read())

            if (result.done) {
              yield* Effect.promise(() =>
                emit.single({ content: "", done: true })
              )
              break
            }

            buffer += decoder.decode(result.value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""

            for (const line of lines) {
              if (!line.trim()) continue

              const event = parseSSELine(line)
              if (!event) continue

              if (event.type === "content_block_delta") {
                yield* Effect.promise(() =>
                  emit.single({
                    content: event.delta.text,
                    done: false,
                  })
                )
              } else if (event.type === "message_stop") {
                yield* Effect.promise(() =>
                  emit.single({ content: "", done: true })
                )
              }
            }
          }
        } catch (error) {
          return yield* Effect.fail(
            new LLMError({
              message: `Error reading stream: ${error instanceof Error ? error.message : String(error)}`,
              provider: "anthropic",
              cause: error,
            })
          )
        } finally {
          reader.releaseLock()
        }
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
      const result = yield* Effect.either(
        Effect.tryPromise({
          try: () =>
            fetch(`${API_BASE_URL}/messages`, {
              method: "POST",
              headers: {
                "x-api-key": apiKey,
                "anthropic-version": ANTHROPIC_VERSION,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: SUPPORTED_MODELS[0],
                messages: [{ role: "user", content: "test" }],
                max_tokens: 1,
              }),
            }),
          catch: () =>
            new LLMError({
              message: "Network error validating API key",
              provider: "anthropic",
            }),
        })
      )

      if (Either.isLeft(result)) {
        return false
      }

      const response = result.right

      // If we get a 429 (rate limit), the key is valid but we're rate limited
      if (response.status === 429) {
        return true
      }

      // 200-299 means valid key
      // 401 means invalid key
      // Other errors might be network issues, so we'll consider them valid for now
      return response.ok || response.status !== 401
    })

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
