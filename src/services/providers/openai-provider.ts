import { Effect, Stream, Either } from "effect";
import { chat } from "@tanstack/ai";
import { createOpenAI } from "@tanstack/ai-openai";
import type { LLMProvider, LLMRequest, LLMResponse, StreamChunk } from "../llm-service";
import { LLMError } from "../llm-service";
import { ApiKeyService, ApiKeyNotFoundError } from "../api-key-service";

// Supported models
const SUPPORTED_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo",
  "o1",
  "o3-mini",
] as const;

type OpenAIModel = (typeof SUPPORTED_MODELS)[number];

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

// Helper to validate model name
const isValidModel = (model: string): model is OpenAIModel => {
  return SUPPORTED_MODELS.includes(model as OpenAIModel);
};

// Create the OpenAI provider
export const makeOpenAIProvider = Effect.gen(function* () {
  const apiKeyService = yield* ApiKeyService;

  const getApiKey = (): Effect.Effect<string, LLMError> =>
    apiKeyService.get("openai").pipe(
      Effect.mapError((error) => {
        if (error instanceof ApiKeyNotFoundError) {
          return new LLMError({
            message:
              "OpenAI API key not found. Set it with: grimoire config set openai YOUR_API_KEY",
            provider: "openai",
            cause: error,
          });
        }
        return new LLMError({
          message: "Failed to retrieve OpenAI API key",
          provider: "openai",
          cause: error,
        });
      })
    );

  const complete = (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> =>
    Effect.gen(function* () {
      const apiKey = yield* getApiKey();

      // Map model names - default to gpt-4o-mini if not in our list
      const modelToUse: OpenAIModel = isValidModel(request.model) ? request.model : "gpt-4o-mini";

      const systemPrompts = extractSystemPrompts(request.messages);
      const messages = convertMessages(request.messages);

      const result = yield* Effect.tryPromise({
        try: async () => {
          const adapter = createOpenAI(apiKey);

          const chatStream = chat({
            adapter,
            model: modelToUse,
            messages,
            systemPrompts: systemPrompts.length > 0 ? systemPrompts : undefined,
          });

          // Collect all chunks for non-streaming response
          let content = "";
          let inputTokens = 0;
          let outputTokens = 0;

          for await (const chunk of chatStream) {
            if (chunk.type === "content" && chunk.content) {
              content += chunk.content;
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
        catch: (error) =>
          new LLMError({
            message: `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`,
            provider: "openai",
            cause: error,
          }),
      });

      return result;
    });

  const stream = (request: LLMRequest): Stream.Stream<StreamChunk, LLMError, never> =>
    Stream.asyncEffect<StreamChunk, LLMError>(
      (emit) =>
        Effect.gen(function* () {
          const apiKey = yield* getApiKey();

          // Map model names
          const modelToUse: OpenAIModel = isValidModel(request.model)
            ? request.model
            : "gpt-4o-mini";

          const systemPrompts = extractSystemPrompts(request.messages);
          const messages = convertMessages(request.messages);

          yield* Effect.tryPromise({
            try: async () => {
              const adapter = createOpenAI(apiKey);

              const chatStream = chat({
                adapter,
                model: modelToUse,
                messages,
                systemPrompts: systemPrompts.length > 0 ? systemPrompts : undefined,
              });

              for await (const chunk of chatStream) {
                if (chunk.type === "content" && chunk.content) {
                  await emit.single({
                    content: chunk.content,
                    done: false,
                  });
                }
                if (chunk.type === "done") {
                  await emit.single({ content: "", done: true });
                }
              }
            },
            catch: (error) =>
              new LLMError({
                message: `OpenAI streaming error: ${error instanceof Error ? error.message : String(error)}`,
                provider: "openai",
                cause: error,
              }),
          });
        })
    );

  const listModels = (): Effect.Effect<string[], LLMError> => Effect.succeed([...SUPPORTED_MODELS]);

  const validateApiKey = (): Effect.Effect<boolean, LLMError, never> =>
    Effect.gen(function* () {
      // Try to get API key
      const apiKeyResult = yield* Effect.either(getApiKey());

      if (Either.isLeft(apiKeyResult)) {
        return false;
      }

      const apiKey = apiKeyResult.right;

      // Make a minimal request to validate the key
      const result = yield* Effect.tryPromise({
        try: async () => {
          const adapter = createOpenAI(apiKey);

          const stream = chat({
            adapter,
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "test" }],
          });

          // Just try to get first chunk to validate
          for await (const _ of stream) {
            break;
          }

          return true;
        },
        catch: () => false as boolean,
      });

      return result;
    }).pipe(Effect.catchAll(() => Effect.succeed(false)));

  return {
    name: "openai",
    complete,
    stream,
    listModels,
    validateApiKey,
  } as const satisfies LLMProvider;
});

// Export with alias for backwards compatibility
export const OpenAIProvider = makeOpenAIProvider;
