/**
 * Gemini Provider - Google's Gemini models via TanStack AI
 *
 * Uses proper Effect patterns for streaming and error handling.
 */

import { Effect, Stream, Either, Duration } from "effect";
import { chat } from "@tanstack/ai";
import { createGemini } from "@tanstack/ai-gemini";
import type { LLMProvider, LLMRequest, LLMResponse, StreamChunk, LLMErrors, TokenUsage } from "../llm-service";
import {
  LLMError,
  LLMAuthError,
  LLMTimeoutError,
  parseProviderError,
  streamFromAsyncIterator,
} from "../llm-service";
import { ApiKeyService, ApiKeyNotFoundError } from "../api-key-service";

// ============================================================================
// Constants
// ============================================================================

const PROVIDER_NAME = "google";
const DEFAULT_TIMEOUT_MS = 180000; // 3 minutes

// Supported models (matching TanStack AI Gemini adapter - December 2025)
const SUPPORTED_MODELS = [
  // Gemini 3 preview
  "gemini-3-pro-preview",
  // Gemini 2.5 family
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  // Gemini 2.0 family
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
] as const;

type GeminiModel = (typeof SUPPORTED_MODELS)[number];

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert messages to TanStack AI format.
 * Gemini doesn't support system messages directly - we prepend to first user message.
 */
const convertMessages = (
  messages: { role: string; content: string }[]
): { role: "user" | "assistant"; content: string }[] => {
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

/** Check if model is valid */
const isValidModel = (model: string): model is GeminiModel =>
  SUPPORTED_MODELS.includes(model as GeminiModel);

/** Resolve model name with fallback */
const resolveModel = (model: string): GeminiModel =>
  isValidModel(model) ? model : "gemini-2.0-flash";

/** Parse TanStack AI usage to our TokenUsage format */
const parseUsage = (usage?: { promptTokens?: number; completionTokens?: number }): TokenUsage => ({
  inputTokens: usage?.promptTokens ?? 0,
  outputTokens: usage?.completionTokens ?? 0,
});

/** Create provider-specific error from raw error */
const toProviderError = (error: unknown): LLMErrors =>
  parseProviderError(error, PROVIDER_NAME, "Gemini API error");

// ============================================================================
// Provider Implementation
// ============================================================================

export const makeGeminiProvider = Effect.gen(function* () {
  const apiKeyService = yield* ApiKeyService;

  // Get API key with proper error handling
  const getApiKey = (): Effect.Effect<string, LLMErrors> =>
    apiKeyService.get("google").pipe(
      Effect.mapError((error) => {
        if (error instanceof ApiKeyNotFoundError) {
          return new LLMAuthError({
            message: "Google Gemini API key not found. Set GOOGLE_API_KEY or use 'grimoire config set google <key>'",
            provider: PROVIDER_NAME,
          });
        }
        return new LLMError({
          message: "Failed to retrieve Google API key",
          provider: PROVIDER_NAME,
          cause: error,
        });
      }),
      Effect.withSpan("GeminiProvider.getApiKey")
    );

  // Non-streaming completion
  const complete = (request: LLMRequest): Effect.Effect<LLMResponse, LLMErrors> =>
    Effect.gen(function* () {
      const apiKey = yield* getApiKey();
      const modelToUse = resolveModel(request.model);
      const messages = convertMessages(request.messages);

      const result = yield* Effect.tryPromise({
        try: async () => {
          const adapter = createGemini(apiKey);
          const chatStream = chat({
            adapter,
            model: modelToUse,
            messages,
          });

          let content = "";
          let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

          for await (const chunk of chatStream) {
            // TanStack AI uses `delta` for incremental content
            if (chunk.type === "content" && chunk.delta) {
              content += chunk.delta;
            }
            if (chunk.type === "done" && chunk.usage) {
              usage = parseUsage(chunk.usage);
            }
          }

          return {
            content,
            model: modelToUse,
            usage,
            finishReason: "stop" as const,
          };
        },
        catch: toProviderError,
      }).pipe(
        Effect.timeout(Duration.millis(DEFAULT_TIMEOUT_MS)),
        Effect.catchTag("TimeoutException", () =>
          Effect.fail(
            new LLMTimeoutError({
              message: `Gemini API request timed out after ${DEFAULT_TIMEOUT_MS / 1000} seconds`,
              provider: PROVIDER_NAME,
              timeoutMs: DEFAULT_TIMEOUT_MS,
            })
          )
        )
      );

      return result;
    }).pipe(
      Effect.withSpan("GeminiProvider.complete", {
        attributes: { model: request.model },
      })
    );

  // Streaming completion
  const stream = (request: LLMRequest): Stream.Stream<StreamChunk, LLMErrors> => {
    const modelToUse = resolveModel(request.model);
    const messages = convertMessages(request.messages);

    let usageData: { promptTokens?: number; completionTokens?: number } | undefined;

    return streamFromAsyncIterator<
      { type: string; delta?: string; usage?: { promptTokens?: number; completionTokens?: number } },
      LLMErrors
    >(
      async () => {
        const apiKey = await Effect.runPromise(getApiKey());
        const adapter = createGemini(apiKey);
        return chat({
          adapter,
          model: modelToUse,
          messages,
        });
      },
      (chunk) => {
        // TanStack AI uses `delta` for incremental content
        if (chunk.type === "content" && chunk.delta) {
          return { content: chunk.delta, done: false };
        }
        if (chunk.type === "done") {
          usageData = chunk.usage;
        }
        return null;
      },
      () => ({
        content: "",
        done: true,
        usage: usageData ? parseUsage(usageData) : undefined,
        model: modelToUse,
      }),
      toProviderError,
      DEFAULT_TIMEOUT_MS
    );
  };

  // List available models
  const listModels = (): Effect.Effect<string[], LLMErrors> =>
    Effect.succeed([...SUPPORTED_MODELS]).pipe(
      Effect.withSpan("GeminiProvider.listModels")
    );

  // Validate API key
  const validateApiKey = (): Effect.Effect<boolean, LLMErrors> =>
    Effect.gen(function* () {
      const apiKeyResult = yield* Effect.either(getApiKey());

      if (Either.isLeft(apiKeyResult)) {
        return false;
      }

      const apiKey = apiKeyResult.right;

      const result = yield* Effect.tryPromise({
        try: async () => {
          const adapter = createGemini(apiKey);
          const chatStream = chat({
            adapter,
            model: "gemini-2.0-flash",
            messages: [{ role: "user", content: "hi" }],
          });

          let gotContent = false;
          for await (const chunk of chatStream) {
            if (chunk.type === "content" && chunk.delta) {
              gotContent = true;
            }
            if (chunk.type === "done") {
              break;
            }
          }
          return gotContent;
        },
        catch: (error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (
            errorMessage.includes("401") ||
            errorMessage.includes("API_KEY_INVALID") ||
            errorMessage.includes("authentication")
          ) {
            return false;
          }
          if (errorMessage.includes("404") || errorMessage.includes("not_found")) {
            return true;
          }
          return false;
        },
      });

      return result;
    }).pipe(
      Effect.catchAll(() => Effect.succeed(false)),
      Effect.withSpan("GeminiProvider.validateApiKey")
    );

  return {
    name: PROVIDER_NAME,
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
