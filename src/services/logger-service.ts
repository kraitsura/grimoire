/**
 * Logger Service - File-based logging for debugging
 *
 * Writes logs to ~/.grimoire/debug.log for debugging TUI issues.
 * Logs are timestamped and include context about the operation.
 */

import { Context, Effect, Layer } from "effect";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ============================================================================
// Types
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
}

export interface LoggerServiceImpl {
  readonly debug: (context: string, message: string, data?: unknown) => Effect.Effect<void>;
  readonly info: (context: string, message: string, data?: unknown) => Effect.Effect<void>;
  readonly warn: (context: string, message: string, data?: unknown) => Effect.Effect<void>;
  readonly error: (context: string, message: string, data?: unknown) => Effect.Effect<void>;
  readonly getLogPath: () => string;
  readonly clear: () => Effect.Effect<void>;
  readonly tail: (lines?: number) => Effect.Effect<string[]>;
}

// ============================================================================
// Service Tag
// ============================================================================

export class LoggerService extends Context.Tag("LoggerService")<LoggerService, LoggerServiceImpl>() {}

// ============================================================================
// Implementation
// ============================================================================

const LOG_DIR = path.join(os.homedir(), ".grimoire");
const LOG_FILE = path.join(LOG_DIR, "debug.log");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB max log size

const ensureLogDir = (): void => {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
};

const rotateLogIfNeeded = (): void => {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        const backupPath = `${LOG_FILE}.1`;
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }
        fs.renameSync(LOG_FILE, backupPath);
      }
    }
  } catch {
    // Ignore rotation errors
  }
};

const formatEntry = (entry: LogEntry): string => {
  const levelPadded = entry.level.toUpperCase().padEnd(5);
  const dataStr = entry.data !== undefined ? ` | ${JSON.stringify(entry.data)}` : "";
  return `[${entry.timestamp}] ${levelPadded} [${entry.context}] ${entry.message}${dataStr}\n`;
};

const writeLog = (level: LogLevel, context: string, message: string, data?: unknown): void => {
  try {
    ensureLogDir();
    rotateLogIfNeeded();

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      data,
    };

    fs.appendFileSync(LOG_FILE, formatEntry(entry));
  } catch {
    // Silently fail - logging should never break the app
  }
};

const makeLoggerService = (): LoggerServiceImpl => ({
  debug: (context, message, data) =>
    Effect.sync(() => writeLog("debug", context, message, data)),

  info: (context, message, data) =>
    Effect.sync(() => writeLog("info", context, message, data)),

  warn: (context, message, data) =>
    Effect.sync(() => writeLog("warn", context, message, data)),

  error: (context, message, data) =>
    Effect.sync(() => writeLog("error", context, message, data)),

  getLogPath: () => LOG_FILE,

  clear: () =>
    Effect.sync(() => {
      try {
        if (fs.existsSync(LOG_FILE)) {
          fs.unlinkSync(LOG_FILE);
        }
      } catch {
        // Ignore
      }
    }),

  tail: (lines = 50) =>
    Effect.sync(() => {
      try {
        if (!fs.existsSync(LOG_FILE)) {
          return [];
        }
        const content = fs.readFileSync(LOG_FILE, "utf-8");
        const allLines = content.split("\n").filter((l) => l.trim());
        return allLines.slice(-lines);
      } catch {
        return [];
      }
    }),
});

// ============================================================================
// Layer
// ============================================================================

export const LoggerServiceLive = Layer.succeed(LoggerService, makeLoggerService());

// ============================================================================
// Standalone logger for use outside Effect context
// ============================================================================

const standaloneLogger = makeLoggerService();

export const log = {
  debug: (context: string, message: string, data?: unknown): void => {
    writeLog("debug", context, message, data);
  },
  info: (context: string, message: string, data?: unknown): void => {
    writeLog("info", context, message, data);
  },
  warn: (context: string, message: string, data?: unknown): void => {
    writeLog("warn", context, message, data);
  },
  error: (context: string, message: string, data?: unknown): void => {
    writeLog("error", context, message, data);
  },
  getLogPath: (): string => LOG_FILE,
  clear: (): void => {
    try {
      if (fs.existsSync(LOG_FILE)) {
        fs.unlinkSync(LOG_FILE);
      }
    } catch {
      // Ignore
    }
  },
  tail: (lines = 50): string[] => {
    try {
      if (!fs.existsSync(LOG_FILE)) {
        return [];
      }
      const content = fs.readFileSync(LOG_FILE, "utf-8");
      const allLines = content.split("\n").filter((l) => l.trim());
      return allLines.slice(-lines);
    } catch {
      return [];
    }
  },
};
