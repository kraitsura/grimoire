import { Effect, Stream, Data, pipe } from "effect"
import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMError,
  StreamChunk,
  Message,
} from "../llm-service"
import { ApiKeyService, ApiKeyNotFoundError } from "../api-key-service"

// OpenAI-specific error types
export class OpenAIRateLimitError extends Data.TaggedError("OpenAIRateLimitError")<{
  message: string
  retryAfter?: number
  limit?: number
  remaining?: number
  resetAt?: Date
}> {}

export class OpenAIAPIError extends Data.TaggedError("OpenAIAPIError")<{
  message: string
  statusCode?: number
  type?: string
}> {}

// OpenAI API types
interface OpenAIMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface OpenAIRequest {
  model: string
  messages: OpenAIMessage[]
  temperature?: number
  max_tokens?: number
  stop?: string[]
  stream: boolean
}

interface OpenAIUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

interface OpenAIChoice {
  message?: {
    role: string
    content: string
  }
  delta?: {
    role?: string
    content?: string
  }
  finish_reason: string | null
  index: number
}

interface OpenAIResponse {
  id: string
  object: string
  created: number
  model: string
  choices: OpenAIChoice[]
  usage?: OpenAIUsage
}

interface OpenAIStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: OpenAIChoice[]
}

interface OpenAIErrorResponse {
  error: {
    message: string
    type: string
    code?: string
  }
}

// Supported models
const SUPPORTED_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo",
  "o1",
  "o1-mini",
] as const

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

// Parse rate limit headers
const parseRateLimitHeaders = (headers: Headers) => {
  const limit = headers.get("x-ratelimit-limit-requests")
  const remaining = headers.get("x-ratelimit-remaining-requests")
  const resetTime = headers.get("x-ratelimit-reset-requests")

  return {
    limit: limit ? parseInt(limit, 10) : undefined,
    remaining: remaining ? parseInt(remaining, 10) : undefined,
    resetAt: resetTime ? new Date(resetTime) : undefined,
  }
}

// Convert our Message format to OpenAI format
const convertMessages = (messages: Message[]): OpenAIMessage[] => {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }))
}

// Make OpenAI API request
const makeOpenAIRequest = (
  apiKey: string,
  request: LLMRequest,
  stream: boolean
): Effect.Effect<Response, LLMError> =>
  Effect.gen(function* () {
    const openAIRequest: OpenAIRequest = {
      model: request.model,
      messages: convertMessages(request.messages),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stop: request.stopSequences,
      stream,
    }

    try {
      const response = yield* Effect.promise(() =>
        fetch(OPENAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(openAIRequest),
        })
      )

      return response
    } catch (error) {
      return yield* Effect.fail(
        new LLMError({
          message: `OpenAI API request failed: ${error instanceof Error ? error.message : String(error)}`,
          provider: "openai",
          cause: error,
        })
      )
    }
  })

// Handle error response
const handleErrorResponse = (
  response: Response
): Effect.Effect<never, LLMError> =>
  Effect.gen(function* () {
    const rateLimitInfo = parseRateLimitHeaders(response.headers)

    // Check for rate limit error
    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after")
      return yield* Effect.fail(
        new LLMError({
          message: `OpenAI rate limit exceeded. ${retryAfter ? `Retry after ${retryAfter} seconds.` : ""} Remaining: ${rateLimitInfo.remaining ?? "unknown"}`,
          provider: "openai",
        })
      )
    }

    // Parse error response
    try {
      const errorData = (yield* Effect.promise(() =>
        response.json()
      )) as OpenAIErrorResponse

      return yield* Effect.fail(
        new LLMError({
          message: `OpenAI API error: ${errorData.error.message}`,
          provider: "openai",
        })
      )
    } catch {
      return yield* Effect.fail(
        new LLMError({
          message: `OpenAI API error: ${response.status} ${response.statusText}`,
          provider: "openai",
        })
      )
    }
  })

// Parse Server-Sent Events (SSE)
const parseSSE = (line: string): OpenAIStreamChunk | null => {
  if (!line.startsWith("data: ")) {
    return null
  }

  const data = line.slice(6).trim()

  if (data === "[DONE]") {
    return null
  }

  try {
    return JSON.parse(data) as OpenAIStreamChunk
  } catch {
    return null
  }
}

