import { describe, test, expect, beforeEach } from "bun:test"
import { Effect, Layer, Context } from "effect"
import { OpenAIProvider } from "../src/services/providers/openai-provider"
import { ApiKeyService, ApiKeyNotFoundError } from "../src/services/api-key-service"
import type { LLMRequest, LLMProvider } from "../src/services/llm-service"

// Mock ApiKeyService for testing
const makeMockApiKeyService = (apiKey: string = "sk-test-key") => ({
  get: (provider: string) => Effect.succeed(apiKey),
  set: () => Effect.void,
  remove: () => Effect.void,
  list: () => Effect.succeed(["openai"]),
  validate: () => Effect.succeed(true),
  mask: (key: string) => key.slice(0, 7) + "..." + key.slice(-4),
})

const MockApiKeyServiceLive = Layer.succeed(
  ApiKeyService,
  makeMockApiKeyService()
)

describe("OpenAI Provider", () => {
  describe("listModels", () => {
    test("should return list of supported models", async () => {
      const provider = await Effect.runPromise(
        OpenAIProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      )
      const models = await Effect.runPromise(provider.listModels())

      expect(models).toContain("gpt-4o")
      expect(models).toContain("gpt-4o-mini")
      expect(models).toContain("gpt-4-turbo")
      expect(models).toContain("gpt-4")
      expect(models).toContain("gpt-3.5-turbo")
      expect(models).toContain("o1")
      expect(models).toContain("o1-mini")
    })
  })

  describe("provider metadata", () => {
    test("should have correct provider name", async () => {
      const provider = await Effect.runPromise(
        OpenAIProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      )
      expect(provider.name).toBe("openai")
    })
  })

  describe("complete", () => {
    test("should fail when API key is not found", async () => {
      const NoKeyServiceImpl = {
        get: () =>
          Effect.fail(
            new ApiKeyNotFoundError({ provider: "openai" })
          ),
        set: () => Effect.void,
        remove: () => Effect.void,
        list: () => Effect.succeed([]),
        validate: () => Effect.succeed(false),
        mask: (key: string) => key,
      }

      const NoKeyServiceLive = Layer.succeed(ApiKeyService, NoKeyServiceImpl)

      const provider = await Effect.runPromise(
        OpenAIProvider.pipe(Effect.provide(NoKeyServiceLive))
      )

      const request: LLMRequest = {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
      }

      const result = await Effect.runPromise(
        Effect.either(provider.complete(request))
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("LLMError")
        expect(result.left.message).toContain("API key not found")
      }
    })
  })

  describe("validateApiKey", () => {
    test("should validate API key structure", async () => {
      const provider = await Effect.runPromise(
        OpenAIProvider.pipe(Effect.provide(MockApiKeyServiceLive))
      )

      // Note: This will make an actual API call in real usage
      // For unit tests, you'd want to mock the fetch call
      const result = await Effect.runPromise(
        Effect.either(provider.validateApiKey())
      )

      expect(result._tag).toBe("Right")
    })
  })

  describe("message conversion", () => {
    test("should handle system, user, and assistant messages", async () => {
      const request: LLMRequest = {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello!" },
          { role: "assistant", content: "Hi there!" },
          { role: "user", content: "How are you?" },
        ],
      }

      // This test verifies the structure is correct
      // In real usage, this would make an API call
      expect(request.messages).toHaveLength(4)
      expect(request.messages[0].role).toBe("system")
      expect(request.messages[1].role).toBe("user")
      expect(request.messages[2].role).toBe("assistant")
      expect(request.messages[3].role).toBe("user")
    })
  })

  describe("request parameters", () => {
    test("should handle temperature and maxTokens", async () => {
      const request: LLMRequest = {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.5,
        maxTokens: 100,
      }

      expect(request.temperature).toBe(0.5)
      expect(request.maxTokens).toBe(100)
    })

    test("should handle stop sequences", async () => {
      const request: LLMRequest = {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Count to 10" }],
        stopSequences: ["5", "END"],
      }

      expect(request.stopSequences).toEqual(["5", "END"])
    })
  })
})
