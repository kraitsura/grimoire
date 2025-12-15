/**
 * Favorite Command - Mark prompts as favorites
 *
 * Usage:
 *   grimoire favorite <prompt-name>     # Toggle favorite
 *   grimoire favorite --list            # List all favorites
 *   grimoire favorite --add <name>      # Add to favorites
 *   grimoire favorite --remove <name>   # Remove from favorites
 */

import { Effect } from "effect";
import { StorageService, SqlService } from "../services";
import type { ParsedArgs } from "../cli/parser";

/**
 * Database row structure for prompts table
 */
interface PromptRow {
  id: string;
  name: string;
  is_favorite?: number;
  updated_at: string;
}

/**
 * Favorite command handler
 */
export const favoriteCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const sql = yield* SqlService;

    const listFlag = args.flags["list"] || args.flags["l"];
    const addFlag = args.flags["add"];
    const removeFlag = args.flags["remove"];

    // Handle --list flag
    if (listFlag) {
      const rows = yield* sql.query<PromptRow>(
        "SELECT id, name, updated_at FROM prompts WHERE is_favorite = 1 ORDER BY favorite_order, name"
      );

      if (rows.length === 0) {
        console.log("No favorite prompts.");
        return;
      }

      console.log("FAVORITE PROMPTS");
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

      // Check if already favorite
      if (prompt.isFavorite) {
        console.log(`'${promptName}' is already a favorite.`);
        return;
      }

      // Update to favorite
      yield* storage.update(prompt.id, { isFavorite: true });

      console.log(`Added '${promptName}' to favorites.`);
      return;
    }

    // Handle --remove flag
    if (typeof removeFlag === "string") {
      const promptName = removeFlag;

      // Find prompt by name
      const prompt = yield* storage.getByName(promptName);

      // Check if not favorite
      if (!prompt.isFavorite) {
        console.log(`'${promptName}' is not a favorite.`);
        return;
      }

      // Update to not favorite
      yield* storage.update(prompt.id, { isFavorite: false });

      console.log(`Removed '${promptName}' from favorites.`);
      return;
    }

    // Handle toggle (default action)
    const promptName = args.positional[0];

    if (!promptName) {
      console.log("Usage:");
      console.log("  grimoire favorite <prompt-name>     # Toggle favorite");
      console.log("  grimoire favorite --list            # List all favorites");
      console.log("  grimoire favorite --add <name>      # Add to favorites");
      console.log("  grimoire favorite --remove <name>   # Remove from favorites");
      return;
    }

    // Find prompt by name
    const prompt = yield* storage.getByName(promptName);

    // Toggle favorite status
    const newFavoriteStatus = !prompt.isFavorite;
    yield* storage.update(prompt.id, { isFavorite: newFavoriteStatus });

    if (newFavoriteStatus) {
      console.log(`Added '${promptName}' to favorites.`);
    } else {
      console.log(`Removed '${promptName}' from favorites.`);
    }
  });
