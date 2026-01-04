/**
 * ag scout - Spawn exploration agents in current directory
 *
 * Scouts are read-only agents that explore the codebase in the background,
 * allowing the main agent to continue working while gathering context.
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../../cli/parser";
import { ScoutService, ScoutServiceLive } from "../../services/scout";
import type { ScoutDepth, ScoutEntry, ScoutFindings } from "../../models/scout";

/**
 * Format duration in human-readable form
 */
const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
};

/**
 * Format relative time
 */
const formatRelativeTime = (isoDate: string): string => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
};

/**
 * Truncate string with ellipsis
 */
const truncate = (str: string, len: number): string =>
  str.length > len ? str.slice(0, len - 3) + "..." : str;

/**
 * Status color/symbol
 */
const statusIndicator = (status: ScoutEntry["status"]): string => {
  switch (status) {
    case "pending":
      return "○";
    case "running":
      return "◐";
    case "done":
      return "●";
    case "failed":
      return "✗";
    case "cancelled":
      return "◌";
  }
};

/**
 * Print usage
 */
const printUsage = () => {
  console.log("Usage: grim ag scout <command> [options]");
  console.log();
  console.log("Spawn exploration agents for parallel cognition.");
  console.log();
  console.log("Commands:");
  console.log('  <name> "<question>"    Spawn a scout with the given question');
  console.log("  list, ls               List all scouts");
  console.log("  show <name>            Show scout findings");
  console.log("  cancel <name>          Cancel a running scout");
  console.log("  clear                  Clear completed scouts");
  console.log("  watch                  Watch scouts in real-time");
  console.log();
  console.log("Spawn Options:");
  console.log("  --depth <level>        Exploration depth: shallow|medium|deep (default: medium)");
  console.log("  --focus <path>         Focus exploration on specific directory");
  console.log("  --timeout <seconds>    Max exploration time (default: 120)");
  console.log("  --model <name>         Model: haiku|sonnet|opus (default: haiku)");
  console.log();
  console.log("Show Options:");
  console.log("  --json                 Output as JSON");
  console.log("  --summary              Show only summary");
  console.log("  --raw                  Show raw log output");
  console.log();
  console.log("Clear Options:");
  console.log("  --all                  Include running scouts");
  console.log();
  console.log("Examples:");
  console.log('  grim ag scout auth "How does authentication work?"');
  console.log('  grim ag scout api --depth deep "Map all API endpoints"');
  console.log("  grim ag scout list");
  console.log("  grim ag scout show auth");
  console.log();
  console.log("For worktree-scoped scouts, use: grim wt scout <wt-name> \"question\"");
};

/**
 * List scouts
 */
const listScouts = (projectPath: string) =>
  Effect.gen(function* () {
    const scoutService = yield* ScoutService;
    const scouts = yield* scoutService.list(projectPath);

    if (scouts.length === 0) {
      console.log("No scouts found.");
      console.log();
      console.log('Start one with: grim ag scout <name> "<question>"');
      return;
    }

    // Sort by start time (newest first)
    scouts.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );

    // Print header
    console.log();
    console.log("  NAME           STATUS      STARTED       QUESTION");
    console.log("  " + "─".repeat(70));

    for (const scout of scouts) {
      const indicator = statusIndicator(scout.status);
      const name = scout.name.padEnd(12);
      const status = scout.status.padEnd(10);
      const started = formatRelativeTime(scout.startedAt).padEnd(12);
      const question = truncate(scout.question, 35);

      console.log(`  ${indicator} ${name} ${status} ${started} ${question}`);
    }

    console.log();

    // Summary
    const running = scouts.filter((s) => s.status === "running").length;
    const done = scouts.filter((s) => s.status === "done").length;

    if (running > 0) {
      console.log(`  ${running} running, ${done} completed`);
    }
  });

/**
 * Show scout findings
 */
