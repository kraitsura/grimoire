/**
 * Token Counter Service - Accurate token counting with tiktoken
 *
 * Provides token counting and cost estimation for various LLM models.
 * Uses tiktoken (js-tiktoken) for accurate token counting that matches
 * OpenAI's tokenization.
 */

import { Context, Effect, Layer } from "effect";
import { getEncoding, encodingForModel } from "js-tiktoken";
import type { Tiktoken } from "js-tiktoken";

/**
 * Message structure for chat-based token counting
 */
export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Error types
 */
export class TokenCounterError {
  readonly _tag = "TokenCounterError";
  constructor(readonly message: string) {}
}

/**
 * Model to encoding mapping
 * Maps model names to their tiktoken encoding schemes
 */
const MODEL_TO_ENCODING: Record<string, string> = {
  "gpt-4o": "o200k_base",
  "gpt-4o-mini": "o200k_base",
  "gpt-4-turbo": "cl100k_base",
  "gpt-4": "cl100k_base",
  "gpt-3.5-turbo": "cl100k_base",
  "claude-sonnet-4-20250514": "cl100k_base", // approximation
  "claude-3-5-sonnet-20241022": "cl100k_base",
  "claude-3-opus-20240229": "cl100k_base",
  // Gemini models (approximation using cl100k_base)
  "gemini-2.5-pro": "cl100k_base",
  "gemini-2.5-flash": "cl100k_base",
  "gemini-2.0-flash": "cl100k_base",
  "gemini-2.0-flash-lite": "cl100k_base",
};

/**
 * Model pricing information (per 1M tokens)
 * Used for cost estimation
 */
const MODEL_PRICING: Record<
  string,
  { inputPer1M: number; outputPer1M: number }
> = {
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4-turbo": { inputPer1M: 10.0, outputPer1M: 30.0 },
  "claude-sonnet-4-20250514": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-3-5-sonnet-20241022": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-3-opus-20240229": { inputPer1M: 15.0, outputPer1M: 75.0 },
  // Gemini models pricing (per 1M tokens)
  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 5.0 },
  "gemini-2.5-flash": { inputPer1M: 0.075, outputPer1M: 0.30 },
  "gemini-2.0-flash": { inputPer1M: 0.10, outputPer1M: 0.40 },
  "gemini-2.0-flash-lite": { inputPer1M: 0.075, outputPer1M: 0.30 },
};

/**
 * Token overhead per message for chat models
 * Different models have different overhead for message formatting
 */
const MESSAGE_OVERHEAD: Record<string, number> = {
  "gpt-4o": 3,
  "gpt-4o-mini": 3,
  "gpt-4-turbo": 3,
  "gpt-4": 3,
  "gpt-3.5-turbo": 4,
  "claude-sonnet-4-20250514": 3,
  "claude-3-5-sonnet-20241022": 3,
  "claude-3-opus-20240229": 3,
  // Gemini models (approximation)
  "gemini-2.5-pro": 3,
  "gemini-2.5-flash": 3,
  "gemini-2.0-flash": 3,
  "gemini-2.0-flash-lite": 3,
};

/**
 * Token Counter Service interface
 */
interface TokenCounterServiceImpl {
  /**
   * Count tokens in a text string
   */
  readonly count: (
    text: string,
    model: string
  ) => Effect.Effect<number, TokenCounterError>;

  /**
   * Count tokens in a message array (chat format)
   * Includes overhead for message formatting
   */
  readonly countMessages: (
    messages: Message[],
    model: string
  ) => Effect.Effect<number, TokenCounterError>;

  /**
   * Estimate cost for a given number of tokens
   * Returns cost in USD
   */
  readonly estimateCost: (
    inputTokens: number,
    outputTokens: number,
    model: string
  ) => Effect.Effect<number, TokenCounterError>;
}

/**
 * Token Counter Service tag
 */
export class TokenCounterService extends Context.Tag("TokenCounterService")<
  TokenCounterService,
  TokenCounterServiceImpl
>() {}

/**
 * Get the encoding for a model
 */
const getEncodingForModel = (
  model: string
): Effect.Effect<Tiktoken, TokenCounterError> =>
  Effect.gen(function* () {
    try {
      // Try to get encoding by model name directly
      return encodingForModel(model as any);
    } catch {
      // Fall back to explicit encoding mapping
      const encodingName = MODEL_TO_ENCODING[model];
      if (!encodingName) {
        return yield* Effect.fail(
          new TokenCounterError(
            `Unknown model: ${model}. Supported models: ${Object.keys(MODEL_TO_ENCODING).join(", ")}`
          )
        );
      }

      try {
        return getEncoding(encodingName as any);
      } catch (error) {
        return yield* Effect.fail(
          new TokenCounterError(
            `Failed to load encoding ${encodingName}: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    }
  });

/**
 * Token Counter Service implementation
 */
export const TokenCounterServiceLive = Layer.succeed(
  TokenCounterService,
  TokenCounterService.of({
    count: (text: string, model: string) =>
      Effect.gen(function* () {
        const encoding = yield* getEncodingForModel(model);

        try {
          const tokens = encoding.encode(text);
          return tokens.length;
        } catch (error) {
          return yield* Effect.fail(
            new TokenCounterError(
              `Failed to encode text: ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }
      }),

    countMessages: (messages: Message[], model: string) =>
      Effect.gen(function* () {
        const encoding = yield* getEncodingForModel(model);

        try {
          let totalTokens = 0;

          // Get message overhead for this model (default to 3 if not specified)
          const overhead = MESSAGE_OVERHEAD[model] ?? 3;

          // Count tokens in each message
          for (const message of messages) {
            // Tokens for role
            const roleTokens = encoding.encode(message.role);
            totalTokens += roleTokens.length;

            // Tokens for content
            const contentTokens = encoding.encode(message.content);
            totalTokens += contentTokens.length;

            // Overhead per message (formatting tokens)
            totalTokens += overhead;
          }

          // Additional overhead for the entire conversation
          totalTokens += 3; // Base overhead for chat format

          return totalTokens;
        } catch (error) {
          return yield* Effect.fail(
            new TokenCounterError(
              `Failed to count message tokens: ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }
      }),

    estimateCost: (inputTokens: number, outputTokens: number, model: string) =>
      Effect.gen(function* () {
        const pricing = MODEL_PRICING[model];
        if (!pricing) {
          return yield* Effect.fail(
            new TokenCounterError(
              `No pricing information for model: ${model}. Supported models: ${Object.keys(MODEL_PRICING).join(", ")}`
            )
          );
        }

        // Calculate cost: (tokens / 1,000,000) * price_per_1M
        const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
        const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;

        return inputCost + outputCost;
      }),
  })
);
