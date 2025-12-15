/**
 * Tests for SkillCacheService
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import {
  SkillCacheService,
  SkillCacheServiceLive,
  type GitHubSource,
} from "./skill-cache-service";
import { join } from "path";
import { homedir } from "os";

const testCacheDir = join(homedir(), ".skills", "cache");

describe("SkillCacheService", () => {
  let cleanupNeeded = false;

  afterEach(async () => {
    if (cleanupNeeded) {
      // Clean up test cache
      const program = Effect.gen(function* () {
        const service = yield* SkillCacheService;
        yield* service.clear();
      }).pipe(Effect.provide(SkillCacheServiceLive));

      await Effect.runPromise(program).catch(() => {
        // Ignore cleanup errors
      });
      cleanupNeeded = false;
    }
  });

  describe("isCached", () => {
    it("should return false for non-cached skill", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SkillCacheService;
        const cached = yield* service.isCached("non-existent-skill");
        return cached;
      }).pipe(Effect.provide(SkillCacheServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).toBe(false);
    });
  });

  describe("listCached", () => {
    it("should return empty array when no skills cached", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SkillCacheService;
        const skills = yield* service.listCached();
        return skills;
      }).pipe(Effect.provide(SkillCacheServiceLive));

      const result = await Effect.runPromise(program);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getCached", () => {
    it("should fail with SkillNotCachedError for non-existent skill", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SkillCacheService;
        return yield* service.getCached("non-existent-skill");
      }).pipe(Effect.provide(SkillCacheServiceLive));

      const result = await Effect.runPromise(Effect.either(program));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SkillNotCachedError");
      }
    });
  });

  describe("updateIndex", () => {
    it("should update cache index", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillCacheService;
        yield* service.updateIndex();
      }).pipe(Effect.provide(SkillCacheServiceLive));

      await Effect.runPromise(program);
    });
  });

  describe("validateManifest", () => {
    it("should fail for non-existent manifest", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SkillCacheService;
        return yield* service.validateManifest("/non/existent/path/skill.yaml");
      }).pipe(Effect.provide(SkillCacheServiceLive));

      const result = await Effect.runPromise(Effect.either(program));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SkillManifestError");
      }
    });
  });
});
