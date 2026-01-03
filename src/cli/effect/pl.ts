/**
 * Prompt Library Command - Manage prompts
 */

import { Args, Command, Options } from "@effect/cli";
import { Effect } from "effect";

// Import existing handlers
import {
  aliasCommand as aliasHandler,
  archiveCommand as archiveHandler,
  benchmarkCommand as benchmarkHandler,
  branchCommand as branchHandler,
  compareCommand as compareHandler,
  copyCommand as copyHandler,
  costCommand as costHandler,
  enhanceCommand as enhanceHandler,
  exportCommand as exportHandler,
  favoriteCommand as favoriteHandler,
  formatCommand as formatHandler,
  historyCommand as historyHandler,
  importCommand as importHandler,
  listCommand as listHandler,
  promptCommand as promptHandler,
  pinCommand as pinHandler,
  popCommand as popHandler,
  reindexCommand as reindexHandler,
  rmCommand as rmHandler,
  rollbackCommand as rollbackHandler,
  searchCommand as searchHandler,
  showCommand as showHandler,
  stashCommand as stashHandler,
  statsCommand as statsHandler,
  syncCommand as syncHandler,
  tagCommand as tagHandler,
  templatesCommand as templatesHandler,
  testCommand as testHandler,
  versionsCommand as versionsHandler,
} from "../../commands/pl/index";
import { runInteractive } from "../app";

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

// List command
const listCommand = Command.make(
  "list",
  {
    tags: Options.text("tags").pipe(Options.withAlias("t"), Options.optional),
    search: Options.text("search").pipe(Options.withAlias("s"), Options.optional),
    sort: Options.choice("sort", ["name", "created", "updated"]).pipe(Options.optional),
    limit: Options.integer("limit").pipe(Options.withAlias("n"), Options.optional),
  },
  ({ tags, search, sort, limit }) => {
    const flags: Record<string, string | boolean> = {};
    if (tags._tag === "Some") flags.tags = tags.value;
    if (search._tag === "Some") flags.search = search.value;
    if (sort._tag === "Some") flags.sort = sort.value;
    if (limit._tag === "Some") flags.limit = limit.value.toString();
    return listHandler(buildParsedArgs(["list"], flags));
  }
).pipe(Command.withDescription("List all prompts"));

// Show command
const showCommand = Command.make(
  "show",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Prompt name")),
    json: Options.boolean("json").pipe(Options.withDefault(false)),
  },
  ({ name, json }) => showHandler(buildParsedArgs(["show", name], { json }))
).pipe(Command.withDescription("Show prompt details"));

// Rm command
const rmCommand = Command.make(
  "rm",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Prompt name")),
    force: Options.boolean("force").pipe(Options.withAlias("f"), Options.withDefault(false)),
  },
  ({ name, force }) => rmHandler(buildParsedArgs(["rm", name], { force }))
).pipe(Command.withDescription("Delete a prompt"));

// Copy command
const copyCommand = Command.make(
  "copy",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Prompt name")),
  },
  ({ name }) => copyHandler(buildParsedArgs(["copy", name], {}))
).pipe(Command.withDescription("Copy prompt to clipboard"));

// Search command
const searchCommand = Command.make(
  "search",
  {
    query: Args.text({ name: "query" }).pipe(Args.withDescription("Search query")),
  },
  ({ query }) => searchHandler(buildParsedArgs(["search", query], {}))
).pipe(Command.withDescription("Search prompts"));

// Tag command
const tagCommand = Command.make(
  "tag",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Prompt name")),
    tags: Args.text({ name: "tags" }).pipe(Args.optional),
    add: Options.text("add").pipe(Options.optional),
    remove: Options.text("remove").pipe(Options.optional),
  },
  ({ name, tags, add, remove }) => {
    const flags: Record<string, string | boolean> = {};
    if (add._tag === "Some") flags.add = add.value;
    if (remove._tag === "Some") flags.remove = remove.value;
    const positional = ["tag", name];
    if (tags._tag === "Some") positional.push(tags.value);
    return tagHandler(buildParsedArgs(positional, flags));
  }
).pipe(Command.withDescription("Manage tags"));

// History command
const historyCommand = Command.make(
  "history",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Prompt name")),
  },
  ({ name }) => historyHandler(buildParsedArgs(["history", name], {}))
).pipe(Command.withDescription("Show edit history"));

// Versions command
const versionsCommand = Command.make(
  "versions",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Prompt name")),
  },
  ({ name }) => versionsHandler(buildParsedArgs(["versions", name], {}))
).pipe(Command.withDescription("List versions"));

// Rollback command
const rollbackCommand = Command.make(
  "rollback",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Prompt name")),
    version: Args.text({ name: "version" }).pipe(Args.optional),
  },
  ({ name, version }) => {
    const positional = ["rollback", name];
    if (version._tag === "Some") positional.push(version.value);
    return rollbackHandler(buildParsedArgs(positional, {}));
  }
).pipe(Command.withDescription("Rollback to version"));

