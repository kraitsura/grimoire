/**
 * Worktree Model Schema Tests
 *
 * Tests for worktree domain types and schemas including:
 * - WorktreeConfigSchema
 * - WorktreeMetadataSchema
 * - WorktreeInfoSchema
 * - WorktreeStatusSchema
 * - WorktreeEntrySchema
 * - WorktreeStateSchema
 * - Utility functions
 */

import { describe, it, expect } from "bun:test";
import { Schema } from "@effect/schema";
import { Effect } from "effect";
import {
  WorktreeConfigSchema,
  WorktreeMetadataSchema,
  WorktreeInfoSchema,
  WorktreeStatusSchema,
  WorktreeListItemSchema,
  WorktreeLogSchema,
  WorktreeCheckpointSchema,
  StageTransitionSchema,
  WorktreeStageSchema,
  MergeStatusSchema,
  WorktreeEntrySchema,
  WorktreeStateSchema,
  IssueProviderSchema,
  WorktreeLogTypeSchema,
  DEFAULT_WORKTREE_CONFIG,
  DEFAULT_WORKTREE_STATE,
  PROTECTED_BRANCHES,
  sanitizeBranchName,
  isProtectedBranch,
  getWorktreeInfoPath,
  WORKTREE_METADATA_DIR,
  WORKTREE_INFO_FILE,
  type WorktreeConfig,
  type WorktreeMetadata,
  type WorktreeInfo,
  type WorktreeStatus,
  type WorktreeListItem,
  type WorktreeEntry,
  type WorktreeState,
} from "../../src/models/worktree";

describe("WorktreeConfigSchema", () => {
  it("should validate empty config (all optional)", () => {
    const decode = Schema.decodeUnknownSync(WorktreeConfigSchema);
    const result = decode({});

    expect(result.basePath).toBeUndefined();
    expect(result.copyPatterns).toBeUndefined();
    expect(result.postCreateHooks).toBeUndefined();
    expect(result.copyDependencies).toBeUndefined();
    expect(result.issuePrefix).toBeUndefined();
  });

  it("should validate full config", () => {
    const config = {
      basePath: ".worktrees",
      copyPatterns: [".env*", ".tool-versions"],
      postCreateHooks: ["bun install"],
      copyDependencies: false,
      issuePrefix: "GRIM-",
    };

    const decode = Schema.decodeUnknownSync(WorktreeConfigSchema);
    const result = decode(config);

    expect(result.basePath).toBe(config.basePath);
    expect(result.copyPatterns).toEqual(config.copyPatterns);
    expect(result.postCreateHooks).toEqual(config.postCreateHooks);
    expect(result.copyDependencies).toBe(false);
    expect(result.issuePrefix).toBe("GRIM-");
  });

  it("should fail on empty basePath", () => {
    const decode = Schema.decodeUnknownSync(WorktreeConfigSchema);

    expect(() => decode({ basePath: "" })).toThrow();
  });
});

