/**
 * Tests for skills init command
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect, Layer } from "effect";
import { skillsInit, InitError } from "../../../src/commands/skills/init";
import { SkillStateService } from "../../../src/services/skills/skill-state-service";
import type { ParsedArgs } from "../../../src/cli/parser";
import { join } from "path";
import { existsSync } from "fs";
import { unlink, rm, mkdir, writeFile } from "fs/promises";
import { homedir } from "os";

const testStateDir = join(homedir(), ".skills");
const testStatePath = join(testStateDir, "state.json");

const createParsedArgs = (overrides?: Partial<ParsedArgs>): ParsedArgs => ({
  command: "skills",
  subcommand: "init",
  args: [],
  flags: {},
  ...overrides,
});

const createMockStateService = (
  projects: Map<string, { agent: "claude_code" | "opencode" | "generic"; enabled: string[] }>
): typeof SkillStateService.Service => ({
  getProjectState: (projectPath: string) =>
    Effect.succeed(
      projects.has(projectPath)
        ? {
            ...projects.get(projectPath)!,
            disabled_at: {},
            initialized_at: new Date().toISOString(),
          }
        : null
    ),
  initProject: (projectPath: string, agent) =>
    Effect.sync(() => {
      projects.set(projectPath, { agent, enabled: [] });
    }),
  isInitialized: (projectPath: string) => Effect.succeed(projects.has(projectPath)),
  getEnabled: (projectPath: string) =>
    Effect.succeed(projects.get(projectPath)?.enabled || []),
  setEnabled: (projectPath: string, skills: string[]) =>
    Effect.sync(() => {
      const project = projects.get(projectPath);
      if (project) {
        project.enabled = skills;
      }
    }),
  addEnabled: (projectPath: string, skill: string) =>
    Effect.sync(() => {
      const project = projects.get(projectPath);
      if (project && !project.enabled.includes(skill)) {
        project.enabled.push(skill);
      }
    }),
  removeEnabled: (projectPath: string, skill: string) =>
    Effect.sync(() => {
      const project = projects.get(projectPath);
      if (project) {
        project.enabled = project.enabled.filter((s) => s !== skill);
      }
    }),
  recordDisable: () => Effect.void,
  updateLastSync: () => Effect.void,
});

describe("skills init command", () => {
  let cleanupNeeded = false;
  let originalState: string | null = null;
  let originalCwd: string;
  let testDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();

    // Create a temporary test directory
    testDir = join(homedir(), ".grimoire-test-" + Date.now());
    await mkdir(testDir, { recursive: true });
    process.chdir(testDir);

    // Backup existing state if it exists
    if (existsSync(testStatePath)) {
      const file = Bun.file(testStatePath);
      originalState = await file.text();
    }
  });

  afterEach(async () => {
    // Restore cwd
    process.chdir(originalCwd);

    // Clean up test directory
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }

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

  describe("with mocked state service", () => {
    it("should initialize project with claude_code agent", async () => {
      const projects = new Map();
      const mockState = createMockStateService(projects);
      const TestLayer = Layer.succeed(SkillStateService, mockState);

      const args = createParsedArgs({
        flags: { agent: "claude_code", y: true },
      });

      const program = skillsInit(args).pipe(Effect.provide(TestLayer));

      await Effect.runPromise(program);

      expect(projects.has(testDir)).toBe(true);
      expect(projects.get(testDir)?.agent).toBe("claude_code");
    });

    it("should initialize project with opencode agent", async () => {
      const projects = new Map();
      const mockState = createMockStateService(projects);
      const TestLayer = Layer.succeed(SkillStateService, mockState);

      const args = createParsedArgs({
        flags: { agent: "opencode", y: true },
      });

      const program = skillsInit(args).pipe(Effect.provide(TestLayer));

      await Effect.runPromise(program);

      expect(projects.has(testDir)).toBe(true);
      expect(projects.get(testDir)?.agent).toBe("opencode");
    });

    it("should not reinitialize already initialized project", async () => {
      const projects = new Map([
        [testDir, { agent: "claude_code" as const, enabled: ["beads"] }],
      ]);
      const mockState = createMockStateService(projects);
      const TestLayer = Layer.succeed(SkillStateService, mockState);

      const args = createParsedArgs({
        flags: { agent: "opencode", y: true },
      });

      const program = skillsInit(args).pipe(Effect.provide(TestLayer));

      await Effect.runPromise(program);

      // Agent should remain claude_code
      expect(projects.get(testDir)?.agent).toBe("claude_code");
      // Enabled skills should remain
      expect(projects.get(testDir)?.enabled).toEqual(["beads"]);
    });

    it("should fail with invalid agent type", async () => {
      const projects = new Map();
      const mockState = createMockStateService(projects);
      const TestLayer = Layer.succeed(SkillStateService, mockState);

      const args = createParsedArgs({
        flags: { agent: "invalid-agent", y: true },
      });

      const program = skillsInit(args).pipe(Effect.provide(TestLayer));

      const result = await Effect.runPromise(Effect.either(program));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("InitError");
        expect(result.left.message).toContain("Invalid agent type");
      }
    });

    it("should default to claude_code with auto flag when no agent detected", async () => {
      const projects = new Map();
      const mockState = createMockStateService(projects);
      const TestLayer = Layer.succeed(SkillStateService, mockState);

      const args = createParsedArgs({
        flags: { agent: "auto", y: true },
      });

      const program = skillsInit(args).pipe(Effect.provide(TestLayer));

      await Effect.runPromise(program);

      expect(projects.has(testDir)).toBe(true);
      expect(projects.get(testDir)?.agent).toBe("claude_code");
    });

    it("should detect claude_code when .claude directory exists", async () => {
      // Create .claude directory
      await mkdir(join(testDir, ".claude"), { recursive: true });

      const projects = new Map();
      const mockState = createMockStateService(projects);
      const TestLayer = Layer.succeed(SkillStateService, mockState);

      const args = createParsedArgs({
        flags: { agent: "auto", y: true },
      });

      const program = skillsInit(args).pipe(Effect.provide(TestLayer));

      await Effect.runPromise(program);

      expect(projects.get(testDir)?.agent).toBe("claude_code");
    });

    it("should detect opencode when .opencode directory exists", async () => {
      // Create .opencode directory
      await mkdir(join(testDir, ".opencode"), { recursive: true });

      const projects = new Map();
      const mockState = createMockStateService(projects);
      const TestLayer = Layer.succeed(SkillStateService, mockState);

      const args = createParsedArgs({
        flags: { agent: "auto", y: true },
      });

      const program = skillsInit(args).pipe(Effect.provide(TestLayer));

      await Effect.runPromise(program);

      expect(projects.get(testDir)?.agent).toBe("opencode");
    });

    it("should default to claude_code when both agent directories exist", async () => {
      // Create both .claude and .opencode directories
      await mkdir(join(testDir, ".claude"), { recursive: true });
      await mkdir(join(testDir, ".opencode"), { recursive: true });

      const projects = new Map();
      const mockState = createMockStateService(projects);
      const TestLayer = Layer.succeed(SkillStateService, mockState);

      const args = createParsedArgs({
        flags: { y: true },
      });

      const program = skillsInit(args).pipe(Effect.provide(TestLayer));

      await Effect.runPromise(program);

      // Should default to claude_code when ambiguous
      expect(projects.get(testDir)?.agent).toBe("claude_code");
    });
  });

  describe("file system operations", () => {
    it("should create .claude directory and CLAUDE.md", async () => {
      cleanupNeeded = true;

      const projects = new Map();
      const mockState = createMockStateService(projects);
      const TestLayer = Layer.succeed(SkillStateService, mockState);

      const args = createParsedArgs({
        flags: { agent: "claude_code", y: true },
      });

      const program = skillsInit(args).pipe(Effect.provide(TestLayer));

      await Effect.runPromise(program);

      // Check that directories were created
      expect(existsSync(join(testDir, ".claude"))).toBe(true);
      expect(existsSync(join(testDir, ".claude", "skills"))).toBe(true);
      expect(existsSync(join(testDir, ".claude", "CLAUDE.md"))).toBe(true);

      // Check that CLAUDE.md has the managed section markers
      const file = Bun.file(join(testDir, ".claude", "CLAUDE.md"));
      const content = await file.text();
      expect(content).toContain("<!-- skills:managed:start -->");
      expect(content).toContain("<!-- skills:managed:end -->");
    });

    it("should create .opencode directory and AGENTS.md", async () => {
      cleanupNeeded = true;

      const projects = new Map();
      const mockState = createMockStateService(projects);
      const TestLayer = Layer.succeed(SkillStateService, mockState);

      const args = createParsedArgs({
        flags: { agent: "opencode", y: true },
      });

      const program = skillsInit(args).pipe(Effect.provide(TestLayer));

      await Effect.runPromise(program);

      // Check that directories were created
      expect(existsSync(join(testDir, ".opencode"))).toBe(true);
      expect(existsSync(join(testDir, ".opencode", "skills"))).toBe(true);
      expect(existsSync(join(testDir, ".opencode", "AGENTS.md"))).toBe(true);

      // Check that AGENTS.md has the managed section markers
      const file = Bun.file(join(testDir, ".opencode", "AGENTS.md"));
      const content = await file.text();
      expect(content).toContain("<!-- skills:managed:start -->");
      expect(content).toContain("<!-- skills:managed:end -->");
    });

    it("should add managed markers to existing config file", async () => {
      cleanupNeeded = true;

      // Create existing CLAUDE.md without markers
      await mkdir(join(testDir, ".claude"), { recursive: true });
      await writeFile(
        join(testDir, ".claude", "CLAUDE.md"),
        "# Existing Config\n\nSome content here.",
        "utf-8"
      );

      const projects = new Map();
      const mockState = createMockStateService(projects);
      const TestLayer = Layer.succeed(SkillStateService, mockState);

      const args = createParsedArgs({
        flags: { agent: "claude_code", y: true },
      });

      const program = skillsInit(args).pipe(Effect.provide(TestLayer));

      await Effect.runPromise(program);

      // Check that markers were added
      const file = Bun.file(join(testDir, ".claude", "CLAUDE.md"));
      const content = await file.text();
      expect(content).toContain("# Existing Config");
      expect(content).toContain("Some content here.");
      expect(content).toContain("<!-- skills:managed:start -->");
      expect(content).toContain("<!-- skills:managed:end -->");
    });

    it("should not duplicate markers in existing config file", async () => {
      cleanupNeeded = true;

      // Create existing CLAUDE.md with markers
      await mkdir(join(testDir, ".claude"), { recursive: true });
      const existingContent = `# Existing Config

Some content here.

<!-- skills:managed:start -->
<!-- skills:managed:end -->
`;
      await writeFile(
        join(testDir, ".claude", "CLAUDE.md"),
        existingContent,
        "utf-8"
      );

      const projects = new Map();
      const mockState = createMockStateService(projects);
      const TestLayer = Layer.succeed(SkillStateService, mockState);

      const args = createParsedArgs({
        flags: { agent: "claude_code", y: true },
      });

      const program = skillsInit(args).pipe(Effect.provide(TestLayer));

      await Effect.runPromise(program);

      // Check that content is unchanged
      const file = Bun.file(join(testDir, ".claude", "CLAUDE.md"));
      const content = await file.text();
      expect(content).toBe(existingContent);
    });
  });
});
