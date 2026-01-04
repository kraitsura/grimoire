/**
 * Error Types Tests
 *
 * Tests for all domain error types across the Grimoire codebase:
 * - Base errors (errors.ts)
 * - Worktree errors (worktree-errors.ts)
 * - Skill errors (skill-errors.ts)
 * - Agent errors (agent-errors.ts)
 */

import { describe, it, expect } from "bun:test";
import { Effect, Exit, Cause, Option } from "effect";

// Base errors
import {
  StorageError,
  ClipboardError,
  PromptNotFoundError,
  ValidationError,
  EditorError,
  SqlError,
  ConfigError,
  DuplicateNameError,
  RateLimitError,
  StashItemNotFoundError,
  StashEmptyError,
  ScoutError,
} from "../../src/models/errors";

// Worktree errors
import {
  WorktreeError,
  WorktreeNotFoundError,
  WorktreeAlreadyExistsError,
  BranchNotFoundError,
  GitOperationError,
  WorktreeDirtyError,
  HookExecutionError,
  WorktreeStateReadError,
  WorktreeStateWriteError,
  WorktreeConfigReadError,
  NotInGitRepoError,
  ProtectedBranchError,
  FileCopyError,
} from "../../src/models/worktree-errors";

// Skill errors
import {
  SkillNotFoundError,
  SkillNotCachedError,
  SkillAlreadyEnabledError,
  SkillNotEnabledError,
  SkillManifestError,
  SkillSourceError,
  ProjectNotInitializedError,
  AgentNotDetectedError,
  CliDependencyError,
  PluginInstallError,
  InjectionError,
  PluginDetectedError,
  EmptyRepoError,
  SkillMdFrontmatterError,
  SkillValidationError,
  type ValidationIssue,
  type ValidationResult,
} from "../../src/models/skill-errors";

// Agent errors
import {
  AgentNotFoundError,
  AgentNotCachedError,
  AgentAlreadyEnabledError,
  AgentNotEnabledError,
  AgentDefinitionError,
  AgentSourceError,
  AgentProjectNotInitializedError,
  AgentPlatformNotDetectedError,
  AgentTranspileError,
  AgentWriteError,
  AgentValidationError,
  CliWrapError,
  type AgentValidationIssue,
  type AgentValidationResult,
} from "../../src/models/agent-errors";

// ============================================================================
// Base Errors Tests
// ============================================================================

