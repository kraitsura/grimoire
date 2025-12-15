import { Effect, Stream, Console } from "effect"
import { ApiKeyServiceLive } from "../api-key-service"
import { makeOpenAIProvider } from "./openai-provider"
import { LLMRequest } from "../llm-service"

// Example 1: Complete (non-streaming) request
const exampleComplete = Effect.gen(function* () {
  const provider = yield* makeOpenAIProvider

  const request: LLMRequest = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "What is the capital of France?" },
    ],
    temperature: 0.7,
    maxTokens: 100,
  }

  const response = yield* provider.complete(request)

  yield* Console.log("Complete Response:")
  yield* Console.log(`Content: ${response.content}`)
  yield* Console.log(`Model: ${response.model}`)
  yield* Console.log(
    `Usage: ${response.usage.inputTokens} input, ${response.usage.outputTokens} output`
  )
  yield* Console.log(`Finish Reason: ${response.finishReason}`)
})

// Example 2: Streaming request
const exampleStream = Effect.gen(function* () {
  const provider = yield* makeOpenAIProvider

  const request: LLMRequest = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Tell me a short joke." },
    ],
    temperature: 0.7,
  }

  yield* Console.log("Stream Response:")

  const stream = provider.stream(request)

  yield* Stream.runForEach(stream, (chunk) =>
    Effect.gen(function* () {
      if (chunk.done) {
        yield* Console.log("\n[Stream complete]")
      } else {
        yield* Console.log(chunk.content)
      }
    })
  )
})

// Example 3: List supported models
const exampleListModels = Effect.gen(function* () {
  const provider = yield* makeOpenAIProvider

  const models = yield* provider.listModels()

  yield* Console.log("Supported Models:")
  yield* Effect.forEach(models, (model) => Console.log(`  - ${model}`))
})

// Example 4: Validate API key
const exampleValidateKey = Effect.gen(function* () {
  const provider = yield* makeOpenAIProvider

  const isValid = yield* provider.validateApiKey()

  yield* Console.log(`API Key Valid: ${isValid}`)
})

// Run examples
const program = Effect.gen(function* () {
  yield* Console.log("=== OpenAI Provider Examples ===\n")

  yield* Console.log("1. List Models")
  yield* exampleListModels
  yield* Console.log("")

  yield* Console.log("2. Validate API Key")
  yield* exampleValidateKey
  yield* Console.log("")

  yield* Console.log("3. Complete Request")
  yield* exampleComplete
  yield* Console.log("")

  yield* Console.log("4. Streaming Request")
  yield* exampleStream
})

// To run this example:
// 1. Make sure you have OPENAI_API_KEY set in your environment or config
// 2. Run: bun run src/services/providers/openai-provider.example.ts
const runnable = program.pipe(Effect.provide(ApiKeyServiceLive))

Effect.runPromise(runnable).catch(console.error)
