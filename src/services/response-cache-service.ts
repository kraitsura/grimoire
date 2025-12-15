/**
 * Response Cache Service - Caches LLM responses with TTL and size limits
 *
 * This service provides efficient caching of LLM API responses to reduce
 * redundant calls and improve response times. Uses SHA256 hashing for
 * cache keys and implements TTL-based expiration with size limits.
 */

import { Context, Effect, Layer, Option } from "effect";
import { SqlService } from "./sql-service";
import { SqlError } from "../models";
import { createHash } from "node:crypto";

/**
 * LLM request structure for cache key generation
 */
export interface LLMRequest {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * LLM response structure stored in cache
 */
export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  entries: number;
  totalSize: number;
  hitRate: number;
}

/**
 * Database row structure for response_cache table
 */
interface CacheRow {
  id: string;
  request_hash: string;
  request: string;
  response: string;
  created_at: string;
  expires_at: string;
  size_bytes: number;
}

/**
 * Database row structure for cache stats
 */
interface CacheStatsRow {
  entries: number;
  total_size: number;
}

/**
 * Configuration for cache behavior
 */
interface CacheConfig {
  ttlMs: number; // Time to live in milliseconds
  maxSizeBytes: number; // Maximum cache size in bytes
}

/**
 * Default cache configuration
 * - 24 hour TTL
 * - 100MB max size
 */
const DEFAULT_CONFIG: CacheConfig = {
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  maxSizeBytes: 100 * 1024 * 1024, // 100MB
};

/**
 * Response cache service interface
 */
interface ResponseCacheServiceImpl {
  /**
   * Get cached response for a request
   * Returns None if not found or expired
   */
  readonly get: (request: LLMRequest) => Effect.Effect<Option.Option<LLMResponse>, SqlError>;

  /**
   * Store a response in the cache
   * Evicts oldest entries if size limit exceeded
   */
  readonly set: (request: LLMRequest, response: LLMResponse) => Effect.Effect<void, SqlError>;

  /**
   * Clear all cached responses
   */
  readonly clear: () => Effect.Effect<void, SqlError>;

  /**
   * Get cache statistics
   */
  readonly getStats: () => Effect.Effect<CacheStats, SqlError>;
}

/**
 * Response cache service tag
 */
export class ResponseCacheService extends Context.Tag("ResponseCacheService")<
  ResponseCacheService,
  ResponseCacheServiceImpl
>() {}

/**
 * Generate SHA256 hash for cache key
 * Includes model, messages, temperature, and maxTokens
 */
const generateCacheKey = (request: LLMRequest): string => {
  // Normalize request for consistent hashing
  const normalized = {
    model: request.model,
    messages: request.messages,
    temperature: request.temperature ?? 0,
    maxTokens: request.maxTokens ?? 0,
  };

  // Generate SHA256 hash
  const json = JSON.stringify(normalized);
  const hash = createHash("sha256").update(json).digest("hex");

  return hash;
};

/**
 * Check if a request should be cached
 * Don't cache if temperature > 0 (non-deterministic)
 */
const shouldCache = (request: LLMRequest): boolean => {
  const temperature = request.temperature ?? 0;
  return temperature === 0;
};

/**
 * Calculate size in bytes of a cache entry
 */
const calculateSize = (request: LLMRequest, response: LLMResponse): number => {
  const requestJson = JSON.stringify(request);
  const responseJson = JSON.stringify(response);
  return Buffer.byteLength(requestJson) + Buffer.byteLength(responseJson);
};

/**
 * Response cache service implementation
 */
