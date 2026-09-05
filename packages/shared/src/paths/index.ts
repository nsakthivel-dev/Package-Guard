/**
 * @packageguard/shared — Paths Module
 *
 * SINGLE AUTHORITATIVE SOURCE OF TRUTH for all filesystem paths used by PackageGuard.
 * Imported by: CLI (`apps/cli`), Core Engine (`packages/core`), Database (`packages/database`),
 * and Electron Main Process (`apps/desktop/main`).
 *
 * TARGET DIRECTORY STRUCTURE (Section 3 & 4):
 * %APPDATA%\PackageGuard
 * │
 * ├── data
 * │   └── packageguard.db
 * │
 * ├── snapshots
 * │
 * ├── logs
 * │
 * ├── config
 * │   └── settings.json
 * │
 * └── temp\
 *
 * RULES:
 * 1. NEVER store persistent user data inside the application installation directory.
 * 2. NEVER store the database inside app.asar, resources, Program Files, or dev source dir.
 * 3. Both CLI and Electron must resolve to the exact same paths.
 * 4. NEVER use process.cwd() to locate persistent data.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { assertSafeWritePath } from './path-validator.js';

export const APP_NAME = 'PackageGuard' as const;
export const LEGACY_APP_NAME = 'Package Guard' as const;

let _dataRootOverride: string | null = null;
let _migratedLegacy = false;

/**
 * Explicitly sets the data root override (e.g. for testing / custom setups).
 */
export function setDataRoot(dir: string): void {
  _dataRootOverride = dir;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch { /* ignore */ }
}

/**
 * Returns the platform-appropriate application-data base directory.
 * Windows: %APPDATA% (typically C:\Users\<User>\AppData\Roaming)
 * macOS:   ~/Library/Application Support
 * Linux:   $XDG_CONFIG_HOME or ~/.config
 */
