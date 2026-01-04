/**
 * Source Analyzer Service
 *
 * Analyzes source URLs/paths to determine what type of content they contain:
 * - Single skill (SKILL.md at root)
 * - Collection (multiple skills in subdirectories)
 * - Marketplace (has .claude-plugin/marketplace.json)
 *
 * Also handles common patterns like skills/ subfolder.
 */

import { Context, Effect, Layer, Data } from "effect";
import * as yaml from "js-yaml";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";
import type { GitHubSource } from "./skill-cache-service";
import type { SourceType, Marketplace } from "../../models/marketplace";
import type { SkillInfo, PluginInfo } from "../../models/skill";
// ============================================================================
// Error Types
// ============================================================================

export class SourceAnalyzerError extends Data.TaggedError("SourceAnalyzerError")<{
  source: string;
  message: string;
  cause?: unknown;
}> {}

// ============================================================================
// Tarball Download Helpers (no rate limits for public repos!)
// ============================================================================

interface FileEntry {
  path: string;
  type: "file" | "directory";
}

/**
 * Run a shell command and return stdout
 *
 * Note: Mutable variables inside Effect.async are safe - they're contained
 * within the callback scope and don't escape. Using Ref here would add
 * unnecessary complexity (Effect.runSync in Node callbacks is a smell).
 */
const runCommand = (
  cmd: string,
  args: string[],
  cwd?: string
): Effect.Effect<string, SourceAnalyzerError> =>
  Effect.async((resume) => {
    const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resume(Effect.succeed(stdout));
      } else {
        resume(
          Effect.fail(
            new SourceAnalyzerError({
              source: cmd,
              message: `Command failed with code ${code}: ${stderr || stdout}`,
            })
          )
        );
      }
    });

    proc.on("error", (error) => {
      resume(
        Effect.fail(
          new SourceAnalyzerError({
            source: cmd,
            message: `Failed to spawn command: ${error.message}`,
            cause: error,
          })
        )
      );
    });
  });

/**
 * Download and extract GitHub repo tarball to temp directory
 * Returns path to extracted directory
 */