const showScout = (
  projectPath: string,
  name: string,
  options: { json?: boolean; summary?: boolean; raw?: boolean }
) =>
  Effect.gen(function* () {
    const scoutService = yield* ScoutService;
    const findings = yield* scoutService.show(projectPath, name);

    if (!findings) {
      // Check if scout exists but not done
      const scouts = yield* scoutService.list(projectPath);
      const scout = scouts.find((s) => s.name === name);

      if (!scout) {
        console.log(`Scout "${name}" not found.`);
        return;
      }

      if (scout.status === "running") {
        console.log(`Scout "${name}" is still running...`);
        console.log(`Started: ${formatRelativeTime(scout.startedAt)}`);
        console.log();
        console.log(`Watch progress: tail -f .grim/scouts/findings/${name}.log`);
        return;
      }

      if (scout.status === "pending") {
        console.log(`Scout "${name}" is pending.`);
        return;
      }

      if (scout.status === "cancelled") {
        console.log(`Scout "${name}" was cancelled.`);
        return;
      }

      if (scout.status === "failed") {
        console.log(`Scout "${name}" failed: ${scout.error || "Unknown error"}`);
        return;
      }

      console.log(`No findings available for scout "${name}".`);
      return;
    }

    // JSON output
    if (options.json) {
      console.log(JSON.stringify(findings, null, 2));
      return;
    }

    // Raw log output
    if (options.raw && findings.rawLog) {
      console.log(findings.rawLog);
      return;
    }

    // Summary only
    if (options.summary) {
      console.log(findings.summary);
      return;
    }

    // Full formatted output
    printFindings(findings);
  });

/**
 * Print formatted findings
 */
const printFindings = (findings: ScoutFindings) => {
  const separator = "═".repeat(70);

  console.log();
  console.log(separator);
  console.log(`Scout: ${findings.name}`);
  console.log(`Status: completed (${formatDuration(findings.duration)})`);
  console.log(`Question: ${findings.question}`);
  console.log(separator);
  console.log();

  // Summary
  console.log("## Summary");
  console.log(findings.summary);
  console.log();

  // Key Files
  if (findings.keyFiles.length > 0) {
    console.log("## Key Files");
    for (const file of findings.keyFiles) {
      console.log(`  • ${file.path}`);
      console.log(`    ${file.relevance}`);
    }
    console.log();
  }

  // Code Patterns
  if (findings.codePatterns.length > 0) {
    console.log("## Code Patterns");
    for (const pattern of findings.codePatterns) {
      console.log(`  ${pattern.description}`);
      console.log(`  Location: ${pattern.location}`);
      if (pattern.example) {
        console.log("  ```");
        for (const line of pattern.example.split("\n").slice(0, 10)) {
          console.log(`  ${line}`);
        }
        console.log("  ```");
      }
      console.log();
    }
  }

  // Related Areas
  if (findings.relatedAreas.length > 0) {
    console.log("## Related Areas");
    for (const area of findings.relatedAreas) {
      console.log(`  • ${area.path} - ${area.description}`);
    }
    console.log();
  }
};

/**
 * Spawn a scout
 */
const spawnScout = (
  projectPath: string,
  name: string,
  question: string,
  options: {
    depth?: ScoutDepth;
    focus?: string;
    timeout?: number;
    model?: string;
  }
) =>
  Effect.gen(function* () {
    const scoutService = yield* ScoutService;

    console.log(`Spawning scout "${name}"...`);

    const entry = yield* scoutService.spawn(projectPath, name, question, options);

    console.log();
    console.log(`  Scout: ${entry.name}`);
    console.log(`  Status: ${entry.status}`);
    console.log(`  PID: ${entry.pid || "N/A"}`);
    console.log(`  Depth: ${entry.options.depth}`);
    console.log(`  Model: ${entry.options.model}`);
    console.log(`  Timeout: ${entry.options.timeout}s`);
    console.log();
    console.log(`Monitor: tail -f .grim/scouts/findings/${name}.log`);
    console.log(`Results: grim ag scout show ${name}`);
  });

/**
 * Cancel a scout
 */
