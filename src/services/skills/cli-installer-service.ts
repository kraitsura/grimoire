/**
 * CLI Installer Service
 *
 * Checks and installs CLI dependencies defined in skill manifests.
 */

import { Context, Effect, Layer } from "effect";
import { CliDependencyError } from "../../models/skill-errors";
import type { CliDependency } from "../../models/skill";

/**
 * Available installer types
 */
export type InstallerType = "brew" | "cargo" | "npm" | "go";

/**
 * Installation options
 */
export interface InstallOptions {
  preferred?: InstallerType;
  interactive?: boolean;
}

/**
 * Check if a binary is available by running its check command
 */
const checkBinary = (
  binary: string,
  checkCommand: string
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    try {
      const proc = Bun.spawn(checkCommand.split(" "), {
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = yield* Effect.promise(() => proc.exited);
      return exitCode === 0;
    } catch {
      return false;
    }
  });

/**
 * Check which package managers are available on the system
 */
const getAvailableInstallers = (): Effect.Effect<InstallerType[]> =>
  Effect.gen(function* () {
    const installers: InstallerType[] = [];

    // Check brew (macOS/Linux package manager)
    const hasHomebrew = yield* Effect.gen(function* () {
      try {
        const proc = Bun.spawn(["brew", "--version"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const exitCode = yield* Effect.promise(() => proc.exited);
        return exitCode === 0;
      } catch {
        return false;
      }
    });

    if (hasHomebrew) {
      installers.push("brew");
    }

    // Check cargo (Rust package manager)
    const hasCargo = yield* Effect.gen(function* () {
      try {
        const proc = Bun.spawn(["cargo", "--version"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const exitCode = yield* Effect.promise(() => proc.exited);
        return exitCode === 0;
      } catch {
        return false;
      }
    });

    if (hasCargo) {
      installers.push("cargo");
    }

    // Check npm (Node package manager)
    const hasNpm = yield* Effect.gen(function* () {
      try {
        const proc = Bun.spawn(["npm", "--version"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const exitCode = yield* Effect.promise(() => proc.exited);
        return exitCode === 0;
      } catch {
        return false;
      }
    });

    if (hasNpm) {
      installers.push("npm");
    }

    // Check go (Go package manager)
    const hasGo = yield* Effect.gen(function* () {
      try {
        const proc = Bun.spawn(["go", "version"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const exitCode = yield* Effect.promise(() => proc.exited);
        return exitCode === 0;
      } catch {
        return false;
      }
    });

    if (hasGo) {
      installers.push("go");
    }

    return installers;
  });

/**
 * Run the appropriate installer for a package
 */
const runInstaller = (
  installer: InstallerType,
  packageName: string
): Effect.Effect<void, CliDependencyError> =>
  Effect.gen(function* () {
    let command: string[];

    switch (installer) {
      case "brew":
        command = ["brew", "install", packageName];
        break;
      case "cargo":
        command = ["cargo", "install", packageName];
        break;
      case "npm":
        command = ["npm", "install", "-g", packageName];
        break;
      case "go":
        command = ["go", "install", packageName];
        break;
    }

    try {
      const proc = Bun.spawn(command, {
        stdout: "inherit",
        stderr: "inherit",
      });

      const exitCode = yield* Effect.promise(() => proc.exited);

      if (exitCode !== 0) {
        return yield* Effect.fail(
          new CliDependencyError({
            binary: packageName,
            message: `Installation failed with exit code ${exitCode}`,
          })
        );
      }
    } catch (error) {
      return yield* Effect.fail(
        new CliDependencyError({
          binary: packageName,
          message: `Installation failed: ${error instanceof Error ? error.message : String(error)}`,
        })
      );
    }
  });

/**
 * Install a CLI dependency
 */
const installDependency = (
  binary: string,
  installConfig: CliDependency,
  options?: InstallOptions
): Effect.Effect<void, CliDependencyError> =>
  Effect.gen(function* () {
    // Check if already installed
    const alreadyInstalled = yield* checkBinary(binary, installConfig.check);
    if (alreadyInstalled) {
      return;
    }

    // Check available installers
    const available = yield* getAvailableInstallers();

    if (available.length === 0) {
      return yield* Effect.fail(
        new CliDependencyError({
          binary,
          message:
            "No package managers available. Please install brew, cargo, npm, or go.",
        })
      );
    }

    // Determine which installer to use
    let selectedInstaller: InstallerType | undefined;

    // Try preferred installer first
    if (options?.preferred && available.includes(options.preferred)) {
      const install = installConfig.install?.[options.preferred];
      if (install) {
        selectedInstaller = options.preferred;
      }
    }

    // If no preferred installer or it's not available, try installers in order
    if (!selectedInstaller) {
      const installOptions = installConfig.install;
      if (!installOptions) {
        return yield* Effect.fail(
          new CliDependencyError({
            binary,
            message: "No installation configuration available. Manual install required.",
          })
        );
      }

      // Try installers in preference order
      const preferenceOrder: InstallerType[] = ["brew", "cargo", "npm", "go"];

      for (const installer of preferenceOrder) {
        if (available.includes(installer) && installOptions[installer]) {
          selectedInstaller = installer;
          break;
        }
      }
    }

    if (!selectedInstaller) {
      return yield* Effect.fail(
        new CliDependencyError({
          binary,
          message: "No compatible installer available. Manual install required.",
        })
      );
    }

    // Get package name for the selected installer
    const packageName = installConfig.install?.[selectedInstaller];
    if (!packageName) {
      return yield* Effect.fail(
        new CliDependencyError({
          binary,
          message: `No package name configured for ${selectedInstaller}`,
        })
      );
    }

    // Run installation
    yield* runInstaller(selectedInstaller, packageName);

    // Verify installation
    const success = yield* checkBinary(binary, installConfig.check);
    if (!success) {
      return yield* Effect.fail(
        new CliDependencyError({
          binary,
          message: `Installation completed but ${binary} not found. Try running: ${installConfig.check}`,
        })
      );
    }
  });

/**
 * Service interface
 */
interface CliInstallerServiceImpl {
  // Check if binary is available
  readonly check: (
    binary: string,
    checkCommand: string
  ) => Effect.Effect<boolean>;

  // Install dependency
  readonly install: (
    binary: string,
    installConfig: CliDependency,
    options?: InstallOptions
  ) => Effect.Effect<void, CliDependencyError>;

  // Get available installers
  readonly availableInstallers: () => Effect.Effect<InstallerType[]>;
}

/**
 * Service tag
 */
export class CliInstallerService extends Context.Tag("CliInstallerService")<
  CliInstallerService,
  CliInstallerServiceImpl
>() {}

/**
 * Service implementation
 */
const makeCliInstallerService = (): CliInstallerServiceImpl => ({
  check: (binary: string, checkCommand: string) =>
    checkBinary(binary, checkCommand),

  install: (
    binary: string,
    installConfig: CliDependency,
    options?: InstallOptions
  ) => installDependency(binary, installConfig, options),

  availableInstallers: () => getAvailableInstallers(),
});

/**
 * Live layer
 */
export const CliInstallerServiceLive = Layer.succeed(
  CliInstallerService,
  makeCliInstallerService()
);