describe("WorktreeMetadataSchema", () => {
  it("should validate minimal metadata", () => {
    const metadata = {
      name: "feature-branch",
      branch: "feature/new-thing",
      createdAt: "2025-01-01T00:00:00.000Z",
      parentRepo: "/home/user/project",
    };

    const decode = Schema.decodeUnknownSync(WorktreeMetadataSchema);
    const result = decode(metadata);

    expect(result.name).toBe(metadata.name);
    expect(result.branch).toBe(metadata.branch);
    expect(result.createdAt).toBe(metadata.createdAt);
    expect(result.parentRepo).toBe(metadata.parentRepo);
    expect(result.linkedIssue).toBeUndefined();
    expect(result.createdBy).toBeUndefined();
    expect(result.sessionId).toBeUndefined();
  });

  it("should validate full metadata", () => {
    const metadata = {
      name: "feature-branch",
      branch: "feature/new-thing",
      createdAt: "2025-01-01T00:00:00.000Z",
      parentRepo: "/home/user/project",
      linkedIssue: "GRIM-123",
      createdBy: "agent" as const,
      sessionId: "session-abc123",
    };

    const decode = Schema.decodeUnknownSync(WorktreeMetadataSchema);
    const result = decode(metadata);

    expect(result.linkedIssue).toBe("GRIM-123");
    expect(result.createdBy).toBe("agent");
    expect(result.sessionId).toBe("session-abc123");
  });

  it("should fail on invalid createdBy value", () => {
    const decode = Schema.decodeUnknownSync(WorktreeMetadataSchema);

    expect(() =>
      decode({
        name: "test",
        branch: "test",
        createdAt: "2025-01-01T00:00:00.000Z",
        parentRepo: "/test",
        createdBy: "invalid",
      })
    ).toThrow();
  });

  it("should fail on empty name", () => {
    const decode = Schema.decodeUnknownSync(WorktreeMetadataSchema);

    expect(() =>
      decode({
        name: "",
        branch: "test",
        createdAt: "2025-01-01T00:00:00.000Z",
        parentRepo: "/test",
      })
    ).toThrow();
  });

  it("should fail on empty branch", () => {
    const decode = Schema.decodeUnknownSync(WorktreeMetadataSchema);

    expect(() =>
      decode({
        name: "test",
        branch: "",
        createdAt: "2025-01-01T00:00:00.000Z",
        parentRepo: "/test",
      })
    ).toThrow();
  });
});

describe("WorktreeInfoSchema", () => {
  it("should validate minimal worktree info", () => {
    const info = {
      name: "my-worktree",
      branch: "feature/test",
      path: "/home/user/project/.worktrees/my-worktree",
      createdAt: "2025-01-01T00:00:00.000Z",
    };

    const decode = Schema.decodeUnknownSync(WorktreeInfoSchema);
    const result = decode(info);

    expect(result.name).toBe(info.name);
    expect(result.branch).toBe(info.branch);
    expect(result.path).toBe(info.path);
  });

  it("should validate with optional metadata", () => {
    const info = {
      name: "my-worktree",
      branch: "feature/test",
      path: "/home/user/project/.worktrees/my-worktree",
      createdAt: "2025-01-01T00:00:00.000Z",
      linkedIssue: "GRIM-456",
      metadata: {
        createdBy: "user" as const,
        sessionId: "sess-xyz",
      },
    };

    const decode = Schema.decodeUnknownSync(WorktreeInfoSchema);
    const result = decode(info);

    expect(result.linkedIssue).toBe("GRIM-456");
    expect(result.metadata?.createdBy).toBe("user");
    expect(result.metadata?.sessionId).toBe("sess-xyz");
  });
});

describe("WorktreeStatusSchema", () => {
  it("should validate 'active' status", () => {
    const decode = Schema.decodeUnknownSync(WorktreeStatusSchema);
    expect(decode("active")).toBe("active");
  });

  it("should validate 'stale' status", () => {
    const decode = Schema.decodeUnknownSync(WorktreeStatusSchema);
    expect(decode("stale")).toBe("stale");
  });

  it("should validate 'orphaned' status", () => {
    const decode = Schema.decodeUnknownSync(WorktreeStatusSchema);
    expect(decode("orphaned")).toBe("orphaned");
  });

  it("should fail on invalid status", () => {
    const decode = Schema.decodeUnknownSync(WorktreeStatusSchema);
    expect(() => decode("invalid")).toThrow();
  });
});

describe("WorktreeListItemSchema", () => {
  it("should validate list item with status", () => {
    const item = {
      name: "feature",
      branch: "feature/test",
      path: "/path/to/worktree",
      createdAt: "2025-01-01T00:00:00.000Z",
      status: "active",
    };

    const decode = Schema.decodeUnknownSync(WorktreeListItemSchema);
    const result = decode(item);

    expect(result.status).toBe("active");
  });

  it("should validate with uncommitted changes count", () => {
    const item = {
      name: "feature",
      branch: "feature/test",
      path: "/path/to/worktree",
      createdAt: "2025-01-01T00:00:00.000Z",
      status: "active",
      uncommittedChanges: 5,
      unpushedCommits: 2,
      managed: true,
    };

    const decode = Schema.decodeUnknownSync(WorktreeListItemSchema);
    const result = decode(item);

    expect(result.uncommittedChanges).toBe(5);
    expect(result.unpushedCommits).toBe(2);
    expect(result.managed).toBe(true);
  });
});

