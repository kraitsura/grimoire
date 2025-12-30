/**
 * Anthropic Provider - Claude models via TanStack AI
 *
 * Uses proper Effect patterns for streaming and error handling.
 */

import { Effect, Stream, Either, Duration } from "effect";
import { chat } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
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

const PROVIDER_NAME = "anthropic";
const DEFAULT_TIMEOUT_MS = 180000; // 3 minutes

// Supported models - only models verified to work with Anthropic API
// Note: Many TanStack AI model aliases return 404 from Anthropic
const SUPPORTED_MODELS = [
  "claude-opus-4-5",    // Claude 4.5 Opus - thinking capable
  "claude-sonnet-4-5",  // Claude 4.5 Sonnet - thinking capable
  "claude-haiku-4-5",   // Claude 4.5 Haiku - thinking capable
  "claude-opus-4-1",    // Claude 4.1 Opus - thinking capable
] as const;

type AnthropicModel = (typeof SUPPORTED_MODELS)[number];

// ============================================================================
// Helpers
// ============================================================================

/** Extract system prompts from messages (Anthropic handles these separately) */
const extractSystemPrompts = (messages: { role: string; content: string }[]): string[] =>
  messages.filter((msg) => msg.role === "system").map((msg) => msg.content);

/** Convert messages to TanStack AI format (excluding system messages) */
const convertMessages = (
  messages: { role: string; content: string }[]
): { role: "user" | "assistant"; content: string }[] =>
  messages
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

/** Map Anthropic dated model names to TanStack AI aliases */
const MODEL_ALIASES: Record<string, AnthropicModel> = {
  // Claude 4.5 models (with date suffixes)
  "claude-sonnet-4-5-20250514": "claude-sonnet-4-5",
  "claude-opus-4-5-20250514": "claude-opus-4-5",
  "claude-haiku-4-5-20250514": "claude-haiku-4-5",
  // Claude 4.1 models
  "claude-opus-4-1-20250414": "claude-opus-4-1",
  // Claude 4 models -> map to 4.5 equivalents (claude-sonnet-4/opus-4 don't work)
  "claude-sonnet-4-20250514": "claude-sonnet-4-5",
  "claude-opus-4-20250514": "claude-opus-4-5",
  // Legacy Claude 3.x models -> map to 4.5 equivalents
  "claude-3-5-sonnet-20241022": "claude-sonnet-4-5",
  "claude-3-5-sonnet-latest": "claude-sonnet-4-5",
  "claude-3-5-haiku-20241022": "claude-haiku-4-5",
  "claude-3-5-haiku-latest": "claude-haiku-4-5",
  "claude-3-opus-20240229": "claude-opus-4-5",
  "claude-3-opus-latest": "claude-opus-4-5",
  "claude-3-sonnet-20240229": "claude-sonnet-4-5",
  "claude-3-haiku-20240307": "claude-haiku-4-5",
};

/** Resolve model name to TanStack AI model alias with fallback */
const resolveModel = (model: string): AnthropicModel => {
  // Check if it's already a supported model
  if (SUPPORTED_MODELS.includes(model as AnthropicModel)) {
    return model as AnthropicModel;
  }

  // Check for known aliases
  if (model in MODEL_ALIASES) {
    return MODEL_ALIASES[model];
  }

  // Try to infer from model name patterns
  const lowerModel = model.toLowerCase();
  if (lowerModel.includes("opus") && lowerModel.includes("4-1")) return "claude-opus-4-1";
  if (lowerModel.includes("opus")) return "claude-opus-4-5";
  if (lowerModel.includes("sonnet")) return "claude-sonnet-4-5";
  if (lowerModel.includes("haiku")) return "claude-haiku-4-5";

  // Default fallback
  return "claude-sonnet-4-5";
};

/** Parse TanStack AI usage to our TokenUsage format */
const parseUsage = (usage?: { promptTokens?: number; completionTokens?: number }): TokenUsage => ({
  inputTokens: usage?.promptTokens ?? 0,
  outputTokens: usage?.completionTokens ?? 0,
});

/** Create provider-specific error from raw error */
const toProviderError = (error: unknown): LLMErrors =>
  parseProviderError(error, PROVIDER_NAME, "Anthropic API error");

// ============================================================================
// Provider Implementation
// ============================================================================