describe("Base Errors", () => {
  describe("StorageError", () => {
    it("should create StorageError with message", () => {
      const error = new StorageError({ message: "Failed to read file" });

      expect(error._tag).toBe("StorageError");
      expect(error.message).toBe("Failed to read file");
      expect(error.cause).toBeUndefined();
    });

    it("should create StorageError with cause", () => {
      const cause = new Error("ENOENT");
      const error = new StorageError({
        message: "Failed to read file",
        cause,
      });

      expect(error.cause).toBe(cause);
    });

    it("should be usable in Effect error channel", async () => {
      const program = Effect.fail(
        new StorageError({ message: "Test error" })
      );

      const exit = await Effect.runPromiseExit(program);

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value._tag).toBe("StorageError");
        }
      }
    });
  });

  describe("ClipboardError", () => {
    it("should create ClipboardError", () => {
      const error = new ClipboardError({ message: "Clipboard unavailable" });

      expect(error._tag).toBe("ClipboardError");
      expect(error.message).toBe("Clipboard unavailable");
    });
  });

  describe("PromptNotFoundError", () => {
    it("should create PromptNotFoundError with id", () => {
      const error = new PromptNotFoundError({ id: "abc123" });

      expect(error._tag).toBe("PromptNotFoundError");
      expect(error.id).toBe("abc123");
    });
  });

  describe("ValidationError", () => {
    it("should create ValidationError with field and message", () => {
      const error = new ValidationError({
        field: "name",
        message: "Name is required",
      });

      expect(error._tag).toBe("ValidationError");
      expect(error.field).toBe("name");
      expect(error.message).toBe("Name is required");
    });
  });

  describe("EditorError", () => {
    it("should create EditorError", () => {
      const error = new EditorError({ message: "Editor not found" });

      expect(error._tag).toBe("EditorError");
      expect(error.message).toBe("Editor not found");
    });
  });

  describe("SqlError", () => {
    it("should create SqlError with query", () => {
      const error = new SqlError({
        message: "Syntax error",
        query: "SELECT * FORM users",
      });

      expect(error._tag).toBe("SqlError");
      expect(error.query).toBe("SELECT * FORM users");
    });
  });

  describe("ConfigError", () => {
    it("should create ConfigError with key", () => {
      const error = new ConfigError({
        message: "Invalid config",
        key: "storage.path",
      });

      expect(error._tag).toBe("ConfigError");
      expect(error.key).toBe("storage.path");
    });
  });

  describe("DuplicateNameError", () => {
    it("should create DuplicateNameError", () => {
      const error = new DuplicateNameError({ name: "My Prompt" });

      expect(error._tag).toBe("DuplicateNameError");
      expect(error.name).toBe("My Prompt");
    });
  });

  describe("RateLimitError", () => {
    it("should create RateLimitError with retryAfter", () => {
      const retryDate = new Date("2025-01-01T12:00:00.000Z");
      const error = new RateLimitError({
        provider: "openai",
        message: "Rate limit exceeded",
        retryAfter: retryDate,
      });

      expect(error._tag).toBe("RateLimitError");
      expect(error.provider).toBe("openai");
      expect(error.retryAfter).toBe(retryDate);
    });

    it("should create RateLimitError without retryAfter", () => {
      const error = new RateLimitError({
        provider: "anthropic",
        message: "Too many requests",
      });

      expect(error.retryAfter).toBeUndefined();
    });
  });

  describe("StashItemNotFoundError", () => {
    it("should create StashItemNotFoundError", () => {
      const error = new StashItemNotFoundError({ identifier: "my-stash" });

      expect(error._tag).toBe("StashItemNotFoundError");
      expect(error.identifier).toBe("my-stash");
    });
  });

  describe("StashEmptyError", () => {
    it("should create StashEmptyError", () => {
      const error = new StashEmptyError({ message: "Stash is empty" });

      expect(error._tag).toBe("StashEmptyError");
      expect(error.message).toBe("Stash is empty");
    });
  });

  describe("ScoutError", () => {
    it("should create ScoutError", () => {
      const error = new ScoutError({ message: "Scout failed" });

      expect(error._tag).toBe("ScoutError");
      expect(error.message).toBe("Scout failed");
    });
  });
});

// ============================================================================
// Worktree Errors Tests
// ============================================================================

