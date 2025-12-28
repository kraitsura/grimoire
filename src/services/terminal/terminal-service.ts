/**
 * Terminal Service
 *
 * Detects the current terminal emulator and provides APIs for
 * opening new tabs/windows with commands.
 *
 * Supported terminals:
 * - iTerm2 (macOS): AppleScript
 * - Terminal.app (macOS): AppleScript
 * - WezTerm: CLI
 * - Alacritty: CLI (new window only, no tabs)
 *
 * Unsupported (no scripting API):
 * - Ghostty
 * - Kitty
 * - VS Code integrated terminal
 */

import { Context, Effect, Layer } from "effect";
import { spawn } from "child_process";

// =============================================================================
// Types
// =============================================================================

export type TerminalType =
  | "iterm2"
  | "terminal.app"
  | "wezterm"
  | "alacritty"
  | "ghostty"
  | "kitty"
  | "vscode"
  | "unknown";

export interface TerminalInfo {
  /** Detected terminal type */
  type: TerminalType;
  /** Human-readable name */
  name: string;
  /** Whether this terminal supports opening new tabs/windows programmatically */
  supportsNewTab: boolean;
  /** Whether it opens a tab (true) or window (false) */
  opensTab: boolean;
}

// =============================================================================
// Errors
// =============================================================================

export class TerminalNotSupportedError {
  readonly _tag = "TerminalNotSupportedError";
  constructor(
    readonly terminal: TerminalInfo,
    readonly message: string
  ) {}
}

export class TerminalCommandError {
  readonly _tag = "TerminalCommandError";
  constructor(
    readonly command: string,
    readonly stderr: string,
    readonly exitCode: number
  ) {}
}

// =============================================================================
// Terminal Detection
// =============================================================================

const detectTerminal = (): TerminalInfo => {
  const termProgram = process.env.TERM_PROGRAM ?? "";
  const term = process.env.TERM ?? "";

  // Check TERM_PROGRAM first (most reliable)
  if (termProgram === "iTerm.app") {
    return {
      type: "iterm2",
      name: "iTerm2",
      supportsNewTab: true,
      opensTab: true,
    };
  }

  if (termProgram === "Apple_Terminal") {
    return {
      type: "terminal.app",
      name: "Terminal.app",
      supportsNewTab: true,
      opensTab: true,
    };
  }

  if (termProgram === "WezTerm") {
    return {
      type: "wezterm",
      name: "WezTerm",
      supportsNewTab: true,
      opensTab: true,
    };
  }

  if (termProgram === "ghostty" || process.env.GHOSTTY_RESOURCES_DIR) {
    return {
      type: "ghostty",
      name: "Ghostty",
      supportsNewTab: false,
      opensTab: false,
    };
  }

  if (termProgram === "vscode") {
    return {
      type: "vscode",
      name: "VS Code",
      supportsNewTab: false,
      opensTab: false,
    };
  }

  // Check terminal-specific env vars
  if (process.env.KITTY_WINDOW_ID) {
    return {
      type: "kitty",
      name: "Kitty",
      supportsNewTab: false,
      opensTab: false,
    };
  }

  if (process.env.ALACRITTY_SOCKET) {
    return {
      type: "alacritty",
      name: "Alacritty",
      supportsNewTab: true,
      opensTab: false, // Opens window, not tab
    };
  }

  // Check TERM for kitty
  if (term === "xterm-kitty") {
    return {
      type: "kitty",
      name: "Kitty",
      supportsNewTab: false,
      opensTab: false,
    };
  }

  return {
    type: "unknown",
    name: "Unknown Terminal",
    supportsNewTab: false,
    opensTab: false,
  };
};

// =============================================================================
// Terminal-Specific Implementations
// =============================================================================

/**
 * Execute a shell command and return result
 */
const execCommand = (
  command: string,
  cwd?: string
): Effect.Effect<{ stdout: string; stderr: string; exitCode: number }, never> =>
  Effect.tryPromise({
    try: async () => {
      const proc = Bun.spawn(["sh", "-c", command], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
    },
    catch: (error) => ({
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    }),
  }).pipe(
    Effect.catchAll((result) =>
      Effect.succeed(result as { stdout: string; stderr: string; exitCode: number })
    )
  );

/**
 * Escape a string for shell use
 */
const shellEscape = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;

/**
 * Open new tab in iTerm2 using AppleScript
 */
const openITerm2Tab = (
  command: string,
  cwd: string
): Effect.Effect<void, TerminalCommandError> =>
  Effect.gen(function* () {
    const fullCommand = `cd ${shellEscape(cwd)} && ${command}`;
    const script = `
tell application "iTerm2"
  tell current window
    create tab with default profile
    tell current session
      write text ${JSON.stringify(fullCommand)}
    end tell
  end tell
end tell
`;
    const result = yield* execCommand(`osascript -e ${shellEscape(script)}`);
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new TerminalCommandError("osascript (iTerm2)", result.stderr, result.exitCode)
      );
    }
  });

