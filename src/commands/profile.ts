/**
 * Profile Command - Manage harness-agnostic configuration profiles
 *
 * Profiles can be applied to any supported AI coding assistant.
 * Users have full control over which harnesses receive which profiles.
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../cli/parser";
import { ProfileService } from "../services/profile/profile-service";
import type { HarnessId } from "../models/profile";
import { HARNESS_CONFIG_PATHS } from "../models/profile";

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

/**
 * Resolve harness alias to canonical ID
 */
const resolveHarness = (input: string): HarnessId | undefined => {
  return HARNESS_ALIASES[input.toLowerCase()];
};

/**
 * Parse comma-separated harness list
 */
const parseHarnesses = (input: string): HarnessId[] => {
  return input
    .split(",")
    .map((s) => s.trim())
    .map(resolveHarness)
    .filter((h): h is HarnessId => h !== undefined);
};

/**
 * Show help for profile command
 */
const showHelp = (): void => {
  console.log("Profile Management - Cross-Harness Configuration\n");
  console.log("USAGE:");
  console.log("  grim profile                          Interactive TUI (coming soon)");
  console.log("  grim profile <command> [args]\n");
  console.log("COMMANDS:");
  console.log("  list                                  List all profiles");
  console.log("  show <name>                           Show profile details");
  console.log("  create <name> [--desc=...] [--from=h] Create new profile");
  console.log("  delete <name>                         Delete profile");
  console.log("  apply <name> [harnesses]              Apply to harnesses");
  console.log("  remove <name> [harnesses]             Remove from harnesses");
  console.log("  harnesses                             List available harnesses\n");
  console.log("HARNESSES:");
  console.log("  claude-code (cc)    Claude Code CLI");
  console.log("  opencode (oc)       OpenCode");
  console.log("  cursor              Cursor IDE");
  console.log("  codex               OpenAI Codex CLI");
  console.log("  aider               Aider");
  console.log("  amp                 Sourcegraph Amp");
  console.log("  goose               Goose AI");
  console.log("  gemini              Google Gemini CLI\n");
  console.log("EXAMPLES:");
  console.log("  grim profile create work --desc=\"Work configuration\"");
  console.log("  grim profile create personal --from=claude-code");
  console.log("  grim profile apply work claude-code,opencode");
  console.log("  grim profile apply work                    # Apply to all installed");
  console.log("  grim profile remove work cursor");
  console.log("  grim profile delete old-config\n");
  console.log("Profiles are stored in ~/.grimoire/profiles/");
};

/**
 * Format harness list for display
 */
const formatHarnesses = (harnesses: readonly HarnessId[]): string => {
  if (harnesses.length === 0) return "(none)";
  return harnesses.join(", ");
};

/**
 * Profile command handler
 */