// Create the OpenAI provider
export const makeOpenAIProvider = Effect.gen(function* () {
  const apiKeyService = yield* ApiKeyService

  const getApiKey = (): Effect.Effect<string, LLMError> =>
    apiKeyService.get("openai").pipe(
      Effect.mapError((error) => {
        if (error instanceof ApiKeyNotFoundError) {
          return new LLMError({
            message:
              "OpenAI API key not found. Set it with: grimoire config set openai YOUR_API_KEY",
            provider: "openai",
            cause: error,
          })
        }
        return new LLMError({
          message: "Failed to retrieve OpenAI API key",
          provider: "openai",
          cause: error,
        })
      })
    )

  const complete = (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> =>
    Effect.gen(function* () {
      // Get API key
      const apiKey = yield* getApiKey()

      // Make request
      const response = yield* makeOpenAIRequest(apiKey, request, false)

      // Handle errors
      if (!response.ok) {
        return yield* handleErrorResponse(response)
      }

      // Parse response
      const data = (yield* Effect.promise(() =>
        response.json()
      )) as OpenAIResponse

      const choice = data.choices[0]
      if (!choice || !choice.message) {
        return yield* Effect.fail(
          new LLMError({
            message: "OpenAI API returned no choices",
            provider: "openai",
          })
        )
      }

      return {
        content: choice.message.content,
        model: data.model,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
        finishReason:
          choice.finish_reason === "stop"
            ? "stop"
            : choice.finish_reason === "length"
              ? "length"
              : "error",
      }
    })

  const stream = (
    request: LLMRequest
  ): Stream.Stream<StreamChunk, LLMError, never> =>
    Stream.asyncEffect<StreamChunk, LLMError>((emit) =>
      Effect.gen(function* () {
        // Get API key
        const apiKey = yield* getApiKey()

        // Make streaming request
        const response = yield* makeOpenAIRequest(apiKey, request, true)

        // Handle errors
        if (!response.ok) {
          return yield* handleErrorResponse(response)
        }

        // Check if response body exists
        if (!response.body) {
          return yield* Effect.fail(
            new LLMError({
              message: "OpenAI API response has no body",
              provider: "openai",
            })
          )
        }

        // Process the stream
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        try {
          while (true) {
            const { done, value } = yield* Effect.promise(() => reader.read())

            if (done) {
              // Emit final chunk
              yield* Effect.promise(() => emit.single({ content: "", done: true }))
              break
            }

            // Decode and add to buffer
            buffer += decoder.decode(value, { stream: true })

            // Process complete lines
            const lines = buffer.split("\n")
            buffer = lines.pop() ?? ""

            for (const line of lines) {
              const trimmedLine = line.trim()
              if (!trimmedLine || trimmedLine === "data: [DONE]") {
                continue
              }

              const chunk = parseSSE(trimmedLine)
              if (!chunk) {
                continue
              }

              const delta = chunk.choices[0]?.delta
              if (delta && delta.content) {
                yield* Effect.promise(() => emit.single({ content: delta.content!, done: false }))
              }
            }
          }
        } catch (error) {
          return yield* Effect.fail(
            new LLMError({
              message: `OpenAI streaming error: ${error instanceof Error ? error.message : String(error)}`,
              provider: "openai",
              cause: error,
            })
          )
        }
      })
    )

  const listModels = (): Effect.Effect<string[], LLMError> =>
    Effect.succeed([...SUPPORTED_MODELS])

  const validateApiKey = (): Effect.Effect<boolean, LLMError, never> =>
    Effect.gen(function* () {
      try {
        // Get API key
        const apiKey = yield* getApiKey()

        // Make a simple request to validate the key
        const response = yield* Effect.promise(() =>
          fetch("https://api.openai.com/v1/models", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          })
        )

        return response.ok
      } catch {
        return false
      }
    })

  return {
    name: "openai",
    complete,
    stream,
    listModels,
    validateApiKey,
  } as const satisfies LLMProvider
})

// Export with alias for backwards compatibility
export const OpenAIProvider = makeOpenAIProvider
