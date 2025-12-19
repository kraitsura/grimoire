/**
 * Stash Domain Types
 *
 * Stack-based clipboard stash with optional named items.
 */

import { Schema } from "@effect/schema";

/**
 * StashItem schema for clipboard stash entries
 *
 * Represents a single stashed clipboard content with optional name,
 * stack ordering for LIFO operations, and timestamps.
 */
export const StashItemSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.optionalWith(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)), {
    nullable: true,
  }),
  content: Schema.String,
  createdAt: Schema.DateFromString,
  stackOrder: Schema.Number.pipe(Schema.int()),
});

/**
 * StashItem type derived from schema
 */
export type StashItem = Schema.Schema.Type<typeof StashItemSchema>;

/**
 * Database row interface for stash table
 */
export interface StashItemRow {
  id: string;
  name: string | null;
  content: string;
  created_at: string;
  stack_order: number;
}

/**
 * Convert database row to StashItem
 */
export const rowToStashItem = (row: StashItemRow): StashItem => ({
  id: row.id,
  name: row.name ?? undefined,
  content: row.content,
  createdAt: new Date(row.created_at),
  stackOrder: row.stack_order,
});
