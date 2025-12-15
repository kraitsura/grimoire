import { Effect, Stream, Either } from "effect";
import { chat } from "@tanstack/ai";
import { createGemini } from "@tanstack/ai-gemini";
import type { LLMProvider, LLMRequest, LLMResponse, StreamChunk } from "../llm-service";
import { LLMError } from "../llm-service";
import { ApiKeyService, ApiKeyNotFoundError } from "../api-key-service";

// Supported models (matching TanStack AI Gemini adapter types)
const SUPPORTED_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
] as const;

type GeminiModel = (typeof SUPPORTED_MODELS)[number];

// Helper to convert our messages to TanStack AI format
// Gemini doesn't support system messages directly - we prepend to first user message
const convertMessages = (messages: { role: string; content: string }[]) => {
  const result: { role: "user" | "assistant"; content: string }[] = [];
  let systemContent = "";

  for (const msg of messages) {
    if (msg.role === "system") {
      systemContent += (systemContent ? "\n\n" : "") + msg.content;
    } else if (msg.role === "user" || msg.role === "assistant") {
      result.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  // Prepend system content to first user message if present
  if (systemContent && result.length > 0 && result[0].role === "user") {
    result[0].content = systemContent + "\n\n" + result[0].content;
  } else if (systemContent) {
    // If no user message yet, create one with system content
    result.unshift({ role: "user", content: systemContent });
  }

  return result;
};

// Helper to validate model name
const isValidModel = (model: string): model is GeminiModel => {
  return SUPPORTED_MODELS.includes(model as GeminiModel);
};

// Create the Gemini provider
export const makeGeminiProvider = Effect.gen(function* () {
  const apiKeyService = yield* ApiKeyService;

  const getApiKey = (): Effect.Effect<string, LLMError> =>
    apiKeyService.get("google").pipe(
      Effect.mapError((error) => {
        if (error instanceof ApiKeyNotFoundError) {
          return new LLMError({
            message:
              "Google Gemini API key not found. Set it using GOOGLE_API_KEY environment variable or grimoire config.",
            provider: "google",
            cause: error,
          });
        }
        return new LLMError({
          message: "Failed to retrieve Google API key",
          provider: "google",
          cause: error,
        });
      })
    );

  const complete = (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> =>
    Effect.gen(function* () {
      const apiKey = yield* getApiKey();

      // Map model names - default to gemini-2.0-flash if not in our list
      const modelToUse: GeminiModel = isValidModel(request.model)
        ? request.model
        : "gemini-2.0-flash";

      const messages = convertMessages(request.messages);

      const result = yield* Effect.tryPromise({
        try: async () => {
          const adapter = createGemini(apiKey);

          const chatStream = chat({
            adapter,
            model: modelToUse,
            messages,
            // Note: TanStack AI Gemini adapter doesn't expose maxOutputTokens directly
            // Temperature and other options would go in providerOptions if needed
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
            message: `Gemini API error: ${error instanceof Error ? error.message : String(error)}`,
            provider: "google",
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
          const modelToUse: GeminiModel = isValidModel(request.model)
            ? request.model
            : "gemini-2.0-flash";

          const messages = convertMessages(request.messages);

          yield* Effect.tryPromise({
            try: async () => {
              const adapter = createGemini(apiKey);

              const chatStream = chat({
                adapter,
                model: modelToUse,
                messages,
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
                message: `Gemini streaming error: ${error instanceof Error ? error.message : String(error)}`,
                provider: "google",
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
          const adapter = createGemini(apiKey);

          const stream = chat({
            adapter,
            model: "gemini-2.0-flash",
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
    name: "google",
    complete,
    stream,
    listModels,
    validateApiKey,
  } as const satisfies LLMProvider;
});

// Layer for the Gemini provider
export const GeminiProviderLive = Effect.gen(function* () {
  return yield* makeGeminiProvider;
}).pipe(Effect.withSpan("GeminiProvider.make"));
