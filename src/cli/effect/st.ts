/**
 * Skills/Tools Command - Manage skills, plugins, and agents
 */

import { Args, Command, Options } from "@effect/cli";
import { Effect } from "effect";

// Import existing handlers
import { skillsCommand as skillsHandler } from "../../commands/skills";
import { pluginsCommand as pluginsHandler } from "../../commands/plugins";
import { agentsCommand as agentsHandler } from "../../commands/agents";
import { addCommand as addHandler } from "../../commands/add";

// Helper to build ParsedArgs from Effect CLI args
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

// Skills subcommands
const skillsInstall = Command.make(
  "install",
  {
    source: Args.text({ name: "source" }).pipe(Args.withDescription("Source (e.g., github:owner/repo)")),
    target: Options.text("target").pipe(Options.optional, Options.withDescription("Target skill name")),
  },
  ({ source, target }) => skillsHandler(buildParsedArgs(
    ["install", source, ...(target._tag === "Some" ? [target.value] : [])],
    target._tag === "Some" ? { target: target.value } : {}
  ))
).pipe(Command.withDescription("Install skill (add + init + enable in one command)"));

const skillsInit = Command.make(
  "init",
  {
    agent: Options.text("agent").pipe(Options.optional, Options.withDescription("Agent type")),
  },
  ({ agent }) => skillsHandler(buildParsedArgs(
    ["init"],
    agent._tag === "Some" ? { agent: agent.value } : {}
  ))
).pipe(Command.withDescription("Initialize skills in current project"));

const skillsAdd = Command.make(
  "add",
  {
    source: Args.text({ name: "source" }).pipe(Args.withDescription("Source (e.g., github:owner/repo)")),
  },
  ({ source }) => skillsHandler(buildParsedArgs(["add", source], {}))
).pipe(Command.withDescription("Add a skill to local cache"));

const skillsEnable = Command.make(
  "enable",
  {
    names: Args.text({ name: "names" }).pipe(Args.repeated, Args.withDescription("Skill names to enable")),
    yes: Options.boolean("yes").pipe(Options.withAlias("y"), Options.withDefault(false)),
  },
  ({ names, yes }) => skillsHandler(buildParsedArgs(["enable", ...names], { y: yes }))
).pipe(Command.withDescription("Enable skill(s) in current project"));

const skillsDisable = Command.make(
  "disable",
  {
    names: Args.text({ name: "names" }).pipe(Args.repeated, Args.withDescription("Skill names to disable")),
    purge: Options.boolean("purge").pipe(Options.withDefault(false)),
    yes: Options.boolean("yes").pipe(Options.withAlias("y"), Options.withDefault(false)),
  },
  ({ names, purge, yes }) => skillsHandler(buildParsedArgs(["disable", ...names], { purge, y: yes }))
).pipe(Command.withDescription("Disable skill(s) from current project"));

const skillsList = Command.make(
  "list",
  {
    enabled: Options.boolean("enabled").pipe(Options.withDefault(false)),
  },
  ({ enabled }) => skillsHandler(buildParsedArgs(["list"], { enabled }))
).pipe(Command.withDescription("List available and enabled skills"));

const skillsInfo = Command.make(
  "info",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Skill name")),
  },
  ({ name }) => skillsHandler(buildParsedArgs(["info", name], {}))
).pipe(Command.withDescription("Show details about a skill"));

const skillsSearch = Command.make(
  "search",
  {
    query: Args.text({ name: "query" }).pipe(Args.withDescription("Search query")),
  },
  ({ query }) => skillsHandler(buildParsedArgs(["search", query], {}))
).pipe(Command.withDescription("Search for skills"));

const skillsSync = Command.make(
  "sync",
  {
    yes: Options.boolean("yes").pipe(Options.withAlias("y"), Options.withDefault(false)),
  },
  ({ yes }) => skillsHandler(buildParsedArgs(["sync"], { y: yes }))
).pipe(Command.withDescription("Update enabled skills to latest"));

const skillsDoctor = Command.make(
  "doctor",
  {
    fix: Options.boolean("fix").pipe(Options.withDefault(false)),
  },
  ({ fix }) => skillsHandler(buildParsedArgs(["doctor"], { fix }))
).pipe(Command.withDescription("Diagnose and fix common issues"));

