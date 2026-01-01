/**
 * Agent Command Router
 *
 * Agent operations in current directory context.
 * For worktree-isolated agents, use `grim wt <command>`.
 *
 * Usage:
 *   grim ag spawn "task"          Spawn worker agent
 *   grim ag scout "question"      Spawn exploration agent
 *   grim ag ps                    Show running agents
 *   grim ag kill <id>             Kill an agent
 *   grim ag wait <id>             Wait for agent completion
 *
 * Future commands:
 *   grim ag swarm "complex task"  Multi-agent coordination
 *   grim ag impact <file>         Analyze file change impact
 *   grim ag shadow <id>           Shadow/observe an agent
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../cli/parser";

// Import subcommands
import { agSpawnCommand } from "./ag/spawn";
import { agScoutCommand } from "./ag/scout";

/**
 * Print ag help
 */
const printHelp = () => {
  console.log(`Agent Operations (current directory)

USAGE:
  grim ag <command> [options]

COMMANDS:
  spawn "<task>"       Spawn a worker agent in current directory
  scout "<question>"   Spawn an exploration agent
  ps                   Show running agents
  kill <name|id>       Kill a running agent
  wait <name|id>       Wait for agent to complete

SPAWN OPTIONS:
  -bg, --background    Run in background (headless mode)
  --srt                Enable sandbox (recommended with -bg)
  --new-tab            Open in new terminal tab

SCOUT OPTIONS:
  --depth <level>      shallow|medium|deep (default: medium)
  --focus <path>       Focus on specific directory
  --timeout <secs>     Max exploration time (default: 120)
  --model <name>       haiku|sonnet|opus (default: haiku)

SCOUT SUBCOMMANDS:
  scout list           List all scouts
  scout show <name>    Show scout findings
  scout cancel <name>  Cancel running scout
  scout clear          Clear completed scouts

EXAMPLES:
  grim ag spawn -bg "Implement user authentication"
  grim ag scout "How does the auth system work?"
  grim ag scout auth --depth deep "Map all auth flows"
  grim ag ps
  grim ag kill sess_abc123

COMPARISON WITH WORKTREE:
  grim ag spawn "task"           # Runs in current directory
  grim wt spawn fix-bug "task"   # Creates worktree, runs there

Use 'grim wt' for isolated workspaces with git worktrees.`);
};

/**
 * Agent command router
 */
export const agCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const subcommand = args.positional[0];

    // Help
    if (args.flags.help || args.flags.h || !subcommand) {
      printHelp();
      return;
    }

    // Route to subcommands
    const subArgs: ParsedArgs = {
      command: subcommand,
      flags: args.flags,
      positional: args.positional.slice(1),
    };

    switch (subcommand) {
      case "spawn":
        yield* agSpawnCommand(subArgs);
        break;

      case "scout":
        yield* agScoutCommand(subArgs);
        break;

      case "ps":
        yield* showAgents();
        break;

      case "kill":
        yield* killAgent(subArgs.positional[0]);
        break;

      case "wait":
        yield* waitForAgent(subArgs.positional[0]);
        break;

      default:
        console.log(`Unknown ag command: ${subcommand}`);
        console.log("Run 'grim ag --help' for available commands.");
        process.exit(1);
    }
  });

/**
 * Show running agents (placeholder - will integrate with agent session service)
 */
const showAgents = () =>
  Effect.gen(function* () {
    // Import dynamically to avoid circular deps
    const { AgentSessionService, AgentSessionServiceLive } = yield* Effect.promise(
      () => import("../services/worktree")
    );

    const program = Effect.gen(function* () {
      const sessionService = yield* AgentSessionService;
      const sessions = yield* sessionService.listSessions(process.cwd());

      if (sessions.length === 0) {
        console.log("No agents running in current directory.");
        console.log();
        console.log("Start one with: grim ag spawn -bg \"your task\"");
        return;
      }

      console.log();
      console.log("  ID              STATUS      PID       STARTED");
      console.log("  " + "─".repeat(60));

      for (const session of sessions) {
        const id = session.sessionId.padEnd(14);
        const status = (session.status || "running").padEnd(10);
        const pid = String(session.pid || "?").padEnd(8);
        const started = session.startedAt
          ? new Date(session.startedAt).toLocaleTimeString()
          : "?";

        console.log(`  ${id} ${status} ${pid} ${started}`);
      }
      console.log();
    }).pipe(Effect.provide(AgentSessionServiceLive));

    yield* program;
  });

/**
 * Kill an agent
 */
const killAgent = (nameOrId: string | undefined) =>
  Effect.gen(function* () {
    if (!nameOrId) {
      console.log("Usage: grim ag kill <name|id>");
      return;
    }

    const { AgentSessionService, AgentSessionServiceLive } = yield* Effect.promise(
      () => import("../services/worktree")
    );

    const program = Effect.gen(function* () {
      const sessionService = yield* AgentSessionService;
      const sessions = yield* sessionService.listSessions(process.cwd());

      const session = sessions.find(
        (s) => s.sessionId === nameOrId || s.sessionId.startsWith(nameOrId)
      );

      if (!session) {
        console.log(`Agent "${nameOrId}" not found.`);
        return;
      }

      if (session.pid) {
        try {
          process.kill(session.pid, "SIGTERM");
          console.log(`Killed agent ${session.sessionId} (PID: ${session.pid})`);
        } catch (err) {
          console.log(`Agent ${session.sessionId} is not running (PID: ${session.pid})`);
        }
      }

      yield* sessionService.updateSession(process.cwd(), {
        status: "stopped",
        endedAt: new Date().toISOString(),
      });
    }).pipe(Effect.provide(AgentSessionServiceLive));

    yield* program;
  });

/**
 * Wait for an agent to complete
 */
const waitForAgent = (nameOrId: string | undefined) =>
  Effect.gen(function* () {
    if (!nameOrId) {
      console.log("Usage: grim ag wait <name|id>");
      return;
    }

    const { AgentSessionService, AgentSessionServiceLive } = yield* Effect.promise(
      () => import("../services/worktree")
    );

    const program = Effect.gen(function* () {
      const sessionService = yield* AgentSessionService;

      console.log(`Waiting for agent "${nameOrId}"...`);

      // Poll until done
      while (true) {
        const sessions = yield* sessionService.listSessions(process.cwd());
        const session = sessions.find(
          (s) => s.sessionId === nameOrId || s.sessionId.startsWith(nameOrId)
        );

        if (!session) {
          console.log(`Agent "${nameOrId}" not found.`);
          return;
        }

        if (session.status === "stopped" || session.status === "crashed") {
          console.log(`Agent ${session.sessionId} completed (${session.status})`);
          return;
        }

        // Check if process is still running
        if (session.pid) {
          try {
            process.kill(session.pid, 0); // Signal 0 = check if alive
          } catch {
            console.log(`Agent ${session.sessionId} completed`);
            return;
          }
        }

        yield* Effect.sleep(1000);
      }
    }).pipe(Effect.provide(AgentSessionServiceLive));

    yield* program;
  });
