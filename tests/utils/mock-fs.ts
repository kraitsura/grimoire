/**
 * Mock Filesystem Service
 *
 * In-memory filesystem implementation for testing storage operations
 * without actual disk I/O. Simulates file operations with controllable
 * behavior for error testing.
 */

import { Effect, Layer, Ref } from "effect";

/**
 * File metadata stored in the mock filesystem
 */
export interface MockFile {
  content: string;
  createdAt: Date;
  updatedAt: Date;
  permissions: number;
}

/**
 * Mock filesystem state
 */
export interface MockFsState {
  files: Map<string, MockFile>;
  directories: Set<string>;
  errors: Map<string, Error>; // Path -> Error to throw
}

/**
 * Mock filesystem operations interface
 */
export interface MockFsService {
  // File operations
  readFile: (path: string) => Effect.Effect<string, MockFsError>;
  writeFile: (path: string, content: string) => Effect.Effect<void, MockFsError>;
  appendFile: (path: string, content: string) => Effect.Effect<void, MockFsError>;
  deleteFile: (path: string) => Effect.Effect<void, MockFsError>;
  exists: (path: string) => Effect.Effect<boolean>;
  stat: (path: string) => Effect.Effect<MockFile, MockFsError>;

  // Directory operations
  mkdir: (path: string, options?: { recursive?: boolean }) => Effect.Effect<void, MockFsError>;
  rmdir: (path: string) => Effect.Effect<void, MockFsError>;
  readdir: (path: string) => Effect.Effect<string[], MockFsError>;

  // Test helpers
  setFile: (path: string, content: string) => Effect.Effect<void>;
  setError: (path: string, error: Error) => Effect.Effect<void>;
  clearError: (path: string) => Effect.Effect<void>;
  clear: () => Effect.Effect<void>;
  getState: () => Effect.Effect<MockFsState>;
  listFiles: () => Effect.Effect<string[]>;
}

/**
 * Mock filesystem error
 */
export class MockFsError {
  readonly _tag = "MockFsError";
  constructor(
    readonly code: "ENOENT" | "EEXIST" | "EACCES" | "EISDIR" | "ENOTDIR" | "ENOTEMPTY" | "UNKNOWN",
    readonly message: string,
    readonly path: string
  ) {}
}

/**
 * Create a new mock filesystem service
 */
