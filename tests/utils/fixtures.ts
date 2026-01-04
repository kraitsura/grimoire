/**
 * Test Fixtures
 *
 * Reusable test data for Grimoire tests.
 * Provides factory functions and sample data for prompts, tags, versions, etc.
 */

import { Effect } from "effect";
import type { Prompt, Frontmatter } from "../../src/models/prompt";
import type { PromptVersion } from "../../src/services/version-service";
import type { Branch } from "../../src/services/branch-service";
import type { SkillManifest, AgentType } from "../../src/models/skill";
import type { WorktreeEntry, WorktreeInfo, WorktreeConfig } from "../../src/models/worktree";
import type { AgentDefinition, ClaudeCodeAgent } from "../../src/models/agent";

// ============================================================================
// UUID Generation
// ============================================================================

let uuidCounter = 0;

/**
 * Generate a unique test UUID.
 * Uses a counter to ensure uniqueness across tests.
 */
export const testUuid = (): string => {
  uuidCounter++;
  const hex = uuidCounter.toString(16).padStart(8, "0");
  return `test${hex}-0000-0000-0000-000000000000`;
};

/**
 * Reset the UUID counter (call in beforeEach if needed).
 */
export const resetUuidCounter = (): void => {
  uuidCounter = 0;
};

// ============================================================================
// Date Helpers
// ============================================================================

/**
 * Create a date relative to now.
 */
export const daysAgo = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

/**
 * Create a date relative to now.
 */
export const hoursAgo = (hours: number): Date => {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date;
};

/**
 * Fixed reference date for deterministic tests.
 */
export const FIXED_DATE = new Date("2025-01-01T12:00:00.000Z");

// ============================================================================
// Prompt Fixtures
// ============================================================================

/**
 * Options for creating a test prompt.
 */
export interface PromptFixtureOptions {
  id?: string;
  name?: string;
  content?: string;
  tags?: string[];
  created?: Date;
  updated?: Date;
  version?: number;
  isTemplate?: boolean;
  isFavorite?: boolean;
  isPinned?: boolean;
  favoriteOrder?: number;
  pinOrder?: number;
  filePath?: string;
}

/**
 * Create a test prompt with sensible defaults.
 * Note: The schema uses DateFromString, so dates are stored as Date objects internally.
 */
export const createPrompt = (options: PromptFixtureOptions = {}): Prompt => {
  const created = options.created ?? FIXED_DATE;
  const updated = options.updated ?? FIXED_DATE;
  return {
    id: options.id ?? testUuid(),
    name: options.name ?? `Test Prompt ${uuidCounter}`,
    content: options.content ?? "This is test content for the prompt.",
    tags: options.tags,
    created,
    updated,
    version: options.version,
    isTemplate: options.isTemplate,
    isFavorite: options.isFavorite,
    isPinned: options.isPinned,
    favoriteOrder: options.favoriteOrder,
    pinOrder: options.pinOrder,
    filePath: options.filePath,
  };
};

/**
 * Create frontmatter for a prompt.
 */
export const createFrontmatter = (options: PromptFixtureOptions = {}): Frontmatter => {
  const created = options.created ?? FIXED_DATE;
  const updated = options.updated ?? FIXED_DATE;
  return {
    id: options.id ?? testUuid(),
    name: options.name ?? `Test Prompt ${uuidCounter}`,
    tags: options.tags,
    created,
    updated,
    version: options.version,
    isTemplate: options.isTemplate,
    isFavorite: options.isFavorite,
    isPinned: options.isPinned,
    favoriteOrder: options.favoriteOrder,
    pinOrder: options.pinOrder,
  };
};

/**
 * Sample prompts for common test scenarios.
 */
export const SAMPLE_PROMPTS = {
  /**
   * Simple prompt with no special features.
   */
  simple: createPrompt({
    id: "simple-prompt-id",
    name: "Simple Prompt",
    content: "A simple test prompt.",
  }),

  /**
   * Prompt with tags.
   */
  withTags: createPrompt({
    id: "tagged-prompt-id",
    name: "Tagged Prompt",
    content: "A prompt with tags.",
    tags: ["coding", "javascript", "testing"],
  }),

  /**
   * Template prompt.
   */
  template: createPrompt({
    id: "template-prompt-id",
    name: "Template Prompt",
    content: "You are a {{role}}. Your task is to {{task}}.",
    isTemplate: true,
  }),

  /**
   * Favorited prompt.
   */
  favorite: createPrompt({
    id: "favorite-prompt-id",
    name: "Favorite Prompt",
    content: "This is a favorite prompt.",
    isFavorite: true,
    favoriteOrder: 1,
  }),

  /**
   * Pinned prompt.
   */
  pinned: createPrompt({
    id: "pinned-prompt-id",
    name: "Pinned Prompt",
    content: "This is a pinned prompt.",
    isPinned: true,
    pinOrder: 1,
  }),

  /**
   * Prompt with XML tags (for format testing).
   */
  withXml: createPrompt({
    id: "xml-prompt-id",
    name: "XML Prompt",
    content: `<system>
You are a helpful assistant.
</system>

<user>
Help me with coding.
</user>`,
  }),

  /**
   * Long prompt for performance testing.
   */
  long: createPrompt({
    id: "long-prompt-id",
    name: "Long Prompt",
    content: "This is a sentence. ".repeat(1000),
  }),

  /**
   * Prompt with special characters.
   */
  specialChars: createPrompt({
    id: "special-chars-id",
    name: "Special Characters",
    content: "Testing: émoji 🎉, quotes \"'`, newlines\n\ttabs, unicode: 日本語",
  }),
};

