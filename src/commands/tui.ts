/**
 * TUI Command - Display TUI patterns and design reference
 *
 * This command serves as a central design repository for grimoire's
 * terminal UI patterns, including Unicode symbols, colors, and formatting.
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../cli/parser";

// ═══════════════════════════════════════════════════════════════════════════
// ANSI Color Codes
// ═══════════════════════════════════════════════════════════════════════════

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

// Foreground colors
const FG = {
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

// Background colors
const BG = {
  black: "\x1b[40m",
  red: "\x1b[41m",
  green: "\x1b[42m",
  yellow: "\x1b[43m",
  blue: "\x1b[44m",
  magenta: "\x1b[45m",
  cyan: "\x1b[46m",
  white: "\x1b[47m",
};

// ═══════════════════════════════════════════════════════════════════════════
// Unicode Symbol Library
// ═══════════════════════════════════════════════════════════════════════════

const SYMBOLS = {
  // Status indicators
  check: "✓",
  cross: "✗",
  warning: "⚠",
  info: "ℹ",
  question: "?",

  // Arrows & pointers
  arrowRight: "→",
  arrowLeft: "←",
  arrowUp: "↑",
  arrowDown: "↓",
  play: "▶",
  pointer: "›",
  bullet: "•",

  // Shapes
  circle: "○",
  circleFilled: "●",
  square: "□",
  squareFilled: "■",
  diamond: "◇",
  diamondFilled: "◆",
  star: "★",
  starEmpty: "☆",

  // Box drawing
  boxTopLeft: "┌",
  boxTopRight: "┐",
  boxBottomLeft: "└",
  boxBottomRight: "┘",
  boxHorizontal: "─",
  boxVertical: "│",
  boxCross: "┼",

  // Progress & loading
  block: "█",
  blockMedium: "▓",
  blockLight: "░",
  ellipsis: "…",

  // Misc
  heart: "♥",
  note: "♪",
  sun: "☀",
  moon: "☾",
  cloud: "☁",
  umbrella: "☂",
  flag: "⚑",
  lightning: "⚡",
};

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const color = (fg: keyof typeof FG, text: string) => `${FG[fg]}${text}${RESET}`;
const bold = (text: string) => `${BOLD}${text}${RESET}`;
const dim = (text: string) => `${DIM}${text}${RESET}`;
const line = (char = "─", width = 60) => char.repeat(width);

// ═══════════════════════════════════════════════════════════════════════════
// TUI Command Handler
// ═══════════════════════════════════════════════════════════════════════════

export const tuiCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const section = args.positional[0];

    if (!section || section === "all") {
      displayAll();
    } else if (section === "symbols") {
      displaySymbols();
    } else if (section === "colors") {
      displayColors();
    } else if (section === "status") {
      displayStatusPatterns();
    } else if (section === "tables") {
      displayTablePatterns();
    } else if (section === "help") {
      displayHelp();
    } else {
      console.log(`Unknown section: ${section}`);
      displayHelp();
    }
  });

function displayHelp() {
  console.log(bold("grimoire tui") + " - TUI Pattern Reference\n");
  console.log("Usage: grim tui [section]\n");
  console.log("Sections:");
  console.log("  all      Show all patterns (default)");
  console.log("  symbols  Unicode symbol library");
  console.log("  colors   ANSI color palette");
  console.log("  status   Status indicator patterns");
  console.log("  tables   Table formatting patterns");
  console.log("  help     Show this help");
}

function displayAll() {
  displayHeader();
  console.log("");
  displaySymbols();
  console.log("");
  displayColors();
  console.log("");
  displayStatusPatterns();
  console.log("");
  displayTablePatterns();
  console.log("");
  displayFooter();
}

function displayHeader() {
  console.log(bold(color("cyan", "╔" + line("═", 58) + "╗")));
  console.log(bold(color("cyan", "║")) + "  " + bold("GRIMOIRE TUI PATTERN REFERENCE") + " ".repeat(25) + bold(color("cyan", "║")));
  console.log(bold(color("cyan", "╚" + line("═", 58) + "╝")));
}

function displayFooter() {
  console.log(dim(line("─", 60)));
  console.log(dim(`If you see mojibake (garbled text), there's a Unicode bug.`));
  console.log(dim(`All symbols above should render correctly.`));
}

function displaySymbols() {
  console.log(bold("═══ UNICODE SYMBOLS ═══\n"));

  console.log(bold("Status Indicators:"));
  console.log(`  ${color("green", SYMBOLS.check)} check      ${color("red", SYMBOLS.cross)} cross      ${color("yellow", SYMBOLS.warning)} warning    ${color("blue", SYMBOLS.info)} info`);

  console.log(bold("\nArrows & Pointers:"));
  console.log(`  ${SYMBOLS.arrowRight} arrowRight  ${SYMBOLS.arrowLeft} arrowLeft   ${SYMBOLS.arrowUp} arrowUp     ${SYMBOLS.arrowDown} arrowDown`);
  console.log(`  ${SYMBOLS.play} play        ${SYMBOLS.pointer} pointer     ${SYMBOLS.bullet} bullet`);

  console.log(bold("\nShapes:"));
  console.log(`  ${SYMBOLS.circle} circle      ${SYMBOLS.circleFilled} filled      ${SYMBOLS.square} square      ${SYMBOLS.squareFilled} filled`);
  console.log(`  ${SYMBOLS.diamond} diamond     ${SYMBOLS.diamondFilled} filled      ${SYMBOLS.star} star        ${SYMBOLS.starEmpty} empty`);

  console.log(bold("\nBox Drawing:"));
  console.log(`  ${SYMBOLS.boxTopLeft}${SYMBOLS.boxHorizontal}${SYMBOLS.boxHorizontal}${SYMBOLS.boxHorizontal}${SYMBOLS.boxTopRight}   boxTopLeft, boxHorizontal, boxTopRight`);
  console.log(`  ${SYMBOLS.boxVertical}   ${SYMBOLS.boxVertical}   boxVertical`);
  console.log(`  ${SYMBOLS.boxBottomLeft}${SYMBOLS.boxHorizontal}${SYMBOLS.boxHorizontal}${SYMBOLS.boxHorizontal}${SYMBOLS.boxBottomRight}   boxBottomLeft, boxBottomRight`);

  console.log(bold("\nProgress:"));
  console.log(`  ${SYMBOLS.block}${SYMBOLS.block}${SYMBOLS.block}${SYMBOLS.blockMedium}${SYMBOLS.blockMedium}${SYMBOLS.blockLight}${SYMBOLS.blockLight}${SYMBOLS.blockLight}  block, blockMedium, blockLight`);
  console.log(`  Loading${SYMBOLS.ellipsis}  ellipsis`);

  console.log(bold("\nMisc:"));
  console.log(`  ${color("red", SYMBOLS.heart)} heart  ${SYMBOLS.note} note  ${color("yellow", SYMBOLS.sun)} sun  ${SYMBOLS.moon} moon  ${SYMBOLS.cloud} cloud  ${SYMBOLS.flag} flag  ${color("yellow", SYMBOLS.lightning)} lightning`);
}

function displayColors() {
  console.log(bold("═══ ANSI COLORS ═══\n"));

  console.log(bold("Foreground:"));
  console.log(`  ${FG.black}${BG.white}black${RESET} ${FG.red}red${RESET} ${FG.green}green${RESET} ${FG.yellow}yellow${RESET} ${FG.blue}blue${RESET} ${FG.magenta}magenta${RESET} ${FG.cyan}cyan${RESET} ${FG.white}white${RESET} ${FG.gray}gray${RESET}`);

  console.log(bold("\nStyles:"));
  console.log(`  ${BOLD}bold${RESET}  ${DIM}dim${RESET}  normal`);

  console.log(bold("\nSemantic Usage:"));
  console.log(`  ${color("green", SYMBOLS.check + " Success")} - Completed actions, positive states`);
  console.log(`  ${color("red", SYMBOLS.cross + " Error")} - Failures, destructive actions`);
  console.log(`  ${color("yellow", SYMBOLS.warning + " Warning")} - Caution, non-blocking issues`);
  console.log(`  ${color("blue", SYMBOLS.info + " Info")} - Informational messages`);
  console.log(`  ${color("cyan", SYMBOLS.pointer + " Active")} - Current selection, focus`);
  console.log(`  ${dim(SYMBOLS.circle + " Inactive")} - Disabled, secondary`);
}

function displayStatusPatterns() {
  console.log(bold("═══ STATUS PATTERNS ═══\n"));

  console.log(bold("Worktree Status (grim wt ps):"));
  console.log(`  ${color("cyan", SYMBOLS.play + " running")}     Agent is active`);
  console.log(`  ${color("yellow", SYMBOLS.warning + " uncommitted")} Dirty files, no commits`);
  console.log(`  ${color("blue", SYMBOLS.circleFilled + " committed")}   Has commits + dirty files`);
  console.log(`  ${color("green", SYMBOLS.check + " clean")}       Ready to collect`);
  console.log(`  ${dim(SYMBOLS.circle + " empty")}       No changes`);

  console.log(bold("\nCollect Status:"));
  console.log(`  ${color("green", SYMBOLS.check + " ready")}    Can be collected`);
  console.log(`  ${color("red", "blocked")}  Cannot collect (running/dirty/conflict)`);
  console.log(`  ${dim(SYMBOLS.circle)}         Empty, nothing to collect`);

  console.log(bold("\nDiff Stats:"));
  console.log(`  ${color("green", "+142")} ${color("red", "-38")}  Colored insertions/deletions`);
  console.log(`  ${dim(SYMBOLS.circle)}          No changes`);
}

function displayTablePatterns() {
  console.log(bold("═══ TABLE PATTERNS ═══\n"));

  console.log(bold("Column Headers (uppercase, fixed width):"));
  console.log(`  ${"WORKTREE".padEnd(14)}${"STATUS".padEnd(12)}${"COMMITS".padEnd(10)}COLLECT`);
  console.log(`  ${line("─", 14)}${line("─", 12)}${line("─", 10)}${line("─", 8)}`);

  console.log(bold("\nSample Table:"));
  const rows = [
    { name: "feature-auth", status: `${color("green", SYMBOLS.check + " clean")}`, commits: "3", collect: `${color("green", SYMBOLS.check + " ready")}` },
    { name: "fix-bug-123", status: `${color("cyan", SYMBOLS.play + " running")}`, commits: "1", collect: "blocked" },
    { name: "refactor-ui", status: `${color("yellow", SYMBOLS.warning + " uncommitted")}`, commits: "0", collect: "blocked" },
    { name: "docs-update", status: `${dim(SYMBOLS.circle + " empty")}`, commits: "0", collect: dim(SYMBOLS.circle) },
  ];

  console.log(`  ${"WORKTREE".padEnd(14)}${"STATUS".padEnd(20)}${"COMMITS".padEnd(10)}COLLECT`);
  for (const row of rows) {
    // Note: ANSI codes don't contribute to visual width but do to string length
    // In real code, use a visualWidth() function
    console.log(`  ${row.name.padEnd(14)}${row.status.padEnd(28)}${row.commits.padEnd(10)}${row.collect}`);
  }

  console.log(bold("\nSummary Line:"));
  console.log(`  Summary: ${color("cyan", "1 running")}, ${color("green", "1 clean")}, ${color("yellow", "1 uncommitted")}`);
}