// Archive command
const archiveCommand = Command.make(
  "archive",
  {
    subcommand: Args.text({ name: "subcommand" }).pipe(Args.optional),
    name: Args.text({ name: "name" }).pipe(Args.optional),
  },
  ({ subcommand, name }) => {
    const positional = ["archive"];
    if (subcommand._tag === "Some") positional.push(subcommand.value);
    if (name._tag === "Some") positional.push(name.value);
    return archiveHandler(buildParsedArgs(positional, {}));
  }
).pipe(Command.withDescription("Manage archived prompts"));

// Branch command
const branchCommand = Command.make(
  "branch",
  {
    subcommand: Args.text({ name: "subcommand" }).pipe(Args.optional),
    args: Args.text({ name: "args" }).pipe(Args.repeated, Args.optional),
  },
  ({ subcommand, args }) => {
    const positional = ["branch"];
    if (subcommand._tag === "Some") positional.push(subcommand.value);
    if (args._tag === "Some") positional.push(...args.value);
    return branchHandler(buildParsedArgs(positional, {}));
  }
).pipe(Command.withDescription("Manage prompt branches"));

// Alias command
const aliasCommand = Command.make(
  "alias",
  {
    subcommand: Args.text({ name: "subcommand" }).pipe(Args.optional),
    args: Args.text({ name: "args" }).pipe(Args.repeated, Args.optional),
  },
  ({ subcommand, args }) => {
    const positional = ["alias"];
    if (subcommand._tag === "Some") positional.push(subcommand.value);
    if (args._tag === "Some") positional.push(...args.value);
    return aliasHandler(buildParsedArgs(positional, {}));
  }
).pipe(Command.withDescription("Manage aliases"));

// Favorite command
const favoriteCommand = Command.make(
  "favorite",
  {
    subcommand: Args.text({ name: "subcommand" }).pipe(Args.optional),
    name: Args.text({ name: "name" }).pipe(Args.optional),
  },
  ({ subcommand, name }) => {
    const positional = ["favorite"];
    if (subcommand._tag === "Some") positional.push(subcommand.value);
    if (name._tag === "Some") positional.push(name.value);
    return favoriteHandler(buildParsedArgs(positional, {}));
  }
).pipe(Command.withDescription("Manage favorites"));

// Pin command
const pinCommand = Command.make(
  "pin",
  {
    subcommand: Args.text({ name: "subcommand" }).pipe(Args.optional),
    name: Args.text({ name: "name" }).pipe(Args.optional),
  },
  ({ subcommand, name }) => {
    const positional = ["pin"];
    if (subcommand._tag === "Some") positional.push(subcommand.value);
    if (name._tag === "Some") positional.push(name.value);
    return pinHandler(buildParsedArgs(positional, {}));
  }
).pipe(Command.withDescription("Manage pinned prompts"));

// Format command
const formatCommand = Command.make(
  "format",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Prompt name")),
  },
  ({ name }) => formatHandler(buildParsedArgs(["format", name], {}))
).pipe(Command.withDescription("Format prompt content"));

// Export command
const exportCommand = Command.make(
  "export",
  {
    names: Args.text({ name: "names" }).pipe(Args.repeated, Args.optional),
    output: Options.file("output").pipe(Options.withAlias("o"), Options.optional),
    format: Options.choice("format", ["json", "yaml", "md"]).pipe(Options.optional),
  },
  ({ names, output, format }) => {
    const flags: Record<string, string | boolean> = {};
    if (output._tag === "Some") flags.output = output.value;
    if (format._tag === "Some") flags.format = format.value;
    const positional = ["export"];
    if (names._tag === "Some") positional.push(...names.value);
    return exportHandler(buildParsedArgs(positional, flags));
  }
).pipe(Command.withDescription("Export prompts"));

// Import command
const importCommand = Command.make(
  "import",
  {
    file: Args.file({ name: "file" }).pipe(Args.optional),
    merge: Options.boolean("merge").pipe(Options.withDefault(false)),
  },
  ({ file, merge }) => {
    const positional = ["import"];
    if (file._tag === "Some") positional.push(file.value);
    return importHandler(buildParsedArgs(positional, { merge }));
  }
).pipe(Command.withDescription("Import prompts"));

// Reindex command
const reindexCommand = Command.make("reindex", {}, () =>
  reindexHandler(buildParsedArgs(["reindex"], {}))
).pipe(Command.withDescription("Rebuild search index"));

// Stats command
const statsCommand = Command.make("stats", {}, () =>
  statsHandler(buildParsedArgs(["stats"], {}))
).pipe(Command.withDescription("Show statistics"));

// Templates command
const templatesCommand = Command.make(
  "templates",
  {
    subcommand: Args.text({ name: "subcommand" }).pipe(Args.optional),
    args: Args.text({ name: "args" }).pipe(Args.repeated, Args.optional),
  },
  ({ subcommand, args }) => {
    const positional = ["templates"];
    if (subcommand._tag === "Some") positional.push(subcommand.value);
    if (args._tag === "Some") positional.push(...args.value);
    return templatesHandler(buildParsedArgs(positional, {}));
  }
).pipe(Command.withDescription("Manage templates"));