describe("Worktree Errors", () => {
  describe("WorktreeError", () => {
    it("should create generic WorktreeError", () => {
      const error = new WorktreeError({ message: "Worktree operation failed" });

      expect(error._tag).toBe("WorktreeError");
      expect(error.message).toBe("Worktree operation failed");
    });
  });

  describe("WorktreeNotFoundError", () => {
    it("should create error with name and message getter", () => {
      const error = new WorktreeNotFoundError({ name: "feature-branch" });

      expect(error._tag).toBe("WorktreeNotFoundError");
      expect(error.name).toBe("feature-branch");
      expect(error.message).toBe("Worktree 'feature-branch' not found");
    });
  });

  describe("WorktreeAlreadyExistsError", () => {
    it("should create error with name and branch", () => {
      const error = new WorktreeAlreadyExistsError({
        name: "my-wt",
        branch: "feature/test",
      });

      expect(error._tag).toBe("WorktreeAlreadyExistsError");
      expect(error.name).toBe("my-wt");
      expect(error.branch).toBe("feature/test");
      expect(error.message).toBe(
        "Worktree 'my-wt' already exists for branch 'feature/test'"
      );
    });
  });

  describe("BranchNotFoundError", () => {
    it("should create error with branch name", () => {
      const error = new BranchNotFoundError({ branch: "missing-branch" });

      expect(error._tag).toBe("BranchNotFoundError");
      expect(error.branch).toBe("missing-branch");
      expect(error.message).toBe("Branch 'missing-branch' not found");
    });
  });

  describe("GitOperationError", () => {
    it("should create error with command details", () => {
      const error = new GitOperationError({
        command: "git checkout -b new-branch",
        stderr: "fatal: A branch named 'new-branch' already exists",
        exitCode: 128,
      });

      expect(error._tag).toBe("GitOperationError");
      expect(error.command).toBe("git checkout -b new-branch");
      expect(error.stderr).toContain("already exists");
      expect(error.exitCode).toBe(128);
      expect(error.message).toContain("exit 128");
      expect(error.message).toContain("git checkout");
    });
  });

  describe("WorktreeDirtyError", () => {
    it("should create error with uncommitted changes count", () => {
      const error = new WorktreeDirtyError({
        name: "dirty-wt",
        uncommittedChanges: 5,
      });

      expect(error._tag).toBe("WorktreeDirtyError");
      expect(error.name).toBe("dirty-wt");
      expect(error.uncommittedChanges).toBe(5);
      expect(error.message).toContain("5 uncommitted changes");
      expect(error.message).toContain("--force");
    });
  });

  describe("HookExecutionError", () => {
    it("should create error with hook name and exit code", () => {
      const error = new HookExecutionError({
        hook: "bun install",
        stderr: "Package not found",
        exitCode: 1,
      });

      expect(error._tag).toBe("HookExecutionError");
      expect(error.hook).toBe("bun install");
      expect(error.message).toContain("Hook 'bun install' failed");
      expect(error.message).toContain("exit 1");
    });

    it("should handle missing exit code", () => {
      const error = new HookExecutionError({
        hook: "test-hook",
        stderr: "Error occurred",
      });

      expect(error.exitCode).toBeUndefined();
      expect(error.message).not.toContain("exit");
    });
  });

  describe("WorktreeStateReadError", () => {
    it("should create state read error", () => {
      const error = new WorktreeStateReadError({
        message: "Could not parse state file",
      });

      expect(error._tag).toBe("WorktreeStateReadError");
      expect(error.message).toBe("Could not parse state file");
    });
  });

  describe("WorktreeStateWriteError", () => {
    it("should create state write error", () => {
      const error = new WorktreeStateWriteError({
        message: "Permission denied",
      });

      expect(error._tag).toBe("WorktreeStateWriteError");
      expect(error.message).toBe("Permission denied");
    });
  });

  describe("WorktreeConfigReadError", () => {
    it("should create config read error with path", () => {
      const error = new WorktreeConfigReadError({
        message: "Invalid YAML",
        path: "/path/to/.grimoire.yaml",
      });

      expect(error._tag).toBe("WorktreeConfigReadError");
      expect(error.path).toBe("/path/to/.grimoire.yaml");
    });
  });

  describe("NotInGitRepoError", () => {
    it("should create not in repo error", () => {
      const error = new NotInGitRepoError({ path: "/some/path" });

      expect(error._tag).toBe("NotInGitRepoError");
      expect(error.path).toBe("/some/path");
      expect(error.message).toBe("Not in a git repository: /some/path");
    });
  });

  describe("ProtectedBranchError", () => {
    it("should create protected branch error", () => {
      const error = new ProtectedBranchError({ branch: "main" });

      expect(error._tag).toBe("ProtectedBranchError");
      expect(error.branch).toBe("main");
      expect(error.message).toBe("Cannot delete protected branch 'main'");
    });
  });

  describe("FileCopyError", () => {
    it("should create file copy error with cause", () => {
      const error = new FileCopyError({
        source: "/src/.env",
        destination: "/dest/.env",
        cause: "Permission denied",
      });

      expect(error._tag).toBe("FileCopyError");
      expect(error.source).toBe("/src/.env");
      expect(error.destination).toBe("/dest/.env");
      expect(error.message).toContain("Permission denied");
    });

    it("should handle missing cause", () => {
      const error = new FileCopyError({
        source: "/a",
        destination: "/b",
      });

      expect(error.message).toBe("Failed to copy '/a' to '/b'");
    });
  });
});

// ============================================================================
// Skill Errors Tests
// ============================================================================

