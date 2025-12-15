import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  TokenCounterService,
  TokenCounterServiceLive,
  type Message,
} from "../../src/services/token-counter-service";

describe("TokenCounterService", () => {
  const runEffect = <A, E>(effect: Effect.Effect<A, E, any>) =>
    Effect.runPromise(effect.pipe(Effect.provide(TokenCounterServiceLive)) as Effect.Effect<A, E, never>);

  describe("count", () => {
    test("counts tokens in simple text", async () => {
      const program = Effect.gen(function* () {
        const service = yield* TokenCounterService;
        return yield* service.count("Hello, world!", "gpt-4o");
      });

      const count = await runEffect(program);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10); // "Hello, world!" should be a few tokens
    });

    test("counts tokens for different models", async () => {
      const text = "The quick brown fox jumps over the lazy dog";

      const program = Effect.gen(function* () {
        const service = yield* TokenCounterService;
        const gpt4Count = yield* service.count(text, "gpt-4o");
        const gpt35Count = yield* service.count(text, "gpt-3.5-turbo");
        return { gpt4Count, gpt35Count };
      });

      const { gpt4Count, gpt35Count } = await runEffect(program);
      expect(gpt4Count).toBeGreaterThan(0);
      expect(gpt35Count).toBeGreaterThan(0);
      // Both should produce similar results for simple English text
      expect(Math.abs(gpt4Count - gpt35Count)).toBeLessThan(5);
    });

    test("fails for unknown model", async () => {
      const program = Effect.gen(function* () {
        const service = yield* TokenCounterService;
        return yield* service.count("test", "unknown-model-xyz");
      });

      await expect(runEffect(program)).rejects.toThrow();
    });
  });

  describe("countMessages", () => {
    test("counts tokens in message array", async () => {
      const messages: Message[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is the capital of France?" },
        { role: "assistant", content: "The capital of France is Paris." },
      ];

      const program = Effect.gen(function* () {
        const service = yield* TokenCounterService;
        return yield* service.countMessages(messages, "gpt-4o");
      });

      const count = await runEffect(program);
      expect(count).toBeGreaterThan(0);
      // Should include overhead for message formatting
      expect(count).toBeGreaterThan(20); // Base content + overhead
    });

    test("includes message overhead", async () => {
      const singleMessage: Message[] = [
        { role: "user", content: "Hello" },
      ];

      const program = Effect.gen(function* () {
        const service = yield* TokenCounterService;
        const messageCount = yield* service.countMessages(
          singleMessage,
          "gpt-4o"
        );
        const textCount = yield* service.count("Hello", "gpt-4o");
        return { messageCount, textCount };
      });

      const { messageCount, textCount } = await runEffect(program);
      // Message count should be higher due to role tokens + overhead
      expect(messageCount).toBeGreaterThan(textCount);
    });
  });

  describe("estimateCost", () => {
    test("estimates cost for GPT-4o", async () => {
      const program = Effect.gen(function* () {
        const service = yield* TokenCounterService;
        return yield* service.estimateCost(1000, 500, "gpt-4o");
      });

      const cost = await runEffect(program);
      // 1000 input tokens @ $2.50/1M + 500 output @ $10/1M
      // = $0.0025 + $0.005 = $0.0075
      expect(cost).toBeCloseTo(0.0075, 4);
    });

    test("estimates cost for GPT-4o-mini", async () => {
      const program = Effect.gen(function* () {
        const service = yield* TokenCounterService;
        return yield* service.estimateCost(1000, 500, "gpt-4o-mini");
      });

      const cost = await runEffect(program);
      // 1000 input @ $0.15/1M + 500 output @ $0.60/1M
      // = $0.00015 + $0.0003 = $0.00045
      expect(cost).toBeCloseTo(0.00045, 5);
    });

    test("estimates cost for Claude models", async () => {
      const program = Effect.gen(function* () {
        const service = yield* TokenCounterService;
        return yield* service.estimateCost(
          1000,
          500,
          "claude-sonnet-4-20250514"
        );
      });

      const cost = await runEffect(program);
      // 1000 input @ $3/1M + 500 output @ $15/1M
      // = $0.003 + $0.0075 = $0.0105
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    test("fails for model without pricing", async () => {
      const program = Effect.gen(function* () {
        const service = yield* TokenCounterService;
        return yield* service.estimateCost(1000, 500, "unknown-model");
      });

      await expect(runEffect(program)).rejects.toThrow();
    });
  });

  describe("integration", () => {
    test("counts and estimates cost for a real conversation", async () => {
      const messages: Message[] = [
        {
          role: "system",
          content:
            "You are a helpful assistant that provides concise answers.",
        },
        {
          role: "user",
          content: "Write a haiku about programming.",
        },
        {
          role: "assistant",
          content:
            "Code flows like water\nBugs emerge from deep silence\nDebugger whispers",
        },
      ];

      const program = Effect.gen(function* () {
        const service = yield* TokenCounterService;
        const tokenCount = yield* service.countMessages(messages, "gpt-4o");
        // Assume similar output token count
        const cost = yield* service.estimateCost(
          tokenCount,
          tokenCount,
          "gpt-4o"
        );
        return { tokenCount, cost };
      });

      const { tokenCount, cost } = await runEffect(program);
      expect(tokenCount).toBeGreaterThan(0);
      expect(cost).toBeGreaterThan(0);
      // Cost should be reasonable for a small conversation
      expect(cost).toBeLessThan(0.01);
    });
  });
});
