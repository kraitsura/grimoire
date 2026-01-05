/**
 * LLM Service - Effect-based LLM API wrapper
 *
 * Provides a unified interface for multiple LLM providers with:
 * - Proper Effect patterns for streaming and async operations
 * - Granular error types for different failure modes
 * - Built-in retry policies with exponential backoff
 * - Observability with Effect spans
 * - Resource-safe streaming with proper cleanup
 */

import { Context, Effect, Layer, Stream, Data, Schedule, Duration, Cause, pipe } from "effect";

// ============================================================================
// Error Types - Granular errors for different failure modes
// ============================================================================

/** Base error for all LLM-related failures */
export class LLMError extends Data.TaggedError("LLMError")<{
  message: string;
  provider?: string;
  cause?: unknown;
}> {}

/** API key is missing or invalid */
export class LLMAuthError extends Data.TaggedError("LLMAuthError")<{
  message: string;
  provider: string;
}> {}

/** Rate limit exceeded */
export class LLMRateLimitError extends Data.TaggedError("LLMRateLimitError")<{
  message: string;
  provider: string;
  retryAfterMs?: number;
}> {}

/** Request timed out */
export class LLMTimeoutError extends Data.TaggedError("LLMTimeoutError")<{
  message: string;
  provider: string;
  timeoutMs: number;
}> {}

/** Model not found or not supported */
export class LLMModelError extends Data.TaggedError("LLMModelError")<{
  message: string;
  provider: string;
  model: string;
  availableModels?: string[];
}> {}

/** Content was blocked by safety filters */
export class LLMContentFilterError extends Data.TaggedError("LLMContentFilterError")<{
  message: string;
  provider: string;
}> {}

/** Union of all LLM errors */
export type LLMErrors =
  | LLMError
  | LLMAuthError
  | LLMRateLimitError
  | LLMTimeoutError
  | LLMModelError
  | LLMContentFilterError;

// ============================================================================
// Request/Response Types
// ============================================================================

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ThinkingConfig {
  enabled: boolean;
  budgetTokens?: number; // Min 1024, must be < maxTokens
}

export interface LLMRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  thinking?: ThinkingConfig;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: TokenUsage;
  finishReason: FinishReason;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type FinishReason = "stop" | "length" | "content_filter" | "error";

export type ChunkType = "content" | "thinking" | "done";

export interface StreamChunk {
  type: ChunkType;
  content: string;
  done: boolean;
  // Thinking fields (for type: "thinking")
  thinkingContent?: string;
  thinkingDelta?: string;
  // Fields included in the final chunk (when done: true)
  usage?: TokenUsage;
  model?: string; // The actual model used (for fallback tracking)
}

// ============================================================================
// Provider Interface
// ============================================================================

export interface LLMProvider {
  readonly name: string;
  readonly complete: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMErrors>;
  readonly stream: (request: LLMRequest) => Stream.Stream<StreamChunk, LLMErrors>;
  readonly listModels: () => Effect.Effect<string[], LLMErrors>;
  readonly validateApiKey: () => Effect.Effect<boolean, LLMErrors>;
}

// ============================================================================
// Service Interface
// ============================================================================

export interface LLMServiceImpl {
  /** Complete a request (non-streaming) */
  readonly complete: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMErrors>;

  /** Stream a response chunk by chunk */
  readonly stream: (request: LLMRequest) => Stream.Stream<StreamChunk, LLMErrors>;

  /** Complete with automatic retry for transient failures */
  readonly completeWithRetry: (
    request: LLMRequest,
    options?: RetryOptions
  ) => Effect.Effect<LLMResponse, LLMErrors>;

  /** List available models from a specific provider or all providers */
  readonly listModels: (provider?: string) => Effect.Effect<string[], LLMErrors>;

  /** Register a new provider */
  readonly registerProvider: (provider: LLMProvider) => Effect.Effect<void>;

  /** Get a specific provider by name */
  readonly getProvider: (name: string) => Effect.Effect<LLMProvider, LLMErrors>;