describe("Skill Errors", () => {
  describe("SkillNotFoundError", () => {
    it("should create error with suggestion", () => {
      const error = new SkillNotFoundError({
        name: "bead",
        suggestion: "beads",
      });

      expect(error._tag).toBe("SkillNotFoundError");
      expect(error.name).toBe("bead");
      expect(error.suggestion).toBe("beads");
    });

    it("should create error without suggestion", () => {
      const error = new SkillNotFoundError({ name: "unknown" });

      expect(error.suggestion).toBeUndefined();
    });
  });

  describe("SkillNotCachedError", () => {
    it("should create error", () => {
      const error = new SkillNotCachedError({ name: "my-skill" });

      expect(error._tag).toBe("SkillNotCachedError");
      expect(error.name).toBe("my-skill");
    });
  });

  describe("SkillAlreadyEnabledError", () => {
    it("should create error", () => {
      const error = new SkillAlreadyEnabledError({ name: "beads" });

      expect(error._tag).toBe("SkillAlreadyEnabledError");
      expect(error.name).toBe("beads");
    });
  });

  describe("SkillNotEnabledError", () => {
    it("should create error", () => {
      const error = new SkillNotEnabledError({ name: "typescript" });

      expect(error._tag).toBe("SkillNotEnabledError");
      expect(error.name).toBe("typescript");
    });
  });

  describe("SkillManifestError", () => {
    it("should create error with path", () => {
      const error = new SkillManifestError({
        name: "bad-skill",
        message: "Missing description field",
        path: "/path/to/skill.yaml",
      });

      expect(error._tag).toBe("SkillManifestError");
      expect(error.name).toBe("bad-skill");
      expect(error.message).toBe("Missing description field");
      expect(error.path).toBe("/path/to/skill.yaml");
    });
  });

  describe("SkillSourceError", () => {
    it("should create error with cause", () => {
      const cause = new Error("Network error");
      const error = new SkillSourceError({
        source: "github:user/skill",
        message: "Failed to fetch",
        cause,
      });

      expect(error._tag).toBe("SkillSourceError");
      expect(error.source).toBe("github:user/skill");
      expect(error.cause).toBe(cause);
    });
  });

  describe("ProjectNotInitializedError", () => {
    it("should create error", () => {
      const error = new ProjectNotInitializedError({ path: "/project" });

      expect(error._tag).toBe("ProjectNotInitializedError");
      expect(error.path).toBe("/project");
    });
  });

  describe("AgentNotDetectedError", () => {
    it("should create error", () => {
      const error = new AgentNotDetectedError({ path: "/project" });

      expect(error._tag).toBe("AgentNotDetectedError");
      expect(error.path).toBe("/project");
    });
  });

  describe("CliDependencyError", () => {
    it("should create error", () => {
      const error = new CliDependencyError({
        binary: "git",
        message: "git not found in PATH",
      });

      expect(error._tag).toBe("CliDependencyError");
      expect(error.binary).toBe("git");
    });
  });

  describe("PluginInstallError", () => {
    it("should create error", () => {
      const error = new PluginInstallError({
        plugin: "beads",
        message: "Installation failed",
      });

      expect(error._tag).toBe("PluginInstallError");
      expect(error.plugin).toBe("beads");
    });
  });

  describe("InjectionError", () => {
    it("should create error", () => {
      const error = new InjectionError({
        file: "CLAUDE.md",
        message: "Could not find injection markers",
      });

      expect(error._tag).toBe("InjectionError");
      expect(error.file).toBe("CLAUDE.md");
    });
  });

  describe("PluginDetectedError", () => {
    it("should create error", () => {
      const error = new PluginDetectedError({
        source: "github:user/plugin",
        pluginPath: ".claude-plugin/plugin.json",
      });

      expect(error._tag).toBe("PluginDetectedError");
      expect(error.source).toBe("github:user/plugin");
      expect(error.pluginPath).toBe(".claude-plugin/plugin.json");
    });
  });

  describe("EmptyRepoError", () => {
    it("should create error", () => {
      const error = new EmptyRepoError({ source: "github:user/empty" });

      expect(error._tag).toBe("EmptyRepoError");
      expect(error.source).toBe("github:user/empty");
    });
  });

  describe("SkillMdFrontmatterError", () => {
    it("should create error", () => {
      const error = new SkillMdFrontmatterError({
        path: "/skill/SKILL.md",
        message: "Missing name field in frontmatter",
      });

      expect(error._tag).toBe("SkillMdFrontmatterError");
      expect(error.path).toBe("/skill/SKILL.md");
    });
  });

  describe("SkillValidationError", () => {
    it("should create error with validation result", () => {
      const result: ValidationResult = {
        valid: false,
        issues: [
          {
            field: "name",
            message: "Name too long",
            severity: "error",
            value: "very-long-name-that-exceeds-limit",
          },
          {
            field: "description",
            message: "Description could be more specific",
            severity: "warning",
          },
        ],
        errors: [
          {
            field: "name",
            message: "Name too long",
            severity: "error",
            value: "very-long-name-that-exceeds-limit",
          },
        ],
        warnings: [
          {
            field: "description",
            message: "Description could be more specific",
            severity: "warning",
          },
        ],
      };

      const error = new SkillValidationError({
        name: "bad-skill",
        result,
      });

      expect(error._tag).toBe("SkillValidationError");
      expect(error.name).toBe("bad-skill");
      expect(error.result.valid).toBe(false);
      expect(error.result.errors).toHaveLength(1);
      expect(error.result.warnings).toHaveLength(1);
    });
  });
});

