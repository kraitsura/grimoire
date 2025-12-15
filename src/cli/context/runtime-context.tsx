/**
 * Runtime Context Provider - Effect integration with React/Ink
 *
 * Provides a managed Effect runtime to React components, enabling them to
 * run effectful computations with proper service dependency injection.
 */

import { ManagedRuntime, Layer, Effect } from "effect";
import React, {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Import all services and the main layer
import {
  SqlService,
  StorageService,
  PromptStorageService,
  EditorService,
  Clipboard,
  MigrationService,
  SyncService,
  FileWatcherService,
  ExportService,
  TagService,
  SearchService,
  ImportService,
  ArchiveService,
  ApiKeyService,
  VersionService,
  ChainService,
  PinService,
  FavoriteService,
  SqlLive,
  StorageServiceLive,
  PromptStorageLive,
  EditorServiceLive,
  ClipboardLive,
  MigrationLive,
  SyncLive,
  FileWatcherLive,
  ExportServiceLive,
  TagServiceLive,
  SearchServiceLive,
  ImportServiceLive,
  ArchiveServiceLive,
  ApiKeyServiceLive,
  VersionServiceLive,
  ChainServiceLive,
  PinServiceLive,
  FavoriteServiceLive,
} from "../../services";

/**
 * Main application layer combining all services
 *
 * This layer provides all services needed by the application with
 * proper dependency resolution:
 * - SqlService (foundation layer)
 * - MigrationService (depends on SqlService)
 * - PromptStorageService (file operations)
 * - SyncService (depends on SqlService and PromptStorageService)
 * - StorageService (depends on SqlService, PromptStorageService, and SyncService)
 * - ClipboardService (independent)
 * - EditorService (independent)
 * - ApiKeyService (independent)
 * - FileWatcherService (depends on SyncService)
 * - ExportService (depends on StorageService)
 * - TagService (depends on SqlService and PromptStorageService)
 * - SearchService (depends on SqlService and PromptStorageService)
 * - ImportService (depends on StorageService)
 * - ArchiveService (depends on SqlService and PromptStorageService)
 */
const MainLayer = Layer.mergeAll(
  SqlLive,
  ClipboardLive,
  EditorServiceLive,
  PromptStorageLive,
  ApiKeyServiceLive
).pipe(
  Layer.provideMerge(MigrationLive.pipe(Layer.provide(SqlLive))),
  Layer.provideMerge(
    SyncLive.pipe(Layer.provide(Layer.mergeAll(SqlLive, PromptStorageLive)))
  ),
  Layer.provideMerge(
    StorageServiceLive.pipe(
      Layer.provide(
        Layer.mergeAll(SqlLive, PromptStorageLive, SyncLive.pipe(
          Layer.provide(Layer.mergeAll(SqlLive, PromptStorageLive))
        ))
      )
    )
  ),
  Layer.provideMerge(
    FileWatcherLive.pipe(
      Layer.provide(
        SyncLive.pipe(Layer.provide(Layer.mergeAll(SqlLive, PromptStorageLive)))
      )
    )
  ),
  Layer.provideMerge(
    ExportServiceLive.pipe(
      Layer.provide(
        StorageServiceLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              SqlLive,
              PromptStorageLive,
              SyncLive.pipe(
                Layer.provide(Layer.mergeAll(SqlLive, PromptStorageLive))
              )
            )
          )
        )
      )
    )
  ),
  Layer.provideMerge(
    TagServiceLive.pipe(
      Layer.provide(Layer.mergeAll(SqlLive, PromptStorageLive))
    )
  ),
  Layer.provideMerge(
    SearchServiceLive.pipe(
      Layer.provide(Layer.mergeAll(SqlLive, PromptStorageLive))
    )
  ),
  Layer.provideMerge(
    ImportServiceLive.pipe(
      Layer.provide(
        StorageServiceLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              SqlLive,
              PromptStorageLive,
              SyncLive.pipe(
                Layer.provide(Layer.mergeAll(SqlLive, PromptStorageLive))
              )
            )
          )
        )
      )
    )
  ),
  Layer.provideMerge(
    ArchiveServiceLive.pipe(
      Layer.provide(Layer.mergeAll(SqlLive, PromptStorageLive))
    )
  ),
  // Add VersionService
  Layer.provideMerge(
    VersionServiceLive.pipe(Layer.provide(SqlLive))
  ),
  // Add ChainService
  Layer.provideMerge(
    ChainServiceLive.pipe(Layer.provide(SqlLive))
  ),
  // Add PinService and FavoriteService
  Layer.provideMerge(
    PinServiceLive.pipe(
      Layer.provide(Layer.mergeAll(SqlLive, PromptStorageLive))
    )
  ),
  Layer.provideMerge(
    FavoriteServiceLive.pipe(
      Layer.provide(Layer.mergeAll(SqlLive, PromptStorageLive))
    )
  )
);

/**
 * Runtime type - provides all application services
 *
 * We use any for the error type since it's determined by the layer at runtime.
 */
type RuntimeType = ManagedRuntime.ManagedRuntime<
  | SqlService
  | StorageService
  | PromptStorageService
  | EditorService
  | Clipboard
  | MigrationService
  | SyncService
  | FileWatcherService
  | ExportService
  | TagService
  | SearchService
  | ImportService
  | ArchiveService
  | ApiKeyService
  | VersionService
  | ChainService
  | PinService
  | FavoriteService,
  any
>;

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
export const RuntimeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const runtime = useMemo(() => {
    // Create a managed runtime with the main layer
    return ManagedRuntime.make(MainLayer);
  }, []);

  useEffect(() => {
    // Cleanup: dispose runtime when component unmounts
    return () => {
      runtime.dispose();
    };
  }, [runtime]);

  return (
    <RuntimeContext.Provider value={runtime}>
      {children}
    </RuntimeContext.Provider>
  );
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
  effect: Effect.Effect<
    A,
    E,
    | SqlService
    | StorageService
    | PromptStorageService
    | EditorService
    | Clipboard
    | MigrationService
    | SyncService
    | FileWatcherService
    | ExportService
    | TagService
    | SearchService
    | ImportService
    | ArchiveService
    | ApiKeyService
    | VersionService
    | ChainService
    | PinService
    | FavoriteService
  >,
  deps: React.DependencyList
): EffectState<A, E> => {
  const runtime = useRuntime();
  const [state, setState] = useState<EffectState<A, E>>({
    result: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    setState({ result: null, error: null, loading: true });

    runtime
      .runPromise(effect)
      .then((result: A) => {
        setState({ result, error: null, loading: false });
      })
      .catch((error: E) => {
        setState({ result: null, error: error as E, loading: false });
      });
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
  effectFn: () => Effect.Effect<
    A,
    E,
    | SqlService
    | StorageService
    | PromptStorageService
    | EditorService
    | Clipboard
    | MigrationService
    | SyncService
    | FileWatcherService
    | ExportService
    | TagService
    | SearchService
    | ImportService
    | ArchiveService
    | ApiKeyService
    | VersionService
    | ChainService
    | PinService
    | FavoriteService
  >
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
