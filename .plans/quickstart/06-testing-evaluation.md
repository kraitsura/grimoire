# Testing & Evaluation

## Overview

LLM integration for testing prompts, comparison, benchmarking, and cost estimation.

## Commands

### `test` Command

```
grimoire test <prompt-name>
  -m, --model       Model to use (default: gpt-4o)
  -p, --provider    Provider: openai, anthropic, local
  --temperature     Temperature 0-2
  --max-tokens      Max output tokens
  --vars            Variables as JSON
  --no-stream       Disable streaming
  --save            Save result
  -i                Interactive mode
```

### `compare` Command

```
grimoire compare <prompt1> <prompt2> [...]
  -m, --model       Model to use
  --parallel        Run in parallel (default: true)
  --format          Output: table, json, markdown
  -i                Interactive winner selection
```

### `benchmark` Command

```
grimoire benchmark <test-file>
  -m, --model       Model to use
  --parallel        Concurrent runs
  --format          Output: table, json, junit
  --timeout         Test timeout
  -v, --verbose     Detailed output
```

Test file format (YAML):
```yaml
name: Code Generation Benchmark
tests:
  - name: "Python Hello World"
    prompt: "Write a Python function..."
    expected:
      contains: ["def ", "print"]
      notContains: ["error"]
      matches: "\\bfunction\\s+\\w+"
```

### `cost` Command

```
grimoire cost <prompt-name>
  -m, --model       Model for calculation
  --all-models      Show all models
  --batch           Estimate for N runs
  --output-tokens   Estimated output (default: 500)
```

## Services

### LLMService

```typescript
interface LLMService {
  readonly complete: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError>
  readonly stream: (request: LLMRequest) => Stream.Stream<StreamChunk, LLMError>
  readonly listModels: () => Effect.Effect<string[]>
  readonly countTokens: (text: string, model: string) => Effect.Effect<number>
}

// Provider abstraction
interface LLMProvider {
  readonly name: string
  readonly complete: (request: LLMRequest) => Effect.Effect<LLMResponse>
  readonly stream: (request: LLMRequest) => Stream.Stream<StreamChunk>
  readonly listModels: () => Effect.Effect<string[]>
  readonly validateApiKey: () => Effect.Effect<boolean>
}
```

### Providers

- **OpenAI**: GPT-4o, GPT-4o-mini, GPT-3.5-turbo, o1, o1-mini
- **Anthropic**: Claude Sonnet 4, Claude Opus 4, Claude 3.5 Sonnet, Claude 3.5 Haiku
- **Local**: Ollama integration

### ApiKeyService

```typescript
interface ApiKeyService {
  readonly get: (provider: string) => Effect.Effect<string | undefined>
  readonly set: (provider: string, key: string) => Effect.Effect<void>
  readonly list: () => Effect.Effect<string[]>
}

// Priority: ENV > config file
const ENV_KEYS = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY"
}
```

### RateLimiterService

```typescript
interface RateLimiterService {
  readonly acquire: (provider: string) => Effect.Effect<void>
  readonly setRetryAfter: (provider: string, ms: number) => Effect.Effect<void>
}
```

### ResponseCacheService

```typescript
interface ResponseCacheService {
  readonly get: (request: LLMRequest) => Effect.Effect<Option<LLMResponse>>
  readonly set: (request: LLMRequest, response: LLMResponse) => Effect.Effect<void>
  readonly clear: () => Effect.Effect<void>
}
```

### TokenCounterService

Using `js-tiktoken`:

```typescript
interface TokenCounterService {
  readonly count: (text: string, model: string) => Effect.Effect<number>
  readonly countMessages: (messages: Message[], model: string) => Effect.Effect<number>
}
```

## Pricing Data

```typescript
const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4o": { inputPer1M: 2.50, outputPer1M: 10.00, contextWindow: 128000 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.60, contextWindow: 128000 },
  "claude-sonnet-4-20250514": { inputPer1M: 3.00, outputPer1M: 15.00, contextWindow: 200000 },
  "claude-3-5-haiku-20241022": { inputPer1M: 0.80, outputPer1M: 4.00, contextWindow: 200000 }
}
```

## Ink Components

- `TestInteractive` - Streaming output display
- `CompareInteractive` - Side-by-side results
- `CostInteractive` - Cost calculator

## Implementation Checklist

- [ ] Create LLMService abstraction
- [ ] Implement OpenAI provider (streaming)
- [ ] Implement Anthropic provider
- [ ] Implement local provider (Ollama)
- [ ] Create ApiKeyService
- [ ] Create RateLimiterService
- [ ] Create ResponseCacheService
- [ ] Create TokenCounterService with tiktoken
- [ ] Implement test command
- [ ] Implement compare command
- [ ] Implement benchmark command
- [ ] Implement cost command
- [ ] Build interactive components
