/**
 * Error Types
 */

import { Data } from "effect";

/**
 * Base error for storage-related failures
 */
export class StorageError extends Data.TaggedError("StorageError")<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Error for clipboard operations
 */
export class ClipboardError extends Data.TaggedError("ClipboardError")<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Error for prompt not found
 */
export class PromptNotFoundError extends Data.TaggedError("PromptNotFoundError")<{
  id: string;
}> {}

/**
 * Error for validation failures
 */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  field: string;
  message: string;
}> {}

/**
 * Error for external editor operations
 */
export class EditorError extends Data.TaggedError("EditorError")<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Error for SQL/database operations
 */
export class SqlError extends Data.TaggedError("SqlError")<{
  message: string;
  query?: string;
  cause?: unknown;
}> {}

/**
 * Error for configuration issues
 */
export class ConfigError extends Data.TaggedError("ConfigError")<{
  message: string;
  key?: string;
}> {}

/**
 * Error for duplicate prompt name
 */
export class DuplicateNameError extends Data.TaggedError("DuplicateNameError")<{
  name: string;
}> {}

/**
 * Error for rate limiting operations
 */
export class RateLimitError extends Data.TaggedError("RateLimitError")<{
  provider: string;
  message: string;
  retryAfter?: Date;
}> {}