// ============================================================================
// Agent Errors Tests
// ============================================================================

describe("Agent Errors", () => {
  describe("AgentNotFoundError", () => {
    it("should create error with suggestion", () => {
      const error = new AgentNotFoundError({
        name: "git-helpr",
        suggestion: "git-helper",
      });

      expect(error._tag).toBe("AgentNotFoundError");
      expect(error.name).toBe("git-helpr");
      expect(error.suggestion).toBe("git-helper");
    });
  });

  describe("AgentNotCachedError", () => {
    it("should create error", () => {
      const error = new AgentNotCachedError({ name: "my-agent" });

      expect(error._tag).toBe("AgentNotCachedError");
      expect(error.name).toBe("my-agent");
    });
  });

  describe("AgentAlreadyEnabledError", () => {
    it("should create error with platform", () => {
      const error = new AgentAlreadyEnabledError({
        name: "dev-agent",
        platform: "claude_code",
      });

      expect(error._tag).toBe("AgentAlreadyEnabledError");
      expect(error.name).toBe("dev-agent");
      expect(error.platform).toBe("claude_code");
    });
  });

  describe("AgentNotEnabledError", () => {
    it("should create error", () => {
      const error = new AgentNotEnabledError({ name: "disabled-agent" });

      expect(error._tag).toBe("AgentNotEnabledError");
      expect(error.name).toBe("disabled-agent");
    });
  });

  describe("AgentDefinitionError", () => {
    it("should create error with path", () => {
      const error = new AgentDefinitionError({
        name: "broken-agent",
        message: "Invalid YAML frontmatter",
        path: "/path/to/agent.md",
      });

      expect(error._tag).toBe("AgentDefinitionError");
      expect(error.name).toBe("broken-agent");
      expect(error.message).toBe("Invalid YAML frontmatter");
      expect(error.path).toBe("/path/to/agent.md");
    });
  });

  describe("AgentSourceError", () => {
    it("should create error with cause", () => {
      const cause = new Error("404 Not Found");
      const error = new AgentSourceError({
        source: "github:user/agent",
        message: "Could not fetch agent",
        cause,
      });

      expect(error._tag).toBe("AgentSourceError");
      expect(error.source).toBe("github:user/agent");
      expect(error.cause).toBe(cause);
    });
  });

  describe("AgentProjectNotInitializedError", () => {
    it("should create error", () => {
      const error = new AgentProjectNotInitializedError({
        path: "/my/project",
      });

      expect(error._tag).toBe("AgentProjectNotInitializedError");
      expect(error.path).toBe("/my/project");
    });
  });

  describe("AgentPlatformNotDetectedError", () => {
    it("should create error with hint", () => {
      const error = new AgentPlatformNotDetectedError({
        path: "/project",
        hint: "Try running 'grimoire agents init' first",
      });

      expect(error._tag).toBe("AgentPlatformNotDetectedError");
      expect(error.path).toBe("/project");
      expect(error.hint).toBe("Try running 'grimoire agents init' first");
    });
  });

  describe("AgentTranspileError", () => {
    it("should create error", () => {
      const error = new AgentTranspileError({
        name: "test-agent",
        platform: "cursor",
        message: "Cursor does not support this feature",
      });

      expect(error._tag).toBe("AgentTranspileError");
      expect(error.name).toBe("test-agent");
      expect(error.platform).toBe("cursor");
    });
  });

  describe("AgentWriteError", () => {
    it("should create error", () => {
      const error = new AgentWriteError({
        name: "write-agent",
        path: "/path/to/agent.md",
        message: "Permission denied",
      });

      expect(error._tag).toBe("AgentWriteError");
      expect(error.name).toBe("write-agent");
      expect(error.path).toBe("/path/to/agent.md");
    });
  });

  describe("AgentValidationError", () => {
    it("should create error with validation result", () => {
      const result: AgentValidationResult = {
        valid: false,
        issues: [
          {
            field: "description",
            message: "Description is empty",
            severity: "error",
          },
        ],
        errors: [
          {
            field: "description",
            message: "Description is empty",
            severity: "error",
          },
        ],
        warnings: [],
      };

      const error = new AgentValidationError({
        name: "invalid-agent",
        result,
      });

      expect(error._tag).toBe("AgentValidationError");
      expect(error.name).toBe("invalid-agent");
      expect(error.result.errors).toHaveLength(1);
    });
  });

  describe("CliWrapError", () => {
    it("should create error", () => {
      const error = new CliWrapError({
        cliTool: "docker",
        message: "Docker is not running",
      });

      expect(error._tag).toBe("CliWrapError");
      expect(error.cliTool).toBe("docker");
      expect(error.message).toBe("Docker is not running");
    });
  });
});

