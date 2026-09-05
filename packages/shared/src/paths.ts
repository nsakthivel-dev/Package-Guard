import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

const APP_FOLDER = "Package Guard";
const DATA_SUBDIR = "data";
const DB_FILENAME = "package-guard.db";

export function getAppDataDir(): string {
  const localAppData =
    process.env["LOCALAPPDATA"] ??
    path.join(os.homedir(), ".local", "share");
  return path.join(localAppData, APP_FOLDER);
}

/**
 * Returns the path to the SQLite database file.
 *
 * On Windows this resolves to:
 *   %LOCALAPPDATA%\Package Guard\data\package-guard.db
 *
 * On other platforms (CI, dev on macOS/Linux) it falls back to:
 *   ~/.local/share/Package Guard/data/package-guard.db
 *
 * The directory is created automatically if it does not exist.
 * process.cwd() is never used.
 */
export function getDbPath(): string {
  const dir = path.join(getAppDataDir(), DATA_SUBDIR);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, DB_FILENAME);
}

/**
 * Returns the directory used for snapshot storage files.
 * Creates the directory if it does not exist.
 */
export function getSnapshotStorageDir(): string {
  const dir = path.join(getAppDataDir(), "snapshots");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Returns the directory used for configuration files.
 * Creates the directory if it does not exist.
 */
export function getConfigDir(): string {
  const dir = path.join(getAppDataDir(), "config");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Returns the directory used for log files.
 * Creates the directory if it does not exist.
 */
export function getLogsDir(): string {
  const dir = path.join(getAppDataDir(), "logs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Searches upwards from the given directory (or process.cwd())
 * to locate the project root (indicated by .packageguard or package.json).
 */
export function resolveProjectRoot(startDir: string = process.cwd()): string {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  while (current && current !== root) {
    if (
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
