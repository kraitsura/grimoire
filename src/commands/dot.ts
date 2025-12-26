/**
 * Dot Command - Interactive dotfile explorer TUI
 *
 * Provides a lazygit-style interface for browsing and editing dotfiles.
 * Supports configurable editors (vim, code, zed, etc.)
 */

import React from "react";
import { render } from "ink";
import { Effect } from "effect";
import type { ParsedArgs } from "../cli/parser";
import { DotExplorer } from "../cli/components/dot";
import {
  ConfigService,
  ConfigServiceLive,
  type EditorConfig,
} from "../services/config-service";

/**
 * Dot command - Browse and edit dotfiles interactively
 *
 * Usage:
 *   grim dot                    # Open dotfile explorer in current directory
 *   grim dot /path/to/dir       # Open in specific directory
 *   grim dot --editor=code      # Use VS Code as editor
 *   grim dot --set-editor=zed   # Set default editor to Zed
 *
 * Configuration:
 *   The default editor is stored in ~/.grimoire/config.json
 *   Supported editors: vim, nvim, code, zed, subl, emacs, nano, micro, hx
 */
export const dotCommand = async (args: ParsedArgs): Promise<void> => {
  const { flags, positional } = args;

  // Handle --set-editor flag to change default editor
  if (flags["set-editor"]) {
    const editorName = String(flags["set-editor"]);
    const program = Effect.gen(function* () {
      const config = yield* ConfigService;
      yield* config.setEditor({ name: editorName });
      console.log(`Default editor set to: ${editorName}`);
    }).pipe(Effect.provide(ConfigServiceLive));

    await Effect.runPromise(program);
    return;
  }

  // Get editor config
  let editorConfig: EditorConfig = { name: "vim" };

  if (flags.editor) {
    // Use editor from command line flag
    editorConfig = { name: String(flags.editor) };
  } else {
    // Get from config
    const program = Effect.gen(function* () {
      const config = yield* ConfigService;
      return yield* config.getEditor();
    }).pipe(Effect.provide(ConfigServiceLive));

    try {
      editorConfig = await Effect.runPromise(program);
    } catch {
      // Use default vim
    }
  }

  // Get initial path from positional args
  const initialPath = positional[0];

  // Render the TUI
  await new Promise<void>((resolve) => {
    const { unmount, waitUntilExit } = render(
      React.createElement(DotExplorer, {
        initialPath,
        editorConfig,
        onExit: () => {
          unmount();
          resolve();
        },
      })
    );

    waitUntilExit().then(() => resolve());
  });
};