const skillsUpdate = Command.make(
  "update",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Skill name")),
    trigger: Options.text("trigger").pipe(Options.optional),
    allowedTools: Options.text("allowed-tools").pipe(Options.optional),
    description: Options.text("description").pipe(Options.optional),
  },
  ({ name, trigger, allowedTools, description }) => {
    const flags: Record<string, string | boolean> = {};
    if (trigger._tag === "Some") flags.trigger = trigger.value;
    if (allowedTools._tag === "Some") flags["allowed-tools"] = allowedTools.value;
    if (description._tag === "Some") flags.description = description.value;
    return skillsHandler(buildParsedArgs(["update", name], flags));
  }
).pipe(Command.withDescription("Update skill metadata"));

const skillsValidate = Command.make(
  "validate",
  {
    nameOrPath: Args.text({ name: "name" }).pipe(Args.withDescription("Skill name or path")),
    json: Options.boolean("json").pipe(Options.withDefault(false)),
  },
  ({ nameOrPath, json }) => skillsHandler(buildParsedArgs(["validate", nameOrPath], { json }))
).pipe(Command.withDescription("Validate skill against agentskills.io standard"));

const skillsCommand = Command.make("skills", {}, () =>
  Effect.sync(() => {
    console.log("Skills - Package manager for agent context\n");
    console.log("USAGE: grim st skills <command>\n");
    console.log("Run 'grim st skills <command> --help' for help on a specific command.");
  })
).pipe(
  Command.withDescription("Manage agent skills"),
  Command.withSubcommands([
    skillsInstall,
    skillsInit,
    skillsAdd,
    skillsEnable,
    skillsDisable,
    skillsList,
    skillsInfo,
    skillsSearch,
    skillsSync,
    skillsDoctor,
    skillsUpdate,
    skillsValidate,
  ])
);

// Plugins subcommands
const pluginsAdd = Command.make(
  "add",
  {
    source: Args.text({ name: "source" }).pipe(Args.withDescription("Source (e.g., github:owner/repo)")),
    user: Options.boolean("user").pipe(Options.withDefault(false)),
    project: Options.boolean("project").pipe(Options.withDefault(false)),
  },
  ({ source, user, project }) => pluginsHandler(buildParsedArgs(["add", source], { user, project }))
).pipe(Command.withDescription("Add marketplace and select plugins to install"));

const pluginsInstall = Command.make(
  "install",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Plugin name")),
    marketplace: Options.text("marketplace").pipe(Options.optional),
  },
  ({ name, marketplace }) => {
    const flags: Record<string, string | boolean> = {};
    if (marketplace._tag === "Some") flags.marketplace = marketplace.value;
    return pluginsHandler(buildParsedArgs(["install", name], flags));
  }
).pipe(Command.withDescription("Install a specific plugin"));

const pluginsList = Command.make("list", {}, () =>
  pluginsHandler(buildParsedArgs(["list"], {}))
).pipe(Command.withDescription("List installed plugins"));

const pluginsInfo = Command.make(
  "info",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Plugin name")),
  },
  ({ name }) => pluginsHandler(buildParsedArgs(["info", name], {}))
).pipe(Command.withDescription("Show details about a plugin"));

const pluginsUninstall = Command.make(
  "uninstall",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Plugin name")),
  },
  ({ name }) => pluginsHandler(buildParsedArgs(["uninstall", name], {}))
).pipe(Command.withDescription("Uninstall a plugin"));

const pluginsMarketplaceList = Command.make("list", {}, () =>
  pluginsHandler(buildParsedArgs(["marketplace", "list"], {}))
).pipe(Command.withDescription("List added marketplaces"));

const pluginsMarketplaceRemove = Command.make(
  "remove",
  {
    name: Args.text({ name: "name" }).pipe(Args.optional),
  },
  ({ name }) => pluginsHandler(buildParsedArgs(
    ["marketplace", "remove", ...(name._tag === "Some" ? [name.value] : [])],
    {}
  ))
).pipe(Command.withDescription("Remove a marketplace"));