describe("IssueProviderSchema", () => {
  it("should validate all provider types", () => {
    const decode = Schema.decodeUnknownSync(IssueProviderSchema);

    expect(decode("beads")).toBe("beads");
    expect(decode("github")).toBe("github");
    expect(decode("linear")).toBe("linear");
    expect(decode("jira")).toBe("jira");
    expect(decode("none")).toBe("none");
  });

  it("should fail on invalid provider", () => {
    const decode = Schema.decodeUnknownSync(IssueProviderSchema);
    expect(() => decode("unknown")).toThrow();
  });
});

describe("WorktreeLogTypeSchema", () => {
  it("should validate all log types", () => {
    const decode = Schema.decodeUnknownSync(WorktreeLogTypeSchema);

    expect(decode("log")).toBe("log");
    expect(decode("handoff")).toBe("handoff");
    expect(decode("interrupt")).toBe("interrupt");
  });
});

describe("WorktreeLogSchema", () => {
  it("should validate minimal log entry", () => {
    const log = {
      time: "2025-01-01T12:00:00.000Z",
      message: "Started working on feature",
    };

    const decode = Schema.decodeUnknownSync(WorktreeLogSchema);
    const result = decode(log);

    expect(result.time).toBe(log.time);
    expect(result.message).toBe(log.message);
  });

  it("should validate full log entry with metadata", () => {
    const log = {
      time: "2025-01-01T12:00:00.000Z",
      message: "Handing off to review",
      author: "agent-123",
      type: "handoff" as const,
      metadata: {
        nextStage: "review",
      },
    };

    const decode = Schema.decodeUnknownSync(WorktreeLogSchema);
    const result = decode(log);

    expect(result.type).toBe("handoff");
    expect(result.metadata?.nextStage).toBe("review");
  });

  it("should validate interrupt log with reason", () => {
    const log = {
      time: "2025-01-01T12:00:00.000Z",
      message: "Session interrupted",
      type: "interrupt" as const,
      metadata: {
        reason: "timeout",
      },
    };

    const decode = Schema.decodeUnknownSync(WorktreeLogSchema);
    const result = decode(log);

    expect(result.metadata?.reason).toBe("timeout");
  });
});

describe("WorktreeCheckpointSchema", () => {
  it("should validate checkpoint", () => {
    const checkpoint = {
      hash: "abc123def456",
      message: "Implemented feature X",
      time: "2025-01-01T12:00:00.000Z",
    };

    const decode = Schema.decodeUnknownSync(WorktreeCheckpointSchema);
    const result = decode(checkpoint);

    expect(result.hash).toBe(checkpoint.hash);
    expect(result.message).toBe(checkpoint.message);
    expect(result.author).toBeUndefined();
  });

  it("should validate checkpoint with author", () => {
    const checkpoint = {
      hash: "abc123",
      message: "Update",
      time: "2025-01-01T12:00:00.000Z",
      author: "agent-xyz",
    };

    const decode = Schema.decodeUnknownSync(WorktreeCheckpointSchema);
    const result = decode(checkpoint);

    expect(result.author).toBe("agent-xyz");
  });
});

describe("StageTransitionSchema", () => {
  it("should validate stage transition", () => {
    const transition = {
      from: "plan",
      to: "implement",
      time: "2025-01-01T12:00:00.000Z",
    };

    const decode = Schema.decodeUnknownSync(StageTransitionSchema);
    const result = decode(transition);

    expect(result.from).toBe("plan");
    expect(result.to).toBe("implement");
    expect(result.agent).toBeUndefined();
  });

  it("should validate with agent", () => {
    const transition = {
      from: "implement",
      to: "test",
      time: "2025-01-01T12:00:00.000Z",
      agent: "agent-abc",
    };

    const decode = Schema.decodeUnknownSync(StageTransitionSchema);
    const result = decode(transition);

    expect(result.agent).toBe("agent-abc");
  });
});

