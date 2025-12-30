/**
 * Skills Add Command - Add a skill from a source to local cache
 */

import { Effect } from "effect";
import * as yaml from "js-yaml";
import type { ParsedArgs } from "../../cli/parser";
import { SkillCacheService, SkillValidationService } from "../../services";
import type { GitHubSource } from "../../services";
import {
  SkillSourceError,
  SkillManifestError,
} from "../../models/skill-errors";

/**
 * Normalize GitHub URL to github:owner/repo format
 */
const normalizeGitHubUrl = (url: string): string => {
  // If already in github: format, return as-is
  if (url.startsWith("github:")) {
    return url;
  }

  // Handle various GitHub URL formats
  // https://github.com/owner/repo
  // https://github.com/owner/repo.git
  // git@github.com:owner/repo.git
  // https://github.com/owner/repo/tree/branch/path
  // https://github.com/owner/repo@ref

  let normalized = url;

  // Remove .git suffix
  normalized = normalized.replace(/\.git$/, "");

  // Handle https://github.com/owner/repo
  if (normalized.startsWith("https://github.com/")) {
    normalized = normalized.replace("https://github.com/", "github:");
    // Handle tree/branch/path
    const treeBranchMatch = /^(github:[^/]+\/[^/]+)\/tree\/([^/]+)(\/(.+))?$/.exec(normalized);
    if (treeBranchMatch) {
      const [, repo, branch, , subdir] = treeBranchMatch;
      return `${repo}@${branch}${subdir ? `#${subdir}` : ""}`;
    }
    return normalized;
  }

  // Handle git@github.com:owner/repo
  if (normalized.startsWith("git@github.com:")) {
    normalized = normalized.replace("git@github.com:", "github:");
    return normalized;
  }

  // Return as-is if we can't parse it
  return url;
};

/**
 * Parse GitHub source string
 * Format: github:owner/repo[@ref][#subdir]
 */