/**
 * Open new tab in Terminal.app using AppleScript
 */
const openTerminalAppTab = (
  command: string,
  cwd: string
): Effect.Effect<void, TerminalCommandError> =>
  Effect.gen(function* () {
    const fullCommand = `cd ${shellEscape(cwd)} && ${command}`;
    // Terminal.app's "make new tab" is broken, use keystroke simulation
    const script = `
tell application "Terminal"
  activate
  tell application "System Events"
    keystroke "t" using command down
  end tell
  delay 0.5
  do script ${JSON.stringify(fullCommand)} in front window
end tell
`;
    const result = yield* execCommand(`osascript -e ${shellEscape(script)}`);
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new TerminalCommandError("osascript (Terminal.app)", result.stderr, result.exitCode)
      );
    }
  });

/**
 * Open new tab in WezTerm using CLI
 */
const openWezTermTab = (
  command: string,
  cwd: string
): Effect.Effect<void, TerminalCommandError> =>
  Effect.gen(function* () {
    const result = yield* execCommand(
      `wezterm cli spawn --cwd ${shellEscape(cwd)} -- bash -c ${shellEscape(command)}`
    );
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new TerminalCommandError("wezterm cli spawn", result.stderr, result.exitCode)
      );
    }
  });

/**
 * Open new window in Alacritty using CLI
 */
const openAlacrittyWindow = (
  command: string,
  cwd: string
): Effect.Effect<void, TerminalCommandError> =>
  Effect.gen(function* () {
    const result = yield* execCommand(
      `alacritty msg create-window --working-directory ${shellEscape(cwd)} -e bash -c ${shellEscape(command)}`
    );
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new TerminalCommandError("alacritty msg create-window", result.stderr, result.exitCode)
      );
    }
  });

// =============================================================================
// Service Interface
// =============================================================================

interface TerminalServiceImpl {
  /**
   * Detect the current terminal
   */
  readonly detect: () => Effect.Effect<TerminalInfo, never>;

  /**
   * Open a new tab (or window for Alacritty) with the given command
   */
  readonly openNewTab: (
    command: string,
    cwd: string
  ) => Effect.Effect<void, TerminalNotSupportedError | TerminalCommandError>;

  /**
   * Get help message for unsupported terminals
   */
  readonly getUnsupportedMessage: (
    terminal: TerminalInfo,
    command: string,
    cwd: string
  ) => string;
}

// =============================================================================
// Service Tag
// =============================================================================

export class TerminalService extends Context.Tag("TerminalService")<
  TerminalService,
  TerminalServiceImpl
>() {}

// =============================================================================
// Implementation
// =============================================================================

const makeTerminalService = (): TerminalServiceImpl => ({
  detect: () => Effect.succeed(detectTerminal()),

  openNewTab: (command: string, cwd: string) =>
    Effect.gen(function* () {
      const terminal = detectTerminal();

      if (!terminal.supportsNewTab) {
        return yield* Effect.fail(
          new TerminalNotSupportedError(
            terminal,
            `${terminal.name} does not support opening new tabs programmatically.`
          )
        );
      }

      switch (terminal.type) {
        case "iterm2":
          yield* openITerm2Tab(command, cwd);
          break;
        case "terminal.app":
          yield* openTerminalAppTab(command, cwd);
          break;
        case "wezterm":
          yield* openWezTermTab(command, cwd);
          break;
        case "alacritty":
          yield* openAlacrittyWindow(command, cwd);
          break;
        default:
          return yield* Effect.fail(
            new TerminalNotSupportedError(
              terminal,
              `${terminal.name} is not supported.`
            )
          );
      }
    }),

  getUnsupportedMessage: (terminal: TerminalInfo, command: string, cwd: string) => {
    const lines = [
      `${terminal.name} does not support opening new tabs programmatically.`,
      "",
      "To run the agent manually:",
      `  1. Open a new terminal tab/window`,
      `  2. cd ${cwd}`,
      `  3. ${command}`,
    ];

    if (terminal.type === "ghostty") {
      lines.push("");
      lines.push("Note: Ghostty scripting API is planned but not yet available.");
      lines.push("See: https://github.com/ghostty-org/ghostty/discussions/2353");
    } else if (terminal.type === "kitty") {
      lines.push("");
      lines.push("Note: Kitty remote control is not enabled by this tool.");
      lines.push("You can enable it in kitty.conf: allow_remote_control yes");
    } else if (terminal.type === "vscode") {
      lines.push("");
      lines.push("Tip: Use headless mode (-H) to run in background instead.");
    }

    return lines.join("\n");
  },
});

// =============================================================================
// Layer
// =============================================================================

export const TerminalServiceLive = Layer.succeed(
  TerminalService,
  makeTerminalService()
);
