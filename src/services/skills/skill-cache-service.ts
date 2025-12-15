/**
 * Skill Cache Service
 *
 * Manages skill cache in ~/.skills/cache/ including fetching from GitHub,
 * validating manifests, and maintaining a quick-lookup index.
 */

import { Context, Effect, Layer, Data } from "effect";
import { Schema } from "@effect/schema";
import { join } from "path";
import { homedir } from "os";
import * as yaml from "js-yaml";
import {
  SkillManifest,
  SkillManifestSchema,
} from "../../models/skill";
import {
  SkillNotCachedError,
  SkillSourceError,
  SkillManifestError,
} from "../../models/skill-errors";

/**
 * GitHub source specification
 */
export interface GitHubSource {
  owner: string;
  repo: string;
  ref?: string; // branch/tag
  subdir?: string; // subdirectory
}

/**
 * Cached skill metadata
 */
export interface CachedSkill {
  manifest: SkillManifest;
  skillMdPath?: string;
  readmePath?: string;
  cachedAt: Date;
  source: string;
}

/**
 * Cache metadata stored in .meta.json
 */
interface CacheMeta {
  source: string;
  cachedAt: string;
  version: string;
}

/**
 * Cache index for quick lookups
 */
interface CacheIndex {
  skills: Record<
    string,
    {
      version: string;
      source: string;
      cachedAt: string;
    }
  >;
  updatedAt: string;
}

/**
 * Get the cache directory path
 */
const getCacheDir = (): string => {
  return join(homedir(), ".skills", "cache");
};

/**
 * Get the cache index file path
 */
const getIndexPath = (): string => {
  return join(getCacheDir(), ".index.json");
};

/**
 * Get the skill cache directory path
 */
const getSkillCacheDir = (name: string): string => {
  return join(getCacheDir(), name);
};

/**
 * Parse GitHub source string
 * Format: github:owner/repo[@ref][#subdir]
 */
const parseGitHubSource = (source: string): Effect.Effect<GitHubSource, SkillSourceError> =>
  Effect.gen(function* () {
    if (!source.startsWith("github:")) {
      return yield* Effect.fail(
        new SkillSourceError({
          source,
          message: "Source must start with 'github:'",
        })
      );
    }

    const withoutPrefix = source.slice(7); // Remove 'github:'

    // Split by @ for ref
    const [repoPath, refAndSubdir] = withoutPrefix.split("@");

    // Split repo path by /
    const [owner, repo] = repoPath.split("/");

    if (!owner || !repo) {
      return yield* Effect.fail(
        new SkillSourceError({
          source,
          message: "Invalid GitHub source format. Expected: github:owner/repo[@ref][#subdir]",
        })
      );
    }

    let ref: string | undefined;
    let subdir: string | undefined;

    if (refAndSubdir) {
      const [refPart, subdirPart] = refAndSubdir.split("#");
      ref = refPart || undefined;
      subdir = subdirPart || undefined;
    }

    return { owner, repo, ref, subdir };
  });

/**
 * Ensure cache directory exists
 */
const ensureCacheDir = (): Effect.Effect<void, SkillSourceError> =>
  Effect.gen(function* () {
    const cacheDir = getCacheDir();
    try {
      yield* Effect.promise(() =>
        import("fs/promises").then((fs) => fs.mkdir(cacheDir, { recursive: true }))
      );
    } catch (error) {
      return yield* Effect.fail(
        new SkillSourceError({
          source: cacheDir,
          message: `Failed to create cache directory: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        })
      );
    }
  });

/**
 * Read cache index
 */
const readCacheIndex = (): Effect.Effect<CacheIndex, never> =>
  Effect.gen(function* () {
    const indexPath = getIndexPath();
    const file = Bun.file(indexPath);

    const exists = yield* Effect.promise(() => file.exists());
    if (!exists) {
      return { skills: {}, updatedAt: new Date().toISOString() };
    }

    try {
      const content = yield* Effect.promise(() => file.text());
      return JSON.parse(content) as CacheIndex;
    } catch {
      // Return empty index on parse error
      return { skills: {}, updatedAt: new Date().toISOString() };
    }
  });

/**
 * Write cache index
 */
const writeCacheIndex = (index: CacheIndex): Effect.Effect<void, SkillSourceError> =>
  Effect.gen(function* () {
    const indexPath = getIndexPath();

    try {
      yield* ensureCacheDir();
      yield* Effect.promise(() =>
        Bun.write(indexPath, JSON.stringify(index, null, 2))
      );
    } catch (error) {
      return yield* Effect.fail(
        new SkillSourceError({
          source: indexPath,
          message: `Failed to write cache index: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        })
      );
    }
  });

