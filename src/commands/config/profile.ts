/**
 * Profile Command - Manage harness configuration profiles
 *
 * Profiles are configuration snapshots that can be switched, diffed, and shared.
 * Inspired by bridle's profile management system.
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { ProfileService } from "../../services/profile/profile-service";
import type { HarnessId } from "../../models/profile";
import { HARNESS_CONFIG_PATHS } from "../../models/profile";

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
 * Format profile list for display
 */
const formatProfileList = (
  profiles: Array<{ name: string; isActive: boolean; skills: { items: readonly string[] } }>
): string => {
  if (profiles.length === 0) {
    return "  (no profiles)";
  }

  return profiles
    .map((p) => {
      const activeMarker = p.isActive ? " *" : "";
      const skillCount = p.skills.items.length;
      const skillInfo = skillCount > 0 ? ` (${skillCount} skills)` : "";
      return `  ${p.name}${activeMarker}${skillInfo}`;
    })
    .join("\n");
};

/**
 * Show help for profile command
 */
const showHelp = (): void => {
  console.log("Profile Management - Harness Configuration Snapshots\n");
  console.log("USAGE:");
  console.log("  grim config profile <command> [harness] [name]\n");
  console.log("COMMANDS:");
  console.log("  list [harness]                    List profiles (all or for harness)");
  console.log("  show <harness> <name>             Show profile details");
  console.log("  create <harness> <name>           Create empty profile");
  console.log("  create <harness> <name> --current Snapshot current config");
  console.log("  delete <harness> <name>           Delete profile");
  console.log("  switch <harness> <name>           Switch to profile");
  console.log("  diff <harness> <p1> [p2]          Compare profiles\n");
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
  console.log("  grim config profile list");
  console.log("  grim config profile create claude-code work --current");
  console.log("  grim config profile switch cc work");
  console.log("  grim config profile delete claude-code old-config\n");
  console.log("Profiles are stored in ~/.grimoire/profiles/");
};

/**
 * Profile command handler
 */