// ============================================================================
// Error Pattern Tests
// ============================================================================

describe("Error Patterns", () => {
  it("errors should be matchable by _tag", async () => {
    type AppError =
      | StorageError
      | PromptNotFoundError
      | ValidationError;

    const handleError = (error: AppError): string => {
      switch (error._tag) {
        case "StorageError":
          return `Storage: ${error.message}`;
        case "PromptNotFoundError":
          return `Not found: ${error.id}`;
        case "ValidationError":
          return `Validation: ${error.field} - ${error.message}`;
      }
    };

    const storageResult = handleError(
      new StorageError({ message: "File not found" })
    );
    expect(storageResult).toBe("Storage: File not found");

    const notFoundResult = handleError(
      new PromptNotFoundError({ id: "test-id" })
    );
    expect(notFoundResult).toBe("Not found: test-id");

    const validationResult = handleError(
      new ValidationError({ field: "name", message: "Required" })
    );
    expect(validationResult).toBe("Validation: name - Required");
  });

  it("errors should work with Effect.catchTag", async () => {
    const program = Effect.gen(function* () {
      yield* Effect.fail(new PromptNotFoundError({ id: "missing" }));
      return "success";
    });

    const handled = program.pipe(
      Effect.catchTag("PromptNotFoundError", (error) =>
        Effect.succeed(`Handled: ${error.id}`)
      )
    );

    const result = await Effect.runPromise(handled);
    expect(result).toBe("Handled: missing");
  });

  it("errors should work with Effect.catchAll", async () => {
    type MyError = StorageError | ValidationError;

    const program: Effect.Effect<string, MyError> = Effect.fail(
      new StorageError({ message: "Oops" })
    );

    const handled = program.pipe(
      Effect.catchAll((error) => Effect.succeed(`Error: ${error._tag}`))
    );

    const result = await Effect.runPromise(handled);
    expect(result).toBe("Error: StorageError");
  });
});
