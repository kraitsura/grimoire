/**
 * Worktree Command - Git worktree management
 */

import { Args, Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { render } from "ink";
import React from "react";

// Import existing handlers
import {
  worktreeNew,
  worktreeList,
  worktreeRm,
  worktreePath,
  worktreeExec,
  worktreeOpen,
  worktreeClean,
  worktreeConfig,
  worktreeEach,
  worktreeLog,
  worktreeClaim,
  worktreeRelease,
  worktreeCheckpoint,
  worktreeFromIssue,
  worktreeStatus,
  worktreeHandoff,
  worktreeAvailable,
  worktreeSpawn,
  worktreePs,
  worktreeChildren,
  worktreeWait,
  worktreeCollect,
  worktreeKill,
  worktreeMerge,
  worktreePr,
  worktreeAuth,
  worktreeCommit,
  worktreeAdopt,
} from "../../commands/worktree/index";
import { WorktreeDashboard } from "../components/worktree";

// Helper to build ParsedArgs
const buildParsedArgs = (
  positional: string[],
  flags: Record<string, string | boolean | number>
): { command: string; positional: string[]; flags: Record<string, string | boolean> } => ({
  command: positional[0] || "",
  positional,
  flags: Object.fromEntries(
    Object.entries(flags).map(([k, v]) => [k, typeof v === "number" ? v.toString() : v])
  ),
});

// PS command (default)
const psCommand = Command.make(
  "ps",
  {
    running: Options.boolean("running").pipe(Options.withDefault(false)),
    json: Options.boolean("json").pipe(Options.withDefault(false)),
  },
  ({ running, json }) => worktreePs(buildParsedArgs(["ps"], { running, json }))
).pipe(Command.withDescription("Show all worktrees with agent + collect status"));

// New command
const newCommand = Command.make(
  "new",
  {
    branch: Args.text({ name: "branch" }).pipe(Args.withDescription("Branch name")),
    createBranch: Options.boolean("create-branch").pipe(Options.withAlias("b"), Options.withDefault(false)),
    issue: Options.text("issue").pipe(Options.withAlias("i"), Options.optional),
    output: Options.boolean("output").pipe(Options.withAlias("o"), Options.withDefault(false)),
  },
  ({ branch, createBranch, issue, output }) => {
    const flags: Record<string, string | boolean> = { b: createBranch, o: output };
    if (issue._tag === "Some") flags.i = issue.value;
    return worktreeNew(buildParsedArgs(["new", branch], flags));
  }
).pipe(Command.withDescription("Create a new worktree from branch"));

// Spawn command
const spawnCommand = Command.make(
  "spawn",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Worktree name")),
    prompt: Args.text({ name: "prompt" }).pipe(Args.optional),
    promptFlag: Options.text("prompt").pipe(Options.withAlias("p"), Options.optional),
    background: Options.boolean("background").pipe(Options.withAlias("bg"), Options.withDefault(false)),
    noSandbox: Options.boolean("no-sandbox").pipe(Options.withDefault(false)),
    issue: Options.text("issue").pipe(Options.withAlias("i"), Options.optional),
  },
  ({ name, prompt, promptFlag, background, noSandbox, issue }) => {
    const flags: Record<string, string | boolean> = { bg: background, "no-sandbox": noSandbox };
    if (promptFlag._tag === "Some") flags.p = promptFlag.value;
    if (issue._tag === "Some") flags.i = issue.value;
    const positional = ["spawn", name];
    if (prompt._tag === "Some") positional.push(prompt.value);
    return worktreeSpawn(buildParsedArgs(positional, flags));
  }
).pipe(Command.withDescription("Create worktree + launch sandboxed Claude session"));

// Kill command
const killCommand = Command.make(
  "kill",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Worktree name")),
    force: Options.boolean("force").pipe(Options.withDefault(false)),
  },
  ({ name, force }) => worktreeKill(buildParsedArgs(["kill", name], { force }))
).pipe(Command.withDescription("Terminate a spawned agent"));

// Children command
const childrenCommand = Command.make("children", {}, () =>
  worktreeChildren(buildParsedArgs(["children"], {}))
).pipe(Command.withDescription("Show worktrees spawned by current session"));

// Wait command
const waitCommand = Command.make(
  "wait",
  {
    names: Args.text({ name: "names" }).pipe(Args.repeated, Args.optional),
    timeout: Options.integer("timeout").pipe(Options.optional),
  },
  ({ names, timeout }) => {
    const flags: Record<string, string | boolean> = {};
    if (timeout._tag === "Some") flags.timeout = timeout.value.toString();
    const positional = ["wait"];
    if (names._tag === "Some") positional.push(...names.value);
    return worktreeWait(buildParsedArgs(positional, flags));
  }
).pipe(Command.withDescription("Block until child worktrees complete"));

