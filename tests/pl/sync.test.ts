/**
 * Tests for pl sync command
 *
 * Note: The sync command uses RemoteSyncService.getStatus() which returns
 * a different structure than the mock. These tests verify basic behavior.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Effect, Layer } from "effect";
import { syncCommand } from "../../src/commands/pl/sync";
import { RemoteSyncService } from "../../src/services/remote-sync-service";
import {
  createParsedArgs,
  captureConsole,
  mockProcessExit,
} from "./test-helpers";

describe("pl sync command", () => {
  const console$ = captureConsole();
  const exitMock = mockProcessExit();

  beforeEach(() => {
    console$.start();
    exitMock.start();
  });

  afterEach(() => {
    console$.stop();
    console$.clear();
    exitMock.stop();
    exitMock.reset();
  });

  it("should show status with --status flag when configured", async () => {
    const mockSync = {
      configure: () => Effect.void,
      getConfig: () => Effect.succeed({ provider: "git", remote: "https://remote.git", branch: "main" }),
      getStatus: () =>
        Effect.succeed({
          isConfigured: true,
          remote: "https://remote.git",
          branch: "main",
          ahead: 2,
          behind: 1,
          hasConflicts: false,
        }),
      push: () => Effect.succeed({ filesChanged: 0, conflicts: [] }),
      pull: () => Effect.succeed({ filesChanged: 0, conflicts: [] }),
      status: () => Effect.succeed({ configured: true, lastSync: null, localChanges: 0, remoteChanges: 0 }),
    };
    const TestLayer = Layer.succeed(RemoteSyncService, mockSync);

    const args = createParsedArgs({
      positional: [],
      flags: { status: true },
    });

    await Effect.runPromise(syncCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Status") || l.includes("Remote"))).toBe(true);
  });

  it("should show not configured message when sync is not set up", async () => {
    const mockSync = {
      configure: () => Effect.void,
      getConfig: () => Effect.succeed(null),
      getStatus: () =>
        Effect.succeed({
          isConfigured: false,
          remote: "",
          branch: "",
          ahead: 0,
          behind: 0,
          hasConflicts: false,
        }),
      push: () => Effect.succeed({ filesChanged: 0, conflicts: [] }),
      pull: () => Effect.succeed({ filesChanged: 0, conflicts: [] }),
      status: () => Effect.succeed({ configured: false, lastSync: null, localChanges: 0, remoteChanges: 0 }),
    };
    const TestLayer = Layer.succeed(RemoteSyncService, mockSync);

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(syncCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("not configured") || l.includes("setup"))).toBe(true);
  });

  it("should push changes with --push flag", async () => {
    let pushCalled = false;
    const mockSync = {
      configure: () => Effect.void,
      getConfig: () => Effect.succeed({ provider: "git", remote: "https://remote.git", branch: "main" }),
      getStatus: () =>
        Effect.succeed({
          isConfigured: true,
          remote: "https://remote.git",
          branch: "main",
          ahead: 1,
          behind: 0,
          hasConflicts: false,
        }),
      push: () => {
        pushCalled = true;
        return Effect.succeed({ filesChanged: 3, conflicts: [] });
      },
      pull: () => Effect.succeed({ filesChanged: 0, conflicts: [] }),
      status: () => Effect.succeed({ configured: true, lastSync: null, localChanges: 0, remoteChanges: 0 }),
    };
    const TestLayer = Layer.succeed(RemoteSyncService, mockSync);

    const args = createParsedArgs({
      positional: [],
      flags: { push: true },
    });

    await Effect.runPromise(syncCommand(args).pipe(Effect.provide(TestLayer)));

    expect(pushCalled).toBe(true);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Push") || l.includes("3"))).toBe(true);
  });

  it("should pull changes with --pull flag", async () => {
    let pullCalled = false;
    const mockSync = {
      configure: () => Effect.void,
      getConfig: () => Effect.succeed({ provider: "git", remote: "https://remote.git", branch: "main" }),
      getStatus: () =>
        Effect.succeed({
          isConfigured: true,
          remote: "https://remote.git",
          branch: "main",
          ahead: 0,
          behind: 2,
          hasConflicts: false,
        }),
      push: () => Effect.succeed({ filesChanged: 0, conflicts: [] }),
      pull: () => {
        pullCalled = true;
        return Effect.succeed({ filesChanged: 2, conflicts: [] });
      },
      status: () => Effect.succeed({ configured: true, lastSync: null, localChanges: 0, remoteChanges: 0 }),
    };
    const TestLayer = Layer.succeed(RemoteSyncService, mockSync);

    const args = createParsedArgs({
      positional: [],
      flags: { pull: true },
    });

    await Effect.runPromise(syncCommand(args).pipe(Effect.provide(TestLayer)));

    expect(pullCalled).toBe(true);
    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("Pull") || l.includes("2"))).toBe(true);
  });

  it("should show up to date message when no changes", async () => {
    const mockSync = {
      configure: () => Effect.void,
      getConfig: () => Effect.succeed({ provider: "git", remote: "https://remote.git", branch: "main" }),
      getStatus: () =>
        Effect.succeed({
          isConfigured: true,
          remote: "https://remote.git",
          branch: "main",
          ahead: 0,
          behind: 0,
          hasConflicts: false,
        }),
      push: () => Effect.succeed({ filesChanged: 0, conflicts: [] }),
      pull: () => Effect.succeed({ filesChanged: 0, conflicts: [] }),
      status: () => Effect.succeed({ configured: true, lastSync: null, localChanges: 0, remoteChanges: 0 }),
    };
    const TestLayer = Layer.succeed(RemoteSyncService, mockSync);

    const args = createParsedArgs({ positional: [] });

    await Effect.runPromise(syncCommand(args).pipe(Effect.provide(TestLayer)));

    const logs = console$.getLogs();
    expect(logs.some((l) => l.includes("up to date") || l.includes("Already"))).toBe(true);
  });
});