describe("WorktreeStageSchema", () => {
  it("should validate all pipeline stages", () => {
    const decode = Schema.decodeUnknownSync(WorktreeStageSchema);

    expect(decode("plan")).toBe("plan");
    expect(decode("implement")).toBe("implement");
    expect(decode("test")).toBe("test");
    expect(decode("review")).toBe("review");
  });

  it("should fail on invalid stage", () => {
    const decode = Schema.decodeUnknownSync(WorktreeStageSchema);
    expect(() => decode("deploy")).toThrow();
  });
});

describe("MergeStatusSchema", () => {
  it("should validate all merge statuses", () => {
    const decode = Schema.decodeUnknownSync(MergeStatusSchema);

    expect(decode("pending")).toBe("pending");
    expect(decode("ready")).toBe("ready");
    expect(decode("merged")).toBe("merged");
    expect(decode("conflict")).toBe("conflict");
    expect(decode("abandoned")).toBe("abandoned");
  });
});

describe("WorktreeEntrySchema", () => {
  it("should validate minimal entry", () => {
    const entry = {
      name: "my-worktree",
      branch: "feature/test",
      createdAt: "2025-01-01T00:00:00.000Z",
    };

    const decode = Schema.decodeUnknownSync(WorktreeEntrySchema);
    const result = decode(entry);

    expect(result.name).toBe(entry.name);
    expect(result.branch).toBe(entry.branch);
    expect(result.createdAt).toBe(entry.createdAt);
  });

  it("should validate full entry with all optional fields", () => {
    const entry = {
      name: "my-worktree",
      branch: "feature/test",
      createdAt: "2025-01-01T00:00:00.000Z",
      linkedIssue: "GRIM-100",
      metadata: {
        createdBy: "agent" as const,
        sessionId: "sess-123",
      },
      issueProvider: "beads" as const,
      logs: [
        { time: "2025-01-01T12:00:00.000Z", message: "Started" },
      ],
      checkpoints: [
        { hash: "abc", message: "Initial", time: "2025-01-01T12:00:00.000Z" },
      ],
      claimedBy: "agent-abc",
      claimedAt: "2025-01-01T12:00:00.000Z",
      claimExpiresAt: "2025-01-01T13:00:00.000Z",
      parentWorktree: "parent-wt",
      isExperiment: true,
      currentStage: "implement" as const,
      stageHistory: [
        { from: "plan", to: "implement", time: "2025-01-01T12:00:00.000Z" },
      ],
      parentSession: "parent-sess",
      childWorktrees: ["child-1", "child-2"],
      spawnedAt: "2025-01-01T11:00:00.000Z",
      completedAt: "2025-01-01T14:00:00.000Z",
      mergeStatus: "merged" as const,
    };

    const decode = Schema.decodeUnknownSync(WorktreeEntrySchema);
    const result = decode(entry);

    expect(result.linkedIssue).toBe("GRIM-100");
    expect(result.issueProvider).toBe("beads");
    expect(result.logs).toHaveLength(1);
    expect(result.checkpoints).toHaveLength(1);
    expect(result.claimedBy).toBe("agent-abc");
    expect(result.isExperiment).toBe(true);
    expect(result.currentStage).toBe("implement");
    expect(result.childWorktrees).toEqual(["child-1", "child-2"]);
    expect(result.mergeStatus).toBe("merged");
  });
});