export const makeAnthropicProvider = Effect.gen(function* () {
  const apiKeyService = yield* ApiKeyService;

  // Get API key with proper error handling
  const getApiKey = (): Effect.Effect<string, LLMErrors> =>
    apiKeyService.get("anthropic").pipe(
      Effect.mapError((error) => {
        if (error instanceof ApiKeyNotFoundError) {
          return new LLMAuthError({
            message: "Anthropic API key not found. Set ANTHROPIC_API_KEY or use 'grimoire config set anthropic <key>'",
            provider: PROVIDER_NAME,
          });
        }
        return new LLMError({
          message: "Failed to retrieve Anthropic API key",
          provider: PROVIDER_NAME,
          cause: error,
        });
      }),
      Effect.withSpan("AnthropicProvider.getApiKey")
    );

  // Non-streaming completion
  const complete = (request: LLMRequest): Effect.Effect<LLMResponse, LLMErrors> =>
    Effect.gen(function* () {
      const apiKey = yield* getApiKey();
      const modelToUse = resolveModel(request.model);
      const systemPrompts = extractSystemPrompts(request.messages);
      const messages = convertMessages(request.messages);

      const result = yield* Effect.tryPromise({
        try: async () => {
          const adapter = createAnthropicChat(modelToUse, apiKey);
          const chatStream = chat({
            adapter,
            messages,
            systemPrompts: systemPrompts.length > 0 ? systemPrompts : undefined,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
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
              message: `Anthropic API request timed out after ${DEFAULT_TIMEOUT_MS / 1000} seconds`,
              provider: PROVIDER_NAME,
              timeoutMs: DEFAULT_TIMEOUT_MS,
            })
          )
        )
      );

      return result;
    }).pipe(
      Effect.withSpan("AnthropicProvider.complete", {
        attributes: { model: request.model },
      })
    );

  // Streaming completion
  const stream = (request: LLMRequest): Stream.Stream<StreamChunk, LLMErrors> => {
    const modelToUse = resolveModel(request.model);
    const systemPrompts = extractSystemPrompts(request.messages);
    const messages = convertMessages(request.messages);

    // Track usage data across chunks
    let usageData: { promptTokens?: number; completionTokens?: number } | undefined;

    // Build thinking options if enabled
    const modelOptions = request.thinking?.enabled
      ? {
          thinking: {
            type: "enabled" as const,
            budget_tokens: request.thinking.budgetTokens ?? 4096,
          },
        }
      : undefined;

    return streamFromAsyncIterator<
      { type: string; delta?: string; content?: string; usage?: { promptTokens?: number; completionTokens?: number }; error?: { message?: string; code?: string } },
      LLMErrors
    >(
      // Get iterator
      async () => {
        const apiKey = await Effect.runPromise(getApiKey());
        const adapter = createAnthropicChat(modelToUse, apiKey);
        return chat({
          adapter,
          messages,
          systemPrompts: systemPrompts.length > 0 ? systemPrompts : undefined,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          modelOptions,
        });
      },
      // Transform chunks
      (chunk) => {
        // Handle error chunks from TanStack AI - throw to trigger error handling
        if (chunk.type === "error") {
          const rawMsg = (chunk as { error?: { message?: string } }).error?.message ?? "Unknown API error";
          // Parse nested JSON error format from Anthropic: "400 {\"type\":\"error\",\"error\":{...}}"
          let errorMsg = rawMsg;
          try {
            const jsonMatch = rawMsg.match(/\d+\s*(\{.+\})/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[1]);
              errorMsg = parsed?.error?.message ?? parsed?.message ?? rawMsg;
            }
          } catch {
            // Keep original message if parsing fails
          }
          throw new Error(errorMsg);
        }
        // Handle thinking chunks - include delta in content for display
        if (chunk.type === "thinking") {
          const delta = chunk.delta ?? "";
          if (delta) {
            return {
              type: "thinking" as const,
              content: delta, // Include delta so it displays during streaming
              thinkingDelta: delta,
              thinkingContent: chunk.content,
              done: false,
            };
          }
        }
        // Handle content chunks - accept either delta or content
        if (chunk.type === "content") {
          const content = chunk.delta ?? "";
          if (content) {
            return { type: "content" as const, content, done: false };
          }
        }
        if (chunk.type === "done") {
          usageData = chunk.usage;
        }
        return null;
      },
      // On done - emit final chunk with usage
      () => ({
        type: "done" as const,
        content: "",
        done: true,
        usage: usageData ? parseUsage(usageData) : undefined,
        model: modelToUse,
      }),
      // Error handler
      toProviderError,
      DEFAULT_TIMEOUT_MS
    );
  };

  // List available models
  const listModels = (): Effect.Effect<string[], LLMErrors> =>
    Effect.succeed([...SUPPORTED_MODELS]).pipe(
      Effect.withSpan("AnthropicProvider.listModels")
    );

  // Validate API key by making a minimal request
  const validateApiKey = (): Effect.Effect<boolean, LLMErrors> =>
    Effect.gen(function* () {
      const apiKeyResult = yield* Effect.either(getApiKey());

      if (Either.isLeft(apiKeyResult)) {
        return false;
      }

      const apiKey = apiKeyResult.right;

      const result = yield* Effect.tryPromise({
        try: async () => {
          const adapter = createAnthropicChat("claude-sonnet-4", apiKey);
          const chatStream = chat({
            adapter,
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
          // Auth errors are definite failures
          if (errorMessage.includes("401") || errorMessage.includes("authentication")) {
            return false;
          }
          // Model errors might still mean key is valid
          if (errorMessage.includes("404") || errorMessage.includes("not_found")) {
            return true;
          }
          return false;
        },
      });

      return result;
    }).pipe(
      Effect.catchAll(() => Effect.succeed(false)),
      Effect.withSpan("AnthropicProvider.validateApiKey")
    );

  return {
    name: PROVIDER_NAME,
    complete,
    stream,
    listModels,
    validateApiKey,
  } as const satisfies LLMProvider;
});

// Layer export
export const AnthropicProviderLive = Effect.gen(function* () {
  return yield* makeAnthropicProvider;
}).pipe(Effect.withSpan("AnthropicProvider.make"));
