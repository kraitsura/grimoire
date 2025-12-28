/**
 * Enhancement Service - AI-powered prompt enhancement
 *
 * Provides prompt enhancement using LLM providers with:
 * - Built-in and custom enhancement templates
 * - Streaming responses for live preview
 * - Token counting and cost estimation
 * - Auto-enhancement with sensible defaults
 */

import { Context, Effect, Layer, Stream, Data } from "effect";
import {
  type EnhancementTemplate,
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
  getDefaultTemplate,
  DEFAULT_TEMPLATE_ID,
  type CreateEnhancementTemplateInput,
} from "../models/enhancement-template";
import {
  LLMService,
  type LLMErrors,
  type StreamChunk,
  type Message,
} from "./llm-service";
import { TokenCounterService, type TokenCounterError } from "./token-counter-service";
import { ConfigService, type ConfigReadError } from "./config-service";

// ============================================================================
// Error Types
// ============================================================================

export class EnhancementError extends Data.TaggedError("EnhancementError")<{
  message: string;
  cause?: unknown;
}> {}

export class TemplateNotFoundError extends Data.TaggedError("TemplateNotFoundError")<{
  templateId: string;
}> {}

export class NoDefaultModelError extends Data.TaggedError("NoDefaultModelError")<{
  message: string;
}> {}

export type EnhancementErrors =
  | EnhancementError
  | TemplateNotFoundError
  | NoDefaultModelError
  | LLMErrors
  | TokenCounterError
  | ConfigReadError;

// ============================================================================
// Types
// ============================================================================

export interface EnhancementRequest {
  /** The prompt content to enhance */
  promptContent: string;
  /** Template ID or custom instruction */
  template?: string | EnhancementTemplate;
  /** Custom instruction (overrides template) */
  customInstruction?: string;
  /** Model to use (provider:model format or just model name) */
  model?: string;
}

export interface EnhancementEstimate {
  /** Input tokens for the request */
  inputTokens: number;
  /** Estimated output tokens (heuristic: ~1.5x input for enhancement) */
  estimatedOutputTokens: number;
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Model that will be used */
  model: string;
  /** Template that will be used */
  template: EnhancementTemplate;
  /** Formatted cost string (e.g., "$0.0012") */
  formattedCost: string;
}

export interface EnhancementResult {
  /** The enhanced prompt content */
  content: string;
  /** Original prompt content */
  original: string;
  /** Template used */
  template: EnhancementTemplate;
  /** Model used */
  model: string;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Actual cost in USD */
  cost: number;
}

// ============================================================================
// Service Interface
// ============================================================================

export interface EnhancementServiceImpl {
  /**
   * Enhance a prompt with streaming response
   * Returns a stream of content chunks
   */
  readonly enhance: (
    request: EnhancementRequest
  ) => Stream.Stream<StreamChunk, EnhancementErrors>;

  /**
   * Enhance a prompt and return the complete result
   */
  readonly enhanceComplete: (
    request: EnhancementRequest
  ) => Effect.Effect<EnhancementResult, EnhancementErrors>;

  /**
   * Estimate tokens and cost before enhancement
   */
  readonly estimate: (
    request: EnhancementRequest
  ) => Effect.Effect<EnhancementEstimate, EnhancementErrors>;

  /**
   * Get all available templates (built-in + custom)
   */
  readonly listTemplates: () => Effect.Effect<EnhancementTemplate[], EnhancementErrors>;

  /**
   * Get a template by ID
   */
  readonly getTemplate: (id: string) => Effect.Effect<EnhancementTemplate, TemplateNotFoundError>;

  /**
   * Get the default template
   */
  readonly getDefaultTemplate: () => EnhancementTemplate;

  /**
   * Get the default model from config
   */
  readonly getDefaultModel: () => Effect.Effect<
    { provider: string; model: string },
    NoDefaultModelError | ConfigReadError
  >;

  /**
   * Build the full enhancement prompt from template and content
   */
  readonly buildEnhancementPrompt: (
    template: EnhancementTemplate,
    promptContent: string
  ) => string;
}

// ============================================================================
// Service Tag
// ============================================================================

export class EnhancementService extends Context.Tag("EnhancementService")<
  EnhancementService,
  EnhancementServiceImpl
>() {}

// ============================================================================
// Service Implementation
// ============================================================================

