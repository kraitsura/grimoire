/**
 * useStreamingEffect - Hook for streaming LLM responses with proper React integration
 *
 * Runs Effect streams with fiber-based execution that doesn't block the event loop,
 * allowing React to re-render as chunks arrive.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Effect, Stream, Fiber } from "effect";
import { useRuntime } from "../context/runtime-context.js";
import type { AppServices } from "../../services/index.js";
import type { StreamChunk, TokenUsage } from "../../services/llm-service.js";
import { log } from "../../services/logger-service.js";

export interface StreamingState {
  content: string;
  thinking: string;
  isStreaming: boolean;
  isDone: boolean;
  error: Error | null;
  usage?: TokenUsage;
  model?: string;
}

export interface UseStreamingEffectReturn {
  state: StreamingState;
  start: () => void;
  reset: () => void;
}

const initialState: StreamingState = {
  content: "",
  thinking: "",
  isStreaming: false,
  isDone: false,
  error: null,
};

/**
 * Hook for streaming LLM responses with thinking token support
 *
 * @param streamFactory - Function that returns an Effect Stream of StreamChunks
 * @returns Object with streaming state, start function, and reset function
 *
 * @example
 * ```tsx
 * const { state, start, reset } = useStreamingEffect(() =>
 *   llm.stream({
 *     model: "claude-sonnet-4",
 *     messages: [{ role: "user", content: prompt }],
 *     thinking: { enabled: true, budgetTokens: 4096 },
 *   })
 * );
 *
 * // Start streaming
 * start();
 *
 * // Display state
 * <StreamingCanvas
 *   thinking={state.thinking}
 *   content={state.content}
 *   isStreaming={state.isStreaming}
 *   isDone={state.isDone}
 * />
 * ```
 */
