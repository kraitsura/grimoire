/**
 * Skills Sync Command
 *
 * Updates enabled skills to latest versions from their sources.
 *
 * Usage:
 *   grimoire skills sync
 *   grimoire skills sync --dry-run
 *   grimoire skills sync --reinit
 */

import { Effect } from "effect";
import * as yaml from "js-yaml";
import type { ParsedArgs } from "../../cli/parser";
import {
  SkillCacheService,
  SkillStateService,
  SkillEngineService,
} from "../../services";
import type { GitHubSource } from "../../services";
import { SkillSourceError } from "../../models/skill-errors";

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
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
 * Check if source is a local path
 */
const isLocalPath = (source: string): boolean => {
  return source.startsWith("./") || source.startsWith("../") || source.startsWith("/");
};



/**
 * Sync result for a single skill
 */
interface SyncResult {
  skillName: string;
  status: "updated" | "up-to-date" | "error" | "local-source";
  error?: string;
}

/**
 * Skills sync command handler
 */
export const skillsSync = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const cacheService = yield* SkillCacheService;
    const stateService = yield* SkillStateService;
    const engineService = yield* SkillEngineService;

    const projectPath = process.cwd();

    // Extract flags
    const dryRun = args.flags["dry-run"] === true;
    const reinit = args.flags.reinit === true;

    // Check if project is initialized
    const isInitialized = yield* stateService.isInitialized(projectPath);
    if (!isInitialized) {
      console.log(`${colors.red}Error:${colors.reset} Project not initialized`);
      console.log();
      console.log(
        `Run ${colors.bold}grimoire skills init${colors.reset} to initialize skills in this project.`
      );
      process.exit(1);
    }

    // Get enabled skills
    const enabledSkills = yield* stateService.getEnabled(projectPath);

    if (enabledSkills.length === 0) {
      console.log("No skills enabled in this project.");
      return;
    }

    console.log("Syncing enabled skills...");
    console.log();

    if (dryRun) {
      console.log(`${colors.yellow}Dry run mode - no changes will be made${colors.reset}`);
      console.log();
    }

    const results: SyncResult[] = [];

    // Check each enabled skill for updates
    for (const skillName of enabledSkills) {
      // Get cached skill
      const cachedResult = yield* cacheService.getCached(skillName).pipe(Effect.either);

      if (cachedResult._tag === "Left") {
        results.push({
          skillName,
          status: "error",
          error: "Skill not found in cache",
        });
        continue;
      }

      const cachedSkill = cachedResult.right;
      const source = cachedSkill.source;

      // Check if source is a local path (skip sync for local sources)
      if (isLocalPath(source)) {
        results.push({
          skillName,
          status: "local-source",
        });
        continue;
      }

      // Check if source is a GitHub source
      if (!source.startsWith("github:")) {
        results.push({
          skillName,
          status: "local-source",
        });
        continue;
      }

      // Parse GitHub source
      const githubSourceResult = yield* parseGitHubSource(source).pipe(Effect.either);

      if (githubSourceResult._tag === "Left") {
        results.push({
          skillName,
          status: "error",
          error: "Failed to parse GitHub source",
        });
        continue;
      }

      const githubSource = githubSourceResult.right;

      // For sync, always re-fetch from GitHub (no version checking since we don't track versions anymore)
      if (dryRun) {
        results.push({
          skillName,
          status: "updated",
        });
        continue;
      }

      // Perform the update:
      // 1. Disable the old version
      // 2. Remove from cache
      // 3. Re-fetch from GitHub
      // 4. Update cache index
      // 5. Re-enable with new version

      // Disable the old version
      const disableResult = yield* engineService
        .disable(projectPath, skillName, {})
        .pipe(Effect.either);

      if (disableResult._tag === "Left") {
        results.push({
          skillName,
          status: "error",
          error: "Failed to disable old version",
        });
        continue;
      }

      // Remove old cached version
      yield* cacheService.remove(skillName).pipe(Effect.catchAll(() => Effect.void));

      // Re-fetch from GitHub
      const updateResult = yield* cacheService.fetchFromGitHub(githubSource).pipe(Effect.either);

      if (updateResult._tag === "Left") {
        results.push({
          skillName,
          status: "error",
          error: `Failed to fetch update: ${updateResult.left.message}`,
        });
        continue;
      }

      // Update cache index
      yield* cacheService.updateIndex().pipe(Effect.catchAll(() => Effect.void));

      // Re-enable with new version
      const enableResult = yield* engineService
        .enable(projectPath, skillName, {
          yes: true,
          noDeps: true, // Skip CLI deps re-installation
          noInit: !reinit, // Skip init commands unless --reinit flag is set
        })
        .pipe(Effect.either);

      if (enableResult._tag === "Left") {
        results.push({
          skillName,
          status: "error",
          error: "Failed to re-enable skill with new version",
        });
        continue;
      }

      results.push({
        skillName,
        status: "updated",
      });
    }

    // Update last sync timestamp
    if (!dryRun) {
      yield* stateService.updateLastSync(projectPath);
    }

    // Display results
    let updatedCount = 0;
    let upToDateCount = 0;
    let errorCount = 0;
    let localCount = 0;

    for (const result of results) {
      switch (result.status) {
        case "updated":
          console.log(
            `${colors.green}[ok]${colors.reset} ${colors.bold}${result.skillName}${colors.reset}: updated`
          );
          updatedCount++;
          break;
        case "up-to-date":
          console.log(
            `  ${colors.gray}o${colors.reset} ${result.skillName}: up to date`
          );
          upToDateCount++;
          break;
        case "local-source":
          console.log(
            `  ${colors.gray}o${colors.reset} ${result.skillName}: no remote source`
          );
          localCount++;
          break;
        case "error":
          console.log(`${colors.red}[!!]${colors.reset} ${result.skillName}: ${result.error}`);
          errorCount++;
          break;
      }
    }

    console.log();

    // Summary
    const parts: string[] = [];
    if (updatedCount > 0) {
      parts.push(`${updatedCount} updated`);
    }
    if (upToDateCount > 0) {
      parts.push(`${upToDateCount} up to date`);
    }
    if (localCount > 0) {
      parts.push(`${localCount} local`);
    }
    if (errorCount > 0) {
      parts.push(`${errorCount} failed`);
    }

    const summaryPrefix = dryRun ? "Would update:" : "Updated";
    console.log(`${summaryPrefix} ${parts.join(", ")}`);

    // Show reinit warning if applicable
    if (reinit && !dryRun && updatedCount > 0) {
      console.log();
      console.log(
        `${colors.yellow}Note:${colors.reset} Init commands were re-run for updated skills (--reinit flag)`
      );
      console.log(
        `${colors.yellow}      This may have modified your project files.${colors.reset}`
      );
    }

    // Exit with error if there were errors
    if (errorCount > 0) {
      process.exit(1);
    }
  });
