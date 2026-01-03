/**
 * Profile Command - Manage harness-agnostic configuration profiles
 */

import { Args, Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { ProfileService } from "../../services/profile/profile-service";
import type { HarnessId } from "../../models/profile";

/**
 * Valid harness aliases for flexible input
 */
const HARNESS_ALIASES: Record<string, HarnessId> = {
  "claude-code": "claude-code",
  claude: "claude-code",
  cc: "claude-code",
  opencode: "opencode",
  oc: "opencode",
  cursor: "cursor",
  codex: "codex",
  aider: "aider",
  amp: "amp",
  goose: "goose",
  gemini: "gemini",
};

const resolveHarness = (input: string): HarnessId | undefined =>
  HARNESS_ALIASES[input.toLowerCase()];

const parseHarnesses = (input: string): HarnessId[] =>
  input
    .split(",")
    .map((s) => s.trim())
    .map(resolveHarness)
    .filter((h): h is HarnessId => h !== undefined);

const formatHarnesses = (harnesses: readonly HarnessId[]): string =>
  harnesses.length === 0 ? "(none)" : harnesses.join(", ");

// Subcommands

const profileList = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const profileService = yield* ProfileService;
    const profiles = yield* profileService.list().pipe(
      Effect.catchTag("ProfileConfigError", (e) => {
        console.log(`Config error: ${e.reason}`);
        return Effect.succeed([]);
      })
    );

    if (profiles.length === 0) {
      console.log("\nNo profiles configured.");
      console.log("Use 'grim profile create <name>' to create one.");
      return;
    }

    console.log("\nProfiles:\n");
    console.log(
      "NAME".padEnd(20) +
        "SKILLS".padEnd(8) +
        "CMDS".padEnd(6) +
        "MCP".padEnd(5) +
        "APPLIED TO"
    );
    console.log("-".repeat(70));

    for (const p of profiles) {
      console.log(
        `${p.name.padEnd(20)}${String(p.skillCount).padEnd(8)}${String(p.commandCount).padEnd(6)}${String(p.mcpServerCount).padEnd(5)}${formatHarnesses(p.appliedTo)}`
      );
    }
    console.log("");
  })
).pipe(Command.withDescription("List all profiles"));

const profileShow = Command.make(
  "show",
  { name: Args.text({ name: "name" }).pipe(Args.withDescription("Profile name")) },
  ({ name }) =>
    Effect.gen(function* () {
      const profileService = yield* ProfileService;
      const profile = yield* profileService.get(name).pipe(
        Effect.catchTag("ProfileNotFoundError", () => {
          console.log(`Profile not found: ${name}`);
          return Effect.succeed(null);
        }),
        Effect.catchTag("ProfileConfigError", (e) => {
          console.log(`Config error: ${e.reason}`);
          return Effect.succeed(null);
        })
      );

      if (!profile) return;

      console.log(`\nProfile: ${profile.metadata.name}`);
      if (profile.metadata.description) {
        console.log(`Description: ${profile.metadata.description}`);
      }
      console.log(`Created: ${profile.metadata.created}`);
      console.log(`Updated: ${profile.metadata.updated}`);
      console.log(`Applied to: ${formatHarnesses(profile.metadata.appliedTo)}`);

      console.log(`\nSkills (${profile.skills.length}):`);
      if (profile.skills.length > 0) {
        profile.skills.forEach((s) => console.log(`  - ${s}`));
      } else {
        console.log("  (none)");
      }

      console.log(`\nCommands (${profile.commands.length}):`);
      if (profile.commands.length > 0) {
        profile.commands.forEach((c) => console.log(`  - ${c}`));
      } else {
        console.log("  (none)");
      }

      console.log(`\nMCP Servers (${profile.mcpServers.length}):`);
      if (profile.mcpServers.length > 0) {
        profile.mcpServers.forEach((m) => {
          const status = m.enabled ? "enabled" : "disabled";
          console.log(`  - ${m.name} (${status})`);
        });
      } else {
        console.log("  (none)");
      }
      console.log("");
    })
).pipe(Command.withDescription("Show profile details"));