// Collect command
const collectCommand = Command.make(
  "collect",
  {
    names: Args.text({ name: "names" }).pipe(Args.repeated, Args.optional),
    delete: Options.boolean("delete").pipe(Options.withDefault(false)),
    dryRun: Options.boolean("dry-run").pipe(Options.withDefault(false)),
    strategy: Options.choice("strategy", ["merge", "rebase", "squash"]).pipe(Options.optional),
  },
  ({ names, delete: del, dryRun, strategy }) => {
    const flags: Record<string, string | boolean> = { delete: del, "dry-run": dryRun };
    if (strategy._tag === "Some") flags.strategy = strategy.value;
    const positional = ["collect"];
    if (names._tag === "Some") positional.push(...names.value);
    return worktreeCollect(buildParsedArgs(positional, flags));
  }
).pipe(Command.withDescription("Merge completed children back into current branch"));

// Commit command
const commitCommand = Command.make(
  "commit",
  {
    names: Args.text({ name: "names" }).pipe(Args.repeated),
    message: Options.text("message").pipe(Options.withAlias("m"), Options.optional),
  },
  ({ names, message }) => {
    const flags: Record<string, string | boolean> = {};
    if (message._tag === "Some") flags.m = message.value;
    return worktreeCommit(buildParsedArgs(["commit", ...names], flags));
  }
).pipe(Command.withDescription("Commit all changes in worktree"));

// Merge command
const mergeCommand = Command.make(
  "merge",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Worktree name")),
    squash: Options.boolean("squash").pipe(Options.withDefault(false)),
  },
  ({ name, squash }) => worktreeMerge(buildParsedArgs(["merge", name], { squash }))
).pipe(Command.withDescription("Merge worktree branch into current branch"));

// PR command
const prCommand = Command.make(
  "pr",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Worktree name")),
    draft: Options.boolean("draft").pipe(Options.withDefault(false)),
    title: Options.text("title").pipe(Options.optional),
    body: Options.text("body").pipe(Options.optional),
  },
  ({ name, draft, title, body }) => {
    const flags: Record<string, string | boolean> = { draft };
    if (title._tag === "Some") flags.title = title.value;
    if (body._tag === "Some") flags.body = body.value;
    return worktreePr(buildParsedArgs(["pr", name], flags));
  }
).pipe(Command.withDescription("Create GitHub PR from worktree branch"));

// Auth command
const authCommand = Command.make("auth", {}, () =>
  worktreeAuth(buildParsedArgs(["auth"], {}))
).pipe(Command.withDescription("Check/setup OAuth for headless agents"));

// From-issue command
const fromIssueCommand = Command.make(
  "from-issue",
  {
    id: Args.text({ name: "id" }).pipe(Args.withDescription("Issue ID")),
  },
  ({ id }) => worktreeFromIssue(buildParsedArgs(["from-issue", id], {}))
).pipe(Command.withDescription("Create worktree from issue ID"));

// List command
const listCommand = Command.make(
  "list",
  {
    json: Options.boolean("json").pipe(Options.withDefault(false)),
    stale: Options.boolean("stale").pipe(Options.withDefault(false)),
  },
  ({ json, stale }) => worktreeList(buildParsedArgs(["list"], { json, stale }))
).pipe(Command.withDescription("List worktree names (simple output)"));

// Status command
const statusCommand = Command.make("status", {}, () =>
  worktreeStatus(buildParsedArgs(["status"], {}))
).pipe(Command.withDescription("[DEPRECATED] Use 'ps' instead"));

// Rm command
const rmCommand = Command.make(
  "rm",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Worktree name")),
    branch: Options.boolean("branch").pipe(Options.withDefault(false)),
    force: Options.boolean("force").pipe(Options.withDefault(false)),
  },
  ({ name, branch, force }) => worktreeRm(buildParsedArgs(["rm", name], { branch, force }))
).pipe(Command.withDescription("Remove a worktree"));

// Path command
const pathCommand = Command.make(
  "path",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Worktree name")),
  },
  ({ name }) => worktreePath(buildParsedArgs(["path", name], {}))
).pipe(Command.withDescription("Print worktree path (for scripting)"));

// Exec command
const execCommand = Command.make(
  "exec",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Worktree name")),
    command: Args.text({ name: "command" }).pipe(Args.repeated),
  },
  ({ name, command }) => worktreeExec(buildParsedArgs(["exec", name, ...command], {}))
).pipe(Command.withDescription("Execute command in worktree context"));

// Open command
const openCommand = Command.make(
  "open",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Worktree name")),
  },
  ({ name }) => worktreeOpen(buildParsedArgs(["open", name], {}))
).pipe(Command.withDescription("Open shell in worktree directory"));

