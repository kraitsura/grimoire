/**
 * Pin Command - Pin prompts for quick access
 *
 * Usage:
 *   grimoire pin <prompt-name>     # Toggle pin
 *   grimoire pin --list            # List all pinned
 *   grimoire pin --add <name>      # Pin prompt
 *   grimoire pin --remove <name>   # Unpin prompt
 */

import { Effect } from "effect";
import { StorageService, SqlService } from "../../services";
import type { ParsedArgs } from "../../cli/parser";

/**
 * Database row structure for prompts table
 */
interface PromptRow {
  id: string;
  name: string;
  is_pinned?: number;
  updated_at: string;
}

/**
 * Pin command handler
 */
export const pinCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const sql = yield* SqlService;

    const listFlag = args.flags.list || args.flags.l;
    const addFlag = args.flags.add;
    const removeFlag = args.flags.remove;

    // Handle --list flag
    if (listFlag) {
      const rows = yield* sql.query<PromptRow>(
        "SELECT id, name, updated_at FROM prompts WHERE is_pinned = 1 ORDER BY pin_order, name"
      );

      if (rows.length === 0) {
        console.log("No pinned prompts.");
        return;
      }

      console.log("PINNED PROMPTS");
      console.log("-".repeat(40));

      for (const row of rows) {
        console.log(row.name);
      }

      return;
    }

    // Handle --add flag
    if (typeof addFlag === "string") {
      const promptName = addFlag;

      // Find prompt by name
      const prompt = yield* storage.getByName(promptName);

      // Check if already pinned
      if (prompt.isPinned) {
        console.log(`'${promptName}' is already pinned.`);
        return;
      }

      // Update to pinned
      yield* storage.update(prompt.id, { isPinned: true });

      console.log(`Pinned '${promptName}'.`);
      return;
    }

    // Handle --remove flag
    if (typeof removeFlag === "string") {
      const promptName = removeFlag;

      // Find prompt by name
      const prompt = yield* storage.getByName(promptName);

      // Check if not pinned
      if (!prompt.isPinned) {
        console.log(`'${promptName}' is not pinned.`);
        return;
      }

      // Update to not pinned
      yield* storage.update(prompt.id, { isPinned: false });

      console.log(`Unpinned '${promptName}'.`);
      return;
    }

    // Handle toggle (default action)
    const promptName = args.positional[0];

    if (!promptName) {
      console.log("Usage:");
      console.log("  grimoire pin <prompt-name>     # Toggle pin");
      console.log("  grimoire pin --list            # List all pinned");
      console.log("  grimoire pin --add <name>      # Pin prompt");
      console.log("  grimoire pin --remove <name>   # Unpin prompt");
      return;
    }

    // Find prompt by name
    const prompt = yield* storage.getByName(promptName);

    // Toggle pin status
    const newPinStatus = !prompt.isPinned;
    yield* storage.update(prompt.id, { isPinned: newPinStatus });

    if (newPinStatus) {
      console.log(`Pinned '${promptName}'.`);
    } else {
      console.log(`Unpinned '${promptName}'.`);
    }
  });