const profileCreate = Command.make(
  "create",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Profile name")),
    desc: Options.text("desc").pipe(
      Options.optional,
      Options.withDescription("Profile description")
    ),
    from: Options.text("from").pipe(
      Options.optional,
      Options.withDescription("Extract from harness (claude-code, opencode, etc.)")
    ),
  },
  ({ name, desc, from }) =>
    Effect.gen(function* () {
      const profileService = yield* ProfileService;
      const description = desc._tag === "Some" ? desc.value : undefined;
      const fromHarness = from._tag === "Some" ? resolveHarness(from.value) : undefined;

      if (from._tag === "Some" && !fromHarness) {
        console.log(`Unknown harness: ${from.value}`);
        return;
      }

      const result = yield* profileService
        .create(name, { description, fromHarness })
        .pipe(
          Effect.map(() => ({ success: true as const })),
          Effect.catchTag("ProfileAlreadyExistsError", () => {
            console.log(`Profile already exists: ${name}`);
            return Effect.succeed({ success: false as const });
          }),
          Effect.catchTag("InvalidProfileNameError", (e) => {
            console.log(`Invalid profile name: ${e.name}`);
            console.log(`Reason: ${e.reason}`);
            return Effect.succeed({ success: false as const });
          }),
          Effect.catchTag("HarnessNotInstalledError", (e) => {
            console.log(`Harness not installed: ${e.harnessId}`);
            return Effect.succeed({ success: false as const });
          }),
          Effect.catchTag("UnknownHarnessError", (e) => {
            console.log(`Unknown harness: ${e.harnessId}`);
            return Effect.succeed({ success: false as const });
          }),
          Effect.catchTag("ProfileConfigError", (e) => {
            console.log(`Config error: ${e.reason}`);
            return Effect.succeed({ success: false as const });
          }),
          Effect.catchTag("ProfileExtractionError", (e) => {
            console.log(`Extraction error: ${e.reason}`);
            return Effect.succeed({ success: false as const });
          })
        );

      if (result.success) {
        console.log(`Created profile: ${name}`);
        if (fromHarness) {
          console.log(`(Extracted from ${fromHarness})`);
        }
      }
    })
).pipe(Command.withDescription("Create new profile"));

const profileDelete = Command.make(
  "delete",
  { name: Args.text({ name: "name" }).pipe(Args.withDescription("Profile name")) },
  ({ name }) =>
    Effect.gen(function* () {
      const profileService = yield* ProfileService;
      const result = yield* profileService
        .delete(name)
        .pipe(
          Effect.map(() => ({ success: true as const })),
          Effect.catchTag("ProfileNotFoundError", () => {
            console.log(`Profile not found: ${name}`);
            return Effect.succeed({ success: false as const });
          }),
          Effect.catchTag("ProfileConfigError", (e) => {
            console.log(`Config error: ${e.reason}`);
            return Effect.succeed({ success: false as const });
          })
        );

      if (result.success) {
        console.log(`Deleted profile: ${name}`);
      }
    })
).pipe(Command.withDescription("Delete profile"));

