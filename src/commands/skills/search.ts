/**
 * Skills Search Command
 *
 * Search for skills on GitHub using GitHub API.
 * Searches for repositories with 'skills-cli' or 'agent-skill' topics,
 * and also searches for repositories containing 'skill.yaml' files.
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { SkillSourceError } from "../../models/skill-errors";

/**
 * GitHub repository search result
 */
interface GitHubRepo {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  html_url: string;
  topics?: string[];
}

/**
 * GitHub code search result
 */
interface GitHubCodeResult {
  repository: {
    full_name: string;
    description: string | null;
    stargazers_count: number;
    html_url: string;
  };
}

/**
 * Unified search result
 */
interface SearchResult {
  fullName: string;
  description: string;
  stars: number;
  url: string;
  source: "topic" | "code";
}

/**
 * Simple in-memory cache for search results (5 minutes TTL)
 */
const searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const getCachedResults = (cacheKey: string): SearchResult[] | null => {
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.results;
  }
  return null;
};

const setCachedResults = (cacheKey: string, results: SearchResult[]): void => {
  searchCache.set(cacheKey, { results, timestamp: Date.now() });
};

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  gray: "\x1b[90m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

/**
 * Get GitHub token from environment if available
 */
const getGitHubToken = (): string | undefined => {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
};

/**
 * Create headers for GitHub API requests
 */
const createHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const token = getGitHubToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

/**
 * Search GitHub repositories by topic
 */
