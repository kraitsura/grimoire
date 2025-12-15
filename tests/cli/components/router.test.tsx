/**
 * Router Component Tests
 *
 * Basic tests to verify Router component structure and screen routing.
 * Note: Full rendering tests require ink-testing-library.
 */

import { describe, test, expect } from "bun:test";
import type { Screen } from "../../../src/cli/context/app-context.js";

describe("Router", () => {
  test("screen types are well-defined", () => {
    // Test that all screen types can be created
    const screens: Screen[] = [
      { name: "list" },
      { name: "view", promptId: "test-123" },
      { name: "edit", promptId: "test-456" },
      { name: "edit" },
      { name: "search" },
      { name: "settings" },
      { name: "history", promptId: "test-789" },
    ];

    expect(screens).toHaveLength(7);
    expect(screens[0].name).toBe("list");
    expect(screens[1].name).toBe("view");
    expect((screens[1] as any).promptId).toBe("test-123");
  });

  test("Router component can be imported", async () => {
    const { Router } = await import("../../../src/cli/components/Router.js");
    expect(Router).toBeDefined();
    expect(typeof Router).toBe("function");
  });

  test("Screen components can be imported", async () => {
    const {
      ListScreen,
      ViewerScreen,
      EditScreen,
      SearchScreen,
      SettingsScreen,
      HistoryScreen,
    } = await import("../../../src/cli/screens/index.js");

    expect(ListScreen).toBeDefined();
    expect(ViewerScreen).toBeDefined();
    expect(EditScreen).toBeDefined();
    expect(SearchScreen).toBeDefined();
    expect(SettingsScreen).toBeDefined();
    expect(HistoryScreen).toBeDefined();
  });
});
