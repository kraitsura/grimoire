import { Context, Effect, Layer, Stream, Data } from "effect";

// Error types
export class LLMError extends Data.TaggedError("LLMError")<{
  message: string;
  provider?: string;
  cause?: unknown;
}> {}

// Request/Response types
export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: "stop" | "length" | "error";
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

// Provider interface
export interface LLMProvider {
  readonly name: string;
  readonly complete: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError>;
  readonly stream: (request: LLMRequest) => Stream.Stream<StreamChunk, LLMError>;
  readonly listModels: () => Effect.Effect<string[], LLMError>;
  readonly validateApiKey: () => Effect.Effect<boolean, LLMError>;
}

// Service interface
export interface LLMServiceImpl {
  readonly complete: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError>;
  readonly stream: (request: LLMRequest) => Stream.Stream<StreamChunk, LLMError>;
  readonly listModels: (provider?: string) => Effect.Effect<string[], LLMError>;
  readonly registerProvider: (provider: LLMProvider) => Effect.Effect<void>;
  readonly getProvider: (name: string) => Effect.Effect<LLMProvider, LLMError>;
}

// Service tag
export class LLMService extends Context.Tag("LLMService")<LLMService, LLMServiceImpl>() {}

// Helper to determine provider from model name
const getProviderNameFromModel = (model: string): string => {
  const lowerModel = model.toLowerCase();

  if (
    lowerModel.startsWith("gpt-") ||
    lowerModel.startsWith("o1-") ||
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

  // Default to first registered provider or error
  return "unknown";
};

// Implementation
const makeLLMService = Effect.sync(() => {
  const providers = new Map<string, LLMProvider>();

  const registerProvider = (provider: LLMProvider): Effect.Effect<void> =>
    Effect.sync(() => {
      providers.set(provider.name.toLowerCase(), provider);
    });

  const getProvider = (name: string): Effect.Effect<LLMProvider, LLMError> =>
    Effect.suspend(() => {
      const provider = providers.get(name.toLowerCase());
      if (!provider) {
        return Effect.fail(
          new LLMError({
            message: `Provider '${name}' not found. Available providers: ${Array.from(providers.keys()).join(", ")}`,
            provider: name,
          })
        );
      }
      return Effect.succeed(provider);
    });

  const getProviderForModel = (model: string): Effect.Effect<LLMProvider, LLMError> =>
    Effect.suspend(() => {
      const providerName = getProviderNameFromModel(model);

      if (providerName === "unknown") {
        // Try to use the first available provider
        const availableProviders = Array.from(providers.values());
        if (availableProviders.length === 0) {
          return Effect.fail(
            new LLMError({
              message: "No providers registered",
            })
          );
        }
        return Effect.succeed(availableProviders[0]);
      }

      return getProvider(providerName);
    });

  const complete = (request: LLMRequest): Effect.Effect<LLMResponse, LLMError> =>
    Effect.gen(function* () {
      const provider = yield* getProviderForModel(request.model);
      return yield* provider.complete(request);
    });

  const stream = (request: LLMRequest): Stream.Stream<StreamChunk, LLMError> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const provider = yield* getProviderForModel(request.model);
        return provider.stream(request);
      })
    );

  const listModels = (providerName?: string): Effect.Effect<string[], LLMError> =>
    Effect.gen(function* () {
      if (providerName) {
        const provider = yield* getProvider(providerName);
        return yield* provider.listModels();
      }

      // List models from all providers
      const allProviders = Array.from(providers.values());
      const modelLists = yield* Effect.all(
        allProviders.map((p) => p.listModels()),
        { concurrency: "unbounded" }
      );

      return modelLists.flat();
    });

  return {
    complete,
    stream,
    listModels,
    registerProvider,
    getProvider,
  } as const;
});

// Live layer
export const LLMServiceLive = Layer.effect(LLMService, makeLLMService);

// Helper to create a layer with pre-registered providers
export const makeLLMServiceLayer = (providers: LLMProvider[]): Layer.Layer<LLMService> =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const service = yield* makeLLMService;
      yield* Effect.all(
        providers.map((p) => service.registerProvider(p)),
        { concurrency: "unbounded" }
      );
      return service;
    })
  ).pipe(Layer.provideMerge(LLMServiceLive));
