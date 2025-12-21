/**
 * Skill Cache Service
 *
 * Manages skill cache in ~/.skills/cache/ including fetching from GitHub,
 * validating manifests, and maintaining a quick-lookup index.
 */

import { Context, Effect, Layer } from "effect";
import { join } from "path";
import { homedir } from "os";
import * as yaml from "js-yaml";
import {
  type SkillManifest,
  type SkillInfo,
  type PluginInfo,
  type RepoType,
  type InferredManifest,
} from "../../models/skill";
import {
  SkillNotCachedError,
  SkillSourceError,
  SkillMdFrontmatterError,
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
 * Note: Migrated from ~/.skills/cache to ~/.grimoire/cache
 */
const getCacheDir = (): string => {
  return join(homedir(), ".grimoire", "cache");
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
 * Directories and files to exclude when copying skill directories
 */
const EXCLUDED_PATHS = [".git", "node_modules", ".DS_Store", ".gitignore", "skill.yaml"];

/**
 * Check if a path should be excluded from copying
 */
const shouldExcludePath = (name: string): boolean => {
  return EXCLUDED_PATHS.includes(name) || name.startsWith(".");
};

/**
 * Parse YAML frontmatter from SKILL.md content
 *
 * Expected format:
 * ---
 * name: skill-name
 * description: When to use this skill...
 * allowed-tools: Read, Write, Bash
 * ---
 */
const parseSkillMdFrontmatter = (
  content: string,
  fallbackName: string
): Effect.Effect<InferredManifest, SkillMdFrontmatterError> =>
  Effect.gen(function* () {
    // Check for frontmatter markers
    if (!content.startsWith("---")) {
      return yield* Effect.fail(
        new SkillMdFrontmatterError({
          path: fallbackName,
          message: "SKILL.md must start with YAML frontmatter (---)",
        })
      );
    }

    // Find closing frontmatter marker
    const endMarkerIndex = content.indexOf("---", 3);
    if (endMarkerIndex === -1) {
      return yield* Effect.fail(
        new SkillMdFrontmatterError({
          path: fallbackName,
          message: "SKILL.md frontmatter is not properly closed (missing ---)",
        })
      );
    }

    // Extract frontmatter content
    const frontmatterContent = content.slice(3, endMarkerIndex).trim();

    try {
      const parsed = yaml.load(frontmatterContent) as Record<string, unknown>;

      if (!parsed || typeof parsed !== "object") {
        return yield* Effect.fail(
          new SkillMdFrontmatterError({
            path: fallbackName,
            message: "SKILL.md frontmatter is empty or invalid YAML",
          })
        );
      }

      // Extract name (required, or use fallback)
      const name = typeof parsed.name === "string" ? parsed.name : fallbackName;

      // Extract description (required for discovery)
      const description = typeof parsed.description === "string"
        ? parsed.description
        : "";

      if (!description) {
        return yield* Effect.fail(
          new SkillMdFrontmatterError({
            path: fallbackName,
            message: "SKILL.md frontmatter must have a 'description' field for skill discovery",
          })
        );
      }

      // Extract allowed-tools (optional, can be comma-separated string or array)
      let allowedTools: string[] | undefined;
      if (parsed["allowed-tools"]) {
        if (typeof parsed["allowed-tools"] === "string") {
          allowedTools = parsed["allowed-tools"].split(",").map((t) => t.trim());
        } else if (Array.isArray(parsed["allowed-tools"])) {
          allowedTools = parsed["allowed-tools"].map(String);
        }
      }

      return {
        name,
        description,
        allowed_tools: allowedTools,
      };
    } catch (error) {
      return yield* Effect.fail(
        new SkillMdFrontmatterError({
          path: fallbackName,
          message: `Failed to parse SKILL.md frontmatter: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
  });

/**
 * Convert InferredManifest to full SkillManifest
 */
const inferredToManifest = (inferred: InferredManifest): SkillManifest => ({
  name: inferred.name,
  description: inferred.description,
  allowed_tools: inferred.allowed_tools,
});

/**
 * Detect repository type by checking for skill/plugin markers
 */
const detectRepoTypeFromGitHub = (
  source: GitHubSource
): Effect.Effect<RepoType, SkillSourceError> =>
  Effect.gen(function* () {
    const { owner, repo, ref = "main", subdir } = source;
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
    const path = subdir ? `/${subdir}` : "";

    // Fetch directory listing
    const listUrl = `${baseUrl}${path}?ref=${ref}`;
    const response = yield* Effect.tryPromise({
      try: () => fetch(listUrl),
      catch: (error) =>
        new SkillSourceError({
          source: `github:${owner}/${repo}`,
          message: `Failed to fetch directory listing: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        new SkillSourceError({
          source: `github:${owner}/${repo}`,
          message: `GitHub API error: ${response.status} ${response.statusText}`,
        })
      );
    }

    const contents = (yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) =>
        new SkillSourceError({
          source: `github:${owner}/${repo}`,
          message: `Failed to parse directory listing: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    })) as Array<{ name: string; type: string }>;

    // Check for root-level markers
    // Skills are defined by SKILL.md only (no more skill.yaml)
    const hasSkillMd = contents.some((f) => f.name === "SKILL.md");
    const hasPluginDir = contents.some(
      (f) => f.name === ".claude-plugin" && f.type === "dir"
    );

    // If root has SKILL.md, it's a single skill
    if (hasSkillMd) {
      return {
        type: "skill" as const,
        skill: {
          name: subdir || repo,
          description: "",
          path: subdir || "",
        },
      };
    }

    // If root has plugin markers, it's a plugin
    if (hasPluginDir) {
      return {
        type: "plugin" as const,
        plugin: {
          name: subdir || repo,
          path: subdir || "",
        },
      };
    }

    // Check subdirectories for skills/plugins (collection)
    const subdirs = contents.filter((f) => f.type === "dir" && !f.name.startsWith("."));
    const skills: SkillInfo[] = [];
    const plugins: PluginInfo[] = [];

    for (const dir of subdirs) {
      const subdirUrl = `${baseUrl}${path}/${dir.name}?ref=${ref}`;
      const subdirResponse = yield* Effect.tryPromise({
        try: () => fetch(subdirUrl),
        catch: () =>
          new SkillSourceError({
            source: `github:${owner}/${repo}`,
            message: `Failed to fetch subdirectory: ${dir.name}`,
          }),
      }).pipe(Effect.orElse(() => Effect.succeed(null)));

      if (!subdirResponse || !subdirResponse.ok) continue;

      const subdirContents = (yield* Effect.tryPromise({
        try: () => subdirResponse.json(),
        catch: () =>
          new SkillSourceError({
            source: `github:${owner}/${repo}`,
            message: `Failed to parse subdirectory: ${dir.name}`,
          }),
      }).pipe(
        Effect.orElse(() => Effect.succeed([] as Array<{ name: string; type: string }>))
      )) as Array<{ name: string; type: string }>;

      const subdirHasSkillMd = subdirContents.some((f) => f.name === "SKILL.md");
      const subdirHasPlugin = subdirContents.some(
        (f) => f.name === ".claude-plugin" && f.type === "dir"
      );

      if (subdirHasSkillMd) {
        skills.push({
          name: dir.name,
          description: "",
          path: dir.name,
        });
      } else if (subdirHasPlugin) {
        plugins.push({
          name: dir.name,
          path: dir.name,
        });
      }
    }

    if (skills.length > 0 || plugins.length > 0) {
      return {
        type: "collection" as const,
        skills,
        plugins,
      };
    }

    return { type: "empty" as const };
  });

/**
 * Fetch skill description from SKILL.md frontmatter (for collection display)
 */
const fetchSkillDescription = (
  source: GitHubSource,
  skillPath: string
): Effect.Effect<string, never> =>
  Effect.gen(function* () {
    const { owner, repo, ref = "main" } = source;
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
    const skillMdUrl = `${baseUrl}/${skillPath}/SKILL.md?ref=${ref}`;

    const response = yield* Effect.tryPromise({
      try: () => fetch(skillMdUrl),
      catch: () => Effect.succeed(null),
    }).pipe(Effect.orElse(() => Effect.succeed(null)));

    if (!response || !response.ok) return "";

    const data = (yield* Effect.tryPromise({
      try: () => response.json(),
      catch: () => Effect.succeed(null),
    }).pipe(Effect.orElse(() => Effect.succeed(null)))) as { content: string } | null;

    if (!data || !data.content) return "";

    try {
      const content = atob(data.content);
      const frontmatterResult = yield* parseSkillMdFrontmatter(content, skillPath).pipe(
        Effect.either
      );
      if (frontmatterResult._tag === "Right") {
        return frontmatterResult.right.description;
      }
    } catch {
      // Ignore parse errors
    }

    return "";
  });

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
 * GitHub file entry from API response
 */
interface GitHubFileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url?: string;
  sha?: string;
}

/**
 * Recursively fetch all files from a GitHub directory
 * Returns a map of relative paths to file contents
 */
const fetchGitHubDirectoryRecursive = (
  owner: string,
  repo: string,
  ref: string,
  dirPath: string,
  baseUrl: string
): Effect.Effect<Map<string, string>, SkillSourceError> =>
  Effect.gen(function* () {
    const files = new Map<string, string>();
    const sourceStr = `github:${owner}/${repo}`;

    // Fetch directory listing
    const listUrl = `${baseUrl}/${dirPath}?ref=${ref}`;
    const response = yield* Effect.tryPromise({
      try: () => fetch(listUrl),
      catch: (error) =>
        new SkillSourceError({
          source: sourceStr,
          message: `Failed to fetch directory listing: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Directory doesn't exist, return empty
        return files;
      }
      return yield* Effect.fail(
        new SkillSourceError({
          source: sourceStr,
          message: `GitHub API error: ${response.status} ${response.statusText}`,
        })
      );
    }

    const contents = (yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) =>
        new SkillSourceError({
          source: sourceStr,
          message: `Failed to parse directory listing: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    })) as GitHubFileEntry[];

    // Process each entry
    for (const entry of contents) {
      // Skip excluded paths
      if (shouldExcludePath(entry.name)) {
        continue;
      }

      if (entry.type === "file" && entry.download_url) {
        // Fetch file content
        const fileResponse = yield* Effect.tryPromise({
          try: () => fetch(entry.download_url!),
          catch: (error) =>
            new SkillSourceError({
              source: sourceStr,
              message: `Failed to fetch file: ${entry.path}`,
              cause: error,
            }),
        });

        if (fileResponse.ok) {
          const content = yield* Effect.tryPromise({
            try: () => fileResponse.text(),
            catch: (error) =>
              new SkillSourceError({
                source: sourceStr,
                message: `Failed to read file content: ${entry.path}`,
                cause: error,
              }),
          });

          // Calculate relative path from the skill root
          const relativePath = dirPath ? entry.path.slice(dirPath.length + 1) : entry.name;
          files.set(relativePath, content);
        }
      } else if (entry.type === "dir") {
        // Recursively fetch subdirectory
        const subFiles = yield* fetchGitHubDirectoryRecursive(
          owner,
          repo,
          ref,
          entry.path,
          baseUrl
        );

        // Merge subdirectory files with appropriate path prefix
        const subDirName = entry.name;
        for (const [subPath, content] of subFiles) {
          files.set(`${subDirName}/${subPath}`, content);
        }
      }
    }

    return files;
  });

/**
 * Fetch skill from GitHub using API
 * Skills are defined by SKILL.md with frontmatter only (no skill.yaml)
 * Recursively fetches ALL files in the skill directory
 */
const fetchFromGitHubAPI = (
  source: GitHubSource
): Effect.Effect<CachedSkill, SkillSourceError> =>
  Effect.gen(function* () {
    const { owner, repo, ref = "main", subdir } = source;
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
    const dirPath = subdir || "";
    const sourceStr = `github:${owner}/${repo}${ref !== "main" ? `@${ref}` : ""}${subdir ? `#${subdir}` : ""}`;
    const fallbackName = subdir || repo;

    // Recursively fetch all files from the skill directory
    const allFiles = yield* fetchGitHubDirectoryRecursive(
      owner,
      repo,
      ref,
      dirPath,
      baseUrl
    );

    // Check for required SKILL.md
    const skillMdContent = allFiles.get("SKILL.md");

    if (!skillMdContent) {
      return yield* Effect.fail(
        new SkillSourceError({
          source: sourceStr,
          message: `No SKILL.md found in repository. Skills must have a SKILL.md with frontmatter.`,
        })
      );
    }

    // Parse manifest from SKILL.md frontmatter
    const inferred = yield* parseSkillMdFrontmatter(skillMdContent, fallbackName).pipe(
      Effect.mapError(
        (error) =>
          new SkillSourceError({
            source: sourceStr,
            message: error.message,
          })
      )
    );
    const manifest = inferredToManifest(inferred);

    // Create skill cache directory
    const skillCacheDir = getSkillCacheDir(manifest.name);
    yield* Effect.promise(() =>
      import("fs/promises").then((fs) => fs.mkdir(skillCacheDir, { recursive: true }))
    );

    // Write ALL files to cache (excluding skill.yaml if present - we don't use it)
    const fs = yield* Effect.promise(() => import("fs/promises"));
    for (const [relativePath, content] of allFiles) {
      // Skip skill.yaml - we don't use it anymore
      if (relativePath === "skill.yaml") continue;

      const destPath = join(skillCacheDir, relativePath);
      const destDir = join(skillCacheDir, relativePath.split("/").slice(0, -1).join("/"));

      // Ensure directory exists for nested files
      if (destDir !== skillCacheDir) {
        yield* Effect.promise(() => fs.mkdir(destDir, { recursive: true }));
      }

      yield* Effect.promise(() => Bun.write(destPath, content));
    }

    // Write .meta.json
    const meta: CacheMeta = {
      source: sourceStr,
      cachedAt: new Date().toISOString(),
      version: "1.0.0", // Version is no longer in manifest
    };
    const metaPath = join(skillCacheDir, ".meta.json");
    yield* Effect.promise(() => Bun.write(metaPath, JSON.stringify(meta, null, 2)));

    // Determine paths for optional files
    const skillMdPath = join(skillCacheDir, "SKILL.md");
    const readmePath = allFiles.has("README.md") ? join(skillCacheDir, "README.md") : undefined;

    return {
      manifest,
      skillMdPath,
      readmePath,
      cachedAt: new Date(),
      source: sourceStr,
    };
  });

/**
 * Recursively copy a local directory, excluding certain paths
 */
const copyDirectoryRecursive = (
  srcDir: string,
  destDir: string
): Effect.Effect<void, SkillSourceError> =>
  Effect.gen(function* () {
    const fs = yield* Effect.promise(() => import("fs/promises"));

    // Create destination directory
    yield* Effect.tryPromise({
      try: () => fs.mkdir(destDir, { recursive: true }),
      catch: (error) =>
        new SkillSourceError({
          source: srcDir,
          message: `Failed to create directory: ${destDir}`,
          cause: error,
        }),
    });

    // Read source directory entries
    const entries = yield* Effect.tryPromise({
      try: () => fs.readdir(srcDir, { withFileTypes: true }),
      catch: (error) =>
        new SkillSourceError({
          source: srcDir,
          message: `Failed to read directory: ${srcDir}`,
          cause: error,
        }),
    });

    // Copy each entry
    for (const entry of entries) {
      // Skip excluded paths
      if (shouldExcludePath(entry.name)) {
        continue;
      }

      const srcPath = join(srcDir, entry.name);
      const destPath = join(destDir, entry.name);

      if (entry.isDirectory()) {
        // Recursively copy subdirectory
        yield* copyDirectoryRecursive(srcPath, destPath);
      } else if (entry.isFile()) {
        // Copy file
        yield* Effect.tryPromise({
          try: () => fs.copyFile(srcPath, destPath),
          catch: (error) =>
            new SkillSourceError({
              source: srcDir,
              message: `Failed to copy file: ${srcPath}`,
              cause: error,
            }),
        });
      }
    }
  });

/**
 * Fetch skill from local path
 * Skills are defined by SKILL.md with frontmatter only (no skill.yaml)
 * Recursively copies ALL files in the skill directory
 */
const fetchFromLocalPath = (sourcePath: string): Effect.Effect<CachedSkill, SkillSourceError> =>
  Effect.gen(function* () {
    const skillMdPath = join(sourcePath, "SKILL.md");
    const fallbackName = sourcePath.split("/").pop() || "unknown";

    // Check for required SKILL.md
    const skillMdFile = Bun.file(skillMdPath);
    const hasSkillMd = yield* Effect.promise(() => skillMdFile.exists());

    if (!hasSkillMd) {
      return yield* Effect.fail(
        new SkillSourceError({
          source: sourcePath,
          message: `No SKILL.md found in directory. Skills must have a SKILL.md with frontmatter.`,
        })
      );
    }

    // Parse manifest from SKILL.md frontmatter
    const content = yield* Effect.promise(() => skillMdFile.text());
    const inferred = yield* parseSkillMdFrontmatter(content, fallbackName).pipe(
      Effect.mapError(
        (error) =>
          new SkillSourceError({
            source: sourcePath,
            message: error.message,
          })
      )
    );
    const manifest = inferredToManifest(inferred);

    // Create skill cache directory
    const skillCacheDir = getSkillCacheDir(manifest.name);

    // Recursively copy entire directory (copyDirectoryRecursive already excludes skill.yaml via shouldExcludePath)
    yield* copyDirectoryRecursive(sourcePath, skillCacheDir);

    // Write .meta.json
    const meta: CacheMeta = {
      source: sourcePath,
      cachedAt: new Date().toISOString(),
      version: "1.0.0", // Version is no longer in manifest
    };
    const metaPath = join(skillCacheDir, ".meta.json");
    yield* Effect.promise(() => Bun.write(metaPath, JSON.stringify(meta, null, 2)));

    // Check for optional files in destination
    const destSkillMdPath = join(skillCacheDir, "SKILL.md");
    const destReadmePath = join(skillCacheDir, "README.md");
    const destSkillMdFile = Bun.file(destSkillMdPath);
    const destReadmeFile = Bun.file(destReadmePath);

    return {
      manifest,
      skillMdPath: (yield* Effect.promise(() => destSkillMdFile.exists())) ? destSkillMdPath : undefined,
      readmePath: (yield* Effect.promise(() => destReadmeFile.exists())) ? destReadmePath : undefined,
      cachedAt: new Date(),
      source: sourcePath,
    };
  });

/**
 * Read cached skill
 */
const readCachedSkill = (name: string): Effect.Effect<CachedSkill, SkillNotCachedError> =>
  Effect.gen(function* () {
    const skillCacheDir = getSkillCacheDir(name);
    const skillMdPath = join(skillCacheDir, "SKILL.md");
    const metaPath = join(skillCacheDir, ".meta.json");

    // Check if SKILL.md exists
    const skillMdFile = Bun.file(skillMdPath);
    const exists = yield* Effect.promise(() => skillMdFile.exists());

    if (!exists) {
      return yield* Effect.fail(new SkillNotCachedError({ name }));
    }

    // Read and parse manifest from SKILL.md frontmatter
    const content = yield* Effect.promise(() => skillMdFile.text());
    const inferred = yield* parseSkillMdFrontmatter(content, name).pipe(
      Effect.mapError(() => new SkillNotCachedError({ name }))
    );
    const manifest = inferredToManifest(inferred);

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

    // Check for optional README file
    const readmePath = join(skillCacheDir, "README.md");
    const readmeFile = Bun.file(readmePath);
    const readmeExists = yield* Effect.promise(() => readmeFile.exists());

    return {
      manifest,
      skillMdPath, // Already confirmed to exist
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
    const skillMdPath = join(skillCacheDir, "SKILL.md");
    const file = Bun.file(skillMdPath);
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
        version: "1.0.0", // Version is no longer in manifest
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

  // Type detection
  readonly detectRepoType: (source: GitHubSource) => Effect.Effect<RepoType, SkillSourceError>;

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

  detectRepoType: (source: GitHubSource) => detectRepoTypeFromGitHub(source),

  remove: (name: string) => removeCachedSkill(name),

  clear: () => clearCache(),

  updateIndex: () => updateCacheIndex(),
});

// Live layer
export const SkillCacheServiceLive = Layer.succeed(
  SkillCacheService,
  makeSkillCacheService()
);
