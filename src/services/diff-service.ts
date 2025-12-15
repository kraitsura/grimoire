import { Context, Effect, Layer } from "effect";
import * as Diff from "diff";

/**
 * Options for computing diffs
 */
export interface DiffOptions {
  readonly ignoreWhitespace?: boolean;
}

/**
 * Represents a single change in the diff
 */
export interface Change {
  readonly value: string;
  readonly added?: boolean;
  readonly removed?: boolean;
}

/**
 * Represents a hunk (a contiguous block of changes) in the diff
 */
export interface Hunk {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly lines: string[];
}

/**
 * The result of computing a diff between two strings
 */
export interface DiffResult {
  readonly changes: Change[];
  readonly hunks: Hunk[];
  readonly additions: number;
  readonly deletions: number;
  readonly unchanged: number;
}

/**
 * Options for formatting diffs
 */
export interface FormatOptions {
  readonly context?: number;
  readonly header?: boolean;
}

/**
 * Information about a line in a side-by-side diff
 */
export interface LineInfo {
  readonly type: "unchanged" | "added" | "removed" | "modified";
  readonly leftLine?: number;
  readonly rightLine?: number;
}

/**
 * A side-by-side representation of a diff
 */
export interface SideBySideDiff {
  readonly left: string[];
  readonly right: string[];
  readonly lineInfo: LineInfo[];
}

/**
 * Service for computing and formatting diffs between strings
 */
export interface DiffService {
  readonly computeDiff: (
    oldContent: string,
    newContent: string,
    options?: DiffOptions
  ) => Effect.Effect<DiffResult, never, never>;
  readonly formatUnified: (
    diff: DiffResult,
    options?: FormatOptions
  ) => Effect.Effect<string, never, never>;
  readonly formatSideBySide: (
    diff: DiffResult,
    options?: FormatOptions
  ) => Effect.Effect<SideBySideDiff, never, never>;
  readonly formatInline: (diff: DiffResult) => Effect.Effect<string, never, never>;
}

export const DiffService = Context.GenericTag<DiffService>("@services/DiffService");

/**
 * Converts jsdiff Change objects to our Change interface
 */
const convertChanges = (changes: Diff.Change[]): Change[] => {
  return changes.map((change) => ({
    value: change.value,
    added: change.added,
    removed: change.removed,
  }));
};

/**
 * Computes statistics from changes
 */
const computeStats = (
  changes: Change[]
): { additions: number; deletions: number; unchanged: number } => {
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  for (const change of changes) {
    const lines = change.value.split("\n").filter((line) => line.length > 0);
    const count = lines.length;

    if (change.added) {
      additions += count;
    } else if (change.removed) {
      deletions += count;
    } else {
      unchanged += count;
    }
  }

  return { additions, deletions, unchanged };
};

/**
 * Type for the structured patch from diff library
 */
interface StructuredPatch {
  readonly hunks: readonly {
    readonly oldStart: number;
    readonly oldLines: number;
    readonly newStart: number;
    readonly newLines: number;
    readonly lines: string[];
  }[];
}

/**
 * Extracts hunks from a structured patch
 */
const extractHunks = (patch: StructuredPatch): Hunk[] => {
  return patch.hunks.map((hunk) => ({
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    lines: hunk.lines,
  }));
};

/**
 * Live implementation of DiffService
 */
export const DiffServiceLive = Layer.succeed(
  DiffService,
  DiffService.of({
    computeDiff: (
      oldContent: string,
      newContent: string,
      options?: DiffOptions
    ): Effect.Effect<DiffResult, never, never> =>
      Effect.sync(() => {
        // Compute line-by-line changes
        const changes = Diff.diffLines(
          oldContent,
          newContent,
          options?.ignoreWhitespace ? { ignoreWhitespace: true } : undefined
        );

        // Compute structured patch for hunk information
        const patch = Diff.structuredPatch(
          "old",
          "new",
          oldContent,
          newContent,
          "",
          "",
          options?.ignoreWhitespace ? { ignoreWhitespace: true } : undefined
        ) as StructuredPatch;

        const convertedChanges = convertChanges(changes);
        const stats = computeStats(convertedChanges);
        const hunks = extractHunks(patch);

        return {
          changes: convertedChanges,
          hunks,
          additions: stats.additions,
          deletions: stats.deletions,
          unchanged: stats.unchanged,
        };
      }),

    formatUnified: (diff: DiffResult, options?: FormatOptions): Effect.Effect<string, never, never> =>
      Effect.sync(() => {
        const _context = options?.context ?? 3;
        const includeHeader = options?.header ?? true;
        const lines: string[] = [];

        if (includeHeader) {
          lines.push(`--- old`);
          lines.push(`+++ new`);
        }

        for (const hunk of diff.hunks) {
          // Add hunk header
          lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);

          // Add hunk lines
          lines.push(...hunk.lines);
        }

        return lines.join("\n");
      }),

    formatSideBySide: (
      diff: DiffResult,
      _options?: FormatOptions
    ): Effect.Effect<SideBySideDiff, never, never> =>
      Effect.sync(() => {
        const left: string[] = [];
        const right: string[] = [];
        const lineInfo: LineInfo[] = [];

        let leftLineNum = 1;
        let rightLineNum = 1;

        for (const change of diff.changes) {
          const lines = change.value.split("\n").filter((line) => line.length > 0);

          if (change.added) {
            // Added lines appear only on the right
            for (const line of lines) {
              left.push("");
              right.push(line);
              lineInfo.push({
                type: "added",
                rightLine: rightLineNum++,
              });
            }
          } else if (change.removed) {
            // Removed lines appear only on the left
            for (const line of lines) {
              left.push(line);
              right.push("");
              lineInfo.push({
                type: "removed",
                leftLine: leftLineNum++,
              });
            }
          } else {
            // Unchanged lines appear on both sides
            for (const line of lines) {
              left.push(line);
              right.push(line);
              lineInfo.push({
                type: "unchanged",
                leftLine: leftLineNum++,
                rightLine: rightLineNum++,
              });
            }
          }
        }

        return { left, right, lineInfo };
      }),

    formatInline: (diff: DiffResult): Effect.Effect<string, never, never> =>
      Effect.sync(() => {
        const lines: string[] = [];

        for (const change of diff.changes) {
          const changeLines = change.value.split("\n").filter((line) => line.length > 0);

          for (const line of changeLines) {
            if (change.added) {
              // Green for additions
              lines.push(`\x1b[32m+ ${line}\x1b[0m`);
            } else if (change.removed) {
              // Red for deletions
              lines.push(`\x1b[31m- ${line}\x1b[0m`);
            } else {
              // No color for unchanged
              lines.push(`  ${line}`);
            }
          }
        }

        return lines.join("\n");
      }),
  })
);