const profileApply = Command.make(
  "apply",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Profile name")),
    harnesses: Args.text({ name: "harnesses" }).pipe(
      Args.optional,
      Args.withDescription("Comma-separated harnesses (or all installed if omitted)")
    ),
  },
  ({ name, harnesses: harnessesOpt }) =>
    Effect.gen(function* () {
      const profileService = yield* ProfileService;

      let harnesses: HarnessId[];
      if (harnessesOpt._tag === "Some") {
        harnesses = parseHarnesses(harnessesOpt.value);
        if (harnesses.length === 0) {
          console.log(`No valid harnesses in: ${harnessesOpt.value}`);
          return;
        }
      } else {
        const allHarnesses = yield* profileService.listHarnesses();
        harnesses = allHarnesses.filter((h) => h.installed).map((h) => h.id);
        if (harnesses.length === 0) {
          console.log("No harnesses installed.");
          return;
        }
      }

      const result = yield* profileService
        .apply(name, harnesses)
        .pipe(
          Effect.map(() => ({ success: true as const })),
          Effect.catchTag("ProfileNotFoundError", () => {
            console.log(`Profile not found: ${name}`);
            return Effect.succeed({ success: false as const });
          }),
          Effect.catchTag("HarnessNotInstalledError", (e) => {
            console.log(`Harness not installed: ${e.harnessId}`);
            return Effect.succeed({ success: false as const });
          }),
          Effect.catchTag("UnknownHarnessError", (e) => {
            console.log(`Unknown harness: ${e.harnessId}`);
            return Effect.succeed({ success: false as const });
          }),
          Effect.catchTag("ProfileConfigError", (e) => {
            console.log(`Config error: ${e.reason}`);
            return Effect.succeed({ success: false as const });
          })
        );

      if (result.success) {
        console.log(`Applied '${name}' to: ${harnesses.join(", ")}`);
      }
    })
).pipe(Command.withDescription("Apply profile to harnesses"));

const profileRemove = Command.make(
  "remove",
  {
    name: Args.text({ name: "name" }).pipe(Args.withDescription("Profile name")),
    harnesses: Args.text({ name: "harnesses" }).pipe(
      Args.withDescription("Comma-separated harnesses to remove from")
    ),
  },
  ({ name, harnesses: harnessesStr }) =>
    Effect.gen(function* () {
      const profileService = yield* ProfileService;
      const harnesses = parseHarnesses(harnessesStr);

      if (harnesses.length === 0) {
        console.log(`No valid harnesses in: ${harnessesStr}`);
        return;
      }

      const result = yield* profileService
        .remove(name, harnesses)
        .pipe(
          Effect.map(() => ({ success: true as const })),
          Effect.catchTag("ProfileNotFoundError", () => {
            console.log(`Profile not found: ${name}`);
            return Effect.succeed({ success: false as const });
          }),
          Effect.catchTag("ProfileConfigError", (e) => {
            console.log(`Config error: ${e.reason}`);
            return Effect.succeed({ success: false as const });
          })
        );

      if (result.success) {
        console.log(`Removed '${name}' from: ${harnesses.join(", ")}`);
      }
    })
).pipe(Command.withDescription("Remove profile from harnesses"));

const profileHarnesses = Command.make("harnesses", {}, () =>
  Effect.gen(function* () {
    const profileService = yield* ProfileService;
    const harnesses = yield* profileService.listHarnesses();

    console.log("\nAvailable Harnesses:\n");
    console.log("HARNESS".padEnd(15) + "STATUS".padEnd(15) + "CONFIG PATH");
    console.log("-".repeat(70));

    for (const h of harnesses) {
      const status = h.installed ? "\x1b[32minstalled\x1b[0m" : "\x1b[33mnot found\x1b[0m";
      console.log(`${h.id.padEnd(15)}${status.padEnd(26)}${h.configPath}`);
    }
    console.log("");
  })
).pipe(Command.withDescription("List available harnesses"));

