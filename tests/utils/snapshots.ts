/**
 * Snapshot Testing Utilities
 *
 * Helpers for snapshot testing with Bun's built-in snapshot support.
 * Useful for testing CLI output, formatted prompts, and component rendering.
 */

import { Effect } from "effect";

/**
 * Normalize content for consistent snapshots across platforms.
 * Removes platform-specific variations like timestamps and paths.
 */
export const normalizeForSnapshot = (content: string): string => {
  return content
    // Normalize line endings
    .replace(/\r\n/g, "\n")
    // Remove trailing whitespace
    .replace(/[ \t]+$/gm, "")
    // Normalize home directory paths
    .replace(/\/Users\/[^/]+/g, "/Users/<user>")
    .replace(/C:\\Users\\[^\\]+/g, "C:\\Users\\<user>")
    // Normalize timestamps (ISO format)
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "<timestamp>")
    // Normalize UUIDs
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "<uuid>"
    );
};

/**
 * Normalize JSON for consistent snapshots.
 * Pretty-prints and normalizes dynamic values.
 */
export const normalizeJsonForSnapshot = (obj: unknown): string => {
  const json = JSON.stringify(obj, null, 2);
  return normalizeForSnapshot(json);
};

/**
 * Create a snapshot-friendly representation of an object.
 * Useful for complex objects with nested data.
 */
export const toSnapshotString = (obj: unknown): string => {
  if (typeof obj === "string") {
    return normalizeForSnapshot(obj);
  }
  return normalizeJsonForSnapshot(obj);
};

/**
 * Run an Effect and convert the result to a snapshot-friendly string.
 */
export const effectToSnapshot = async <A, E>(
  effect: Effect.Effect<A, E, never>
): Promise<string> => {
  const result = await Effect.runPromise(effect);
  return toSnapshotString(result);
};

/**
 * Run an Effect expecting failure and snapshot the error.
 */
export const effectErrorToSnapshot = async <A, E>(
  effect: Effect.Effect<A, E, never>
): Promise<string> => {
  try {
    await Effect.runPromise(effect);
    return "<unexpected success>";
  } catch (error) {
    if (error instanceof Error) {
      return normalizeForSnapshot(error.message);
    }
    return toSnapshotString(error);
  }
};

/**
 * Strip ANSI color codes for clean snapshots.
 */
export const stripAnsi = (str: string): string => {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
};

/**
 * Redact sensitive information from snapshots.
 */
export const redactSensitive = (content: string): string => {
  return content
    // Redact API keys
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "<api-key>")
    .replace(/OPENAI_API_KEY=[^\s]+/g, "OPENAI_API_KEY=<redacted>")
    .replace(/ANTHROPIC_API_KEY=[^\s]+/g, "ANTHROPIC_API_KEY=<redacted>")
    // Redact tokens
    .replace(/Bearer [a-zA-Z0-9._-]+/g, "Bearer <token>")
    // Redact file paths that might contain sensitive info
    .replace(/\/private\/var\/folders\/[^\s]+/g, "<temp-path>");
};

/**
 * Prepare content for snapshot with all normalizations.
 */
export const prepareForSnapshot = (content: string): string => {
  return redactSensitive(stripAnsi(normalizeForSnapshot(content)));
};
