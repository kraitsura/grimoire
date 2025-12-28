import { Effect, Stream } from "effect";
import { chat } from "@tanstack/ai";
import { createOllamaChat } from "@tanstack/ai-ollama";
import type { LLMProvider, LLMRequest, LLMResponse, StreamChunk } from "../llm-service";
import { LLMError } from "../llm-service";

const OLLAMA_BASE_URL = "http://localhost:11434";
const OLLAMA_TAGS_URL = `${OLLAMA_BASE_URL}/api/tags`;

interface OllamaTagsResponse {
  models: {
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details?: {
      format?: string;
      family?: string;
      families?: string[];
      parameter_size?: string;
      quantization_level?: string;
    };
  }[];
}

// Helper to extract system prompts from messages
const extractSystemPrompts = (messages: { role: string; content: string }[]): string[] => {
  return messages.filter((msg) => msg.role === "system").map((msg) => msg.content);
};

// Helper to convert our messages to TanStack AI format (excluding system messages)
const convertMessages = (
  messages: { role: string; content: string }[]
): { role: "user" | "assistant"; content: string }[] => {
  return messages
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));
};

// Check if Ollama is running
const checkOllamaConnection = (): Effect.Effect<boolean, LLMError> =>
  Effect.gen(function* () {
    try {
      const response = yield* Effect.promise(() =>
        fetch(OLLAMA_BASE_URL, {
          method: "HEAD",
        })
      );
      return response.ok || response.status === 404; // 404 is ok, means server is running
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.includes("ECONNREFUSED")
          ? "Ollama is not running. Start with: ollama serve"
          : `Failed to connect to Ollama: ${error instanceof Error ? error.message : String(error)}`;

      return yield* Effect.fail(
        new LLMError({
          message: errorMessage,
          provider: "ollama",
          cause: error,
        })
      );
    }
  });

// Create the Ollama provider
export const makeOllamaProvider = (): LLMProvider => {
  const complete = (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> =>
    Effect.gen(function* () {
      // First check if Ollama is running
      yield* checkOllamaConnection();

      const systemPrompts = extractSystemPrompts(request.messages);
      const messages = convertMessages(request.messages);

      const result = yield* Effect.tryPromise({
        try: async () => {
          // Ollama supports arbitrary model names
          const adapter = createOllamaChat(request.model, OLLAMA_BASE_URL);
          const chatStream = chat({
            adapter,
            messages,
            systemPrompts: systemPrompts.length > 0 ? systemPrompts : undefined,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
          });

          // Collect all chunks for non-streaming response
          let content = "";
          let inputTokens = 0;
          let outputTokens = 0;

          for await (const chunk of chatStream) {
            // Use delta for incremental content (consistent with other providers)
            if (chunk.type === "content" && chunk.delta) {
              content += chunk.delta;
            }
            if (chunk.type === "done" && chunk.usage) {
              // TanStack AI uses promptTokens/completionTokens
              inputTokens = chunk.usage.promptTokens ?? 0;
              outputTokens = chunk.usage.completionTokens ?? 0;
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
          };
        },
        catch: (error) => {
          const errorMessage =
            error instanceof Error && error.message.includes("ECONNREFUSED")
              ? "Ollama is not running. Start with: ollama serve"
              : `Ollama API error: ${error instanceof Error ? error.message : String(error)}`;

          return new LLMError({
            message: errorMessage,
            provider: "ollama",
            cause: error,
          });
        },
      });

      return result;
    });

  const stream = (request: LLMRequest): Stream.Stream<StreamChunk, LLMError, never> =>
    Stream.asyncEffect<StreamChunk, LLMError>(
      (emit) =>
        Effect.gen(function* () {
          // First check if Ollama is running
          yield* checkOllamaConnection();

          const systemPrompts = extractSystemPrompts(request.messages);
          const messages = convertMessages(request.messages);

          yield* Effect.tryPromise({
            try: async () => {
              // Ollama supports arbitrary model names
              const adapter = createOllamaChat(request.model, OLLAMA_BASE_URL);
              const chatStream = chat({
                adapter,
                messages,
                systemPrompts: systemPrompts.length > 0 ? systemPrompts : undefined,
                temperature: request.temperature,
                maxTokens: request.maxTokens,
              });

              for await (const chunk of chatStream) {
                // Use delta for incremental content (consistent with other providers)
                if (chunk.type === "content" && chunk.delta) {
                  await emit.single({
                    type: "content" as const,
                    content: chunk.delta,
                    done: false,
                  });
                }
                if (chunk.type === "done") {
                  await emit.single({ type: "content" as const, content: "", done: true });
                }
              }
            },
            catch: (error) => {
              const errorMessage =
                error instanceof Error && error.message.includes("ECONNREFUSED")
                  ? "Ollama is not running. Start with: ollama serve"
                  : `Ollama streaming error: ${error instanceof Error ? error.message : String(error)}`;

              return new LLMError({
                message: errorMessage,
                provider: "ollama",
                cause: error,
              });
            },
          });
        })
    );

  const listModels = (): Effect.Effect<string[], LLMError> =>
    Effect.gen(function* () {
      // First check if Ollama is running
      yield* checkOllamaConnection();

      try {
        const response = yield* Effect.promise(() =>
          fetch(OLLAMA_TAGS_URL, {
            method: "GET",
          })
        );

        if (!response.ok) {
          return yield* Effect.fail(
            new LLMError({
              message: `Failed to list Ollama models: ${response.status} ${response.statusText}`,
              provider: "ollama",
            })
          );
        }

        const data = (yield* Effect.promise(() => response.json())) as OllamaTagsResponse;

        // Extract model names
        return data.models.map((model) => model.name);
      } catch (error) {
        const errorMessage =
          error instanceof Error && error.message.includes("ECONNREFUSED")
            ? "Ollama is not running. Start with: ollama serve"
            : `Failed to list Ollama models: ${error instanceof Error ? error.message : String(error)}`;

        return yield* Effect.fail(
          new LLMError({
            message: errorMessage,
            provider: "ollama",
            cause: error,
          })
        );
      }
    });

  const validateApiKey = (): Effect.Effect<boolean, LLMError, never> =>
    Effect.gen(function* () {
      // Ollama doesn't use API keys, just check if it's reachable
      try {
        const response = yield* Effect.promise(() =>
          fetch(OLLAMA_BASE_URL, {
            method: "HEAD",
          })
        );
        return response.ok || response.status === 404; // 404 is ok, means server is running
      } catch (error) {
        // Connection refused means Ollama is not running
        if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
          return yield* Effect.fail(
            new LLMError({
              message: "Ollama is not running. Start with: ollama serve",
              provider: "ollama",
              cause: error,
            })
          );
        }
        return false;
      }
    });

  return {
    name: "ollama",
    complete,
    stream,
    listModels,
    validateApiKey,
  };
};

// Export a factory function that creates the provider
export const OllamaProvider = Effect.sync(() => makeOllamaProvider());
