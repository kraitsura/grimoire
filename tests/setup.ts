/**
 * Test Setup File
 *
 * Loaded before all tests via bunfig.toml preload.
 * Configures the global test environment.
 */

import { beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { resetUuidCounter } from "./utils/fixtures";

// ============================================================================
// Global Configuration
// ============================================================================

/**
 * Increase test timeout for Effect-based tests that may take longer.
 * Default Bun timeout is 5000ms, we extend to 30000ms.
 */
// Note: Bun doesn't have a global timeout config, set per-test if needed

// ============================================================================
// Global Hooks
// ============================================================================

/**
 * Reset fixture counters before each test to ensure isolation.
 */
beforeEach(() => {
  resetUuidCounter();
});

/**
 * Global setup that runs once before all tests.
 */
beforeAll(() => {
  // Suppress console output during tests unless explicitly enabled
  if (process.env.TEST_VERBOSE !== "true") {
    // Store original console methods
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };

    // Override console methods to suppress output
    console.log = (...args: unknown[]) => {
      if (process.env.DEBUG) {
        originalConsole.log(...args);
      }
    };

    console.warn = (...args: unknown[]) => {
      if (process.env.DEBUG) {
        originalConsole.warn(...args);
      }
    };

    // Keep errors visible
    // console.error is not suppressed
  }
});

/**
 * Global cleanup that runs once after all tests.
 */
afterAll(() => {
  // Any global cleanup can go here
});

// ============================================================================
// Test Environment Variables
// ============================================================================

// Set test-specific environment variables
process.env.NODE_ENV = "test";

// Disable color output for consistent test snapshots
process.env.NO_COLOR = "1";
process.env.FORCE_COLOR = "0";

// ============================================================================
// Custom Matchers (if needed)
// ============================================================================

// Bun uses expect from bun:test which has Jest-compatible matchers
// Custom matchers can be added here if needed

// ============================================================================
// Utility Exports
// ============================================================================

// Re-export commonly used items for convenience
export { resetUuidCounter } from "./utils/fixtures";
