/**
 * Marketplace Detection Service
 *
 * Detects plugins and skills in GitHub repositories.
 * Extends the skill detection logic to also find Claude Code plugins.
 */

import { Context, Effect, Layer } from "effect";
import type { MarketplacePluginInfo, MarketplaceContent } from "../../models/plugin";
import type { SkillInfo } from "../../models/skill";
import { DetectionError } from "../../models/plugin-errors";

/**
 * GitHub source specification
 */
export interface GitHubSource {
  owner: string;
  repo: string;
  ref?: string;
  subdir?: string;
}

/**
 * Marketplace type detection result
 */
export type MarketplaceType =
  | { type: "explicit"; content: MarketplaceContent }
  | { type: "implicit"; content: MarketplaceContent }
  | { type: "single-plugin"; plugin: MarketplacePluginInfo }
  | { type: "single-skill"; skill: SkillInfo }
  | { type: "empty" };

/**
 * GitHub API file entry
 */
interface GitHubFileEntry {
  name: string;
  type: "file" | "dir";
  path: string;
}

/**
 * Plugin.json structure
 */
interface PluginJsonManifest {
  name?: string;
  description?: string;
  version?: string;
}

/**
 * Parse GitHub source string
 * Format: github:owner/repo[@ref][#subdir]
 */