const parseGitHubSource = (
  source: string
): Effect.Effect<GitHubSource, SkillSourceError> =>
  Effect.gen(function* () {
    // Normalize URL first
    const normalized = normalizeGitHubUrl(source);

    if (!normalized.startsWith("github:")) {
      return yield* Effect.fail(
        new SkillSourceError({
          source,
          message: "Source must start with 'github:' or be a local path",
        })
      );
    }

    const withoutPrefix = normalized.slice(7); // Remove 'github:'

    // Split by @ for ref
    const [repoPath, refAndSubdir] = withoutPrefix.split("@");

    // Split repo path by /
    const [owner, repo] = repoPath.split("/");

    if (!owner || !repo) {
      return yield* Effect.fail(
        new SkillSourceError({
          source,
          message:
            "Invalid GitHub source format. Expected: github:owner/repo[@ref][#subdir]",
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
 * Check if source is a local path
 */
const isLocalPath = (source: string): boolean => {
  return source.startsWith("./") || source.startsWith("../") || source.startsWith("/");
};

/**
 * Skills add command implementation
 */
export const skillsAdd = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const cacheService = yield* SkillCacheService;

    // Get source from positional args
    const source = args.positional[1];

    if (!source) {
      console.log("Error: Missing source argument");
      console.log("Usage: grimoire skills add <source> [-f|--force] [--no-validate]");
      console.log("");
      console.log("Examples:");
      console.log("  grimoire skills add github:steveyegge/beads");
      console.log("  grimoire skills add github:owner/repo@v1.0.0");
      console.log("  grimoire skills add github:owner/repo#subdir");
      console.log("  grimoire skills add https://github.com/owner/repo");
      console.log("  grimoire skills add https://github.com/owner/repo/tree/main/skills");
      console.log("  grimoire skills add ./local/path");
      console.log("  grimoire skills add github:owner/repo --force  # Overwrite if cached");
      console.log("  grimoire skills add ./path --no-validate        # Skip validation");
      return;
    }

    // Check for force flag
    const force = args.flags.force === true || args.flags.f === true;
    const noValidate = args.flags["no-validate"] === true;

    // Parse source to get skill name for cache checking
    let skillNameForCacheCheck: string | undefined;

    if (!force) {
      if (isLocalPath(source)) {
        // Try to get the skill name from SKILL.md if it's a local path
        const skillMdPath = `${source}/SKILL.md`;
        const skillMdResult = yield* Effect.gen(function* () {
          try {
            const file = Bun.file(skillMdPath);
            const exists = yield* Effect.promise(() => file.exists());
            if (exists) {
              const content = yield* Effect.promise(() => file.text());
              // Parse frontmatter to get name
              if (content.startsWith("---")) {
                const endMarkerIndex = content.indexOf("---", 3);
                if (endMarkerIndex !== -1) {
                  const frontmatter = content.slice(3, endMarkerIndex).trim();
                  const parsed = yaml.load(frontmatter) as Record<string, unknown>;
                  if (parsed && typeof parsed.name === "string") {
                    return parsed.name;
                  }
                }
              }
            }
          } catch {
            // Ignore errors
          }
          return undefined;
        }).pipe(Effect.either);

        if (skillMdResult._tag === "Right") {
          skillNameForCacheCheck = skillMdResult.right;
        }
      } else {
        // For GitHub sources, we need to fetch SKILL.md first to get the name
        const githubSourceResult = yield* parseGitHubSource(source).pipe(Effect.either);

        if (githubSourceResult._tag === "Right") {
          const githubSource = githubSourceResult.right;
          const { owner, repo, ref = "main", subdir } = githubSource;
          const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
          const path = subdir ? `/${subdir}` : "";
          const skillMdUrl = `${baseUrl}${path}/SKILL.md?ref=${ref}`;

          // Try to fetch just SKILL.md to get the skill name
          const skillMdCheckResult = yield* Effect.gen(function* () {
            const response = yield* Effect.promise(() => fetch(skillMdUrl));
            if (response.ok) {
              const data = (yield* Effect.promise(() => response.json())) as { content: string };
              const content = atob(data.content);
              // Parse frontmatter
              if (content.startsWith("---")) {
                const endMarkerIndex = content.indexOf("---", 3);
                if (endMarkerIndex !== -1) {
                  const frontmatter = content.slice(3, endMarkerIndex).trim();
                  const parsed = yaml.load(frontmatter) as Record<string, unknown>;
                  if (parsed && typeof parsed.name === "string") {
                    return parsed.name;
                  }
                }
              }
            }
            return undefined;
          }).pipe(Effect.either);

          if (skillMdCheckResult._tag === "Right" && skillMdCheckResult.right) {
            skillNameForCacheCheck = skillMdCheckResult.right;
          }
        }
      }

      // Check if already cached
      if (skillNameForCacheCheck) {
        const isCached = yield* cacheService.isCached(skillNameForCacheCheck);

        if (isCached) {
          console.log(
            `Skill '${skillNameForCacheCheck}' is already cached. Use --force to update.`
          );
          return;
        }
      }
    }

    // If force flag is set and we have a skill name, remove the old cached version
    if (force && skillNameForCacheCheck) {
      const isCached = yield* cacheService.isCached(skillNameForCacheCheck);
      if (isCached) {
        console.log(`Removing existing cached skill: ${skillNameForCacheCheck}`);
        yield* cacheService.remove(skillNameForCacheCheck).pipe(
          Effect.catchAll(() => Effect.void)
        );
      }
    }

    // Fetch the skill (this validates and caches it)
    const fetchResult = yield* Effect.gen(function* () {
      if (isLocalPath(source)) {
        console.log(`Fetching skill from local path: ${source}`);
        return yield* cacheService.fetchFromLocal(source);
      } else {
        // Parse GitHub source
        const githubSource = yield* parseGitHubSource(source);
        console.log(
          `Fetching skill from GitHub: ${githubSource.owner}/${githubSource.repo}${
            githubSource.ref ? `@${githubSource.ref}` : ""
          }${githubSource.subdir ? `#${githubSource.subdir}` : ""}`
        );
        return yield* cacheService.fetchFromGitHub(githubSource);
      }
    }).pipe(
      Effect.catchAll((error) => {
        // Use _tag for Effect tagged error discrimination
        if ("_tag" in error && error._tag === "SkillSourceError") {
          // Check for specific error types
          const errorMsg = error.message.toLowerCase();

          if (errorMsg.includes("403") || errorMsg.includes("rate limit")) {
            console.log(`Error: GitHub API rate limit exceeded`);
            console.log(`Tip: Set GITHUB_TOKEN environment variable to increase rate limit`);
            console.log(`Note: Git clone fallback is not yet implemented`);
          } else if (errorMsg.includes("404") || errorMsg.includes("not found")) {
            console.log(`Error: Repository not found or is private`);
            console.log(`Please check the repository exists and is accessible`);
          } else if (errorMsg.includes("network") || errorMsg.includes("fetch failed") || errorMsg.includes("econnrefused")) {
            console.log(`Error: Network error - please check your internet connection`);
          } else {
            console.log(`Error: ${error.message}`);
          }
          return Effect.fail(error);
        }

        // Fallback for any other error
        const message = "message" in error ? error.message : String(error);
        console.log(`Error: ${message}`);
        return Effect.fail(error);
      }),
      Effect.either
    );

    // Check if fetch was successful
    if (fetchResult._tag === "Left") {
      return;
    }

    const cachedSkill = fetchResult.right;

    // Perform validation unless --no-validate is specified
    if (!noValidate) {
      const validationService = yield* SkillValidationService;

      // Get directory name for validation (from source path or manifest name)
      const directoryName = isLocalPath(source)
        ? source.split("/").pop() || cachedSkill.manifest.name
        : cachedSkill.manifest.name;

      // Read SKILL.md content for size validation
      let skillMdContent: string | undefined;
      if (cachedSkill.skillMdPath) {
        const skillMdFile = Bun.file(cachedSkill.skillMdPath);
        const exists = yield* Effect.promise(() => skillMdFile.exists());
        if (exists) {
          skillMdContent = yield* Effect.promise(() => skillMdFile.text());
        }
      }

      // Validate the manifest
      const validationResult = validationService.validateManifest(
        cachedSkill.manifest,
        { directoryName, skillMdContent }
      );

      // Report validation issues
      if (validationResult.errors.length > 0) {
        console.log(`\nValidation errors:`);
        for (const error of validationResult.errors) {
          console.log(`  ✖ ${error.field}: ${error.message}`);
        }

        // Remove the cached skill since validation failed
        yield* cacheService.remove(cachedSkill.manifest.name).pipe(
          Effect.catchAll(() => Effect.void)
        );

        console.log(`\nSkill not added due to validation errors.`);
        console.log(`Use --no-validate to skip validation.`);
        return;
      }

      // Report warnings
      if (validationResult.warnings.length > 0) {
        console.log(`\nValidation warnings:`);
        for (const warning of validationResult.warnings) {
          console.log(`  ! ${warning.field}: ${warning.message}`);
        }
      }
    }

    // Update cache index
    yield* cacheService.updateIndex();

    // Provide appropriate success message
    if (force) {
      console.log(
        `Successfully updated skill: ${cachedSkill.manifest.name}`
      );
    } else {
      console.log(
        `Successfully added skill: ${cachedSkill.manifest.name}`
      );
    }

    console.log(`Cached at: ${cachedSkill.cachedAt.toISOString()}`);

    if (cachedSkill.manifest.description) {
      console.log(`Description: ${cachedSkill.manifest.description}`);
    }
  });