// Test command
const testCommand = Command.make(
  "test",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Prompt name")),
    model: Options.text("model").pipe(Options.optional),
    input: Options.text("input").pipe(Options.optional),
  },
  ({ name, model, input }) => {
    const flags: Record<string, string | boolean> = {};
    if (model._tag === "Some") flags.model = model.value;
    if (input._tag === "Some") flags.input = input.value;
    return testHandler(buildParsedArgs(["test", name], flags));
  }
).pipe(Command.withDescription("Test prompt with LLM"));

// Cost command
const costCommand = Command.make(
  "cost",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Prompt name")),
  },
  ({ name }) => costHandler(buildParsedArgs(["cost", name], {}))
).pipe(Command.withDescription("Estimate token costs"));

// Compare command
const compareCommand = Command.make(
  "compare",
  {
    names: Args.text({ name: "names" }).pipe(Args.repeated),
  },
  ({ names }) => compareHandler(buildParsedArgs(["compare", ...names], {}))
).pipe(Command.withDescription("A/B test prompts"));

// Benchmark command
const benchmarkCommand = Command.make(
  "benchmark",
  {
    name: Args.text({ name: "name" }).pipe(Args.optional),
  },
  ({ name }) => {
    const positional = ["benchmark"];
    if (name._tag === "Some") positional.push(name.value);
    return benchmarkHandler(buildParsedArgs(positional, {}));
  }
).pipe(Command.withDescription("Run test suite"));

// Enhance command
const enhanceCommand = Command.make(
  "enhance",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Prompt name")),
    aspect: Options.text("aspect").pipe(Options.optional),
  },
  ({ name, aspect }) => {
    const flags: Record<string, string | boolean> = {};
    if (aspect._tag === "Some") flags.aspect = aspect.value;
    return enhanceHandler(buildParsedArgs(["enhance", name], flags));
  }
).pipe(Command.withDescription("AI-powered enhancement"));

// Sync command
const syncCommand = Command.make("sync", {}, () =>
  syncHandler(buildParsedArgs(["sync"], {}))
).pipe(Command.withDescription("Sync with remote"));

// Stash command
const stashCommand = Command.make(
  "stash",
  {
    message: Args.text({ name: "message" }).pipe(Args.optional),
  },
  ({ message }) => {
    const positional = ["stash"];
    if (message._tag === "Some") positional.push(message.value);
    return stashHandler(buildParsedArgs(positional, {}));
  }
).pipe(Command.withDescription("Stash clipboard content"));

// Pop command
const popCommand = Command.make("pop", {}, () =>
  popHandler(buildParsedArgs(["pop"], {}))
).pipe(Command.withDescription("Pop from stash"));

/**
 * Prompt Library command with subcommands
 */
export const plCommand = Command.make(
  "pl",
  {
    name: Args.text({ name: "name" }).pipe(
      Args.optional,
      Args.withDescription("Prompt name to create/edit")
    ),
    content: Options.text("content").pipe(Options.withAlias("c"), Options.optional),
    paste: Options.boolean("paste").pipe(Options.withAlias("p"), Options.withDefault(false)),
    tags: Options.text("tags").pipe(Options.withAlias("t"), Options.optional),
    rename: Options.text("name").pipe(Options.optional),
  },
  ({ name, content, paste, tags, rename }) =>
    Effect.gen(function* () {
      // If a name is provided that isn't a subcommand, treat as prompt create/edit
      if (name._tag === "Some") {
        const PL_SUBCOMMANDS = new Set([
          "list", "show", "rm", "delete", "copy", "search", "tag", "history",
          "versions", "rollback", "archive", "branch", "alias", "favorite",
          "pin", "format", "export", "import", "reindex", "stats", "templates",
          "test", "cost", "compare", "benchmark", "enhance", "sync", "stash", "pop"
        ]);

        if (!PL_SUBCOMMANDS.has(name.value)) {
          const flags: Record<string, string | boolean> = { p: paste };
          if (content._tag === "Some") flags.c = content.value;
          if (tags._tag === "Some") flags.t = tags.value;
          if (rename._tag === "Some") flags.name = rename.value;
          yield* promptHandler(buildParsedArgs(["pl", name.value], flags));
          return;
        }
      }

      // No name = launch interactive TUI
      yield* runInteractive();
    })
).pipe(
  Command.withDescription("Prompt Library - manage prompts"),
  Command.withSubcommands([
    listCommand,
    showCommand,
    rmCommand,
    copyCommand,
    searchCommand,
    tagCommand,
    historyCommand,
    versionsCommand,
    rollbackCommand,
    archiveCommand,
    branchCommand,
    aliasCommand,
    favoriteCommand,
    pinCommand,
    formatCommand,
    exportCommand,
    importCommand,
    reindexCommand,
    statsCommand,
    templatesCommand,
    testCommand,
    costCommand,
    compareCommand,
    benchmarkCommand,
    enhanceCommand,
    syncCommand,
    stashCommand,
    popCommand,
  ])
);