const makeEnhancementService = Effect.gen(function* () {
  const llm = yield* LLMService;
  const tokenCounter = yield* TokenCounterService;
  const config = yield* ConfigService;

  // Custom templates storage (in-memory for now, could be persisted later)
  const customTemplates = new Map<string, EnhancementTemplate>();

  const getDefaultModel = (): Effect.Effect<
    { provider: string; model: string },
    NoDefaultModelError | ConfigReadError
  > =>
    Effect.gen(function* () {
      const defaultModel = yield* config.getDefaultModel();
      if (!defaultModel) {
        return yield* Effect.fail(
          new NoDefaultModelError({
            message:
              "No default model configured. Run 'grimoire config set-model <provider> <model>' first.",
          })
        );
      }
      return defaultModel;
    });

  const getTemplate = (id: string): Effect.Effect<EnhancementTemplate, TemplateNotFoundError> =>
    Effect.suspend(() => {
      // Check built-in templates first
      const builtIn = getBuiltinTemplate(id);
      if (builtIn) {
        return Effect.succeed(builtIn);
      }

      // Check custom templates
      const custom = customTemplates.get(id);
      if (custom) {
        return Effect.succeed(custom);
      }

      // Check by name (case-insensitive)
      const byName = BUILTIN_TEMPLATES.find(
        (t) => t.name.toLowerCase() === id.toLowerCase() || t.type === id.toLowerCase()
      );
      if (byName) {
        return Effect.succeed(byName);
      }

      return Effect.fail(new TemplateNotFoundError({ templateId: id }));
    });

  const listTemplates = (): Effect.Effect<EnhancementTemplate[], EnhancementErrors> =>
    Effect.sync(() => {
      const all = [...BUILTIN_TEMPLATES, ...customTemplates.values()];
      return all;
    });

  const buildEnhancementPrompt = (
    template: EnhancementTemplate,
    promptContent: string
  ): string => {
    // Replace the {prompt} placeholder in the template
    return template.prompt.replace("{prompt}", promptContent);
  };

  const resolveTemplate = (
    request: EnhancementRequest
  ): Effect.Effect<EnhancementTemplate, TemplateNotFoundError> => {
    if (request.customInstruction) {
      // Create an ad-hoc template for custom instructions
      const customTemplate: EnhancementTemplate = {
        id: "custom-adhoc",
        name: "Custom Enhancement",
        description: "User-provided enhancement instruction",
        type: "custom",
        isBuiltIn: false,
        created: new Date(),
        updated: new Date(),
        prompt: `You are an expert prompt engineer. Your task is to enhance the following prompt.

Enhancement instruction: ${request.customInstruction}

Original prompt:
---
{prompt}
---

Return ONLY the enhanced prompt with no explanations, preamble, or commentary. The output should be ready to use directly.`,
      };
      return Effect.succeed(customTemplate);
    }

    if (typeof request.template === "object") {
      return Effect.succeed(request.template);
    }

    if (typeof request.template === "string") {
      return getTemplate(request.template);
    }

    // Default template
    return Effect.succeed(getDefaultTemplate());
  };

  const resolveModel = (
    request: EnhancementRequest
  ): Effect.Effect<string, NoDefaultModelError | ConfigReadError> => {
    if (request.model) {
      return Effect.succeed(request.model);
    }
    return getDefaultModel().pipe(Effect.map((m) => m.model));
  };

  const estimate = (
    request: EnhancementRequest
  ): Effect.Effect<EnhancementEstimate, EnhancementErrors> =>
    Effect.gen(function* () {
      const template = yield* resolveTemplate(request);
      const model = yield* resolveModel(request);

      // Build the full prompt to count tokens
      const fullPrompt = buildEnhancementPrompt(template, request.promptContent);

      const messages: Message[] = [
        { role: "system", content: "You are an expert prompt engineer." },
        { role: "user", content: fullPrompt },
      ];

      // Count input tokens
      const inputTokens = yield* tokenCounter
        .countMessages(messages, model)
        .pipe(Effect.catchAll(() => Effect.succeed(Math.ceil(fullPrompt.length / 4))));

      // Estimate output tokens (enhanced prompts are typically 1.5-2x the original)
      const estimatedOutputTokens = Math.ceil(request.promptContent.length / 4 * 1.5);

      // Estimate cost
      const estimatedCost = yield* tokenCounter
        .estimateCost(inputTokens, estimatedOutputTokens, model)
        .pipe(Effect.catchAll(() => Effect.succeed(0)));

      return {
        inputTokens,
        estimatedOutputTokens,
        estimatedCost,
        model,
        template,
        formattedCost:
          estimatedCost === 0
            ? "Unknown"
            : estimatedCost < 0.01
              ? `<$0.01`
              : `$${estimatedCost.toFixed(4)}`,
      };
    });

  const enhance = (
    request: EnhancementRequest
  ): Stream.Stream<StreamChunk, EnhancementErrors> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const template = yield* resolveTemplate(request);
        const model = yield* resolveModel(request);

        const fullPrompt = buildEnhancementPrompt(template, request.promptContent);

        const messages: Message[] = [
          { role: "user", content: fullPrompt },
        ];

        return llm.stream({
          model,
          messages,
          temperature: 0.7, // Slightly creative for enhancement
        });
      })
    );

  const enhanceComplete = (
    request: EnhancementRequest
  ): Effect.Effect<EnhancementResult, EnhancementErrors> =>
    Effect.gen(function* () {
      const template = yield* resolveTemplate(request);
      const model = yield* resolveModel(request);

      const fullPrompt = buildEnhancementPrompt(template, request.promptContent);

      const messages: Message[] = [
        { role: "user", content: fullPrompt },
      ];

      const response = yield* llm.complete({
        model,
        messages,
        temperature: 0.7,
      });

      // Calculate cost
      const cost = yield* tokenCounter
        .estimateCost(response.usage.inputTokens, response.usage.outputTokens, model)
        .pipe(Effect.catchAll(() => Effect.succeed(0)));

      return {
        content: response.content.trim(),
        original: request.promptContent,
        template,
        model: response.model,
        usage: {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        },
        cost,
      };
    });

  return {
    enhance,
    enhanceComplete,
    estimate,
    listTemplates,
    getTemplate,
    getDefaultTemplate,
    getDefaultModel,
    buildEnhancementPrompt,
  } as const;
});

// ============================================================================
// Layer
// ============================================================================

export const EnhancementServiceLive = Layer.effect(EnhancementService, makeEnhancementService);
