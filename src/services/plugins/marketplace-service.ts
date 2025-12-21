/**
 * Marketplace Service
 *
 * Tracks added marketplaces in ~/.grimoire/marketplaces.json.
 * Provides CRUD operations for marketplace management.
 */

import { Context, Effect, Layer } from "effect";
import { join } from "path";
import { homedir } from "os";
import type { TrackedMarketplace, MarketplaceState, Scope } from "../../models/plugin";
import {
  MarketplaceStateError,
  MarketplaceNotFoundError,
  MarketplaceAlreadyExistsError,
} from "../../models/plugin-errors";

/**
 * Get the marketplaces state file path
 */
const getStateFilePath = (): string => {
  return join(homedir(), ".grimoire", "marketplaces.json");
};

/**
 * Default empty state
 */
const defaultState: MarketplaceState = {
  version: 1,
  marketplaces: [],
};

/**
 * Read marketplace state from file
 */
const readState = (): Effect.Effect<MarketplaceState, MarketplaceStateError> =>
  Effect.gen(function* () {
    const path = getStateFilePath();
    const file = Bun.file(path);

    const exists = yield* Effect.promise(() => file.exists());
    if (!exists) {
      return defaultState;
    }

    try {
      const content = yield* Effect.promise(() => file.text());
      const state = JSON.parse(content) as MarketplaceState;

      // Validate structure
      if (!state.version || !Array.isArray(state.marketplaces)) {
        return defaultState;
      }

      return state;
    } catch (error) {
      return yield* Effect.fail(
        new MarketplaceStateError({
          operation: "read",
          message: `Failed to read marketplace state: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        })
      );
    }
  });

/**
 * Write marketplace state to file
 */
const writeState = (
  state: MarketplaceState
): Effect.Effect<void, MarketplaceStateError> =>
  Effect.gen(function* () {
    const path = getStateFilePath();
    const dir = join(homedir(), ".grimoire");

    try {
      // Ensure directory exists
      const fs = yield* Effect.promise(() => import("fs/promises"));
      yield* Effect.promise(() => fs.mkdir(dir, { recursive: true }));

      // Write state file
      yield* Effect.promise(() =>
        Bun.write(path, JSON.stringify(state, null, 2))
      );
    } catch (error) {
      return yield* Effect.fail(
        new MarketplaceStateError({
          operation: "write",
          message: `Failed to write marketplace state: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        })
      );
    }
  });

// Service interface
interface MarketplaceServiceImpl {
  /**
   * List all tracked marketplaces
   */
  readonly list: () => Effect.Effect<TrackedMarketplace[], MarketplaceStateError>;

  /**
   * Get a marketplace by name
   */
  readonly get: (
    name: string
  ) => Effect.Effect<TrackedMarketplace | null, MarketplaceStateError>;

  /**
   * Add a new marketplace
   */
  readonly add: (
    marketplace: TrackedMarketplace
  ) => Effect.Effect<void, MarketplaceStateError | MarketplaceAlreadyExistsError>;

  /**
   * Remove a marketplace by name
   */
  readonly remove: (
    name: string
  ) => Effect.Effect<void, MarketplaceStateError | MarketplaceNotFoundError>;

  /**
   * Check if a marketplace exists
   */
  readonly exists: (name: string) => Effect.Effect<boolean, MarketplaceStateError>;

  /**
   * Create a TrackedMarketplace object
   */
  readonly createMarketplace: (
    name: string,
    source: string,
    scope: Scope
  ) => TrackedMarketplace;
}

// Service tag
export class MarketplaceService extends Context.Tag("MarketplaceService")<
  MarketplaceService,
  MarketplaceServiceImpl
>() {}

// Service implementation
const makeMarketplaceService = (): MarketplaceServiceImpl => ({
  list: () =>
    Effect.gen(function* () {
      const state = yield* readState();
      return [...state.marketplaces];
    }),

  get: (name: string) =>
    Effect.gen(function* () {
      const state = yield* readState();
      return state.marketplaces.find((m) => m.name === name) ?? null;
    }),

  add: (marketplace: TrackedMarketplace) =>
    Effect.gen(function* () {
      const state = yield* readState();

      // Check if already exists
      const existing = state.marketplaces.find((m) => m.name === marketplace.name);
      if (existing) {
        return yield* Effect.fail(
          new MarketplaceAlreadyExistsError({
            name: marketplace.name,
            source: existing.source,
          })
        );
      }

      // Add new marketplace
      const newState: MarketplaceState = {
        ...state,
        marketplaces: [...state.marketplaces, marketplace],
      };

      yield* writeState(newState);
    }),

  remove: (name: string) =>
    Effect.gen(function* () {
      const state = yield* readState();

      // Check if exists
      const index = state.marketplaces.findIndex((m) => m.name === name);
      if (index === -1) {
        return yield* Effect.fail(
          new MarketplaceNotFoundError({ name })
        );
      }

      // Remove marketplace
      const newState: MarketplaceState = {
        ...state,
        marketplaces: state.marketplaces.filter((m) => m.name !== name),
      };

      yield* writeState(newState);
    }),

  exists: (name: string) =>
    Effect.gen(function* () {
      const state = yield* readState();
      return state.marketplaces.some((m) => m.name === name);
    }),

  createMarketplace: (name: string, source: string, scope: Scope): TrackedMarketplace => ({
    name,
    source,
    scope,
    addedAt: new Date().toISOString(),
  }),
});

// Live layer
export const MarketplaceServiceLive = Layer.succeed(
  MarketplaceService,
  makeMarketplaceService()
);
