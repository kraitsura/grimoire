/**
 * grimoire wt auth - Check and setup authentication for headless agents
 *
 * Headless mode (--print) requires an OAuth token from `claude setup-token`.
 * Without it, headless mode falls back to API credits instead of subscription.
 */

import { Effect } from "effect";
import { execSync, spawnSync } from "child_process";
import type { ParsedArgs } from "../../cli/parser";

/**
 * Check if Claude OAuth token is configured for headless mode
 */
const checkAuthStatus = (): { hasToken: boolean; error?: string } => {
  try {
    // Try a minimal headless command with $0 budget to test auth
    // If it fails with "Credit balance", no OAuth token is set
    // If it fails with "budget exceeded", OAuth might be set but we're not sure
    // If it succeeds or fails differently, OAuth is likely set
    const result = spawnSync(
      "claude",
      ["--print", "--max-budget-usd", "0", "test"],
      {
        timeout: 10000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    const output = (result.stdout || "") + (result.stderr || "");

    if (output.includes("Credit balance is too low")) {
      return {
        hasToken: false,
        error: "No OAuth token configured. Headless mode will use API credits.",
      };
    }

    // Budget exceeded means auth is working but we hit the $0 limit
    if (output.includes("budget") || output.includes("Budget")) {
      return { hasToken: true };
    }

    // Any other response likely means auth is working
    return { hasToken: true };
  } catch (err) {
    return {
      hasToken: false,
      error: `Failed to check auth: ${err}`,
    };
  }
};

/**
 * Print usage and exit
 */
const printUsage = () => {
  console.log("Usage: grimoire wt auth [options]");
  console.log();
  console.log("Check and setup authentication for headless agents.");
  console.log();
  console.log("Options:");
  console.log("  --check      Check if OAuth token is configured");
  console.log("  --setup      Run `claude setup-token` to configure OAuth");
  console.log("  --help, -h   Show this help");
  console.log();
  console.log("Background:");
  console.log("  Headless mode (-bg, -H) uses Claude's --print flag, which");
  console.log("  requires an OAuth token to use your subscription. Without it,");
  console.log("  headless mode falls back to API credits.");
  console.log();
  console.log("  Run `grimoire wt auth --setup` to configure your OAuth token.");
  process.exit(0);
};

export const worktreeAuth = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const showHelp = args.flags.help === true || args.flags.h === true;
    const doSetup = args.flags.setup === true;
    const doCheck = args.flags.check === true || (!doSetup && !showHelp);

    if (showHelp) {
      printUsage();
      return;
    }

    if (doSetup) {
      console.log("Launching Claude token setup...");
      console.log();
      console.log("This will open an interactive session to configure your OAuth token.");
      console.log("The token allows headless agents to use your Claude subscription.");
      console.log();

      try {
        // Run claude setup-token interactively
        execSync("claude setup-token", {
          stdio: "inherit",
        });
        console.log();
        console.log("✓ Token setup complete. Headless agents will now use your subscription.");
      } catch (err) {
        console.log();
        console.log("Token setup was cancelled or failed.");
        console.log("Run `claude setup-token` manually if needed.");
        process.exit(1);
      }
      return;
    }

    if (doCheck) {
      console.log("Checking Claude authentication for headless mode...");
      console.log();

      const status = checkAuthStatus();

      if (status.hasToken) {
        console.log("✓ OAuth token is configured");
        console.log("  Headless agents will use your Claude subscription.");
      } else {
        console.log("✗ OAuth token NOT configured");
        console.log();
        if (status.error) {
          console.log(`  ${status.error}`);
          console.log();
        }
        console.log("  To fix this, run:");
        console.log("    grimoire wt auth --setup");
        console.log();
        console.log("  Or manually:");
        console.log("    claude setup-token");
        process.exit(1);
      }
    }
  });