const pluginsMarketplace = Command.make("marketplace", {}, () =>
  Effect.sync(() => console.log("Use 'grim st plugins marketplace list' or 'grim st plugins marketplace remove'"))
).pipe(
  Command.withDescription("Marketplace management"),
  Command.withSubcommands([pluginsMarketplaceList, pluginsMarketplaceRemove])
);

const pluginsCommand = Command.make("plugins", {}, () =>
  Effect.sync(() => {
    console.log("Plugins - Claude Code plugin management\n");
    console.log("USAGE: grim st plugins <command>\n");
    console.log("Run 'grim st plugins <command> --help' for help.");
  })
).pipe(
  Command.withDescription("Manage Claude Code plugins"),
  Command.withSubcommands([
    pluginsAdd,
    pluginsInstall,
    pluginsList,
    pluginsInfo,
    pluginsUninstall,
    pluginsMarketplace,
  ])
);

// Agents subcommands
const agentsCreate = Command.make(
  "create",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Agent name")),
    cli: Options.text("cli").pipe(Options.optional, Options.withDescription("CLI tool to wrap")),
  },
  ({ name, cli }) => {
    const flags: Record<string, string | boolean> = {};
    if (cli._tag === "Some") flags.cli = cli.value;
    return agentsHandler(buildParsedArgs(["create", name], flags));
  }
).pipe(Command.withDescription("Scaffold a new agent definition"));

const agentsList = Command.make("list", {}, () =>
  agentsHandler(buildParsedArgs(["list"], {}))
).pipe(Command.withDescription("List available and enabled agents"));

const agentsEnable = Command.make(
  "enable",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Agent name")),
  },
  ({ name }) => agentsHandler(buildParsedArgs(["enable", name], {}))
).pipe(Command.withDescription("Enable agent in current project"));

const agentsDisable = Command.make(
  "disable",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Agent name")),
  },
  ({ name }) => agentsHandler(buildParsedArgs(["disable", name], {}))
).pipe(Command.withDescription("Disable agent from current project"));

const agentsInfo = Command.make(
  "info",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Agent name")),
  },
  ({ name }) => agentsHandler(buildParsedArgs(["info", name], {}))
).pipe(Command.withDescription("Show agent details"));

const agentsValidate = Command.make(
  "validate",
  {
    nameOrPath: Args.text({ name: "name" }).pipe(Args.withDescription("Agent name or path")),
  },
  ({ nameOrPath }) => agentsHandler(buildParsedArgs(["validate", nameOrPath], {}))
).pipe(Command.withDescription("Validate agent definition"));

const agentsCommand = Command.make("agents", {}, () =>
  Effect.sync(() => {
    console.log("Agents - CLI tool subagent management\n");
    console.log("USAGE: grim st agents <command>\n");
    console.log("Run 'grim st agents <command> --help' for help.");
  })
).pipe(
  Command.withDescription("Manage subagent definitions"),
  Command.withSubcommands([
    agentsCreate,
    agentsList,
    agentsEnable,
    agentsDisable,
    agentsInfo,
    agentsValidate,
  ])
);

// Add command (shortcut)
const addCommand = Command.make(
  "add",
  {
    source: Args.text({ name: "source" }).pipe(Args.withDescription("Source (e.g., github:owner/repo)")),
  },
  ({ source }) => Effect.promise(() => addHandler(buildParsedArgs([source], {})))
).pipe(Command.withDescription("Add skills/plugins from GitHub or marketplace"));

/**
 * St command with subcommands
 */
export const stCommand = Command.make("st", {}, () =>
  Effect.sync(() => {
    console.log("Skills/Tools - Manage agent capabilities\n");
    console.log("USAGE:");
    console.log("  grim st <command> [subcommand] [options]\n");
    console.log("COMMANDS:");
    console.log("  skills      Manage agent skills (context injection)");
    console.log("  plugins     Manage Claude Code plugins");
    console.log("  agents      Manage subagent definitions");
    console.log("  add         Add skills/plugins from GitHub or marketplace\n");
    console.log("Run 'grim st <command> --help' for command-specific help.");
  })
).pipe(
  Command.withDescription("Skills/Tools - manage skills, plugins, agents"),
  Command.withSubcommands([skillsCommand, pluginsCommand, agentsCommand, addCommand])
);
