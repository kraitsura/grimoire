/**
 * Alias Command - Manage command shortcuts/aliases
 *
 * Usage:
 *   grimoire alias <name> <command>   # Create alias
 *   grimoire alias --list             # List all aliases
 *   grimoire alias --remove <name>    # Remove alias
 */

import { Effect } from "effect";
import { AliasService } from "../services/alias-service";
import type { ParsedArgs } from "../cli/parser";

/**
 * Alias command implementation
 *
 * Supports creating, listing, and removing command aliases.
 */
export const aliasCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const aliasService = yield* AliasService;

    const listFlag = args.flags["list"];
    const removeFlag = args.flags["remove"];

    // List aliases
    if (listFlag) {
      const aliases = yield* aliasService.listAliases();

      if (aliases.length === 0) {
        console.log("No aliases defined.");
        return;
      }

      console.log("Aliases:\n");

      // Find longest alias name for alignment
      const maxNameLength = Math.max(...aliases.map((a) => a.name.length));

      // Sort alphabetically by name
      const sorted = [...aliases].sort((a, b) => a.name.localeCompare(b.name));

      for (const alias of sorted) {
        const name = alias.name.padEnd(maxNameLength + 2);
        const command = alias.command + (alias.args.length > 0 ? " " + alias.args.join(" ") : "");
        console.log(`  ${name}→ ${command}`);
      }

      console.log("\nUse: grimoire <alias> [args...]");
      return;
    }

    // Remove alias
    if (removeFlag) {
      const name = typeof removeFlag === "string" ? removeFlag : args.positional[0];

      if (!name) {
        console.log("Usage: grimoire alias --remove <name>");
        return;
      }

      yield* aliasService.removeAlias(name).pipe(
        Effect.catchTags({
          AliasNotFoundError: (error) =>
            Effect.sync(() => {
              console.log(`Alias not found: ${error.name}`);
            }),
          AliasError: (error) =>
            Effect.sync(() => {
              console.log(error.message);
            }),
        })
      );

      console.log(`Alias '${name}' removed`);
      return;
    }

    // Create alias
    const [name, ...commandParts] = args.positional;

    if (!name || commandParts.length === 0) {
      console.log("Usage:");
      console.log("  grimoire alias <name> <command>   # Create alias");
      console.log("  grimoire alias --list             # List all aliases");
      console.log("  grimoire alias --remove <name>    # Remove alias");
      return;
    }

    // Join command parts back together
    const commandString = commandParts.join(" ");

    // Parse command and args
    // The first word is the command, rest are args
    const parts = commandString.split(/\s+/);
    const command = parts[0];
    const commandArgs = parts.slice(1);

    yield* aliasService.createAlias(name, command, commandArgs);

    console.log(`Alias '${name}' created: ${commandString}`);
  });
