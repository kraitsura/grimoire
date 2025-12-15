# LLM Providers

This directory contains implementations of LLM providers that implement the `LLMProvider` interface.

## OpenAI Provider

The OpenAI provider supports chat completion requests to OpenAI's API.

### Supported Models

- `gpt-4o` - Latest GPT-4 optimized model
- `gpt-4o-mini` - Smaller, faster GPT-4 optimized model
- `gpt-4-turbo` - GPT-4 Turbo with enhanced performance
- `gpt-4` - Standard GPT-4 model
- `gpt-3.5-turbo` - Fast and cost-effective model
- `o1` - OpenAI's reasoning model
- `o1-mini` - Smaller reasoning model

### Configuration

Set your OpenAI API key using one of these methods:

1. Environment variable:
   ```bash
   export OPENAI_API_KEY="sk-..."
   ```

2. Grimoire config:
   ```bash
   grimoire config set openai sk-...
   ```

### Usage

#### Basic Completion

```typescript
import { Effect } from "effect"
import { makeOpenAIProvider } from "./providers/openai-provider"
import { ApiKeyService } from "./api-key-service"

const program = Effect.gen(function* () {
  const apiKeyService = yield* ApiKeyService
  const provider = makeOpenAIProvider(apiKeyService)

  const response = yield* provider.complete({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "What is TypeScript?" }
    ],
    temperature: 0.7,
    maxTokens: 500
  })

  console.log(response.content)
  console.log(`Tokens: ${response.usage.inputTokens + response.usage.outputTokens}`)
})
```

#### Streaming

```typescript
import { Effect, Stream } from "effect"
import { makeOpenAIProvider } from "./providers/openai-provider"
import { ApiKeyService } from "./api-key-service"

const program = Effect.gen(function* () {
  const apiKeyService = yield* ApiKeyService
  const provider = makeOpenAIProvider(apiKeyService)

  const stream = provider.stream({
    model: "gpt-4o-mini",
    messages: [
      { role: "user", content: "Write a haiku about programming" }
    ],
    temperature: 0.9
  })

  yield* stream.pipe(
    Effect.forEach((chunk) =>
      Effect.sync(() => {
        if (!chunk.done) {
          process.stdout.write(chunk.content)
        }
      })
    )
  )
})
```

#### List Models

```typescript
const program = Effect.gen(function* () {
  const apiKeyService = yield* ApiKeyService
  const provider = makeOpenAIProvider(apiKeyService)

  const models = yield* provider.listModels()
  console.log("Supported models:", models)
})
```

#### Validate API Key

```typescript
const program = Effect.gen(function* () {
  const apiKeyService = yield* ApiKeyService
  const provider = makeOpenAIProvider(apiKeyService)

  const isValid = yield* provider.validateApiKey()
  console.log("API key is valid:", isValid)
})
```

### Error Handling

The provider handles several error cases:

1. **Missing API Key**: Returns `LLMError` with helpful message
2. **Rate Limiting**: Parses `x-ratelimit-*` headers and provides retry information
3. **API Errors**: Converts OpenAI error responses to `LLMError`
4. **Network Errors**: Wraps fetch errors in `LLMError`

Example error handling:

```typescript
const program = Effect.gen(function* () {
  const apiKeyService = yield* ApiKeyService
  const provider = makeOpenAIProvider(apiKeyService)

  const result = yield* Effect.either(
    provider.complete({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }]
    })
  )

  if (result._tag === "Left") {
    const error = result.left
    console.error(`Error: ${error.message}`)
    console.error(`Provider: ${error.provider}`)
  } else {
    console.log(result.right.content)
  }
})
```

### Rate Limiting

The provider automatically parses OpenAI's rate limit headers:

- `x-ratelimit-limit-requests` - Maximum requests allowed
- `x-ratelimit-remaining-requests` - Requests remaining
- `x-ratelimit-reset-requests` - When the limit resets

When rate limited (429 status), the error message includes:
- Retry-after time (if provided)
- Remaining requests
- Reset time

### Token Usage

All responses include token usage information:

```typescript
{
  usage: {
    inputTokens: 10,    // Prompt tokens
    outputTokens: 50    // Completion tokens
  }
}
```

### Integration with LLMService

Register the provider with the LLM service:

```typescript
import { Effect } from "effect"
import { LLMService } from "./llm-service"
import { OpenAIProvider } from "./providers"

const program = Effect.gen(function* () {
  const llmService = yield* LLMService
  const openaiProvider = yield* OpenAIProvider

  yield* llmService.registerProvider(openaiProvider)

  // Now you can use it through the service
  const response = yield* llmService.complete({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Hello" }]
  })
})
```

### Implementation Details

#### API Endpoint

- Base URL: `https://api.openai.com/v1/chat/completions`
- Method: `POST`
- Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer ${apiKey}`

#### Request Format

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7,
  "max_tokens": 500,
  "stop": ["END"],
  "stream": false
}
```

#### Response Format (Non-streaming)

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4o-mini",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 50,
    "total_tokens": 60
  }
}
```

#### Streaming Format

Streams use Server-Sent Events (SSE):

```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...,"choices":[{"delta":{"content":"Hello"},...}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...,"choices":[{"delta":{"content":" world"},...}]}

data: [DONE]
```

Each chunk contains a `delta` with incremental content.

### Testing

Run the test suite:

```bash
bun test tests/openai-provider.test.ts
```

Run the example:

```bash
# Set your API key first
export OPENAI_API_KEY="sk-..."

# Run the example
bun run src/services/providers/openai-provider.example.ts
```

### Future Enhancements

Potential improvements:

1. **Function Calling**: Support OpenAI's function calling feature
2. **Vision**: Support image inputs for vision-capable models
3. **JSON Mode**: Support structured JSON output mode
4. **Retry Logic**: Automatic retry with exponential backoff
5. **Caching**: Response caching for identical requests
6. **Cost Tracking**: Track API costs based on token usage
