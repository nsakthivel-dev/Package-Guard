import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  getUserDataDirectory,
  getDatabasePath,
  getSnapshotDirectory,
  getConfigDirectory,
  getLogDirectory,
} from "./paths/index.js";

const APP_FOLDER = "Package Guardian";
const DATA_SUBDIR = "data";
const DB_FILENAME = "package_guardian.db";

export function getAppDataDir(): string {
  return getUserDataDirectory();
}

/**
 * Returns the path to the SQLite database file.
 * Authoritatively delegates to getDatabasePath() in paths/index.ts:
 *   %APPDATA%\PackageGuardian\data\package_guardian.db
 */
export function getDbPath(): string {
  return getDatabasePath();
}

/**
 * Returns the directory used for snapshot storage files.
 * Creates the directory if it does not exist.
 */
export function getSnapshotStorageDir(): string {
  return getSnapshotDirectory();
}

/**
 * Returns the directory used for configuration files.
 * Creates the directory if it does not exist.
 */
export function getConfigDir(): string {
  return getConfigDirectory();
}

/**
 * Returns the directory used for log files.
 * Creates the directory if it does not exist.
 */
export function getLogsDir(): string {
  return getLogDirectory();
}

/**
 * Searches upwards from the given directory (or process.cwd())
 * to locate the project root (indicated by .packageguardian, .packageguard, or package.json).
 */
export function resolveProjectRoot(startDir: string = process.cwd()): string {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  while (current && current !== root) {
    if (
      fs.existsSync(path.join(current, ".packageguardian")) ||
      fs.existsSync(path.join(current, ".packageguard")) ||
      fs.existsSync(path.join(current, "package.json"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return path.resolve(startDir);
}

// Re-export all path utilities and validators
export * from "./paths/index.js";
export * from "./paths/path-validator.js";