const searchByTopic = (
  query: string,
  limit: number
): Effect.Effect<SearchResult[], SkillSourceError> =>
  Effect.gen(function* () {
    const topics = ["skills-cli", "agent-skill"];
    const allResults: SearchResult[] = [];

    for (const topic of topics) {
      const searchQuery = query
        ? `topic:${topic}+${encodeURIComponent(query)}`
        : `topic:${topic}`;
      const url = `https://api.github.com/search/repositories?q=${searchQuery}&sort=stars&order=desc&per_page=${limit}`;

      const response = yield* Effect.tryPromise({
        try: () => fetch(url, { headers: createHeaders() }),
        catch: (error) =>
          new SkillSourceError({
            source: "github",
            message: `Failed to search GitHub: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
          if (rateLimitRemaining === "0") {
            return yield* Effect.fail(
              new SkillSourceError({
                source: "github",
                message: "GitHub API rate limit exceeded",
              })
            );
          }
        }

        if (response.status === 422) {
          // Validation failed - likely bad query syntax
          continue;
        }

        return yield* Effect.fail(
          new SkillSourceError({
            source: "github",
            message: `GitHub API error: ${response.status} ${response.statusText}`,
          })
        );
      }

      const data = (yield* Effect.tryPromise({
        try: () => response.json(),
        catch: (error) =>
          new SkillSourceError({
            source: "github",
            message: `Failed to parse response: ${error instanceof Error ? error.message : String(error)}`,
          }),
      })) as { items: GitHubRepo[] };

      for (const repo of data.items) {
        allResults.push({
          fullName: repo.full_name,
          description: repo.description || "No description",
          stars: repo.stargazers_count,
          url: repo.html_url,
          source: "topic",
        });
      }
    }

    return allResults;
  });

/**
 * Search GitHub code for skill.yaml files
 */
const searchBySkillYaml = (
  query: string,
  limit: number
): Effect.Effect<SearchResult[], SkillSourceError> =>
  Effect.gen(function* () {
    const searchQuery = query
      ? `filename:skill.yaml+${encodeURIComponent(query)}`
      : "filename:skill.yaml";
    const url = `https://api.github.com/search/code?q=${searchQuery}&sort=indexed&order=desc&per_page=${limit}`;

    const response = yield* Effect.tryPromise({
      try: () => fetch(url, { headers: createHeaders() }),
      catch: (error) =>
        new SkillSourceError({
          source: "github",
          message: `Failed to search GitHub: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    if (!response.ok) {
      if (response.status === 403) {
        const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
        if (rateLimitRemaining === "0") {
          return yield* Effect.fail(
            new SkillSourceError({
              source: "github",
              message: "GitHub API rate limit exceeded",
            })
          );
        }
      }

      if (response.status === 422) {
        // Validation failed - return empty results
        return [];
      }

      return yield* Effect.fail(
        new SkillSourceError({
          source: "github",
          message: `GitHub API error: ${response.status} ${response.statusText}`,
        })
      );
    }

    const data = (yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) =>
        new SkillSourceError({
          source: "github",
          message: `Failed to parse response: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })) as { items: GitHubCodeResult[] };

    const results: SearchResult[] = [];
    const seen = new Set<string>();

    for (const item of data.items) {
      const fullName = item.repository.full_name;
      if (!seen.has(fullName)) {
        seen.add(fullName);
        results.push({
          fullName,
          description: item.repository.description || "No description",
          stars: item.repository.stargazers_count,
          url: item.repository.html_url,
          source: "code",
        });
      }
    }

    return results;
  });

/**
 * Perform the actual search (called by cache)
 */
const performSearch = (
  cacheKey: string
): Effect.Effect<SearchResult[], SkillSourceError> =>
  Effect.gen(function* () {
    const [query, limitStr] = cacheKey.split("|");
    const limit = parseInt(limitStr, 10);

    // Search both by topic and by skill.yaml filename
    const topicResults = yield* searchByTopic(query, limit).pipe(
      Effect.catchAll(() => Effect.succeed([]))
    );

    const codeResults = yield* searchBySkillYaml(query, limit).pipe(
      Effect.catchAll(() => Effect.succeed([]))
    );

    // Merge results, deduplicate by full_name, and sort by stars
    const allResults = [...topicResults, ...codeResults];
    const uniqueResults = new Map<string, SearchResult>();

    for (const result of allResults) {
      const existing = uniqueResults.get(result.fullName);
      if (!existing || existing.stars < result.stars) {
        uniqueResults.set(result.fullName, result);
      }
    }

    const sorted = Array.from(uniqueResults.values()).sort((a, b) => b.stars - a.stars);

    return sorted.slice(0, limit);
  });

/**
 * Format star count with thousands separator
 */
const formatStars = (stars: number): string => {
  if (stars >= 1000) {
    return `${(stars / 1000).toFixed(1)}k`;
  }
  return stars.toString();
};

/**
 * Skills search command implementation
 */
export const skillsSearch = (args: ParsedArgs) =>
  Effect.gen(function* () {
    // Get query from positional args (everything after 'search')
    const queryParts = args.positional.slice(1);
    const query = queryParts.join(" ").trim();

    // Get limit flag (default: 10)
    const limitFlag = args.flags.limit;
    const limit =
      typeof limitFlag === "string" ? parseInt(limitFlag, 10) : typeof limitFlag === "number" ? limitFlag : 10;

    if (isNaN(limit) || limit < 1 || limit > 100) {
      console.log("Error: --limit must be a number between 1 and 100");
      return;
    }

    // Display search message
    if (query) {
      console.log(`Searching GitHub for "${query}"...\n`);
    } else {
      console.log("Searching GitHub for all skills...\n");
    }

    // Create cache key
    const cacheKey = `${query}|${limit}`;

    // Check cache first
    const cached = getCachedResults(cacheKey);

    // Search with caching
    const searchResult = yield* Effect.gen(function* () {
      if (cached) {
        return cached;
      }

      const results = yield* performSearch(cacheKey);
      setCachedResults(cacheKey, results);
      return results;
    }).pipe(
      Effect.catchAll((error: unknown) => {
        if (error instanceof SkillSourceError) {
          if (error.message.includes("rate limit")) {
            console.log(`${colors.yellow}Error: GitHub API rate limit exceeded${colors.reset}`);
            console.log(
              `${colors.gray}Tip: Set GITHUB_TOKEN environment variable to increase rate limit${colors.reset}`
            );
          } else {
            console.log(`${colors.yellow}Error: ${error.message}${colors.reset}`);
          }
          return Effect.fail(error);
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(
          `${colors.yellow}Error: ${errorMessage}${colors.reset}`
        );
        return Effect.fail(error);
      }),
      Effect.either
    );

    if (searchResult._tag === "Left") {
      return;
    }

    const results = searchResult.right;

    // Display results
    if (results.length === 0) {
      console.log(`${colors.gray}No skills found${colors.reset}`);
      if (query) {
        console.log(
          `${colors.gray}Try a different search term or browse https://github.com/topics/skills-cli${colors.reset}`
        );
      }
      return;
    }

    console.log(`${colors.bold}Results (${results.length}):${colors.reset}`);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const number = `${i + 1}.`.padEnd(4);
      const name = result.fullName.padEnd(35);
      const desc = result.description.slice(0, 40).padEnd(40);
      const stars = `${colors.yellow}★${colors.reset} ${formatStars(result.stars)}`;

      console.log(`  ${colors.gray}${number}${colors.reset}${colors.cyan}${name}${colors.reset}${desc}  ${stars}`);
    }

    console.log();
    console.log(`${colors.gray}Run 'grimoire skills add github:<owner>/<repo>' to add a skill${colors.reset}`);
  });
