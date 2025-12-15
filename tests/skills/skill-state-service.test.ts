/**
 * Tests for SkillStateService
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import {
  SkillStateService,
  SkillStateServiceLive,
} from "../../src/services/skills/skill-state-service";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import { unlink, mkdir, writeFile } from "fs/promises";

const testStateDir = join(homedir(), ".skills");
const testStatePath = join(testStateDir, "state.json");

describe("SkillStateService", () => {
  let cleanupNeeded = false;
  let originalState: string | null = null;

  beforeEach(async () => {
    // Backup existing state if it exists
    if (existsSync(testStatePath)) {
      const file = Bun.file(testStatePath);
      originalState = await file.text();
    }
  });

  afterEach(async () => {
    if (cleanupNeeded) {
      // Restore original state or clean up
      if (originalState) {
        await writeFile(testStatePath, originalState, "utf-8");
      } else if (existsSync(testStatePath)) {
        await unlink(testStatePath);
      }
      cleanupNeeded = false;
      originalState = null;
    }
  });

  describe("getProjectState", () => {
    it("should return null for non-existent project", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const state = yield* service.getProjectState("/non/existent/project");
        return state;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).toBeNull();
    });

    it("should return project state after initialization", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project";

        yield* service.initProject(projectPath, "claude_code");
        const state = yield* service.getProjectState(projectPath);

        return state;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).not.toBeNull();
      expect(result?.agent).toBe("claude_code");
      expect(result?.enabled).toEqual([]);
      expect(result?.initialized_at).toBeDefined();
    });
  });

  describe("initProject", () => {
    it("should initialize new project with claude_code agent", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/claude";

        yield* service.initProject(projectPath, "claude_code");
        const state = yield* service.getProjectState(projectPath);

        return state;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).not.toBeNull();
      expect(result?.agent).toBe("claude_code");
      expect(result?.enabled).toEqual([]);
      expect(result?.disabled_at).toEqual({});
    });

    it("should initialize new project with opencode agent", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/opencode";

        yield* service.initProject(projectPath, "opencode");
        const state = yield* service.getProjectState(projectPath);

        return state;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result?.agent).toBe("opencode");
    });

    it("should not overwrite existing project", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/existing";

        // Initialize first time
        yield* service.initProject(projectPath, "claude_code");
        const state1 = yield* service.getProjectState(projectPath);

        // Try to initialize again with different agent
        yield* service.initProject(projectPath, "opencode");
        const state2 = yield* service.getProjectState(projectPath);

        return { state1, state2 };
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      // Agent should remain claude_code
      expect(result.state1?.agent).toBe("claude_code");
      expect(result.state2?.agent).toBe("claude_code");
    });
  });

  describe("isInitialized", () => {
    it("should return false for non-initialized project", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const initialized = yield* service.isInitialized("/non/existent/project");
        return initialized;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).toBe(false);
    });

    it("should return true for initialized project", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/init-check";

        yield* service.initProject(projectPath, "claude_code");
        const initialized = yield* service.isInitialized(projectPath);

        return initialized;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).toBe(true);
    });
  });

  describe("getEnabled", () => {
    it("should return empty array for new project", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/get-enabled";

        yield* service.initProject(projectPath, "claude_code");
        const enabled = yield* service.getEnabled(projectPath);

        return enabled;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).toEqual([]);
    });

    it("should return empty array for non-existent project", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const enabled = yield* service.getEnabled("/non/existent/project");
        return enabled;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).toEqual([]);
    });
  });

  describe("setEnabled", () => {
    it("should set enabled skills for project", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/set-enabled";

        yield* service.initProject(projectPath, "claude_code");
        yield* service.setEnabled(projectPath, ["beads", "roo"]);
        const enabled = yield* service.getEnabled(projectPath);

        return enabled;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).toEqual(["beads", "roo"]);
    });

    it("should not fail for non-existent project", async () => {
      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        yield* service.setEnabled("/non/existent/project", ["skill"]);
      }).pipe(Effect.provide(SkillStateServiceLive));

      // Should not throw
      await Effect.runPromise(program);
    });

    it("should replace existing enabled skills", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/replace-enabled";

        yield* service.initProject(projectPath, "claude_code");
        yield* service.setEnabled(projectPath, ["skill1", "skill2"]);
        yield* service.setEnabled(projectPath, ["skill3"]);
        const enabled = yield* service.getEnabled(projectPath);

        return enabled;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).toEqual(["skill3"]);
    });
  });

  describe("addEnabled", () => {
    it("should add skill to enabled list", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/add-enabled";

        yield* service.initProject(projectPath, "claude_code");
        yield* service.addEnabled(projectPath, "beads");
        const enabled = yield* service.getEnabled(projectPath);

        return enabled;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).toEqual(["beads"]);
    });

    it("should not duplicate skills", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/no-duplicate";

        yield* service.initProject(projectPath, "claude_code");
        yield* service.addEnabled(projectPath, "beads");
        yield* service.addEnabled(projectPath, "beads");
        const enabled = yield* service.getEnabled(projectPath);

        return enabled;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).toEqual(["beads"]);
    });

    it("should add multiple skills", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/add-multiple";

        yield* service.initProject(projectPath, "claude_code");
        yield* service.addEnabled(projectPath, "beads");
        yield* service.addEnabled(projectPath, "roo");
        yield* service.addEnabled(projectPath, "playwright");
        const enabled = yield* service.getEnabled(projectPath);

        return enabled;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).toEqual(["beads", "roo", "playwright"]);
    });
  });

  describe("removeEnabled", () => {
    it("should remove skill from enabled list", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/remove-enabled";

        yield* service.initProject(projectPath, "claude_code");
        yield* service.addEnabled(projectPath, "beads");
        yield* service.addEnabled(projectPath, "roo");
        yield* service.removeEnabled(projectPath, "beads");
        const enabled = yield* service.getEnabled(projectPath);

        return enabled;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).toEqual(["roo"]);
    });

    it("should not fail for non-existent skill", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/remove-nonexistent";

        yield* service.initProject(projectPath, "claude_code");
        yield* service.removeEnabled(projectPath, "non-existent");
        const enabled = yield* service.getEnabled(projectPath);

        return enabled;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result).toEqual([]);
    });
  });

  describe("recordDisable", () => {
    it("should record when skill was disabled", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/record-disable";

        yield* service.initProject(projectPath, "claude_code");
        yield* service.recordDisable(projectPath, "beads");
        const state = yield* service.getProjectState(projectPath);

        return state;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result?.disabled_at).toHaveProperty("beads");
      expect(result?.disabled_at.beads).toBeDefined();
    });

    it("should update timestamp for already disabled skill", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/update-disable";

        yield* service.initProject(projectPath, "claude_code");
        yield* service.recordDisable(projectPath, "beads");
        const state1 = yield* service.getProjectState(projectPath);

        // Wait a bit
        yield* Effect.sleep("10 millis");

        yield* service.recordDisable(projectPath, "beads");
        const state2 = yield* service.getProjectState(projectPath);

        return { first: state1?.disabled_at.beads, second: state2?.disabled_at.beads };
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result.first).toBeDefined();
      expect(result.second).toBeDefined();
      // Second timestamp should be later or equal
      expect(new Date(result.second!).getTime()).toBeGreaterThanOrEqual(
        new Date(result.first!).getTime()
      );
    });
  });

  describe("updateLastSync", () => {
    it("should update last sync timestamp", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/last-sync";

        yield* service.initProject(projectPath, "claude_code");
        yield* service.updateLastSync(projectPath);
        const state = yield* service.getProjectState(projectPath);

        return state;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result?.last_sync).toBeDefined();
    });

    it("should update timestamp on subsequent syncs", async () => {
      cleanupNeeded = true;

      const program = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/update-sync";

        yield* service.initProject(projectPath, "claude_code");
        yield* service.updateLastSync(projectPath);
        const state1 = yield* service.getProjectState(projectPath);

        // Wait a bit
        yield* Effect.sleep("10 millis");

        yield* service.updateLastSync(projectPath);
        const state2 = yield* service.getProjectState(projectPath);

        return { first: state1?.last_sync, second: state2?.last_sync };
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program);
      expect(result.first).toBeDefined();
      expect(result.second).toBeDefined();
      expect(new Date(result.second!).getTime()).toBeGreaterThanOrEqual(
        new Date(result.first!).getTime()
      );
    });
  });

  describe("persistence", () => {
    it("should persist state across service instances", async () => {
      cleanupNeeded = true;

      const program1 = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/persistence";

        yield* service.initProject(projectPath, "claude_code");
        yield* service.addEnabled(projectPath, "beads");
      }).pipe(Effect.provide(SkillStateServiceLive));

      await Effect.runPromise(program1);

      // New program with fresh service instance
      const program2 = Effect.gen(function* () {
        const service = yield* SkillStateService;
        const projectPath = "/test/project/persistence";

        const enabled = yield* service.getEnabled(projectPath);
        return enabled;
      }).pipe(Effect.provide(SkillStateServiceLive));

      const result = await Effect.runPromise(program2);
      expect(result).toEqual(["beads"]);
    });
  });
});