describe("WorktreeStateSchema", () => {
  it("should validate empty state", () => {
    const state = {
      version: 2 as const,
      worktrees: [],
    };

    const decode = Schema.decodeUnknownSync(WorktreeStateSchema);
    const result = decode(state);

    expect(result.version).toBe(2);
    expect(result.worktrees).toEqual([]);
  });

  it("should validate state with worktrees", () => {
    const state = {
      version: 2 as const,
      worktrees: [
        {
          name: "wt1",
          branch: "feature/one",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
        {
          name: "wt2",
          branch: "feature/two",
          createdAt: "2025-01-02T00:00:00.000Z",
        },
      ],
    };

    const decode = Schema.decodeUnknownSync(WorktreeStateSchema);
    const result = decode(state);

    expect(result.worktrees).toHaveLength(2);
    expect(result.worktrees[0].name).toBe("wt1");
    expect(result.worktrees[1].name).toBe("wt2");
  });

  it("should fail on wrong version", () => {
    const decode = Schema.decodeUnknownSync(WorktreeStateSchema);

    expect(() =>
      decode({
        version: 1,
        worktrees: [],
      })
    ).toThrow();
  });
});

describe("Constants and defaults", () => {
  it("should have correct default config", () => {
    expect(DEFAULT_WORKTREE_CONFIG.basePath).toBe(".worktrees");
    expect(DEFAULT_WORKTREE_CONFIG.copyPatterns).toContain(".env*");
    expect(DEFAULT_WORKTREE_CONFIG.copyDependencies).toBe(false);
    expect(DEFAULT_WORKTREE_CONFIG.postCreateHooks).toEqual([]);
  });

  it("should have correct default state", () => {
    expect(DEFAULT_WORKTREE_STATE.version).toBe(2);
    expect(DEFAULT_WORKTREE_STATE.worktrees).toEqual([]);
  });

  it("should have protected branches", () => {
    expect(PROTECTED_BRANCHES).toContain("main");
    expect(PROTECTED_BRANCHES).toContain("master");
  });

  it("should have correct metadata directory and file names", () => {
    expect(WORKTREE_METADATA_DIR).toBe(".grim");
    expect(WORKTREE_INFO_FILE).toBe("info.json");
  });
});

describe("Utility functions", () => {
  describe("sanitizeBranchName", () => {
    it("should replace slashes with dashes", () => {
      expect(sanitizeBranchName("feature/new-thing")).toBe("feature-new-thing");
    });

    it("should remove special characters", () => {
      expect(sanitizeBranchName("feature@#$test")).toBe("featuretest");
    });

    it("should preserve valid characters", () => {
      expect(sanitizeBranchName("my-branch_v1.0")).toBe("my-branch_v1.0");
    });

    it("should trim leading and trailing dashes", () => {
      expect(sanitizeBranchName("/feature/test/")).toBe("feature-test");
    });

    it("should handle multiple slashes", () => {
      expect(sanitizeBranchName("a/b/c/d")).toBe("a-b-c-d");
    });
  });

  describe("isProtectedBranch", () => {
    it("should return true for main", () => {
      expect(isProtectedBranch("main")).toBe(true);
    });

    it("should return true for master", () => {
      expect(isProtectedBranch("master")).toBe(true);
    });

    it("should return false for feature branches", () => {
      expect(isProtectedBranch("feature/test")).toBe(false);
    });

    it("should return false for develop", () => {
      expect(isProtectedBranch("develop")).toBe(false);
    });
  });

  describe("getWorktreeInfoPath", () => {
    it("should construct correct path", () => {
      const result = getWorktreeInfoPath("/home/user/project/.worktrees/my-wt");
      expect(result).toBe("/home/user/project/.worktrees/my-wt/.grim/info.json");
    });
  });
});

describe("Type exports", () => {
  it("should export WorktreeConfig type", () => {
    const config: WorktreeConfig = {
      basePath: ".worktrees",
    };
    expect(config).toBeDefined();
  });

  it("should export WorktreeMetadata type", () => {
    const metadata: WorktreeMetadata = {
      name: "test",
      branch: "test",
      createdAt: "2025-01-01T00:00:00.000Z",
      parentRepo: "/test",
    };
    expect(metadata).toBeDefined();
  });

  it("should export WorktreeInfo type", () => {
    const info: WorktreeInfo = {
      name: "test",
      branch: "test",
      path: "/test/path",
      createdAt: "2025-01-01T00:00:00.000Z",
    };
    expect(info).toBeDefined();
  });

  it("should export WorktreeStatus type", () => {
    const status: WorktreeStatus = "active";
    expect(status).toBeDefined();
  });

  it("should export WorktreeEntry type", () => {
    const entry: WorktreeEntry = {
      name: "test",
      branch: "test",
      createdAt: "2025-01-01T00:00:00.000Z",
    };
    expect(entry).toBeDefined();
  });

  it("should export WorktreeState type", () => {
    const state: WorktreeState = {
      version: 2,
      worktrees: [],
    };
    expect(state).toBeDefined();
  });
});