const cancelScout = (projectPath: string, name: string) =>
  Effect.gen(function* () {
    const scoutService = yield* ScoutService;
    const cancelled = yield* scoutService.cancel(projectPath, name);

    if (cancelled) {
      console.log(`Scout "${name}" cancelled.`);
    } else {
      console.log(`Scout "${name}" is not running.`);
    }
  });

/**
 * Clear scouts
 */
const clearScouts = (projectPath: string, includeRunning: boolean) =>
  Effect.gen(function* () {
    const scoutService = yield* ScoutService;
    const removed = yield* scoutService.clear(projectPath, includeRunning);

    if (removed.length === 0) {
      console.log("No scouts to clear.");
    } else {
      console.log(`Cleared ${removed.length} scout(s): ${removed.join(", ")}`);
    }
  });

/**
 * Watch scouts
 */
const watchScouts = (projectPath: string) =>
  Effect.gen(function* () {
    const scoutService = yield* ScoutService;

    console.log("Watching scouts... (Ctrl+C to stop)");
    console.log();

    let lastOutput = "";

    const render = () =>
      Effect.gen(function* () {
        const scouts = yield* scoutService.list(projectPath);

        // Build output
        let output = "";
        output += "  NAME           STATUS      STARTED       QUESTION\n";
        output += "  " + "─".repeat(70) + "\n";

        for (const scout of scouts) {
          const indicator = statusIndicator(scout.status);
          const name = scout.name.padEnd(12);
          const status = scout.status.padEnd(10);
          const started = formatRelativeTime(scout.startedAt).padEnd(12);
          const question = truncate(scout.question, 35);

          output += `  ${indicator} ${name} ${status} ${started} ${question}\n`;
        }

        // Only redraw if changed
        if (output !== lastOutput) {
          console.clear();
          console.log("Watching scouts... (Ctrl+C to stop)\n");
          console.log(output);
          lastOutput = output;
        }

        // Check if all done
        const running = scouts.filter((s) => s.status === "running" || s.status === "pending");
        if (running.length === 0 && scouts.length > 0) {
          console.log("\nAll scouts completed.");
          return true;
        }

        return false;
      });

    // Poll loop
    while (true) {
      const done = yield* render();
      if (done) break;
      yield* Effect.sleep(1000);
    }
  });

/**
 * ag scout command handler
 */
export const agScoutCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const projectPath = process.cwd();

    // Help
    if (args.flags.help || args.flags.h) {
      printUsage();
      return;
    }

    const subcommand = args.positional[0];

    // No args - show help
    if (!subcommand) {
      printUsage();
      return;
    }

    // Route subcommands
    switch (subcommand) {
      case "list":
      case "ls":
        yield* listScouts(projectPath);
        break;

      case "show": {
        const name = args.positional[1];
        if (!name) {
          console.log("Usage: grim ag scout show <name>");
          return;
        }
        yield* showScout(projectPath, name, {
          json: args.flags.json === true,
          summary: args.flags.summary === true,
          raw: args.flags.raw === true,
        });
        break;
      }

      case "cancel": {
        const name = args.positional[1];
        if (!name) {
          console.log("Usage: grim ag scout cancel <name>");
          return;
        }
        yield* cancelScout(projectPath, name);
        break;
      }

      case "clear":
        yield* clearScouts(projectPath, args.flags.all === true);
        break;

      case "watch":
        yield* watchScouts(projectPath);
        break;

      default: {
        // Default: spawn a scout
        // grim ag scout <name> "<question>"
        const name = args.positional[0];
        const question = args.positional[1] || (args.flags.question as string) || (args.flags.q as string);

        if (!question) {
          console.log("Usage: grim ag scout <name> \"<question>\"");
          console.log();
          console.log("Example: grim ag scout auth \"How does authentication work?\"");
          return;
        }

        yield* spawnScout(projectPath, name, question, {
          depth: args.flags.depth as ScoutDepth | undefined,
          focus: args.flags.focus as string | undefined,
          timeout: typeof args.flags.timeout === "number" ? args.flags.timeout : undefined,
          model: args.flags.model as string | undefined,
        });
        break;
      }
    }
  }).pipe(Effect.provide(ScoutServiceLive));
