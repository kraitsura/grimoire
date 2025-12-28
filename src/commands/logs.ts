/**
 * Logs Command - View and manage debug logs
 *
 * Usage:
 *   grimoire logs              - Show last 50 log entries
 *   grimoire logs -n 100       - Show last 100 entries
 *   grimoire logs -f           - Follow log output (like tail -f)
 *   grimoire logs -c           - Clear the log file
 *   grimoire logs -p           - Show log file path
 */

import { Effect } from "effect";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { log } from "../services/logger-service.js";
import type { ParsedArgs } from "../cli/parser";

/**
 * Logs command implementation
 */
export const logsCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const logPath = log.getLogPath();

    // Handle --path flag
    if (args.flags.path || args.flags.p) {
      console.log(logPath);
      return;
    }

    // Handle --clear flag
    if (args.flags.clear || args.flags.c) {
      log.clear();
      console.log("Log file cleared");
      return;
    }

    // Handle --follow flag
    if (args.flags.follow || args.flags.f) {
      // Use tail -f for following
      if (!fs.existsSync(logPath)) {
        // Create empty file so tail doesn't fail
        const dir = path.dirname(logPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(logPath, "");
      }

      console.log(`Following ${logPath} (Ctrl+C to stop)\n`);

      yield* Effect.async<void, Error>((resume) => {
        const tail = spawn("tail", ["-f", logPath], { stdio: "inherit" });

        tail.on("error", (err) => {
          resume(Effect.fail(new Error(`Failed to start tail: ${err.message}`)));
        });

        tail.on("close", () => {
          resume(Effect.succeed(undefined));
        });

        // Handle SIGINT to clean up
        process.on("SIGINT", () => {
          tail.kill();
          process.exit(0);
        });
      });

      return;
    }

    // Show last N lines
    const linesArg = args.flags.lines || args.flags.n || args.positional[0];
    const lines = typeof linesArg === "string" ? parseInt(linesArg, 10) : 50;
    const logLines = log.tail(lines);

    if (logLines.length === 0) {
      console.log("No logs found.");
      console.log(`Log file: ${logPath}`);
      console.log("\nTip: Run your TUI action, then run 'grimoire logs' again to see debug output.");
      return;
    }

    console.log(`Last ${logLines.length} log entries from ${logPath}:\n`);
    for (const line of logLines) {
      // Color code by log level
      if (line.includes(" ERROR ")) {
        console.log(`\x1b[31m${line}\x1b[0m`);
      } else if (line.includes(" WARN ")) {
        console.log(`\x1b[33m${line}\x1b[0m`);
      } else if (line.includes(" INFO ")) {
        console.log(`\x1b[36m${line}\x1b[0m`);
      } else {
        console.log(`\x1b[90m${line}\x1b[0m`);
      }
    }
  });