export function useStreamingEffect(
  streamFactory: () => Stream.Stream<StreamChunk, unknown, AppServices>
): UseStreamingEffectReturn {
  const runtime = useRuntime();
  const fiberRef = useRef<Fiber.RuntimeFiber<void, unknown> | null>(null);
  const mountedRef = useRef(true);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<StreamingState>(initialState);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Clear connection timeout on unmount
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      // Cancel any running fiber on unmount
      // Interrupt errors are expected (fiber may already be complete)
      if (fiberRef.current) {
        runtime.runPromise(Fiber.interrupt(fiberRef.current)).catch(() => undefined);
      }
    };
  }, [runtime]);

  const reset = useCallback(() => {
    // Clear connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    // Cancel any running fiber (interrupt errors expected)
    if (fiberRef.current) {
      runtime.runPromise(Fiber.interrupt(fiberRef.current)).catch(() => undefined);
      fiberRef.current = null;
    }
    setState(initialState);
  }, [runtime]);

  const start = useCallback(() => {
    log.info("useStreamingEffect", "start() called");

    // Cancel any existing fiber (interrupt errors expected)
    if (fiberRef.current) {
      log.debug("useStreamingEffect", "Cancelling existing fiber");
      runtime.runPromise(Fiber.interrupt(fiberRef.current)).catch(() => undefined);
    }

    // Reset state for new stream
    setState({
      ...initialState,
      isStreaming: true,
    });

    // Track if we received any chunks
    let receivedAnyChunk = false;
    let chunkCount = 0;

    // Clear any existing connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }

    // Connection timeout - if no chunks received within 30 seconds, fail
    log.debug("useStreamingEffect", "Setting 30s connection timeout");
    connectionTimeoutRef.current = setTimeout(() => {
      if (!receivedAnyChunk && mountedRef.current) {
        log.error("useStreamingEffect", "Connection timeout - no chunks received in 30s");
        connectionTimeoutRef.current = null;
        setState((prev) => {
          if (prev.isStreaming && !prev.isDone && !prev.error) {
            return {
              ...prev,
              isStreaming: false,
              isDone: true,
              error: new Error("Connection timeout: No response received within 30 seconds"),
            };
          }
          return prev;
        });
        // Interrupt the fiber if it's still running (interrupt errors expected)
        if (fiberRef.current) {
          runtime.runPromise(Fiber.interrupt(fiberRef.current)).catch(() => undefined);
        }
      }
    }, 30000);

    // Create the streaming effect
    log.debug("useStreamingEffect", "Creating streaming effect");
    const effect = Effect.gen(function* () {
      log.debug("useStreamingEffect", "Effect.gen started, calling streamFactory()");
      const stream = streamFactory();
      log.debug("useStreamingEffect", "streamFactory() returned, starting Stream.runForEach");

      yield* Stream.runForEach(stream, (chunk) =>
        Effect.gen(function* () {
          if (!mountedRef.current) {
            log.warn("useStreamingEffect", "Component unmounted, ignoring chunk");
            return;
          }

          chunkCount++;
          if (!receivedAnyChunk) {
            log.info("useStreamingEffect", "First chunk received", { type: chunk.type, done: chunk.done });
            receivedAnyChunk = true;
            // Clear timeout once we receive first chunk
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
              connectionTimeoutRef.current = null;
            }
          }

          // Log every 10th chunk to avoid spam
          if (chunkCount % 10 === 0) {
            log.debug("useStreamingEffect", `Received ${chunkCount} chunks`, { type: chunk.type });
          }

          // Update state based on chunk type
          if (chunk.type === "thinking" && chunk.thinkingDelta) {
            setState((prev) => ({
              ...prev,
              thinking: prev.thinking + chunk.thinkingDelta,
            }));
          } else if (chunk.type === "content" && chunk.content) {
            setState((prev) => ({
              ...prev,
              content: prev.content + chunk.content,
            }));
          }

          if (chunk.done) {
            log.info("useStreamingEffect", "Stream done", { usage: chunk.usage, model: chunk.model, totalChunks: chunkCount });
            setState((prev) => ({
              ...prev,
              isDone: true,
              isStreaming: false,
              usage: chunk.usage,
              model: chunk.model,
            }));
          }

          // Yield to allow React to re-render
          yield* Effect.yieldNow();
        })
      );

      log.debug("useStreamingEffect", "Stream.runForEach completed", { totalChunks: chunkCount });

      // Clear connection timeout since stream completed
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      // If stream completed without emitting any chunks and without done flag, mark as done
      if (!receivedAnyChunk && mountedRef.current) {
        log.warn("useStreamingEffect", "Stream completed without any chunks");
        setState((prev) => {
          if (!prev.isDone) {
            return {
              ...prev,
              isDone: true,
              isStreaming: false,
              error: prev.error ?? new Error("Stream ended without producing any output"),
            };
          }
          return prev;
        });
      }
    }).pipe(
      Effect.catchAll((e) =>
        Effect.sync(() => {
          const errorMsg = e instanceof Error ? e.message : String(e);
          const errorStack = e instanceof Error ? e.stack : undefined;
          const errorType = e?.constructor?.name ?? typeof e;
          const errorTag = e && typeof e === "object" && "_tag" in e ? (e as { _tag: string })._tag : undefined;
          log.error("useStreamingEffect", "Stream error caught in catchAll", {
            error: errorMsg,
            type: errorType,
            tag: errorTag,
            chunkCount,
            stack: errorStack,
          });
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          if (!mountedRef.current) return;
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            isDone: true, // Mark done on error so UI can transition
            error: e instanceof Error ? e : new Error(String(e)),
          }));
        })
      )
    );

    // Run with fork for non-blocking execution
    log.debug("useStreamingEffect", "Starting fiber execution");
    runtime
      .runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.fork(effect);
          fiberRef.current = fiber;
          log.debug("useStreamingEffect", "Fiber forked, joining...");
          yield* Fiber.join(fiber);
          log.debug("useStreamingEffect", "Fiber join completed");
        })
      )
      .then(() => {
        log.info("useStreamingEffect", "runPromise resolved successfully");
      })
      .catch((e) => {
        // Handle any uncaught errors (fiber-level failures)
        const errorMsg = e instanceof Error ? e.message : String(e);
        const errorStack = e instanceof Error ? e.stack : undefined;
        const errorType = e?.constructor?.name ?? typeof e;
        const errorTag = e && typeof e === "object" && "_tag" in e ? (e as { _tag: string })._tag : undefined;
        log.error("useStreamingEffect", "runPromise rejected", {
          error: errorMsg,
          type: errorType,
          tag: errorTag,
          stack: errorStack,
          rawError: JSON.stringify(e, Object.getOwnPropertyNames(e ?? {})),
        });
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            isDone: true,
            error: prev.error ?? (e instanceof Error ? e : new Error(String(e) || "Stream failed")),
          }));
        }
      });
  }, [runtime, streamFactory]);

  return { state, start, reset };
}
