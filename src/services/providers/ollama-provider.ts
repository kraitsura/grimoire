import { Effect, Stream, Data, pipe } from "effect"
import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMError,
  StreamChunk,
  Message,
} from "../llm-service"

// Ollama-specific error types
export class OllamaConnectionError extends Data.TaggedError("OllamaConnectionError")<{
  message: string
  cause?: unknown
}> {}

export class OllamaModelNotFoundError extends Data.TaggedError("OllamaModelNotFoundError")<{
  message: string
  model: string
}> {}

// Ollama API types
interface OllamaMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface OllamaChatRequest {
  model: string
  messages: OllamaMessage[]
  stream: boolean
  options?: {
    temperature?: number
    num_predict?: number
    stop?: string[]
  }
}

interface OllamaChatResponse {
  model: string
  created_at: string
  message: {
    role: string
    content: string
  }
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  eval_count?: number
  eval_duration?: number
}

interface OllamaStreamChunk {
  model: string
  created_at: string
  message?: {
    role: string
    content: string
  }
  done: boolean
  total_duration?: number
  prompt_eval_count?: number
  eval_count?: number
}

interface OllamaTagsResponse {
  models: Array<{
    name: string
    model: string
    modified_at: string
    size: number
    digest: string
    details?: {
      format?: string
      family?: string
      families?: string[]
      parameter_size?: string
      quantization_level?: string
    }
  }>
}

interface OllamaErrorResponse {
  error: string
}

const OLLAMA_BASE_URL = "http://localhost:11434"
const OLLAMA_CHAT_URL = `${OLLAMA_BASE_URL}/api/chat`
const OLLAMA_TAGS_URL = `${OLLAMA_BASE_URL}/api/tags`

// Convert our Message format to Ollama format
const convertMessages = (messages: Message[]): OllamaMessage[] => {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }))
}

// Check if Ollama is running
const checkOllamaConnection = (): Effect.Effect<boolean, LLMError> =>
  Effect.gen(function* () {
    try {
      const response = yield* Effect.promise(() =>
        fetch(OLLAMA_BASE_URL, {
          method: "HEAD",
        })
      )
      return response.ok || response.status === 404 // 404 is ok, means server is running
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.includes("ECONNREFUSED")
          ? "Ollama is not running. Start with: ollama serve"
          : `Failed to connect to Ollama: ${error instanceof Error ? error.message : String(error)}`

      return yield* Effect.fail(
        new LLMError({
          message: errorMessage,
          provider: "ollama",
          cause: error,
        })
      )
    }
  })