export const profileCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const profileService = yield* ProfileService;

    // Get command parts: profile <command> [harness] [name]
    // args.positional[0] is "profile"
    const command = args.positional[1];
    const harnessInput = args.positional[2];
    const profileName = args.positional[3];
    const secondProfileName = args.positional[4]; // For diff

    // Show help if no command
    if (!command) {
      showHelp();
      return;
    }

    switch (command) {
      case "list": {
        // List profiles for all harnesses or specific one
        if (harnessInput) {
          const harnessId = resolveHarness(harnessInput);
          if (!harnessId) {
            console.log(`Unknown harness: ${harnessInput}`);
            console.log(`Valid harnesses: ${Object.keys(HARNESS_ALIASES).join(", ")}`);
            return;
          }

          const profiles = yield* profileService.list(harnessId).pipe(
            Effect.catchTag("UnknownHarnessError", (e) => {
              console.log(`Unknown harness: ${e.harnessId}`);
              return Effect.succeed([]);
            }),
            Effect.catchTag("ProfileConfigError", (e) => {
              console.log(`Config error: ${e.reason}`);
              return Effect.succeed([]);
            })
          );

          console.log(`\n${harnessId} Profiles:\n`);
          console.log(formatProfileList(profiles));
          console.log("\n* = active profile");
        } else {
          // List all harnesses
          const all = yield* profileService.listAll().pipe(
            Effect.catchTag("ProfileConfigError", (e) => {
              console.log(`Config error: ${e.reason}`);
              return Effect.succeed([]);
            })
          );

          if (all.length === 0) {
            console.log("\nNo profiles configured.");
            console.log("Use 'grim config profile create <harness> <name>' to create one.");
            return;
          }

          console.log("\nConfigured Profiles:\n");
          for (const { harnessId, profiles } of all) {
            console.log(`${harnessId}:`);
            console.log(formatProfileList(profiles));
            console.log("");
          }
          console.log("* = active profile");
        }
        break;
      }

      case "show": {
        if (!harnessInput || !profileName) {
          console.log("Usage: grim config profile show <harness> <name>");
          return;
        }

        const harnessId = resolveHarness(harnessInput);
        if (!harnessId) {
          console.log(`Unknown harness: ${harnessInput}`);
          return;
        }

        const profile = yield* profileService.get(harnessId, profileName).pipe(
          Effect.catchTag("ProfileNotFoundError", (e) => {
            console.log(`Profile not found: ${e.profileName}`);
            return Effect.succeed(null);
          }),
          Effect.catchTag("ProfileConfigError", (e) => {
            console.log(`Config error: ${e.reason}`);
            return Effect.succeed(null);
          })
        );

        if (!profile) return;

        console.log(`\nProfile: ${profile.name}`);
        console.log(`Harness: ${profile.harnessId}`);
        console.log(`Active:  ${profile.isActive ? "Yes" : "No"}`);
        console.log(`Path:    ${profile.path}`);
        console.log("");

        if (profile.model) {
          console.log(`Model:   ${profile.model}`);
        }
        if (profile.theme) {
          console.log(`Theme:   ${profile.theme}`);
        }

        console.log(`\nSkills (${profile.skills.items.length}):`);
        if (profile.skills.items.length > 0) {
          profile.skills.items.forEach((s) => console.log(`  - ${s}`));
        } else {
          console.log("  (none)");
        }

        console.log(`\nCommands (${profile.commands.items.length}):`);
        if (profile.commands.items.length > 0) {
          profile.commands.items.forEach((c) => console.log(`  - ${c}`));
        } else {
          console.log("  (none)");
        }

        if (profile.agents && profile.agents.items.length > 0) {
          console.log(`\nAgents (${profile.agents.items.length}):`);
          profile.agents.items.forEach((a) => console.log(`  - ${a}`));
        }

        console.log("");
        break;
      }

      case "create": {
        if (!harnessInput || !profileName) {
          console.log("Usage: grim config profile create <harness> <name> [--current]");
          return;
        }

        const harnessId = resolveHarness(harnessInput);
        if (!harnessId) {
          console.log(`Unknown harness: ${harnessInput}`);
          return;
        }

        const fromCurrent = args.flags["current"] === true || args.flags["from-current"] === true;

        yield* profileService
          .create(harnessId, profileName, { fromCurrent })
          .pipe(
            Effect.catchTag("ProfileAlreadyExistsError", (e) => {
              console.log(`Profile already exists: ${e.profileName}`);
              return Effect.void;
            }),
            Effect.catchTag("InvalidProfileNameError", (e) => {
              console.log(`Invalid profile name: ${e.name}`);
              console.log(`Reason: ${e.reason}`);
              return Effect.void;
            }),
            Effect.catchTag("HarnessNotInstalledError", (e) => {
              console.log(`Harness not installed: ${e.harnessId}`);
              console.log(`Expected config at: ${e.configPath}`);
              return Effect.void;
            }),
            Effect.catchTag("UnknownHarnessError", (e) => {
              console.log(`Unknown harness: ${e.harnessId}`);
              return Effect.void;
            }),
            Effect.catchTag("ProfileConfigError", (e) => {
              console.log(`Config error: ${e.reason}`);
              return Effect.void;
            }),
            Effect.tap(() =>
              Effect.sync(() => {
                if (fromCurrent) {
                  console.log(`Created profile '${profileName}' from current ${harnessId} config`);
                } else {
                  console.log(`Created empty profile '${profileName}' for ${harnessId}`);
                }
              })
            )
          );
        break;
      }

      case "delete": {
        if (!harnessInput || !profileName) {
          console.log("Usage: grim config profile delete <harness> <name>");
          return;
        }

        const harnessId = resolveHarness(harnessInput);
        if (!harnessId) {
          console.log(`Unknown harness: ${harnessInput}`);
          return;
        }

        const deleteResult = yield* profileService
          .delete(harnessId, profileName)
          .pipe(
            Effect.map(() => ({ success: true as const })),
            Effect.catchTag("ProfileNotFoundError", (e) => {
              console.log(`Profile not found: ${e.profileName}`);
              return Effect.succeed({ success: false as const });
            }),
            Effect.catchTag("CannotDeleteActiveProfileError", (e) => {
              console.log(`Cannot delete active profile: ${e.profileName}`);
              console.log("Switch to another profile first.");
              return Effect.succeed({ success: false as const });
            }),
            Effect.catchTag("ProfileConfigError", (e) => {
              console.log(`Config error: ${e.reason}`);
              return Effect.succeed({ success: false as const });
            })
          );

        if (deleteResult.success) {
          console.log(`Deleted profile '${profileName}' from ${harnessId}`);
        }
        break;
      }

      case "switch": {
        if (!harnessInput || !profileName) {
          console.log("Usage: grim config profile switch <harness> <name>");
          return;
        }

        const harnessId = resolveHarness(harnessInput);
        if (!harnessId) {
          console.log(`Unknown harness: ${harnessInput}`);
          return;
        }

        // Check if profile exists
        const profile = yield* profileService.get(harnessId, profileName).pipe(
          Effect.catchTag("ProfileNotFoundError", (e) => {
            console.log(`Profile not found: ${e.profileName}`);
            return Effect.succeed(null);
          }),
          Effect.catchTag("ProfileConfigError", (e) => {
            console.log(`Config error: ${e.reason}`);
            return Effect.succeed(null);
          })
        );

        if (!profile) return;

        // For now, just mark as active (full switching with backup is grimoire-1k32)
        yield* profileService.setActive(harnessId, profileName).pipe(
          Effect.catchTag("ProfileConfigError", (e) => {
            console.log(`Config error: ${e.reason}`);
            return Effect.void;
          }),
          Effect.tap(() =>
            Effect.sync(() => {
              console.log(`Switched ${harnessId} to profile '${profileName}'`);
              console.log("");
              console.log("Note: This marks the profile as active in grimoire's config.");
              console.log("Full config switching will be implemented in a future update.");
            })
          )
        );
        break;
      }

      case "diff": {
        if (!harnessInput || !profileName) {
          console.log("Usage: grim config profile diff <harness> <profile1> [profile2]");
          console.log("  If profile2 is omitted, compares profile1 with current config");
          return;
        }

        const harnessId = resolveHarness(harnessInput);
        if (!harnessId) {
          console.log(`Unknown harness: ${harnessInput}`);
          return;
        }

        // TODO: Implement diff (grimoire-1npu)
        console.log(`Diff not yet implemented.`);
        console.log(`Would compare: ${profileName} vs ${secondProfileName || "current config"}`);
        break;
      }

      default:
        console.log(`Unknown command: ${command}`);
        showHelp();
    }
  });
