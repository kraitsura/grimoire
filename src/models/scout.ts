/**
 * Scout Types
 *
 * Defines schemas and types for scout agents - lightweight exploration
 * agents that run in background for parallel cognition.
 */

import { Schema } from "@effect/schema";

/**
 * Scout exploration depth
 */
export const ScoutDepthSchema = Schema.Literal("shallow", "medium", "deep");
export type ScoutDepth = Schema.Schema.Type<typeof ScoutDepthSchema>;

/**
 * Scout status
 */
export const ScoutStatusSchema = Schema.Literal(
  "pending",   // Created but not started
  "running",   // Currently exploring
  "done",      // Completed successfully
  "failed",    // Error during exploration
  "cancelled"  // Manually cancelled
);
export type ScoutStatus = Schema.Schema.Type<typeof ScoutStatusSchema>;

/**
 * Scout options
 */
export const ScoutOptionsSchema = Schema.Struct({
  depth: Schema.optional(ScoutDepthSchema),
  focus: Schema.optional(Schema.String),
  timeout: Schema.optional(Schema.Number),
  model: Schema.optional(Schema.String),
});
export type ScoutOptions = Schema.Schema.Type<typeof ScoutOptionsSchema>;

/**
 * Scout entry in state registry
 */
export const ScoutEntrySchema = Schema.Struct({
  name: Schema.String,
  question: Schema.String,
  status: ScoutStatusSchema,
  pid: Schema.optional(Schema.Number),
  startedAt: Schema.String,
  completedAt: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  options: Schema.Struct({
    depth: ScoutDepthSchema,
    focus: Schema.optional(Schema.String),
    timeout: Schema.Number,
    model: Schema.String,
  }),
});
export type ScoutEntry = Schema.Schema.Type<typeof ScoutEntrySchema>;

/**
 * Key file found by scout
 */
export const ScoutKeyFileSchema = Schema.Struct({
  path: Schema.String,
  relevance: Schema.String,
});
export type ScoutKeyFile = Schema.Schema.Type<typeof ScoutKeyFileSchema>;

/**
 * Code pattern found by scout
 */
export const ScoutCodePatternSchema = Schema.Struct({
  description: Schema.String,
  example: Schema.String,
  location: Schema.String,
});
export type ScoutCodePattern = Schema.Schema.Type<typeof ScoutCodePatternSchema>;

/**
 * Related area found by scout
 */
export const ScoutRelatedAreaSchema = Schema.Struct({
  path: Schema.String,
  description: Schema.String,
});
export type ScoutRelatedArea = Schema.Schema.Type<typeof ScoutRelatedAreaSchema>;

/**
 * Scout findings - structured exploration results
 */
export const ScoutFindingsSchema = Schema.Struct({
  name: Schema.String,
  question: Schema.String,
  exploredAt: Schema.String,
  duration: Schema.Number, // seconds

  summary: Schema.String,

  keyFiles: Schema.Array(ScoutKeyFileSchema),
  codePatterns: Schema.Array(ScoutCodePatternSchema),
  relatedAreas: Schema.Array(ScoutRelatedAreaSchema),

  rawLog: Schema.optional(Schema.String),
});
export type ScoutFindings = Schema.Schema.Type<typeof ScoutFindingsSchema>;

/**
 * Scout state file schema
 */
export const ScoutStateSchema = Schema.Struct({
  version: Schema.Literal(1),
  scouts: Schema.Record({ key: Schema.String, value: ScoutEntrySchema }),
});
export type ScoutState = Schema.Schema.Type<typeof ScoutStateSchema>;

/**
 * Default scout options
 */
export const DEFAULT_SCOUT_OPTIONS = {
  depth: "medium" as const,
  timeout: 120,
  model: "haiku",
};

/**
 * Scout directories
 */
export const SCOUT_DIR = ".grim/scouts";
export const SCOUT_STATE_FILE = "state.json";
export const SCOUT_FINDINGS_DIR = "findings";

/**
 * Get scout state file path
 */
export const getScoutStatePath = (projectPath: string): string =>
  `${projectPath}/${SCOUT_DIR}/${SCOUT_STATE_FILE}`;

/**
 * Get scout findings file path
 */
export const getScoutFindingsPath = (projectPath: string, name: string): string =>
  `${projectPath}/${SCOUT_DIR}/${SCOUT_FINDINGS_DIR}/${name}.json`;

/**
 * Get scout log file path
 */
export const getScoutLogPath = (projectPath: string, name: string): string =>
  `${projectPath}/${SCOUT_DIR}/${SCOUT_FINDINGS_DIR}/${name}.log`;