export const profileCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const profileService = yield* ProfileService;

    const command = args.positional[0];
    const arg1 = args.positional[1];
    const arg2 = args.positional[2];

    // Show help if no command
    if (!command) {
      showHelp();
      return;
    }

    switch (command) {
      case "list": {
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
          const applied = formatHarnesses(p.appliedTo);
          console.log(
            `${p.name.padEnd(20)}${String(p.skillCount).padEnd(8)}${String(p.commandCount).padEnd(6)}${String(p.mcpServerCount).padEnd(5)}${applied}`
          );
        }
        console.log("");
        break;
      }

      case "show": {
        if (!arg1) {
          console.log("Usage: grim profile show <name>");
          return;
        }

        const profile = yield* profileService.get(arg1).pipe(
          Effect.catchTag("ProfileNotFoundError", () => {
            console.log(`Profile not found: ${arg1}`);
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

        if (profile.metadata.tags && profile.metadata.tags.length > 0) {
          console.log(`Tags: ${profile.metadata.tags.join(", ")}`);
        }

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
        break;
      }

      case "create": {
        if (!arg1) {
          console.log("Usage: grim profile create <name> [--desc=...] [--from=harness]");
          return;
        }

        const description = args.flags["desc"] as string | undefined;
        const fromHarnessInput = args.flags["from"] as string | undefined;
        const fromHarness = fromHarnessInput ? resolveHarness(fromHarnessInput) : undefined;

        if (fromHarnessInput && !fromHarness) {
          console.log(`Unknown harness: ${fromHarnessInput}`);
          return;
        }

        const result = yield* profileService
          .create(arg1, { description, fromHarness })
          .pipe(
            Effect.map(() => ({ success: true as const })),
            Effect.catchTag("ProfileAlreadyExistsError", () => {
              console.log(`Profile already exists: ${arg1}`);
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
            })
          );

        if (result.success) {
          console.log(`Created profile: ${arg1}`);
          if (fromHarness) {
            console.log(`(Extracted from ${fromHarness} - extraction not yet implemented)`);
          }
        }
        break;
      }

      case "delete": {
        if (!arg1) {
          console.log("Usage: grim profile delete <name>");
          return;
        }

        const result = yield* profileService
          .delete(arg1)
          .pipe(
            Effect.map(() => ({ success: true as const })),
            Effect.catchTag("ProfileNotFoundError", () => {
              console.log(`Profile not found: ${arg1}`);
              return Effect.succeed({ success: false as const });
            }),
            Effect.catchTag("ProfileConfigError", (e) => {
              console.log(`Config error: ${e.reason}`);
              return Effect.succeed({ success: false as const });
            })
          );

        if (result.success) {
          console.log(`Deleted profile: ${arg1}`);
        }
        break;
      }

      case "apply": {
        if (!arg1) {
          console.log("Usage: grim profile apply <name> [harness1,harness2,...]");
          console.log("       If no harnesses specified, applies to all installed harnesses.");
          return;
        }

        // Determine which harnesses to apply to
        let harnesses: HarnessId[];
        if (arg2) {
          harnesses = parseHarnesses(arg2);
          if (harnesses.length === 0) {
            console.log(`No valid harnesses in: ${arg2}`);
            return;
          }
        } else {
          // Apply to all installed harnesses
          const allHarnesses = yield* profileService.listHarnesses();
          harnesses = allHarnesses.filter((h) => h.installed).map((h) => h.id);
          if (harnesses.length === 0) {
            console.log("No harnesses installed.");
            return;
          }
        }

        const result = yield* profileService
          .apply(arg1, harnesses)
          .pipe(
            Effect.map(() => ({ success: true as const })),
            Effect.catchTag("ProfileNotFoundError", () => {
              console.log(`Profile not found: ${arg1}`);
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
          console.log(`Applied '${arg1}' to: ${harnesses.join(", ")}`);
          console.log("\nNote: Actual config copying not yet implemented.");
          console.log("Profile is marked as applied but harness configs unchanged.");
        }
        break;
      }

      case "remove": {
        if (!arg1) {
          console.log("Usage: grim profile remove <name> <harness1,harness2,...>");
          return;
        }

        if (!arg2) {
          console.log("Please specify which harnesses to remove the profile from.");
          console.log("Usage: grim profile remove <name> <harness1,harness2,...>");
          return;
        }

        const harnesses = parseHarnesses(arg2);
        if (harnesses.length === 0) {
          console.log(`No valid harnesses in: ${arg2}`);
          return;
        }

        const result = yield* profileService
          .remove(arg1, harnesses)
          .pipe(
            Effect.map(() => ({ success: true as const })),
            Effect.catchTag("ProfileNotFoundError", () => {
              console.log(`Profile not found: ${arg1}`);
              return Effect.succeed({ success: false as const });
            }),
            Effect.catchTag("ProfileConfigError", (e) => {
              console.log(`Config error: ${e.reason}`);
              return Effect.succeed({ success: false as const });
            })
          );

        if (result.success) {
          console.log(`Removed '${arg1}' from: ${harnesses.join(", ")}`);
        }
        break;
      }

      case "harnesses": {
        const harnesses = yield* profileService.listHarnesses();

        console.log("\nAvailable Harnesses:\n");
        console.log("HARNESS".padEnd(15) + "STATUS".padEnd(15) + "CONFIG PATH");
        console.log("-".repeat(70));

        for (const h of harnesses) {
          const status = h.installed ? "\x1b[32minstalled\x1b[0m" : "\x1b[33mnot found\x1b[0m";
          console.log(`${h.id.padEnd(15)}${status.padEnd(26)}${h.configPath}`);
        }
        console.log("");
        break;
      }

      default:
        console.log(`Unknown command: ${command}`);
        showHelp();
    }
  });