const profileDiff = Command.make(
  "diff",
  {
    profile1: Args.text({ name: "profile1" }).pipe(Args.withDescription("First profile (or profile to compare)")),
    profile2: Args.text({ name: "profile2" }).pipe(
      Args.optional,
      Args.withDescription("Second profile to compare against")
    ),
    harness: Options.text("harness").pipe(
      Options.optional,
      Options.withDescription("Compare profile against harness config")
    ),
    json: Options.boolean("json").pipe(
      Options.withDefault(false),
      Options.withDescription("Output as JSON")
    ),
  },
  ({ profile1, profile2, harness, json }) =>
    Effect.gen(function* () {
      const profileService = yield* ProfileService;

      // If --harness is provided, compare profile vs harness
      if (harness._tag === "Some") {
        const harnessId = resolveHarness(harness.value);
        if (!harnessId) {
          console.log(`Unknown harness: ${harness.value}`);
          return;
        }

        const result = yield* profileService
          .diffWithHarness(profile1, harnessId)
          .pipe(
            Effect.catchTag("ProfileNotFoundError", () => {
              console.log(`Profile not found: ${profile1}`);
              return Effect.succeed(null);
            }),
            Effect.catchTag("ProfileConfigError", (e) => {
              console.log(`Config error: ${e.reason}`);
              return Effect.succeed(null);
            }),
            Effect.catchTag("UnknownHarnessError", (e) => {
              console.log(`Unknown harness: ${e.harnessId}`);
              return Effect.succeed(null);
            }),
            Effect.catchTag("HarnessNotInstalledError", (e) => {
              console.log(`Harness not installed: ${e.harnessId}`);
              return Effect.succeed(null);
            }),
            Effect.catchTag("ProfileExtractionError", (e) => {
              console.log(`Extraction error: ${e.reason}`);
              return Effect.succeed(null);
            })
          );

        if (!result) return;

        if (json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\nComparing profile '${profile1}' vs ${harnessId}\n`);

          if (result.identical) {
            console.log("\x1b[32m✓ No differences\x1b[0m");
          } else {
            for (const diff of result.differences) {
              const sign = diff.changeType === "added" ? "\x1b[32m+" : diff.changeType === "removed" ? "\x1b[31m-" : "\x1b[33m~";
              console.log(`${sign} [${diff.category}] ${diff.item}\x1b[0m`);
              if (diff.details) {
                console.log(`    ${diff.details}`);
              }
            }
            console.log(`\n${result.differences.length} difference(s) found.`);
          }
        }
        return;
      }

      // Compare two profiles
      if (profile2._tag !== "Some") {
        console.log("Usage:");
        console.log("  grim profile diff <profile1> <profile2>     Compare two profiles");
        console.log("  grim profile diff <profile> --harness=cc    Compare profile vs harness");
        return;
      }

      const result = yield* profileService
        .diff(profile1, profile2.value)
        .pipe(
          Effect.catchTag("ProfileNotFoundError", () => {
            console.log(`Profile not found`);
            return Effect.succeed(null);
          }),
          Effect.catchTag("ProfileConfigError", (e) => {
            console.log(`Config error: ${e.reason}`);
            return Effect.succeed(null);
          })
        );

      if (!result) return;

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\nComparing profiles: '${profile1}' vs '${profile2.value}'\n`);

        if (result.identical) {
          console.log("\x1b[32m✓ Profiles are identical\x1b[0m");
        } else {
          for (const diff of result.differences) {
            const sign = diff.changeType === "added" ? "\x1b[32m+" : diff.changeType === "removed" ? "\x1b[31m-" : "\x1b[33m~";
            console.log(`${sign} [${diff.category}] ${diff.item}\x1b[0m`);
            if (diff.details) {
              console.log(`    ${diff.details}`);
            }
          }
          console.log(`\n${result.differences.length} difference(s) found.`);
        }
      }
    })
).pipe(Command.withDescription("Compare profiles or profile vs harness"));

/**
 * Profile command with subcommands
 */
export const profileCommand = Command.make("profile", {}, () =>
  Effect.sync(() => {
    console.log("Profile Management - Cross-Harness Configuration\n");
    console.log("USAGE:");
    console.log("  grim profile <command> [args]\n");
    console.log("COMMANDS:");
    console.log("  list                     List all profiles");
    console.log("  show <name>              Show profile details");
    console.log("  create <name> [options]  Create new profile");
    console.log("  delete <name>            Delete profile");
    console.log("  apply <name> [harnesses] Apply to harnesses");
    console.log("  remove <name> <harnesses> Remove from harnesses");
    console.log("  harnesses                List available harnesses");
    console.log("  diff <p1> [p2|--harness] Compare profiles or vs harness\n");
    console.log("Run 'grim profile <command> --help' for command-specific help.");
  })
).pipe(
  Command.withDescription("Manage harness-agnostic configuration profiles"),
  Command.withSubcommands([
    profileList,
    profileShow,
    profileCreate,
    profileDelete,
    profileApply,
    profileRemove,
    profileHarnesses,
    profileDiff,
  ])
);