/**
 * Create multiple prompts at once.
 */
export const createPrompts = (count: number, baseOptions: PromptFixtureOptions = {}): Prompt[] => {
  return Array.from({ length: count }, (_, i) =>
    createPrompt({
      ...baseOptions,
      name: `${baseOptions.name ?? "Test Prompt"} ${i + 1}`,
    })
  );
};

// ============================================================================
// Version Fixtures
// ============================================================================

/**
 * Options for creating a test version.
 */
export interface VersionFixtureOptions {
  id?: number;
  promptId?: string;
  version?: number;
  content?: string;
  frontmatter?: Record<string, unknown>;
  changeReason?: string;
  branch?: string;
  parentVersion?: number;
  createdAt?: Date;
}

/**
 * Create a test version.
 */
export const createVersion = (options: VersionFixtureOptions = {}): PromptVersion => ({
  id: options.id ?? uuidCounter++,
  promptId: options.promptId ?? testUuid(),
  version: options.version ?? 1,
  content: options.content ?? "Version content",
  frontmatter: options.frontmatter ?? {},
  changeReason: options.changeReason,
  branch: options.branch ?? "main",
  parentVersion: options.parentVersion,
  createdAt: options.createdAt ?? FIXED_DATE,
});

// ============================================================================
// Branch Fixtures
// ============================================================================

/**
 * Options for creating a test branch.
 */
export interface BranchFixtureOptions {
  id?: string;
  name?: string;
  promptId?: string;
  createdFromVersion?: number;
  createdAt?: Date;
  isActive?: boolean;
}

/**
 * Create a test branch.
 */
export const createBranch = (options: BranchFixtureOptions = {}): Branch => ({
  id: options.id ?? testUuid(),
  name: options.name ?? `test-branch-${uuidCounter++}`,
  promptId: options.promptId ?? testUuid(),
  createdFromVersion: options.createdFromVersion,
  createdAt: options.createdAt ?? FIXED_DATE,
  isActive: options.isActive ?? true,
});

// ============================================================================
// Skill Fixtures
// ============================================================================

/**
 * Options for creating a test skill manifest.
 * Based on SkillManifestSchema which has: name, description, allowed_tools
 */
export interface SkillFixtureOptions {
  name?: string;
  description?: string;
  allowed_tools?: string[];
}

/**
 * Create a test skill manifest.
 */
export const createSkillManifest = (options: SkillFixtureOptions = {}): SkillManifest => ({
  name: options.name ?? `test-skill-${uuidCounter++}`,
  description: options.description ?? "A test skill for testing purposes.",
  allowed_tools: options.allowed_tools,
});

/**
 * Sample skill manifests.
 */
export const SAMPLE_SKILLS = {
  /**
   * Minimal valid skill.
   */
  minimal: createSkillManifest({
    name: "minimal-skill",
    description: "A minimal skill.",
  }),

  /**
   * Skill with allowed tools.
   */
  withTools: createSkillManifest({
    name: "tools-skill",
    description: "A skill with allowed tools.",
    allowed_tools: ["Read", "Write", "Bash"],
  }),
};

// ============================================================================
// Worktree Fixtures
// ============================================================================

/**
 * Options for creating a test worktree entry.
 */
export interface WorktreeFixtureOptions {
  name?: string;
  branch?: string;
  createdAt?: string;
  linkedIssue?: string;
  createdBy?: "user" | "agent";
  sessionId?: string;
}

/**
 * Create a test worktree entry.
 */
export const createWorktreeEntry = (options: WorktreeFixtureOptions = {}): WorktreeEntry => ({
  name: options.name ?? `wt-${uuidCounter++}`,
  branch: options.branch ?? `feature/test-${uuidCounter}`,
  createdAt: options.createdAt ?? FIXED_DATE.toISOString(),
  linkedIssue: options.linkedIssue,
  metadata: options.createdBy || options.sessionId
    ? {
        createdBy: options.createdBy,
        sessionId: options.sessionId,
      }
    : undefined,
});

/**
 * Create a test worktree info.
 */
export const createWorktreeInfo = (options: WorktreeFixtureOptions & { path?: string } = {}): WorktreeInfo => ({
  name: options.name ?? `wt-${uuidCounter++}`,
  branch: options.branch ?? `feature/test-${uuidCounter}`,
  path: options.path ?? `/tmp/project/.worktrees/wt-${uuidCounter}`,
  createdAt: options.createdAt ?? FIXED_DATE.toISOString(),
  linkedIssue: options.linkedIssue,
  metadata: options.createdBy || options.sessionId
    ? {
        createdBy: options.createdBy,
        sessionId: options.sessionId,
      }
    : undefined,
});

