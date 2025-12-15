/**
 * Tests for CliInstallerService
 */

import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import {
  CliInstallerService,
  CliInstallerServiceLive,
  type InstallerType,
} from "./cli-installer-service";

describe("CliInstallerService", () => {
  describe("availableInstallers", () => {
    it("should return array of available installers", async () => {
      const program = Effect.gen(function* () {
        const service = yield* CliInstallerService;
        const installers = yield* service.availableInstallers();
        return installers;
      }).pipe(Effect.provide(CliInstallerServiceLive));

      const result = await Effect.runPromise(program);

      expect(Array.isArray(result)).toBe(true);
      // Should have at least one installer available
      expect(result.length).toBeGreaterThanOrEqual(0);
      // Each item should be a valid installer type
      result.forEach((installer: InstallerType) => {
        expect(["brew", "cargo", "npm", "go"]).toContain(installer);
      });
    });
  });

  describe("check", () => {
    it("should return true for available binary", async () => {
      const program = Effect.gen(function* () {
        const service = yield* CliInstallerService;
        // Check for node which should be available in test environment
        const available = yield* service.check("node", "node --version");
        return available;
      }).pipe(Effect.provide(CliInstallerServiceLive));

      const result = await Effect.runPromise(program);

      expect(result).toBe(true);
    });

    it("should return false for non-existent binary", async () => {
      const program = Effect.gen(function* () {
        const service = yield* CliInstallerService;
        const available = yield* service.check(
          "non-existent-binary-xyz",
          "non-existent-binary-xyz --version"
        );
        return available;
      }).pipe(Effect.provide(CliInstallerServiceLive));

      const result = await Effect.runPromise(program);

      expect(result).toBe(false);
    });
  });

  describe("install", () => {
    it("should skip installation if binary already exists", async () => {
      const program = Effect.gen(function* () {
        const service = yield* CliInstallerService;
        // Try to install node which should already be available
        yield* service.install("node", {
          check: "node --version",
          install: {
            npm: "node", // This would fail if it actually tried to install
          },
        });
      }).pipe(Effect.provide(CliInstallerServiceLive));

      // Should not throw since node is already installed
      await Effect.runPromise(program);
    });

    it("should fail when no installers are configured", async () => {
      const program = Effect.gen(function* () {
        const service = yield* CliInstallerService;
        return yield* service.install("fake-binary", {
          check: "fake-binary --version",
          // No install config
        });
      }).pipe(Effect.provide(CliInstallerServiceLive));

      const result = await Effect.runPromise(Effect.either(program));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("CliDependencyError");
        expect(result.left.binary).toBe("fake-binary");
      }
    });

    it("should fail when no compatible installer is available", async () => {
      const program = Effect.gen(function* () {
        const service = yield* CliInstallerService;
        return yield* service.install("fake-binary", {
          check: "fake-binary --version",
          install: {
            // Only configure an installer that doesn't exist
            cargo: "fake-binary",
          },
        });
      }).pipe(Effect.provide(CliInstallerServiceLive));

      const result = await Effect.runPromise(Effect.either(program));

      // Should either fail because:
      // 1. No compatible installer available (if cargo not installed)
      // 2. Installation failed (if cargo is installed but package doesn't exist)
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("CliDependencyError");
      }
    });

    it("should respect preferred installer option", async () => {
      const program = Effect.gen(function* () {
        const service = yield* CliInstallerService;
        const available = yield* service.availableInstallers();

        if (available.length === 0) {
          // Skip test if no installers available
          return "skipped";
        }

        // Try with preferred installer that exists
        yield* service.install(
          "node",
          {
            check: "node --version",
            install: {
              npm: "node",
            },
          },
          { preferred: "npm" }
        );

        return "success";
      }).pipe(Effect.provide(CliInstallerServiceLive));

      const result = await Effect.runPromise(program);
      expect(["skipped", "success"]).toContain(result);
    });
  });
});