export function getAppDataBase(): string {
  if (process.platform === 'win32') {
    return process.env['APPDATA'] || path.join(os.homedir(), 'AppData', 'Roaming');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  return process.env['XDG_CONFIG_HOME'] || path.join(os.homedir(), '.config');
}

/**
 * Migrates legacy data from `%APPDATA%\Package Guard` to `%APPDATA%\PackageGuard`
 * safely and non-destructively on first access.
 */
function migrateLegacyDataIfNeeded(targetRoot: string): void {
  if (_migratedLegacy) return;
  _migratedLegacy = true;

  try {
    const legacyRoot = path.join(getAppDataBase(), LEGACY_APP_NAME);
    if (!fs.existsSync(legacyRoot) || legacyRoot === targetRoot) {
      return;
    }

    // 1. Migrate database file
    const targetDataDir = path.join(targetRoot, 'data');
    const targetDbPath = path.join(targetDataDir, 'packageguard.db');
    if (!fs.existsSync(targetDbPath)) {
      const candidates = [
        path.join(legacyRoot, 'database', 'db.json'),
        path.join(legacyRoot, 'data', 'packageguard.db'),
        path.join(legacyRoot, 'database', 'app_storage.json'),
      ];
      for (const oldFile of candidates) {
        if (fs.existsSync(oldFile)) {
          fs.mkdirSync(targetDataDir, { recursive: true });
          fs.copyFileSync(oldFile, targetDbPath);
          break;
        }
      }
    }

    // 2. Migrate snapshots
    const legacySnaps = path.join(legacyRoot, 'snapshots');
    const targetSnaps = path.join(targetRoot, 'snapshots');
    if (fs.existsSync(legacySnaps) && fs.existsSync(targetSnaps)) {
      const files = fs.readdirSync(legacySnaps);
      for (const file of files) {
        const src = path.join(legacySnaps, file);
        const dst = path.join(targetSnaps, file);
        if (!fs.existsSync(dst) && fs.statSync(src).isFile()) {
          try { fs.copyFileSync(src, dst); } catch { /* ignore */ }
        }
      }
    }

    // 3. Migrate config
    const legacyConfig = path.join(legacyRoot, 'config.json');
    const targetConfigDir = path.join(targetRoot, 'config');
    const targetConfig = path.join(targetConfigDir, 'settings.json');
    if (fs.existsSync(legacyConfig) && !fs.existsSync(targetConfig)) {
      fs.mkdirSync(targetConfigDir, { recursive: true });
      fs.copyFileSync(legacyConfig, targetConfig);
    }
  } catch (err) {
    // Non-blocking migration warning
    console.warn('[SHARED-PATHS] Note: Legacy data migration skipped:', (err as Error).message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Authoritative Central Path Responsibilities (Section 4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the authoritative persistent user-data root directory:
 * `%APPDATA%\PackageGuard`
 */
export function getUserDataDirectory(): string {
  if (_dataRootOverride) return _dataRootOverride;
  if (process.env.PG_DATA_ROOT) {
    const dir = process.env.PG_DATA_ROOT;
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    return dir;
  }
  const root = path.join(getAppDataBase(), APP_NAME);
  try { fs.mkdirSync(root, { recursive: true }); } catch { /* ignore */ }
  migrateLegacyDataIfNeeded(root);
  return root;
}

/**
 * Returns the authoritative database path:
 * `%APPDATA%\PackageGuard\data\packageguard.db`
 */
export function getDatabasePath(): string {
  const root = getUserDataDirectory();
  const dataDir = path.join(root, 'data');
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch { /* ignore */ }
  return path.join(dataDir, 'packageguard.db');
}

/**
 * Returns the authoritative snapshot storage directory:
 * `%APPDATA%\PackageGuard\snapshots`
 */
export function getSnapshotDirectory(): string {
  const dir = path.join(getUserDataDirectory(), 'snapshots');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

/**
 * Returns the authoritative logs directory:
 * `%APPDATA%\PackageGuard\logs`
 */
export function getLogDirectory(): string {
  const dir = path.join(getUserDataDirectory(), 'logs');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

/**
 * Returns the authoritative config directory:
 * `%APPDATA%\PackageGuard\config`
 */
export function getConfigDirectory(): string {
  const dir = path.join(getUserDataDirectory(), 'config');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

/**
 * Returns the authoritative settings configuration file path:
 * `%APPDATA%\PackageGuard\config\settings.json`
 */
export function getSettingsPath(): string {
  return path.join(getConfigDirectory(), 'settings.json');
}

/**
 * Returns the authoritative temp directory:
 * `%APPDATA%\PackageGuard\temp`
 */
export function getTempDirectory(): string {
  const dir = path.join(getUserDataDirectory(), 'temp');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

/**
 * Returns the application installation or execution directory:
 * For normal Windows install: C:\Program Files\Package Guard\
 * For ZIP extraction: the extracted directory (e.g. D:\Tools\PackageGuard\)
 * For development: workspace root
 */
export function getApplicationDirectory(): string {
  const proc = process as any;
  if (proc.resourcesPath && !proc.resourcesPath.includes('node_modules')) {
    // Packaged Electron: process.resourcesPath is <installDir>\resources
    return path.dirname(proc.resourcesPath);
  }

  // Check if running as packaged binary
  const execDir = path.dirname(process.execPath);
  if (!execDir.includes('node_modules') && !execDir.toLowerCase().includes('node')) {
    const pkgJson = path.join(execDir, 'package.json');
    const resourcesDir = path.join(execDir, 'resources');
    if (fs.existsSync(resourcesDir) || fs.existsSync(pkgJson)) {
      return execDir;
    }
  }

  // In development: navigate up to repository root
  return path.resolve(__dirname, '..', '..', '..', '..');
}

/**
 * Returns the CLI directory within the application:
 * Installed / Packaged: <installDir>\cli
 * Development: <workspaceRoot>\apps\cli
 */
export function getCliDirectory(): string {
  const appDir = getApplicationDirectory();
  const installedCli = path.join(appDir, 'cli');
  if (fs.existsSync(installedCli)) {
    return installedCli;
  }
  return path.join(appDir, 'apps', 'cli');
}

/**
 * Returns the CLI entrypoint script path:
 * Packaged: <appDir>\cli\index.js or <resourcesPath>\app.asar\apps\cli\dist\index.js
 * Dev: <appDir>\apps\cli\dist\index.js
 */
export function getCliEntrypointPath(): string {
  const proc = process as any;
  if (proc.resourcesPath) {
    const asarCli = path.join(proc.resourcesPath, 'app.asar', 'apps', 'cli', 'dist', 'index.js');
    if (fs.existsSync(asarCli)) return asarCli;

    const extraCli = path.join(getApplicationDirectory(), 'cli', 'index.js');
    if (fs.existsSync(extraCli)) return extraCli;
  }

  const appDir = getApplicationDirectory();
  const devCli = path.join(appDir, 'apps', 'cli', 'dist', 'index.js');
  return devCli;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward-Compatible Aliases & Shared Helpers
// ─────────────────────────────────────────────────────────────────────────────

export const getUserDataDir = getUserDataDirectory;
export const getPgDir = getUserDataDirectory;
export const getDbJsonPath = getDatabasePath;
export const getSnapshotDir = getSnapshotDirectory;
export const getLogsDir = getLogDirectory;
export const getConfigPath = getSettingsPath;
export const getTempDir = getTempDirectory;

export function getServerJsonPath(): string {
  return path.join(getUserDataDirectory(), 'server.json');
}

export function getNotifySocketPath(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\package-guard-notify';
  }
  return path.join(getUserDataDirectory(), 'notify.sock');
}

export function resolveProjectPath(rawPath?: string): string {
  const target = rawPath ?? process.cwd();
  const resolved = path.resolve(target);
  try {
    return (fs as any).realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

/**
 * Idempotently ensures all required user-data subdirectories exist:
 * - data
 * - snapshots
 * - logs
 * - config
 * - temp
 */
export function ensureUserDataDirs(): { created: string[]; failed: Array<{ dir: string; error: string }> } {
  const root = getUserDataDirectory();
  const required = [
    path.join(root, 'data'),
    path.join(root, 'snapshots'),
    path.join(root, 'logs'),
    path.join(root, 'config'),
    path.join(root, 'temp'),
  ];

  const created: string[] = [];
  const failed: Array<{ dir: string; error: string }> = [];

  for (const dir of required) {
    try {
      assertSafeWritePath(dir);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        created.push(dir);
      }
    } catch (err: unknown) {
      const message = (err as Error).message;
      console.error(`[SHARED-PATHS] Blocked or failed to create directory: ${dir} — ${message}`);
      failed.push({ dir, error: message });
    }
  }

  return { created, failed };
}

export * from './path-validator.js';