/**
 * Sample worktree entries.
 */
export const SAMPLE_WORKTREES = {
  /**
   * Simple worktree with minimal config.
   */
  simple: createWorktreeEntry({
    name: "simple-wt",
    branch: "feature/simple",
  }),

  /**
   * Worktree created by agent with linked issue.
   */
  agentCreated: createWorktreeEntry({
    name: "agent-wt",
    branch: "feature/agent-task",
    linkedIssue: "GRIM-123",
    createdBy: "agent",
    sessionId: "sess-abc123",
  }),

  /**
   * Worktree with full metadata.
   */
  full: createWorktreeEntry({
    name: "full-wt",
    branch: "feature/full",
    linkedIssue: "GRIM-456",
    createdBy: "user",
  }),
};

// ============================================================================
// Agent Fixtures
// ============================================================================

/**
 * Options for creating a test agent definition.
 */
export interface AgentFixtureOptions {
  name?: string;
  description?: string;
  content?: string;
  tools?: string[];
  model?: string;
  wraps_cli?: string;
  tags?: string[];
}

/**
 * Create a test agent definition.
 */
export const createAgentDefinition = (options: AgentFixtureOptions = {}): AgentDefinition => ({
  name: options.name ?? `test-agent-${uuidCounter++}`,
  description: options.description ?? "A test agent for testing purposes.",
  content: options.content ?? "# Test Agent\n\nThis is a test agent.",
  tools: options.tools,
  model: options.model,
  wraps_cli: options.wraps_cli,
  tags: options.tags,
});

/**
 * Create a test Claude Code agent.
 */
export const createClaudeCodeAgent = (options: AgentFixtureOptions & {
  color?: string;
  permissionMode?: "default" | "ask" | "allow";
} = {}): ClaudeCodeAgent => ({
  name: options.name ?? `claude-agent-${uuidCounter++}`,
  description: options.description ?? "A test Claude Code agent.",
  content: options.content ?? "# Claude Agent\n\nInstructions here.",
  tools: options.tools,
  model: options.model,
  color: options.color,
  permissionMode: options.permissionMode,
});

/**
 * Sample agent definitions.
 */
export const SAMPLE_AGENTS = {
  /**
   * Minimal agent.
   */
  minimal: createAgentDefinition({
    name: "minimal-agent",
    description: "A minimal agent.",
    content: "Minimal instructions.",
  }),

  /**
   * Agent with tools.
   */
  withTools: createAgentDefinition({
    name: "dev-agent",
    description: "Development agent with tools.",
    content: "Development instructions.",
    tools: ["Read", "Write", "Bash", "Glob"],
  }),

  /**
   * CLI wrapper agent.
   */
  cliWrapper: createAgentDefinition({
    name: "git-helper",
    description: "Git helper agent.",
    content: "Git workflow instructions.",
    tools: ["Bash"],
    wraps_cli: "git",
    tags: ["git", "cli"],
  }),
};

// ============================================================================
// Markdown Fixtures
// ============================================================================

/**
 * Create a markdown file with frontmatter.
 */
export const createMarkdownWithFrontmatter = (
  frontmatter: Record<string, unknown>,
  content: string
): string => {
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:\n${value.map((v) => `  - ${v}`).join("\n")}`;
      }
      if (value instanceof Date) {
        return `${key}: "${value.toISOString()}"`;
      }
      if (typeof value === "string") {
        return `${key}: "${value}"`;
      }
      return `${key}: ${value}`;
    })
    .join("\n");

  return `---\n${yaml}\n---\n\n${content}`;
};

/**
 * Sample markdown prompts (as they would appear on disk).
 */
export const SAMPLE_MARKDOWN = {
  simple: createMarkdownWithFrontmatter(
    {
      id: "simple-md-id",
      name: "Simple Markdown",
      created: FIXED_DATE,
      updated: FIXED_DATE,
    },
    "This is the content."
  ),

  withTags: createMarkdownWithFrontmatter(
    {
      id: "tagged-md-id",
      name: "Tagged Markdown",
      tags: ["tag1", "tag2"],
      created: FIXED_DATE,
      updated: FIXED_DATE,
    },
    "Content with tags."
  ),
};

// ============================================================================
// Tag Fixtures
// ============================================================================

/**
 * Sample tag sets for testing.
 */
export const SAMPLE_TAGS = {
  empty: [] as string[],
  single: ["coding"],
  multiple: ["coding", "javascript", "testing"],
  withSpaces: ["web dev", "front end", "back end"],
  unicode: ["日本語", "中文", "한국어"],
};

// ============================================================================
// Effect Helpers
// ============================================================================

/**
 * Create an Effect that returns a prompt.
 */
export const effectPrompt = (options?: PromptFixtureOptions): Effect.Effect<Prompt> =>
  Effect.succeed(createPrompt(options));

/**
 * Create an Effect that returns multiple prompts.
 */
export const effectPrompts = (
  count: number,
  options?: PromptFixtureOptions
): Effect.Effect<Prompt[]> => Effect.succeed(createPrompts(count, options));