export const ResponseCacheServiceLive = Layer.effect(
  ResponseCacheService,
  Effect.gen(function* () {
    // Get service dependencies
    const sql = yield* SqlService;
    const config = DEFAULT_CONFIG;

    /**
     * Initialize cache table if it doesn't exist
     */
    const initializeTable = (): Effect.Effect<void, SqlError> =>
      sql.run(`
        CREATE TABLE IF NOT EXISTS response_cache (
          id TEXT PRIMARY KEY,
          request_hash TEXT UNIQUE NOT NULL,
          request TEXT NOT NULL,
          response TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          size_bytes INTEGER NOT NULL
        )
      `);

    /**
     * Create index on request_hash for fast lookups
     */
    const createIndex = (): Effect.Effect<void, SqlError> =>
      sql.run(`
        CREATE INDEX IF NOT EXISTS idx_response_cache_hash
        ON response_cache(request_hash)
      `);

    /**
     * Create index on expires_at for efficient cleanup
     */
    const createExpirationIndex = (): Effect.Effect<void, SqlError> =>
      sql.run(`
        CREATE INDEX IF NOT EXISTS idx_response_cache_expires
        ON response_cache(expires_at)
      `);

    /**
     * Remove expired entries
     */
    const cleanupExpired = (): Effect.Effect<void, SqlError> =>
      sql.run("DELETE FROM response_cache WHERE expires_at < ?", [new Date().toISOString()]);

    /**
     * Evict oldest entries until size limit is met
     */
    const evictOldest = (targetSize: number): Effect.Effect<void, SqlError> =>
      Effect.gen(function* () {
        // Get current total size
        const statsRows = yield* sql.query<CacheStatsRow>(
          "SELECT COUNT(*) as entries, COALESCE(SUM(size_bytes), 0) as total_size FROM response_cache"
        );

        const currentSize = statsRows[0]?.total_size ?? 0;

        if (currentSize <= targetSize) {
          return;
        }

        // Calculate how many bytes to free
        const bytesToFree = currentSize - targetSize;

        // Delete oldest entries until we free enough space
        yield* sql.run(
          `DELETE FROM response_cache
           WHERE id IN (
             SELECT id FROM response_cache
             ORDER BY created_at ASC
             LIMIT (
               SELECT COUNT(*)
               FROM (
                 SELECT id, SUM(size_bytes) OVER (ORDER BY created_at ASC) as running_total
                 FROM response_cache
               ) WHERE running_total <= ?
             )
           )`,
          [bytesToFree]
        );
      });

    // Initialize table and indexes
    yield* initializeTable();
    yield* createIndex();
    yield* createExpirationIndex();

    return ResponseCacheService.of({
      get: (request: LLMRequest) =>
        Effect.gen(function* () {
          // Clean up expired entries first
          yield* cleanupExpired();

          // Don't attempt cache lookup if request shouldn't be cached
          if (!shouldCache(request)) {
            return Option.none();
          }

          // Generate cache key
          const hash = generateCacheKey(request);

          // Query cache
          const rows = yield* sql.query<CacheRow>(
            `SELECT response, expires_at
             FROM response_cache
             WHERE request_hash = ?
             AND expires_at > ?`,
            [hash, new Date().toISOString()]
          );

          if (rows.length === 0) {
            return Option.none();
          }

          // Parse and return cached response
          const cached = JSON.parse(rows[0].response) as LLMResponse;
          return Option.some(cached);
        }),

      set: (request: LLMRequest, response: LLMResponse) =>
        Effect.gen(function* () {
          // Don't cache if temperature > 0
          if (!shouldCache(request)) {
            return;
          }

          // Generate cache key and calculate size
          const hash = generateCacheKey(request);
          const size = calculateSize(request, response);
          const now = new Date();
          const expiresAt = new Date(now.getTime() + config.ttlMs);

          // Use transaction for atomicity
          yield* sql.transaction(
            Effect.gen(function* () {
              // Evict old entries if needed to make room
              const maxSize = config.maxSizeBytes - size;
              yield* evictOldest(maxSize);

              // Insert or replace cache entry
              yield* sql.run(
                `INSERT OR REPLACE INTO response_cache
                 (id, request_hash, request, response, created_at, expires_at, size_bytes)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  crypto.randomUUID(),
                  hash,
                  JSON.stringify(request),
                  JSON.stringify(response),
                  now.toISOString(),
                  expiresAt.toISOString(),
                  size,
                ]
              );
            })
          );
        }),

      clear: () =>
        Effect.gen(function* () {
          yield* sql.run("DELETE FROM response_cache");
        }),

      getStats: () =>
        Effect.gen(function* () {
          // Clean up expired entries first
          yield* cleanupExpired();

          // Get cache statistics
          const statsRows = yield* sql.query<CacheStatsRow>(
            "SELECT COUNT(*) as entries, COALESCE(SUM(size_bytes), 0) as total_size FROM response_cache"
          );

          const stats = statsRows[0];
          const entries = stats?.entries ?? 0;
          const totalSize = stats?.total_size ?? 0;

          // Note: Hit rate calculation would require tracking hits/misses
          // For now, return 0 as placeholder
          // In a real implementation, you would track this in a separate table
          const hitRate = 0;

          return {
            entries,
            totalSize,
            hitRate,
          };
        }),
    });
  })
);