  /** Check if a provider is available */
  readonly hasProvider: (name: string) => Effect.Effect<boolean>;
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

// ============================================================================
// Service Tag
// ============================================================================

export class LLMService extends Context.Tag("LLMService")<LLMService, LLMServiceImpl>() {}

// ============================================================================
// Retry Policy
// ============================================================================

/** Default retry policy for transient failures */
const makeRetrySchedule = (options: RetryOptions = {}) => {
  const { maxRetries = 3, initialDelayMs = 1000, maxDelayMs = 30000 } = options;

  return pipe(
    Schedule.exponential(Duration.millis(initialDelayMs), 2),
    Schedule.either(Schedule.spaced(Duration.millis(maxDelayMs))),
    Schedule.upTo(Duration.millis(maxDelayMs * maxRetries)),
    Schedule.intersect(Schedule.recurs(maxRetries))
  );
};

/** Check if an error is retryable */
const isRetryableError = (error: LLMErrors): boolean => {
  // Rate limits are retryable
  if (error._tag === "LLMRateLimitError") return true;

  // Timeouts are retryable
  if (error._tag === "LLMTimeoutError") return true;

  // Generic errors might be retryable (network issues, etc.)
  if (error._tag === "LLMError") {
    const message = error.message.toLowerCase();
    return (
      message.includes("network") ||
      message.includes("connection") ||
      message.includes("timeout") ||
      message.includes("503") ||
      message.includes("502") ||
      message.includes("429")
    );
  }

  // Auth errors, model errors, content filter errors are NOT retryable
  return false;
};

// ============================================================================
// Provider Detection
// ============================================================================

const getProviderNameFromModel = (model: string): string => {
  const lowerModel = model.toLowerCase();

  if (
    lowerModel.startsWith("gpt-") ||
    lowerModel.startsWith("o1") ||
    lowerModel.startsWith("o3") ||
    lowerModel.startsWith("o4") ||
    lowerModel.includes("openai")
  ) {
    return "openai";
  }

  if (lowerModel.startsWith("claude-") || lowerModel.includes("anthropic")) {
    return "anthropic";
  }

  if (lowerModel.startsWith("gemini-") || lowerModel.includes("google")) {
    return "google";
  }

  if (
    lowerModel.includes("llama") ||
    lowerModel.includes("mistral") ||
    lowerModel.includes("mixtral")
  ) {
    return "ollama";
  }

  return "unknown";
};

// ============================================================================
// Service Implementation
// ============================================================================

const makeLLMService = Effect.sync(() => {
  const providers = new Map<string, LLMProvider>();

  const registerProvider = (provider: LLMProvider): Effect.Effect<void> =>
    Effect.sync(() => {
      providers.set(provider.name.toLowerCase(), provider);
    }).pipe(Effect.withSpan("LLMService.registerProvider", { attributes: { provider: provider.name } }));

  const getProvider = (name: string): Effect.Effect<LLMProvider, LLMError> =>
    Effect.suspend(() => {
      const provider = providers.get(name.toLowerCase());
      if (!provider) {
        return Effect.fail(
          new LLMError({
            message: `Provider '${name}' not found. Available: ${Array.from(providers.keys()).join(", ") || "none"}`,
            provider: name,
          })
        );
      }
      return Effect.succeed(provider);
    });

  const hasProvider = (name: string): Effect.Effect<boolean> =>
    Effect.sync(() => providers.has(name.toLowerCase()));

  const getProviderForModel = (model: string): Effect.Effect<LLMProvider, LLMError> =>
    Effect.suspend(() => {
      const providerName = getProviderNameFromModel(model);

      if (providerName === "unknown") {
        const availableProviders = Array.from(providers.values());
        if (availableProviders.length === 0) {
          return Effect.fail(
            new LLMError({
              message: "No LLM providers registered. Configure an API key first.",
            })
          );
        }
        // Use first available provider as fallback
        return Effect.succeed(availableProviders[0]);
      }

      return getProvider(providerName);
    });

  const complete = (request: LLMRequest): Effect.Effect<LLMResponse, LLMErrors> =>
    Effect.gen(function* () {
      const provider = yield* getProviderForModel(request.model);
      return yield* provider.complete(request);
    }).pipe(
      Effect.withSpan("LLMService.complete", {
        attributes: { model: request.model, messageCount: request.messages.length },
      })
    );

  const completeWithRetry = (
    request: LLMRequest,
    options?: RetryOptions
  ): Effect.Effect<LLMResponse, LLMErrors> =>
    complete(request).pipe(
      Effect.retry({
        schedule: makeRetrySchedule(options),
        while: isRetryableError,
      }),
      Effect.withSpan("LLMService.completeWithRetry", {
        attributes: { model: request.model, maxRetries: options?.maxRetries ?? 3 },
      })
    );

  const stream = (request: LLMRequest): Stream.Stream<StreamChunk, LLMErrors> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const provider = yield* getProviderForModel(request.model);
        return provider.stream(request);
      }).pipe(
        Effect.withSpan("LLMService.stream.init", {
          attributes: { model: request.model },
        })
      )
    );

  const listModels = (providerName?: string): Effect.Effect<string[], LLMErrors> =>
    Effect.gen(function* () {
      if (providerName) {
        const provider = yield* getProvider(providerName);
        return yield* provider.listModels();
      }

      // List models from all providers concurrently
      const allProviders = Array.from(providers.values());
      if (allProviders.length === 0) {
        return [];
      }

      const modelLists = yield* Effect.all(
        allProviders.map((p) =>
          p.listModels().pipe(
            // Don't fail if one provider fails, just return empty list
            Effect.catchAll(() => Effect.succeed([] as string[]))
          )
        ),
        { concurrency: 5 }
      );

      return modelLists.flat();
    }).pipe(Effect.withSpan("LLMService.listModels", { attributes: { provider: providerName } }));

  return {
    complete,
    completeWithRetry,
    stream,
    listModels,
    registerProvider,
    getProvider,
    hasProvider,
  } as const;
});

