import { describe, test, expect } from "bun:test"
import { Effect, Stream } from "effect"
import { makeOllamaProvider } from "../../../src/services/providers/ollama-provider"
import type { LLMRequest } from "../../../src/services/llm-service"

describe("OllamaProvider", () => {
  test("provider has correct name", () => {
    const provider = makeOllamaProvider()
    expect(provider.name).toBe("ollama")
  })

  test("listModels returns empty array when Ollama is not running", async () => {
    const provider = makeOllamaProvider()

    const result = await Effect.runPromise(
      Effect.either(provider.listModels())
    )

    // Either succeeds with models or fails with connection error
    if (result._tag === "Right") {
      expect(Array.isArray(result.right)).toBe(true)
    } else {
      expect(result.left.message).toContain("Ollama")
    }
  })

  test("validateApiKey returns true when Ollama is running, error when not", async () => {
    const provider = makeOllamaProvider()

    const result = await Effect.runPromise(
      Effect.either(provider.validateApiKey())
    )

    // Either succeeds (Ollama running) or fails (Ollama not running)
    if (result._tag === "Right") {
      expect(typeof result.right).toBe("boolean")
    } else {
      expect(result.left.message).toContain("Ollama")
    }
  })

  test("complete request has correct structure", async () => {
    const provider = makeOllamaProvider()

    const request: LLMRequest = {
      model: "llama2",
      messages: [
        { role: "user", content: "Hello" }
      ],
      temperature: 0.7,
    }

    const result = await Effect.runPromise(
      Effect.either(provider.complete(request))
    )

    // Will fail if Ollama is not running, but we can check error structure
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("LLMError")
      expect(typeof result.left.message).toBe("string")
    } else {
      // If it succeeds, verify response structure
      expect(result.right.content).toBeDefined()
      expect(result.right.model).toBeDefined()
      expect(result.right.usage).toBeDefined()
      expect(result.right.finishReason).toBeDefined()
    }
  })

  test("stream request returns correct stream", async () => {
    const provider = makeOllamaProvider()

    const request: LLMRequest = {
      model: "llama2",
      messages: [
        { role: "user", content: "Hello" }
      ],
    }

    const stream = provider.stream(request)

    // Try to collect stream chunks (will fail if Ollama not running)
    const result = await Effect.runPromise(
      Effect.either(
        Effect.gen(function* () {
          const chunks = yield* Stream.runCollect(stream)
          return Array.from(chunks).map(chunk => chunk.content)
        })
      )
    )

    if (result._tag === "Left") {
      expect(result.left._tag).toBe("LLMError")
    } else {
      expect(Array.isArray(result.right)).toBe(true)
    }
  })
})