/**
 * Validate skill manifest from path
 */
const validateManifestAtPath = (
  path: string
): Effect.Effect<SkillManifest, SkillManifestError> =>
  Effect.gen(function* () {
    try {
      const file = Bun.file(path);
      const exists = yield* Effect.promise(() => file.exists());

      if (!exists) {
        return yield* Effect.fail(
          new SkillManifestError({
            name: path,
            message: "Manifest file not found",
            path,
          })
        );
      }

      const content = yield* Effect.promise(() => file.text());
      const parsed = yaml.load(content);

      // Validate against schema
      const decoded = Schema.decodeUnknownSync(SkillManifestSchema);
      const manifest = yield* Effect.try({
        try: () => decoded(parsed),
        catch: (error) =>
          new SkillManifestError({
            name: path,
            message: `Invalid manifest schema: ${error instanceof Error ? error.message : String(error)}`,
            path,
          }),
      });

      return manifest;
    } catch (error) {
      return yield* Effect.fail(
        new SkillManifestError({
          name: path,
          message: `Failed to read manifest: ${error instanceof Error ? error.message : String(error)}`,
          path,
        })
      );
    }
  });

/**
 * Fetch skill from GitHub using API
 */
const fetchFromGitHubAPI = (
  source: GitHubSource
): Effect.Effect<CachedSkill, SkillSourceError> =>
  Effect.gen(function* () {
    const { owner, repo, ref = "main", subdir } = source;
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
    const path = subdir ? `/${subdir}` : "";
    const manifestUrl = `${baseUrl}${path}/skill.yaml?ref=${ref}`;

    try {
      // Fetch manifest
      const manifestResponse = yield* Effect.tryPromise({
        try: () => fetch(manifestUrl),
        catch: (error) =>
          new SkillSourceError({
            source: `github:${owner}/${repo}`,
            message: `Failed to fetch from GitHub: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

      if (!manifestResponse.ok) {
        return yield* Effect.fail(
          new SkillSourceError({
            source: `github:${owner}/${repo}`,
            message: `GitHub API error: ${manifestResponse.status} ${manifestResponse.statusText}`,
          })
        );
      }

      const manifestDataRaw = yield* Effect.tryPromise({
        try: () => manifestResponse.json(),
        catch: (error) =>
          new SkillSourceError({
            source: `github:${owner}/${repo}`,
            message: `Failed to parse GitHub response: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

      const manifestData = manifestDataRaw as { content: string };

      // Decode base64 content
      const manifestContent = atob(manifestData.content);
      const parsed = yaml.load(manifestContent);

      // Validate manifest
      const decoded = Schema.decodeUnknownSync(SkillManifestSchema);
      const manifest = yield* Effect.try({
        try: () => decoded(parsed),
        catch: (error) =>
          new SkillSourceError({
            source: `github:${owner}/${repo}`,
            message: `Invalid manifest: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

      // Create skill cache directory
      const skillCacheDir = getSkillCacheDir(manifest.name);
      yield* Effect.promise(() =>
        import("fs/promises").then((fs) => fs.mkdir(skillCacheDir, { recursive: true }))
      );

      // Write manifest
      const manifestPath = join(skillCacheDir, "skill.yaml");
      yield* Effect.promise(() => Bun.write(manifestPath, manifestContent));

      // Try to fetch SKILL.md
      let skillMdPath: string | undefined;
      const skillMdUrl = `${baseUrl}${path}/SKILL.md?ref=${ref}`;
      const skillMdResult = yield* Effect.gen(function* () {
        const skillMdResponse = yield* Effect.promise(() => fetch(skillMdUrl));
        if (skillMdResponse.ok) {
          const skillMdData = (yield* Effect.promise(() =>
            skillMdResponse.json()
          )) as { content: string };
          const skillMdContent = atob(skillMdData.content);
          const path = join(skillCacheDir, "SKILL.md");
          yield* Effect.promise(() => Bun.write(path, skillMdContent));
          return path;
        }
        return undefined;
      }).pipe(Effect.orElse(() => Effect.succeed(undefined)));
      skillMdPath = skillMdResult;

      // Try to fetch README.md
      let readmePath: string | undefined;
      const readmeUrl = `${baseUrl}${path}/README.md?ref=${ref}`;
      const readmeResult = yield* Effect.gen(function* () {
        const readmeResponse = yield* Effect.promise(() => fetch(readmeUrl));
        if (readmeResponse.ok) {
          const readmeData = (yield* Effect.promise(() =>
            readmeResponse.json()
          )) as { content: string };
          const readmeContent = atob(readmeData.content);
          const path = join(skillCacheDir, "README.md");
          yield* Effect.promise(() => Bun.write(path, readmeContent));
          return path;
        }
        return undefined;
      }).pipe(Effect.orElse(() => Effect.succeed(undefined)));
      readmePath = readmeResult;

      // Write .meta.json
      const sourceStr = `github:${owner}/${repo}${ref ? `@${ref}` : ""}${subdir ? `#${subdir}` : ""}`;
      const meta: CacheMeta = {
        source: sourceStr,
        cachedAt: new Date().toISOString(),
        version: manifest.version,
      };
      const metaPath = join(skillCacheDir, ".meta.json");
      yield* Effect.promise(() => Bun.write(metaPath, JSON.stringify(meta, null, 2)));

      return {
        manifest,
        skillMdPath,
        readmePath,
        cachedAt: new Date(),
        source: sourceStr,
      };
    } catch (error) {
      return yield* Effect.fail(
        new SkillSourceError({
          source: `github:${owner}/${repo}`,
          message: `Failed to fetch from GitHub: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        })
      );
    }
  });

/**
 * Fetch skill from local path
 */
const fetchFromLocalPath = (path: string): Effect.Effect<CachedSkill, SkillSourceError> =>
  Effect.gen(function* () {
    const manifestPath = join(path, "skill.yaml");

    // Validate manifest
    const manifest = yield* validateManifestAtPath(manifestPath).pipe(
      Effect.mapError(
        (error) =>
          new SkillSourceError({
            source: path,
            message: error.message,
            cause: error,
          })
      )
    );

    // Create skill cache directory
    const skillCacheDir = getSkillCacheDir(manifest.name);
    yield* Effect.tryPromise({
      try: () =>
        import("fs/promises").then((fs) => fs.mkdir(skillCacheDir, { recursive: true })),
      catch: (error) =>
        new SkillSourceError({
          source: path,
          message: `Failed to create cache directory: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    // Copy manifest
    const destManifestPath = join(skillCacheDir, "skill.yaml");
    yield* Effect.tryPromise({
      try: async () => {
        const fs = await import("fs/promises");
        await fs.copyFile(manifestPath, destManifestPath);
      },
      catch: (error) =>
        new SkillSourceError({
          source: path,
          message: `Failed to copy manifest: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    // Copy SKILL.md if exists
    let skillMdPath: string | undefined;
    const srcSkillMdPath = join(path, "SKILL.md");
    const skillMdResult = yield* Effect.gen(function* () {
      const skillMdFile = Bun.file(srcSkillMdPath);
      const exists = yield* Effect.promise(() => skillMdFile.exists());
      if (exists) {
        const destPath = join(skillCacheDir, "SKILL.md");
        yield* Effect.promise(async () => {
          const fs = await import("fs/promises");
          await fs.copyFile(srcSkillMdPath, destPath);
        });
        return destPath;
      }
      return undefined;
    }).pipe(Effect.orElse(() => Effect.succeed(undefined)));
    skillMdPath = skillMdResult;

    // Copy README.md if exists
    let readmePath: string | undefined;
    const srcReadmePath = join(path, "README.md");
    const readmeResult = yield* Effect.gen(function* () {
      const readmeFile = Bun.file(srcReadmePath);
      const exists = yield* Effect.promise(() => readmeFile.exists());
      if (exists) {
        const destPath = join(skillCacheDir, "README.md");
        yield* Effect.promise(async () => {
          const fs = await import("fs/promises");
          await fs.copyFile(srcReadmePath, destPath);
        });
        return destPath;
      }
      return undefined;
    }).pipe(Effect.orElse(() => Effect.succeed(undefined)));
    readmePath = readmeResult;

    // Write .meta.json
    const meta: CacheMeta = {
      source: path,
      cachedAt: new Date().toISOString(),
      version: manifest.version,
    };
    const metaPath = join(skillCacheDir, ".meta.json");
    yield* Effect.promise(() => Bun.write(metaPath, JSON.stringify(meta, null, 2)));

    return {
      manifest,
      skillMdPath,
      readmePath,
      cachedAt: new Date(),
      source: path,
    };
  });

/**
 * Read cached skill
 */
const readCachedSkill = (name: string): Effect.Effect<CachedSkill, SkillNotCachedError> =>
  Effect.gen(function* () {
    const skillCacheDir = getSkillCacheDir(name);
    const manifestPath = join(skillCacheDir, "skill.yaml");
    const metaPath = join(skillCacheDir, ".meta.json");

    // Check if manifest exists
    const manifestFile = Bun.file(manifestPath);
    const exists = yield* Effect.promise(() => manifestFile.exists());

    if (!exists) {
      return yield* Effect.fail(new SkillNotCachedError({ name }));
    }

    // Read and validate manifest
    const manifest = yield* validateManifestAtPath(manifestPath).pipe(
      Effect.mapError(
        () => new SkillNotCachedError({ name })
      )
    );

    // Read meta
    const metaFile = Bun.file(metaPath);
    const metaExists = yield* Effect.promise(() => metaFile.exists());

    let source = "unknown";
    let cachedAt = new Date();

    if (metaExists) {
      try {
        const metaContent = yield* Effect.promise(() => metaFile.text());
        const meta = JSON.parse(metaContent) as CacheMeta;
        source = meta.source;
        cachedAt = new Date(meta.cachedAt);
      } catch {
        // Use defaults if meta is invalid
      }
    }

    // Check for optional files
    const skillMdPath = join(skillCacheDir, "SKILL.md");
    const readmePath = join(skillCacheDir, "README.md");

    const skillMdFile = Bun.file(skillMdPath);
    const readmeFile = Bun.file(readmePath);

    const skillMdExists = yield* Effect.promise(() => skillMdFile.exists());
    const readmeExists = yield* Effect.promise(() => readmeFile.exists());

    return {
      manifest,
      skillMdPath: skillMdExists ? skillMdPath : undefined,
      readmePath: readmeExists ? readmePath : undefined,
      cachedAt,
      source,
    };
  });

/**
 * List all cached skills
 */
const listCachedSkills = (): Effect.Effect<CachedSkill[]> =>
  Effect.gen(function* () {
    const cacheDir = getCacheDir();

    try {
      const fs = yield* Effect.promise(() => import("fs/promises"));
      const exists = yield* Effect.promise(async () => {
        try {
          await fs.access(cacheDir);
          return true;
        } catch {
          return false;
        }
      });

      if (!exists) {
        return [];
      }

      const entries = yield* Effect.promise(() => fs.readdir(cacheDir, { withFileTypes: true }));

      const skillNames = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name);

      const skills: CachedSkill[] = [];

      for (const name of skillNames) {
        const skillResult = yield* readCachedSkill(name).pipe(
          Effect.either
        );

        if (skillResult._tag === "Right") {
          skills.push(skillResult.right);
        }
      }

      return skills;
    } catch {
      return [];
    }
  });

/**
 * Check if a skill is cached
 */
const isSkillCached = (name: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const skillCacheDir = getSkillCacheDir(name);
    const manifestPath = join(skillCacheDir, "skill.yaml");
    const file = Bun.file(manifestPath);
    return yield* Effect.promise(() => file.exists());
  });

/**
 * Remove a cached skill
 */
const removeCachedSkill = (name: string): Effect.Effect<void, SkillNotCachedError> =>
  Effect.gen(function* () {
    const isCached = yield* isSkillCached(name);

    if (!isCached) {
      return yield* Effect.fail(new SkillNotCachedError({ name }));
    }

    const skillCacheDir = getSkillCacheDir(name);

    try {
      const fs = yield* Effect.promise(() => import("fs/promises"));
      yield* Effect.promise(() => fs.rm(skillCacheDir, { recursive: true, force: true }));
    } catch (error) {
      return yield* Effect.fail(new SkillNotCachedError({ name }));
    }
  });

/**
 * Clear all cached skills
 */
const clearCache = (): Effect.Effect<void, SkillSourceError> =>
  Effect.gen(function* () {
    const cacheDir = getCacheDir();

    const fs = yield* Effect.promise(() => import("fs/promises"));
    const exists = yield* Effect.promise(async () => {
      try {
        await fs.access(cacheDir);
        return true;
      } catch {
        return false;
      }
    });

    if (exists) {
      yield* Effect.promise(() => fs.rm(cacheDir, { recursive: true, force: true }));
    }

    // Recreate cache directory
    yield* ensureCacheDir();
  }).pipe(
    Effect.catchAll(() => Effect.void)
  );

/**
 * Update cache index
 */
const updateCacheIndex = (): Effect.Effect<void, SkillSourceError> =>
  Effect.gen(function* () {
    const skills = yield* listCachedSkills();

    const index: CacheIndex = {
      skills: {},
      updatedAt: new Date().toISOString(),
    };

    for (const skill of skills) {
      index.skills[skill.manifest.name] = {
        version: skill.manifest.version,
        source: skill.source,
        cachedAt: skill.cachedAt.toISOString(),
      };
    }

    yield* writeCacheIndex(index);
  });

// Service interface
interface SkillCacheServiceImpl {
  // Cache management
  readonly getCached: (name: string) => Effect.Effect<CachedSkill, SkillNotCachedError>;
  readonly listCached: () => Effect.Effect<CachedSkill[]>;
  readonly isCached: (name: string) => Effect.Effect<boolean>;

  // Fetching
  readonly fetchFromGitHub: (source: GitHubSource) => Effect.Effect<CachedSkill, SkillSourceError>;
  readonly fetchFromLocal: (path: string) => Effect.Effect<CachedSkill, SkillSourceError>;

  // Validation
  readonly validateManifest: (path: string) => Effect.Effect<SkillManifest, SkillManifestError>;

  // Cache operations
  readonly remove: (name: string) => Effect.Effect<void, SkillNotCachedError>;
  readonly clear: () => Effect.Effect<void, SkillSourceError>;

  // Index
  readonly updateIndex: () => Effect.Effect<void, SkillSourceError>;
}

// Service tag
export class SkillCacheService extends Context.Tag("SkillCacheService")<
  SkillCacheService,
  SkillCacheServiceImpl
>() {}

// Service implementation
const makeSkillCacheService = (): SkillCacheServiceImpl => ({
  getCached: (name: string) => readCachedSkill(name),

  listCached: () => listCachedSkills(),

  isCached: (name: string) => isSkillCached(name),

  fetchFromGitHub: (source: GitHubSource) => fetchFromGitHubAPI(source),

  fetchFromLocal: (path: string) => fetchFromLocalPath(path),

  validateManifest: (path: string) => validateManifestAtPath(path),

  remove: (name: string) => removeCachedSkill(name),

  clear: () => clearCache(),

  updateIndex: () => updateCacheIndex(),
});

// Live layer
export const SkillCacheServiceLive = Layer.succeed(
  SkillCacheService,
  makeSkillCacheService()
);