// Make Ollama API request
const makeOllamaRequest = (
  request: LLMRequest,
  stream: boolean
): Effect.Effect<Response, LLMError> =>
  Effect.gen(function* () {
    // First check if Ollama is running
    yield* checkOllamaConnection()

    const ollamaRequest: OllamaChatRequest = {
      model: request.model,
      messages: convertMessages(request.messages),
      stream,
      options: {
        temperature: request.temperature,
        num_predict: request.maxTokens,
        stop: request.stopSequences,
      },
    }

    try {
      const response = yield* Effect.promise(() =>
        fetch(OLLAMA_CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(ollamaRequest),
        })
      )

      return response
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.includes("ECONNREFUSED")
          ? "Ollama is not running. Start with: ollama serve"
          : `Ollama API request failed: ${error instanceof Error ? error.message : String(error)}`

      return yield* Effect.fail(
        new LLMError({
          message: errorMessage,
          provider: "ollama",
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
    // Try to parse error response
    try {
      const errorData = (yield* Effect.promise(() =>
        response.json()
      )) as OllamaErrorResponse

      // Check if it's a model not found error
      if (
        errorData.error.toLowerCase().includes("model") &&
        errorData.error.toLowerCase().includes("not found")
      ) {
        return yield* Effect.fail(
          new LLMError({
            message: `Model not found. Pull it with: ollama pull <model>`,
            provider: "ollama",
          })
        )
      }

      return yield* Effect.fail(
        new LLMError({
          message: `Ollama API error: ${errorData.error}`,
          provider: "ollama",
        })
      )
    } catch {
      return yield* Effect.fail(
        new LLMError({
          message: `Ollama API error: ${response.status} ${response.statusText}`,
          provider: "ollama",
        })
      )
    }
  })

// Create the Ollama provider
export const makeOllamaProvider = (): LLMProvider => {
  const complete = (request: LLMRequest): Effect.Effect<LLMResponse, LLMError> =>
    Effect.gen(function* () {
      // Make request
      const response = yield* makeOllamaRequest(request, false)

      // Handle errors
      if (!response.ok) {
        return yield* handleErrorResponse(response)
      }

      // Parse response
      const data = (yield* Effect.promise(() =>
        response.json()
      )) as OllamaChatResponse

      if (!data.message) {
        return yield* Effect.fail(
          new LLMError({
            message: "Ollama API returned no message",
            provider: "ollama",
          })
        )
      }

      return {
        content: data.message.content,
        model: data.model,
        usage: {
          inputTokens: data.prompt_eval_count ?? 0,
          outputTokens: data.eval_count ?? 0,
        },
        finishReason: data.done ? "stop" : "error",
      }
    })

  const stream = (
    request: LLMRequest
  ): Stream.Stream<StreamChunk, LLMError, never> =>
    Stream.asyncEffect<StreamChunk, LLMError>((emit) =>
      Effect.gen(function* () {
        // Make streaming request
        const response = yield* makeOllamaRequest(request, true)

        // Handle errors
        if (!response.ok) {
          return yield* handleErrorResponse(response)
        }

        // Check if response body exists
        if (!response.body) {
          return yield* Effect.fail(
            new LLMError({
              message: "Ollama API response has no body",
              provider: "ollama",
            })
          )
        }

        // Process the stream - Ollama sends newline-delimited JSON
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        try {
          while (true) {
            const { done, value } = yield* Effect.promise(() => reader.read())

            if (done) {
              break
            }

            // Decode and add to buffer
            buffer += decoder.decode(value, { stream: true })

            // Process complete lines (newline-delimited JSON)
            const lines = buffer.split("\n")
            buffer = lines.pop() ?? ""

            for (const line of lines) {
              const trimmedLine = line.trim()
              if (!trimmedLine) {
                continue
              }

              try {
                const chunk = JSON.parse(trimmedLine) as OllamaStreamChunk

                // Emit content if available
                if (chunk.message && chunk.message.content) {
                  yield* Effect.promise(() =>
                    emit.single({
                      content: chunk.message!.content,
                      done: false,
                    })
                  )
                }

                // Check if done
                if (chunk.done) {
                  yield* Effect.promise(() => emit.single({ content: "", done: true }))
                  break
                }
              } catch (error) {
                // Skip malformed JSON lines
                continue
              }
            }
          }
        } catch (error) {
          return yield* Effect.fail(
            new LLMError({
              message: `Ollama streaming error: ${error instanceof Error ? error.message : String(error)}`,
              provider: "ollama",
              cause: error,
            })
          )
        }
      })
    )

  const listModels = (): Effect.Effect<string[], LLMError> =>
    Effect.gen(function* () {
      // First check if Ollama is running
      yield* checkOllamaConnection()

      try {
        const response = yield* Effect.promise(() =>
          fetch(OLLAMA_TAGS_URL, {
            method: "GET",
          })
        )

        if (!response.ok) {
          return yield* Effect.fail(
            new LLMError({
              message: `Failed to list Ollama models: ${response.status} ${response.statusText}`,
              provider: "ollama",
            })
          )
        }

        const data = (yield* Effect.promise(() =>
          response.json()
        )) as OllamaTagsResponse

        // Extract model names
        return data.models.map((model) => model.name)
      } catch (error) {
        const errorMessage =
          error instanceof Error && error.message.includes("ECONNREFUSED")
            ? "Ollama is not running. Start with: ollama serve"
            : `Failed to list Ollama models: ${error instanceof Error ? error.message : String(error)}`

        return yield* Effect.fail(
          new LLMError({
            message: errorMessage,
            provider: "ollama",
            cause: error,
          })
        )
      }
    })

  const validateApiKey = (): Effect.Effect<boolean, LLMError, never> =>
    Effect.gen(function* () {
      // Ollama doesn't use API keys, just check if it's reachable
      try {
        const response = yield* Effect.promise(() =>
          fetch(OLLAMA_BASE_URL, {
            method: "HEAD",
          })
        )
        return response.ok || response.status === 404 // 404 is ok, means server is running
      } catch (error) {
        // Connection refused means Ollama is not running
        if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
          return yield* Effect.fail(
            new LLMError({
              message: "Ollama is not running. Start with: ollama serve",
              provider: "ollama",
              cause: error,
            })
          )
        }
        return false
      }
    })

  return {
    name: "ollama",
    complete,
    stream,
    listModels,
    validateApiKey,
  }
}

// Export a factory function that creates the provider
export const OllamaProvider = Effect.gen(function* () {
  return makeOllamaProvider()
})