export const parseGitHubSource = (
  source: string
): Effect.Effect<GitHubSource, DetectionError> =>
  Effect.gen(function* () {
    if (!source.startsWith("github:")) {
      return yield* Effect.fail(
        new DetectionError({
          source,
          message: "Source must start with 'github:'",
        })
      );
    }

    const withoutPrefix = source.slice(7);
    const [repoPath, refAndSubdir] = withoutPrefix.split("@");
    const [owner, repo] = repoPath.split("/");

    if (!owner || !repo) {
      return yield* Effect.fail(
        new DetectionError({
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
 * Fetch directory contents from GitHub API
 */
const fetchDirectoryContents = (
  owner: string,
  repo: string,
  ref: string,
  path: string
): Effect.Effect<GitHubFileEntry[], DetectionError> =>
  Effect.gen(function* () {
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
    const url = path ? `${baseUrl}/${path}?ref=${ref}` : `${baseUrl}?ref=${ref}`;

    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: (error) =>
        new DetectionError({
          source: `github:${owner}/${repo}`,
          message: `Failed to fetch directory: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      return yield* Effect.fail(
        new DetectionError({
          source: `github:${owner}/${repo}`,
          message: `GitHub API error: ${response.status} ${response.statusText}`,
        })
      );
    }

    const contents = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) =>
        new DetectionError({
          source: `github:${owner}/${repo}`,
          message: `Failed to parse directory listing: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    return contents as GitHubFileEntry[];
  });

/**
 * Fetch and parse plugin.json from GitHub
 */
const fetchPluginJson = (
  owner: string,
  repo: string,
  ref: string,
  pluginPath: string
): Effect.Effect<PluginJsonManifest | null, never> =>
  Effect.gen(function* () {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${pluginPath}/.claude-plugin/plugin.json`;

    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: () => null,
    }).pipe(Effect.orElse(() => Effect.succeed(null)));

    if (!response || !response.ok) return null;

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: () => null,
    }).pipe(Effect.orElse(() => Effect.succeed(null)));

    return json as PluginJsonManifest | null;
  });

/**
 * Fetch SKILL.md frontmatter description from GitHub
 */
const fetchSkillDescription = (
  owner: string,
  repo: string,
  ref: string,
  skillPath: string
): Effect.Effect<string, never> =>
  Effect.gen(function* () {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${skillPath}/SKILL.md`;

    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: () => null,
    }).pipe(Effect.orElse(() => Effect.succeed(null)));

    if (!response || !response.ok) return "";

    const content = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () => "",
    }).pipe(Effect.orElse(() => Effect.succeed("")));

    // Parse description from frontmatter
    if (!content.startsWith("---")) return "";

    const endMarker = content.indexOf("---", 3);
    if (endMarker === -1) return "";

    const frontmatter = content.slice(3, endMarker);
    const descMatch = frontmatter.match(/description:\s*(.+)/);
    return descMatch ? descMatch[1].trim() : "";
  });

/**
 * Detect marketplace content in a GitHub repository
 */
const detectMarketplaceContent = (
  source: GitHubSource
): Effect.Effect<MarketplaceType, DetectionError> =>
  Effect.gen(function* () {
    const { owner, repo, ref = "main", subdir } = source;
    const basePath = subdir || "";

    // Fetch root directory contents
    const contents = yield* fetchDirectoryContents(owner, repo, ref, basePath);

    if (contents.length === 0) {
      return { type: "empty" as const };
    }

    // Check for explicit marketplace.json
    const hasMarketplaceJson = contents.some(
      (f) => f.name === "marketplace.json" && f.type === "file"
    );

    // Check for root-level plugin (.claude-plugin directory)
    const hasPluginDir = contents.some(
      (f) => f.name === ".claude-plugin" && f.type === "dir"
    );

    // Check for root-level skill (SKILL.md)
    const hasSkillMd = contents.some(
      (f) => f.name === "SKILL.md" && f.type === "file"
    );

    // Single plugin at root
    if (hasPluginDir && !hasMarketplaceJson) {
      const pluginJson = yield* fetchPluginJson(owner, repo, ref, basePath);
      return {
        type: "single-plugin" as const,
        plugin: {
          name: pluginJson?.name || subdir || repo,
          description: pluginJson?.description,
          version: pluginJson?.version,
          path: basePath,
        },
      };
    }

    // Single skill at root
    if (hasSkillMd && !hasPluginDir) {
      const description = yield* fetchSkillDescription(owner, repo, ref, basePath);
      return {
        type: "single-skill" as const,
        skill: {
          name: subdir || repo,
          description,
          path: basePath,
        },
      };
    }

    // Scan subdirectories for plugins and skills
    const subdirs = contents.filter(
      (f) => f.type === "dir" && !f.name.startsWith(".")
    );

    const plugins: MarketplacePluginInfo[] = [];
    const skills: SkillInfo[] = [];

    for (const dir of subdirs) {
      const dirPath = basePath ? `${basePath}/${dir.name}` : dir.name;
      const dirContents = yield* fetchDirectoryContents(owner, repo, ref, dirPath).pipe(
        Effect.orElse(() => Effect.succeed([] as GitHubFileEntry[]))
      );

      const dirHasPlugin = dirContents.some(
        (f) => f.name === ".claude-plugin" && f.type === "dir"
      );
      const dirHasSkill = dirContents.some(
        (f) => f.name === "SKILL.md" && f.type === "file"
      );

      if (dirHasPlugin) {
        const pluginJson = yield* fetchPluginJson(owner, repo, ref, dirPath);
        plugins.push({
          name: pluginJson?.name || dir.name,
          description: pluginJson?.description,
          version: pluginJson?.version,
          path: dir.name,
        });
      } else if (dirHasSkill) {
        const description = yield* fetchSkillDescription(owner, repo, ref, dirPath);
        skills.push({
          name: dir.name,
          description,
          path: dir.name,
        });
      }
    }

    // Determine marketplace type
    if (hasMarketplaceJson) {
      return {
        type: "explicit" as const,
        content: { plugins, skills },
      };
    }

    if (plugins.length > 0 || skills.length > 0) {
      return {
        type: "implicit" as const,
        content: { plugins, skills },
      };
    }

    return { type: "empty" as const };
  });

// Service interface
interface MarketplaceDetectionServiceImpl {
  /**
   * Parse a GitHub source string into components
   */
  readonly parseSource: (source: string) => Effect.Effect<GitHubSource, DetectionError>;

  /**
   * Detect marketplace content in a GitHub repository
   */
  readonly detect: (source: GitHubSource) => Effect.Effect<MarketplaceType, DetectionError>;

  /**
   * Detect from source string (convenience method)
   */
  readonly detectFromSource: (source: string) => Effect.Effect<MarketplaceType, DetectionError>;
}

// Service tag
export class MarketplaceDetectionService extends Context.Tag("MarketplaceDetectionService")<
  MarketplaceDetectionService,
  MarketplaceDetectionServiceImpl
>() {}

// Service implementation
const makeMarketplaceDetectionService = (): MarketplaceDetectionServiceImpl => ({
  parseSource: (source: string) => parseGitHubSource(source),

  detect: (source: GitHubSource) => detectMarketplaceContent(source),

  detectFromSource: (source: string) =>
    Effect.gen(function* () {
      const parsed = yield* parseGitHubSource(source);
      return yield* detectMarketplaceContent(parsed);
    }),
});

// Live layer
export const MarketplaceDetectionServiceLive = Layer.succeed(
  MarketplaceDetectionService,
  makeMarketplaceDetectionService()
);