const downloadAndExtractTarball = (
  owner: string,
  repo: string,
  ref: string
): Effect.Effect<string, SourceAnalyzerError> =>
  Effect.gen(function* () {
    // Create temp directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grimoire-"));

    // Try multiple tarball URL formats (main/master, tags, etc.)
    const urlsToTry = [
      `https://github.com/${owner}/${repo}/archive/refs/heads/${ref}.tar.gz`,
      `https://github.com/${owner}/${repo}/archive/refs/tags/${ref}.tar.gz`,
      `https://github.com/${owner}/${repo}/archive/${ref}.tar.gz`,
    ];

    let tarballPath: string | null = null;
    let downloadError: Error | null = null;

    for (const tarballUrl of urlsToTry) {
      try {
        const response = yield* Effect.tryPromise({
          try: () => fetch(tarballUrl, { redirect: "follow" }),
          catch: (error) => new SourceAnalyzerError({
            source: `github:${owner}/${repo}`,
            message: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
        });

        if (!response.ok) {
          continue;
        }

        // Save tarball to temp file
        tarballPath = path.join(tempDir, "repo.tar.gz");
        const buffer = yield* Effect.tryPromise({
          try: () => response.arrayBuffer(),
          catch: (error) => new SourceAnalyzerError({
            source: `github:${owner}/${repo}`,
            message: `Buffer read failed: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
        });

        fs.writeFileSync(tarballPath, Buffer.from(buffer));
        break;
      } catch (e) {
        downloadError = e instanceof Error ? e : new Error(String(e));
      }
    }

    if (!tarballPath) {
      // Cleanup on failure
      fs.rmSync(tempDir, { recursive: true, force: true });
      return yield* Effect.fail(
        new SourceAnalyzerError({
          source: `github:${owner}/${repo}`,
          message: `Failed to download tarball: ${downloadError?.message || "Not found"}`,
          cause: downloadError,
        })
      );
    }

    // Extract tarball
    yield* runCommand("tar", ["-xzf", tarballPath, "-C", tempDir]);

    // Find extracted directory (GitHub names it repo-ref/)
    const entries = fs.readdirSync(tempDir);
    const extractedDir = entries.find(
      (e) => e !== "repo.tar.gz" && fs.statSync(path.join(tempDir, e)).isDirectory()
    );

    if (!extractedDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      return yield* Effect.fail(
        new SourceAnalyzerError({
          source: `github:${owner}/${repo}`,
          message: "Failed to find extracted directory",
        })
      );
    }

    return path.join(tempDir, extractedDir);
  });

/**
 * Recursively list all files in a directory
 */
const listFilesRecursive = (dir: string, basePath = ""): FileEntry[] => {
  const entries: FileEntry[] = [];

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const relativePath = basePath ? `${basePath}/${item.name}` : item.name;

      if (item.isDirectory()) {
        entries.push({ path: relativePath, type: "directory" });
        entries.push(...listFilesRecursive(path.join(dir, item.name), relativePath));
      } else if (item.isFile()) {
        entries.push({ path: relativePath, type: "file" });
      }
    }
  } catch {
    // Ignore permission errors, etc.
  }

  return entries;
};

/**
 * Read file content from extracted directory
 */
const readLocalFile = (extractedDir: string, filePath: string): string | null => {
  try {
    const fullPath = path.join(extractedDir, filePath);
    return fs.readFileSync(fullPath, "utf-8");
  } catch {
    return null;
  }
};

/**
 * Cleanup temp directory
 */
const cleanupTempDir = (tempDir: string): void => {
  try {
    // Get parent temp dir (we extract into tempDir/repo-name/)
    const parentDir = path.dirname(tempDir);
    if (parentDir.includes("grimoire-")) {
      fs.rmSync(parentDir, { recursive: true, force: true });
    } else {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
};

/**
 * Parse SKILL.md frontmatter to extract name and description
 */
const parseSkillFrontmatter = (content: string, fallbackName: string): SkillInfo => {
  if (!content.startsWith("---")) {
    return { name: fallbackName, description: "", path: "" };
  }

  const endMarkerIndex = content.indexOf("---", 3);
  if (endMarkerIndex === -1) {
    return { name: fallbackName, description: "", path: "" };
  }

  try {
    const frontmatterContent = content.slice(3, endMarkerIndex).trim();
    const parsed = yaml.load(frontmatterContent) as Record<string, unknown>;

    return {
      name: typeof parsed.name === "string" ? parsed.name : fallbackName,
      description: typeof parsed.description === "string" ? parsed.description : "",
      path: "",
    };
  } catch {
    return { name: fallbackName, description: "", path: "" };
  }
};

// ============================================================================
// Source Analysis
// ============================================================================

/**
 * Analyze a GitHub source to determine its type
 * Downloads tarball and analyzes locally (no API rate limits!)
 */
const analyzeGitHubSource = (
  source: GitHubSource
): Effect.Effect<SourceType, SourceAnalyzerError> =>
  Effect.gen(function* () {
    const { owner, repo, ref = "main", subdir } = source;

    // Download and extract tarball (no rate limits!)
    const extractedDir = yield* downloadAndExtractTarball(owner, repo, ref);

    try {
      // Determine base path for analysis
      const analysisRoot = subdir ? path.join(extractedDir, subdir) : extractedDir;

      // Check if the analysis root exists
      if (!fs.existsSync(analysisRoot)) {
        return { type: "empty" as const };
      }

      // List all files recursively
      const allFiles = listFilesRecursive(analysisRoot);

      if (allFiles.length === 0) {
        return { type: "empty" as const };
      }

      // Check for markers at root level
      const hasSkillMd = allFiles.some(
        (f) => f.path === "SKILL.md" && f.type === "file"
      );
      const hasPluginDir = allFiles.some(
        (f) => f.path === ".claude-plugin" && f.type === "directory"
      );

      // If root has SKILL.md (and no plugin dir), it's a single skill
      if (hasSkillMd && !hasPluginDir) {
        const skillMdContent = readLocalFile(analysisRoot, "SKILL.md");
        const skillInfo = parseSkillFrontmatter(skillMdContent || "", subdir || repo);
        skillInfo.path = subdir || "";

        return {
          type: "single-skill" as const,
          skill: skillInfo,
        };
      }

      // Check for marketplace (has .claude-plugin directory with marketplace.json)
      let marketplace: Marketplace | null = null;
      if (hasPluginDir) {
        const hasMarketplaceJson = allFiles.some(
          (f) => f.path === ".claude-plugin/marketplace.json" && f.type === "file"
        );

        if (hasMarketplaceJson) {
          const marketplaceJson = readLocalFile(analysisRoot, ".claude-plugin/marketplace.json");

          if (marketplaceJson) {
            try {
              const parsed = JSON.parse(marketplaceJson) as {
                name?: string;
                description?: string;
              };

              marketplace = {
                name: parsed.name || repo,
                repo: `github:${owner}/${repo}${subdir ? `#${subdir}` : ""}`,
                type: "community",
                description: parsed.description,
                claudePluginId: parsed.name || repo,
                addedAt: new Date().toISOString(),
              };
            } catch {
              // Not a valid marketplace.json
            }
          }
        }
      }

      // Find all SKILL.md files and .claude-plugin directories
      const skills: SkillInfo[] = [];
      const plugins: PluginInfo[] = [];

      // Find all SKILL.md files (excluding root)
      const skillMdFiles = allFiles.filter(
        (f) => f.type === "file" && f.path.endsWith("/SKILL.md")
      );

      // Find all .claude-plugin directories (excluding root)
      const pluginDirs = allFiles.filter(
        (f) => f.type === "directory" && f.path.endsWith("/.claude-plugin")
      );

      // Process SKILL.md files to extract skill info
      for (const skillMdEntry of skillMdFiles) {
        // Get the skill directory (parent of SKILL.md)
        const skillDir = skillMdEntry.path.replace(/\/SKILL\.md$/, "");
        const skillName = skillDir.split("/").pop() || "unknown";

        // Read SKILL.md content locally (no network request!)
        const skillMdContent = readLocalFile(analysisRoot, skillMdEntry.path);
        const skillInfo = parseSkillFrontmatter(skillMdContent || "", skillName);
        skillInfo.path = subdir ? `${subdir}/${skillDir}` : skillDir;
        skills.push(skillInfo);
      }

      // Process plugin directories that don't have SKILL.md
      for (const pluginDir of pluginDirs) {
        const parentDir = pluginDir.path.replace(/\/.claude-plugin$/, "");

        // Skip root .claude-plugin (used for marketplace detection)
        if (parentDir === "") continue;

        // Check if this plugin already has a SKILL.md (then it's already in skills)
        const hasSkillMdAlready = skillMdFiles.some(
          (f) => f.path === `${parentDir}/SKILL.md`
        );

        if (!hasSkillMdAlready) {
          const pluginName = parentDir.split("/").pop() || "unknown";
          plugins.push({
            name: pluginName,
            path: subdir ? `${subdir}/${parentDir}` : parentDir,
          });
        }
      }

      // Determine result type
      if (marketplace && (skills.length > 0 || plugins.length > 0)) {
        return {
          type: "marketplace" as const,
          marketplace,
          skills,
          plugins,
        };
      }

      if (skills.length > 0 || plugins.length > 0) {
        return {
          type: "collection" as const,
          skills,
          plugins,
        };
      }

      return { type: "empty" as const };
    } finally {
      // Always cleanup temp directory
      cleanupTempDir(extractedDir);
    }
  });

/**
 * Parse GitHub source string
 * Format: github:owner/repo[@ref][#subdir] or https://github.com/owner/repo
 */
const parseGitHubSource = (source: string): GitHubSource | null => {
  // Normalize URL formats
  let normalized = source;

  // Handle https://github.com/owner/repo
  if (normalized.startsWith("https://github.com/")) {
    normalized = normalized.replace("https://github.com/", "github:");
    // Handle tree/branch/path
    const treeBranchMatch = /^(github:[^/]+\/[^/]+)\/tree\/([^/]+)(\/(.+))?$/.exec(normalized);
    if (treeBranchMatch) {
      const [, repoStr, branch, , subPath] = treeBranchMatch;
      normalized = `${repoStr}@${branch}${subPath ? `#${subPath}` : ""}`;
    }
  }

  // Handle git@github.com:owner/repo
  if (normalized.startsWith("git@github.com:")) {
    normalized = normalized.replace("git@github.com:", "github:");
    normalized = normalized.replace(/\.git$/, "");
  }

  if (!normalized.startsWith("github:")) {
    return null;
  }

  const withoutPrefix = normalized.slice(7); // Remove 'github:'
  const [repoPath, refAndSubdir] = withoutPrefix.split("@");
  const [owner, repo] = repoPath.split("/");

  if (!owner || !repo) {
    return null;
  }

  let ref: string | undefined;
  let subdir: string | undefined;

  if (refAndSubdir) {
    const [refPart, subdirPart] = refAndSubdir.split("#");
    ref = refPart || undefined;
    subdir = subdirPart || undefined;
  } else {
    // Check for # without @
    const hashIndex = repo.indexOf("#");
    if (hashIndex > 0) {
      subdir = repo.slice(hashIndex + 1);
    }
  }

  return { owner, repo: repo.split("#")[0], ref, subdir };
};

// ============================================================================
// Service Interface
// ============================================================================

interface SourceAnalyzerServiceImpl {
  /**
   * Analyze a source URL/path to determine what it contains
   */
  readonly analyze: (source: string) => Effect.Effect<SourceType, SourceAnalyzerError>;

  /**
   * Parse a source string into GitHubSource
   */
  readonly parseSource: (source: string) => GitHubSource | null;

  /**
   * Check if a source is a local path
   */
  readonly isLocalPath: (source: string) => boolean;
}

// ============================================================================
// Service Tag
// ============================================================================

export class SourceAnalyzerService extends Context.Tag("SourceAnalyzerService")<
  SourceAnalyzerService,
  SourceAnalyzerServiceImpl
>() {}

// ============================================================================
// Service Implementation
// ============================================================================

const makeSourceAnalyzerService = (): SourceAnalyzerServiceImpl => ({
  analyze: (source: string) =>
    Effect.gen(function* () {
      // Check if local path
      if (source.startsWith("./") || source.startsWith("../") || source.startsWith("/")) {
        // TODO: Implement local path analysis
        // For now, return empty
        return { type: "empty" as const };
      }

      // Parse as GitHub source
      const githubSource = parseGitHubSource(source);

      if (!githubSource) {
        return yield* Effect.fail(
          new SourceAnalyzerError({
            source,
            message: "Invalid source format. Expected: github:owner/repo or https://github.com/owner/repo",
          })
        );
      }

      return yield* analyzeGitHubSource(githubSource);
    }),

  parseSource: (source: string) => parseGitHubSource(source),

  isLocalPath: (source: string) =>
    source.startsWith("./") || source.startsWith("../") || source.startsWith("/"),
});

// ============================================================================
// Live Layer
// ============================================================================

export const SourceAnalyzerServiceLive = Layer.succeed(
  SourceAnalyzerService,
  makeSourceAnalyzerService()
);
