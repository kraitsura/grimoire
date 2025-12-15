/**
 * Runtime Context Provider - Effect integration with React/Ink
 *
 * Provides a managed Effect runtime to React components, enabling them to
 * run effectful computations with proper service dependency injection.
 */

import { ManagedRuntime, Effect } from "effect";
import React, {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Import the composed MainLive layer and AppServices type from services
import { MainLive, type AppServices } from "../../services";

/**
 * Runtime type - provides all application services
 *
 * Uses the centralized AppServices type from services/index.ts
 */
type RuntimeType = ManagedRuntime.ManagedRuntime<AppServices, never>;

/**
 * Runtime context
 */
const RuntimeContext = createContext<RuntimeType | null>(null);

/**
 * Runtime Provider Component
 *
 * Creates a managed Effect runtime and provides it to child components.
 * Handles cleanup on unmount to properly dispose of resources.
 *
 * @example
 * ```tsx
 * <RuntimeProvider>
 *   <App />
 * </RuntimeProvider>
 * ```
 */
export const RuntimeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const runtime = useMemo(() => {
    // Create a managed runtime with the main layer
    // Type assertion is safe because MainLive composes layers that don't produce build errors
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return ManagedRuntime.make(MainLive) as RuntimeType;
  }, []);

  useEffect(() => {
    // Cleanup: dispose runtime when component unmounts
    return () => {
      void runtime.dispose();
    };
  }, [runtime]);

  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
};

/**
 * Hook to access the Effect runtime
 *
 * @throws Error if called outside of RuntimeProvider
 * @returns The Effect runtime
 *
 * @example
 * ```tsx
 * const runtime = useRuntime();
 * await runtime.runPromise(myEffect);
 * ```
 */
export const useRuntime = (): RuntimeType => {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error("useRuntime must be used within a RuntimeProvider");
  }
  return runtime;
};

/**
 * Effect execution state
 */
interface EffectState<A, E> {
  result: A | null;
  error: E | null;
  loading: boolean;
}

/**
 * Hook to run an Effect and track its state
 *
 * Executes an Effect when the component mounts or dependencies change,
 * and tracks the result, error, and loading state.
 *
 * @param effect - The Effect to execute
 * @param deps - React dependency array (triggers re-execution when changed)
 * @returns Object with result, error, and loading state
 *
 * @example
 * ```tsx
 * const { result, error, loading } = useEffectRun(
 *   Effect.gen(function* () {
 *     const storage = yield* StorageService;
 *     return yield* storage.getAll;
 *   }),
 *   []
 * );
 *
 * if (loading) return <Text>Loading...</Text>;
 * if (error) return <Text color="red">Error: {String(error)}</Text>;
 * return <Text>Prompts: {result?.length}</Text>;
 * ```
 */
export const useEffectRun = <A, E>(
  effect: Effect.Effect<A, E, AppServices>,
  deps: React.DependencyList
): EffectState<A, E> => {
  const runtime = useRuntime();
  const [state, setState] = useState<EffectState<A, E>>({
    result: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;

    // Run async operation
    runtime
      .runPromise(effect)
      .then((result: A) => {
        if (mounted) {
          setState({ result, error: null, loading: false });
        }
      })
      .catch((error: E) => {
        if (mounted) {
          setState({ result: null, error: error, loading: false });
        }
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
};

/**
 * Mutation state and execute function
 */
interface MutationState<A> {
  execute: () => Promise<A>;
  loading: boolean;
}

/**
 * Hook for running Effects as mutations (on-demand execution)
 *
 * Returns a function to execute the Effect and tracks loading state.
 * Unlike useEffectRun, this does not run automatically on mount.
 *
 * @param effectFn - Function that returns the Effect to execute
 * @returns Object with execute function and loading state
 *
 * @example
 * ```tsx
 * const { execute, loading } = useEffectCallback(() =>
 *   Effect.gen(function* () {
 *     const storage = yield* StorageService;
 *     return yield* storage.create({
 *       name: "My Prompt",
 *       content: "Hello world"
 *     });
 *   })
 * );
 *
 * <Button onPress={() => execute()}>
 *   {loading ? "Creating..." : "Create Prompt"}
 * </Button>
 * ```
 */
export const useEffectCallback = <A, E>(
  effectFn: () => Effect.Effect<A, E, AppServices>
): MutationState<A> => {
  const runtime = useRuntime();
  const [loading, setLoading] = useState(false);

  const execute = async (): Promise<A> => {
    setLoading(true);
    try {
      return await runtime.runPromise(effectFn());
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading };
};