// ============================================================================
// Layer
// ============================================================================

export const LLMServiceLive = Layer.effect(LLMService, makeLLMService);

/** Create a layer with pre-registered providers */
export const makeLLMServiceLayer = (providerEffects: LLMProvider[]): Layer.Layer<LLMService> =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const service = yield* makeLLMService;
      yield* Effect.all(
        providerEffects.map((p) => service.registerProvider(p)),
        { concurrency: 5 }
      );
      return service;
    })
  ).pipe(Layer.provideMerge(LLMServiceLive));

// ============================================================================
// Helper Functions for Providers
// ============================================================================

/** Parse error message to determine error type */
export const parseProviderError = (
  error: unknown,
  provider: string,
  defaultMessage: string
): LLMErrors => {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // Authentication errors
  if (
    lowerMessage.includes("401") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("invalid api key") ||
    lowerMessage.includes("authentication")
  ) {
    return new LLMAuthError({
      message: `Authentication failed: ${message}`,
      provider,
    });
  }

  // Rate limit errors
  if (lowerMessage.includes("429") || lowerMessage.includes("rate limit")) {
    const retryMatch = /retry.+?(\d+)/i.exec(message);
    return new LLMRateLimitError({
      message: `Rate limit exceeded: ${message}`,
      provider,
      retryAfterMs: retryMatch ? parseInt(retryMatch[1]) * 1000 : undefined,
    });
  }

  // Content filter errors
  if (
    lowerMessage.includes("content filter") ||
    lowerMessage.includes("safety") ||
    lowerMessage.includes("blocked")
  ) {
    return new LLMContentFilterError({
      message: `Content blocked: ${message}`,
      provider,
    });
  }

  // Model errors
  if (
    lowerMessage.includes("model") &&
    (lowerMessage.includes("not found") || lowerMessage.includes("invalid") || lowerMessage.includes("404"))
  ) {
    return new LLMModelError({
      message: `Model error: ${message}`,
      provider,
      model: "unknown",
    });
  }

  // Default to generic error
  return new LLMError({
    message: `${defaultMessage}: ${message}`,
    provider,
    cause: error,
  });
};

/** Create a stream from an async iterator with proper Effect patterns */
export const streamFromAsyncIterator = <T, E>(
  getIterator: () => Promise<AsyncIterable<T>>,
  transform: (item: T) => StreamChunk | null,
  onDone: () => StreamChunk,
  onError: (error: unknown) => E,
  timeoutMs = 180000 // 3 minutes default
): Stream.Stream<StreamChunk, E> =>
  Stream.unwrap(
    Effect.gen(function* () {
      // Get iterator with timeout - this covers the initial connection
      const iterable = yield* pipe(
        Effect.tryPromise({
          try: () => getIterator(),
          catch: onError,
        }),
        Effect.timeoutFail({
          duration: Duration.millis(timeoutMs),
          onTimeout: () => onError(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds`)),
        })
      );

      // Convert async iterable to stream with per-chunk timeout
      // Each chunk must arrive within the timeout window
      return pipe(
        Stream.fromAsyncIterable(iterable, onError),
        // Apply timeout to each chunk emission - fails if no data for timeoutMs
        Stream.timeoutFail(
          () => onError(new Error(`Stream timed out - no data received for ${Math.round(timeoutMs / 1000)} seconds`)),
          Duration.millis(timeoutMs)
        ),
        // Transform items to StreamChunk, filtering nulls
        Stream.map(transform),
        Stream.filter((chunk): chunk is StreamChunk => chunk !== null),
        // Append the done chunk at the end
        Stream.concat(Stream.succeed(onDone()))
      );
    })
  );