// Clean command
const cleanCommand = Command.make(
  "clean",
  {
    dryRun: Options.boolean("dry-run").pipe(Options.withDefault(false)),
    force: Options.boolean("force").pipe(Options.withDefault(false)),
  },
  ({ dryRun, force }) => worktreeClean(buildParsedArgs(["clean"], { "dry-run": dryRun, force }))
).pipe(Command.withDescription("Remove stale worktrees (managed only)"));

// Adopt command
const adoptCommand = Command.make(
  "adopt",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Worktree name")),
  },
  ({ name }) => worktreeAdopt(buildParsedArgs(["adopt", name], {}))
).pipe(Command.withDescription("Take ownership of unmanaged worktree"));

// Config command
const configCommand = Command.make(
  "config",
  {
    key: Args.text({ name: "key" }).pipe(Args.optional),
    value: Args.text({ name: "value" }).pipe(Args.optional),
  },
  ({ key, value }) => {
    const positional = ["config"];
    if (key._tag === "Some") positional.push(key.value);
    if (value._tag === "Some") positional.push(value.value);
    return worktreeConfig(buildParsedArgs(positional, {}));
  }
).pipe(Command.withDescription("View or modify configuration"));

// Each command
const eachCommand = Command.make(
  "each",
  {
    command: Args.text({ name: "command" }).pipe(Args.repeated),
    parallel: Options.boolean("parallel").pipe(Options.withDefault(false)),
  },
  ({ command, parallel }) => worktreeEach(buildParsedArgs(["each", ...command], { parallel }))
).pipe(Command.withDescription("Run command across all worktrees"));

// Log command
const logCommand = Command.make(
  "log",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Worktree name")),
    message: Args.text({ name: "message" }).pipe(Args.optional),
  },
  ({ name, message }) => {
    const positional = ["log", name];
    if (message._tag === "Some") positional.push(message.value);
    return worktreeLog(buildParsedArgs(positional, {}));
  }
).pipe(Command.withDescription("Add progress log or view logs"));

// Checkpoint command
const checkpointCommand = Command.make(
  "checkpoint",
  {
    message: Args.text({ name: "message" }).pipe(Args.optional),
  },
  ({ message }) => {
    const positional = ["checkpoint"];
    if (message._tag === "Some") positional.push(message.value);
    return worktreeCheckpoint(buildParsedArgs(positional, {}));
  }
).pipe(Command.withDescription("Create git checkpoint with metadata"));

// Claim command
const claimCommand = Command.make(
  "claim",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Worktree name")),
  },
  ({ name }) => worktreeClaim(buildParsedArgs(["claim", name], {}))
).pipe(Command.withDescription("Claim worktree for exclusive work"));

// Release command
const releaseCommand = Command.make(
  "release",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Worktree name")),
  },
  ({ name }) => worktreeRelease(buildParsedArgs(["release", name], {}))
).pipe(Command.withDescription("Release claim on worktree"));

// Handoff command
const handoffCommand = Command.make(
  "handoff",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Worktree name")),
    to: Options.text("to").pipe(Options.optional),
  },
  ({ name, to }) => {
    const flags: Record<string, string | boolean> = {};
    if (to._tag === "Some") flags.to = to.value;
    return worktreeHandoff(buildParsedArgs(["handoff", name], flags));
  }
).pipe(Command.withDescription("Release + notify target agent"));

// Available command
const availableCommand = Command.make("available", {}, () =>
  worktreeAvailable(buildParsedArgs(["available"], {}))
).pipe(Command.withDescription("List unclaimed worktrees"));

/**
 * Worktree command with subcommands
 */
export const wtCommand = Command.make(
  "wt",
  {
    interactive: Options.boolean("interactive").pipe(
      Options.withAlias("i"),
      Options.withDefault(false),
      Options.withDescription("Launch TUI dashboard")
    ),
  },
  ({ interactive }) =>
    Effect.gen(function* () {
      if (interactive) {
        const { waitUntilExit } = render(React.createElement(WorktreeDashboard), {
          exitOnCtrlC: true,
        });
        yield* Effect.promise(() => waitUntilExit());
        return;
      }

      // Default to ps when no subcommand
      yield* worktreePs(buildParsedArgs(["ps"], {}));
    })
).pipe(
  Command.withDescription("Worktree - isolated workspaces + agents"),
  Command.withSubcommands([
    psCommand,
    newCommand,
    spawnCommand,
    killCommand,
    childrenCommand,
    waitCommand,
    collectCommand,
    commitCommand,
    mergeCommand,
    prCommand,
    authCommand,
    fromIssueCommand,
    listCommand,
    statusCommand,
    rmCommand,
    pathCommand,
    execCommand,
    openCommand,
    cleanCommand,
    adoptCommand,
    configCommand,
    eachCommand,
    logCommand,
    checkpointCommand,
    claimCommand,
    releaseCommand,
    handoffCommand,
    availableCommand,
  ])
);