export const createMockFs = (): Effect.Effect<MockFsService, never, never> => {
  return Effect.gen(function* () {
    const stateRef = yield* Ref.make<MockFsState>({
      files: new Map(),
      directories: new Set(["/", "."]),
      errors: new Map(),
    });

    const checkError = (path: string): Effect.Effect<void, MockFsError> =>
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef);
        const error = state.errors.get(path);
        if (error) {
          return yield* Effect.fail(
            new MockFsError("UNKNOWN", error.message, path)
          );
        }
      });

    const normalizePath = (path: string): string => {
      // Simple path normalization
      return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    };

    const getParentDir = (path: string): string => {
      const normalized = normalizePath(path);
      const lastSlash = normalized.lastIndexOf("/");
      if (lastSlash <= 0) return "/";
      return normalized.slice(0, lastSlash);
    };

    const ensureParentExists = (path: string): Effect.Effect<void, MockFsError> =>
      Effect.gen(function* () {
        const parent = getParentDir(path);
        if (parent === "/" || parent === ".") return;

        const state = yield* Ref.get(stateRef);
        if (!state.directories.has(parent) && !state.files.has(parent)) {
          return yield* Effect.fail(
            new MockFsError("ENOENT", `Parent directory does not exist: ${parent}`, parent)
          );
        }
      });

    return {
      readFile: (path: string) =>
        Effect.gen(function* () {
          yield* checkError(path);
          const state = yield* Ref.get(stateRef);
          const normalized = normalizePath(path);
          const file = state.files.get(normalized);
          if (!file) {
            return yield* Effect.fail(
              new MockFsError("ENOENT", `File not found: ${path}`, path)
            );
          }
          if (state.directories.has(normalized)) {
            return yield* Effect.fail(
              new MockFsError("EISDIR", `Is a directory: ${path}`, path)
            );
          }
          return file.content;
        }),

      writeFile: (path: string, content: string) =>
        Effect.gen(function* () {
          yield* checkError(path);
          yield* ensureParentExists(path);
          const normalized = normalizePath(path);
          const now = new Date();

          yield* Ref.update(stateRef, (state) => {
            const existing = state.files.get(normalized);
            state.files.set(normalized, {
              content,
              createdAt: existing?.createdAt ?? now,
              updatedAt: now,
              permissions: existing?.permissions ?? 0o644,
            });
            return state;
          });
        }),

      appendFile: (path: string, content: string) =>
        Effect.gen(function* () {
          yield* checkError(path);
          const normalized = normalizePath(path);
          const state = yield* Ref.get(stateRef);
          const existing = state.files.get(normalized);
          const newContent = (existing?.content ?? "") + content;

          yield* Ref.update(stateRef, (s) => {
            s.files.set(normalized, {
              content: newContent,
              createdAt: existing?.createdAt ?? new Date(),
              updatedAt: new Date(),
              permissions: existing?.permissions ?? 0o644,
            });
            return s;
          });
        }),

      deleteFile: (path: string) =>
        Effect.gen(function* () {
          yield* checkError(path);
          const normalized = normalizePath(path);
          const state = yield* Ref.get(stateRef);

          if (!state.files.has(normalized)) {
            return yield* Effect.fail(
              new MockFsError("ENOENT", `File not found: ${path}`, path)
            );
          }
          if (state.directories.has(normalized)) {
            return yield* Effect.fail(
              new MockFsError("EISDIR", `Is a directory: ${path}`, path)
            );
          }

          yield* Ref.update(stateRef, (s) => {
            s.files.delete(normalized);
            return s;
          });
        }),

      exists: (path: string) =>
        Effect.gen(function* () {
          const normalized = normalizePath(path);
          const state = yield* Ref.get(stateRef);
          return state.files.has(normalized) || state.directories.has(normalized);
        }),

      stat: (path: string) =>
        Effect.gen(function* () {
          yield* checkError(path);
          const normalized = normalizePath(path);
          const state = yield* Ref.get(stateRef);
          const file = state.files.get(normalized);

          if (!file) {
            return yield* Effect.fail(
              new MockFsError("ENOENT", `File not found: ${path}`, path)
            );
          }
          return file;
        }),

      mkdir: (path: string, options?: { recursive?: boolean }) =>
        Effect.gen(function* () {
          yield* checkError(path);
          const normalized = normalizePath(path);
          const state = yield* Ref.get(stateRef);

          if (state.directories.has(normalized)) {
            return yield* Effect.fail(
              new MockFsError("EEXIST", `Directory already exists: ${path}`, path)
            );
          }

          if (!options?.recursive) {
            yield* ensureParentExists(path);
          }

          yield* Ref.update(stateRef, (s) => {
            // If recursive, create all parent directories
            if (options?.recursive) {
              const parts = normalized.split("/").filter(Boolean);
              let current = "";
              for (const part of parts) {
                current = current + "/" + part;
                s.directories.add(current);
              }
            } else {
              s.directories.add(normalized);
            }
            return s;
          });
        }),

      rmdir: (path: string) =>
        Effect.gen(function* () {
          yield* checkError(path);
          const normalized = normalizePath(path);
          const state = yield* Ref.get(stateRef);

          if (!state.directories.has(normalized)) {
            return yield* Effect.fail(
              new MockFsError("ENOENT", `Directory not found: ${path}`, path)
            );
          }

          // Check if directory is empty
          for (const filePath of state.files.keys()) {
            if (filePath.startsWith(normalized + "/")) {
              return yield* Effect.fail(
                new MockFsError("ENOTEMPTY", `Directory not empty: ${path}`, path)
              );
            }
          }

          yield* Ref.update(stateRef, (s) => {
            s.directories.delete(normalized);
            return s;
          });
        }),

      readdir: (path: string) =>
        Effect.gen(function* () {
          yield* checkError(path);
          const normalized = normalizePath(path);
          const state = yield* Ref.get(stateRef);

          if (!state.directories.has(normalized) && normalized !== ".") {
            return yield* Effect.fail(
              new MockFsError("ENOENT", `Directory not found: ${path}`, path)
            );
          }

          const prefix = normalized === "/" || normalized === "." ? "" : normalized + "/";
          const entries = new Set<string>();

          // Add files in this directory
          for (const filePath of state.files.keys()) {
            if (filePath.startsWith(prefix)) {
              const relative = filePath.slice(prefix.length);
              const firstPart = relative.split("/")[0];
              if (firstPart) entries.add(firstPart);
            }
          }

          // Add subdirectories
          for (const dirPath of state.directories) {
            if (dirPath.startsWith(prefix) && dirPath !== normalized) {
              const relative = dirPath.slice(prefix.length);
              const firstPart = relative.split("/")[0];
              if (firstPart) entries.add(firstPart);
            }
          }

          return Array.from(entries).sort();
        }),

      // Test helpers
      setFile: (path: string, content: string) =>
        Effect.gen(function* () {
          const normalized = normalizePath(path);
          const now = new Date();

          // Ensure parent directories exist
          const parts = normalized.split("/").filter(Boolean);
          let current = "";
          for (let i = 0; i < parts.length - 1; i++) {
            current = current + "/" + parts[i];
            yield* Ref.update(stateRef, (s) => {
              s.directories.add(current);
              return s;
            });
          }

          yield* Ref.update(stateRef, (state) => {
            state.files.set(normalized, {
              content,
              createdAt: now,
              updatedAt: now,
              permissions: 0o644,
            });
            return state;
          });
        }),

      setError: (path: string, error: Error) =>
        Ref.update(stateRef, (state) => {
          state.errors.set(normalizePath(path), error);
          return state;
        }),

      clearError: (path: string) =>
        Ref.update(stateRef, (state) => {
          state.errors.delete(normalizePath(path));
          return state;
        }),

      clear: () =>
        Ref.set(stateRef, {
          files: new Map(),
          directories: new Set(["/", "."]),
          errors: new Map(),
        }),

      getState: () => Ref.get(stateRef),

      listFiles: () =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef);
          return Array.from(state.files.keys()).sort();
        }),
    };
  });
};

/**
 * Context tag for MockFsService
 */
export class MockFs extends Effect.Tag("MockFs")<MockFs, MockFsService>() {}

/**
 * Live layer that creates a fresh mock filesystem
 */
export const MockFsLive: Layer.Layer<MockFs> = Layer.effect(
  MockFs,
  createMockFs()
);

/**
 * Create a mock filesystem layer pre-populated with files
 */
export const mockFsWithFiles = (
  files: Record<string, string>
): Layer.Layer<MockFs> => {
  return Layer.effect(
    MockFs,
    Effect.gen(function* () {
      const fs = yield* createMockFs();
      for (const [path, content] of Object.entries(files)) {
        yield* fs.setFile(path, content);
      }
      return fs;
    })
  );
};
