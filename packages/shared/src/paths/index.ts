/**
 * @packageguard/shared — Paths Module
 *
 * SINGLE AUTHORITATIVE SOURCE OF TRUTH for all filesystem paths used by Package Guardian.
 * Imported by: CLI (`apps/cli`), Core Engine (`packages/core`), Database (`packages/database`),
 * and Electron Main Process (`apps/desktop/main`).
 *
 * TARGET DIRECTORY STRUCTURE:
 * %APPDATA%\PackageGuardian
 * │
 * ├── data
 * │   └── package_guardian.db
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

export const APP_NAME = 'PackageGuardian' as const;
export const LEGACY_APP_NAMES = ['PackageGuard', 'Package Guard', 'package-guard'] as const;
export const LEGACY_APP_NAME = 'PackageGuard' as const;

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
 * Migrates legacy data from previous Package Guard locations
 * (`%APPDATA%\PackageGuard`, `%APPDATA%\Package Guard`, `%LOCALAPPDATA%\Package Guard`)
 * to `%APPDATA%\PackageGuardian` safely and non-destructively on first access.
 */
function migrateLegacyDataIfNeeded(targetRoot: string): void {
  if (_migratedLegacy) return;
  _migratedLegacy = true;

  try {
    const baseAppData = getAppDataBase();
    const localAppData = process.env['LOCALAPPDATA'] || (process.platform === 'win32' ? path.join(os.homedir(), 'AppData', 'Local') : '');

    const candidateLegacyRoots = [
      path.join(baseAppData, 'PackageGuard'),
      path.join(baseAppData, 'Package Guard'),
      path.join(baseAppData, 'package-guard'),
      ...(localAppData ? [
        path.join(localAppData, 'Package Guard'),
        path.join(localAppData, 'PackageGuard'),
        path.join(localAppData, 'package-guard'),
      ] : [])
    ];

    const targetDataDir = path.join(targetRoot, 'data');
    const targetDbPath = path.join(targetDataDir, 'package_guardian.db');
    const targetSnaps = path.join(targetRoot, 'snapshots');
    const targetConfigDir = path.join(targetRoot, 'config');
    const targetConfig = path.join(targetConfigDir, 'settings.json');

    for (const legacyRoot of candidateLegacyRoots) {
      if (!fs.existsSync(legacyRoot) || legacyRoot === targetRoot) {
        continue;
      }

      // 1. Migrate database file
      if (!fs.existsSync(targetDbPath)) {
        const candidates = [
          path.join(legacyRoot, 'data', 'package_guardian.db'),
          path.join(legacyRoot, 'data', 'packageguard.db'),
          path.join(legacyRoot, 'data', 'package-guard.db'),
          path.join(legacyRoot, 'database', 'package-guard.db'),
          path.join(legacyRoot, 'database', 'db.json'),
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
      if (fs.existsSync(legacySnaps)) {
        try {
          fs.mkdirSync(targetSnaps, { recursive: true });
          const files = fs.readdirSync(legacySnaps);
          for (const file of files) {
            const src = path.join(legacySnaps, file);
            const dst = path.join(targetSnaps, file);
            if (!fs.existsSync(dst) && fs.statSync(src).isFile()) {
              try {
                fs.copyFileSync(src, dst);
              } catch { /* ignore */ }
            }
          }
        } catch { /* ignore */ }
      }

      // 3. Migrate config
      if (!fs.existsSync(targetConfig)) {
        const legacyConfigs = [
          path.join(legacyRoot, 'config', 'settings.json'),
          path.join(legacyRoot, 'config.json'),
        ];
        for (const cfg of legacyConfigs) {
          if (fs.existsSync(cfg)) {
            try {
              fs.mkdirSync(targetConfigDir, { recursive: true });
              fs.copyFileSync(cfg, targetConfig);
              break;
            } catch { /* ignore */ }
          }
        }
      }

      // 4. Migrate permissions
      const targetPermissions = path.join(targetConfigDir, 'permissions.json');
      const legacyPermissions = path.join(legacyRoot, 'config', 'permissions.json');
      if (!fs.existsSync(targetPermissions) && fs.existsSync(legacyPermissions)) {
        try {
          fs.mkdirSync(targetConfigDir, { recursive: true });
          fs.copyFileSync(legacyPermissions, targetPermissions);
        } catch { /* ignore */ }
      }

      // 5. Migrate install.ini
      const targetInstallIni = path.join(targetRoot, 'install.ini');
      const legacyInstallIni = path.join(legacyRoot, 'install.ini');
      if (!fs.existsSync(targetInstallIni) && fs.existsSync(legacyInstallIni)) {
        try {
          fs.copyFileSync(legacyInstallIni, targetInstallIni);
        } catch { /* ignore */ }
      }
    }
  } catch (err) {
    // Non-blocking migration warning
    console.warn('[SHARED-PATHS] Note: Legacy data migration skipped:', (err as Error).message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Authoritative Central Path Responsibilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the authoritative persistent user-data root directory:
 * `%APPDATA%\PackageGuardian`
 */
export function getUserDataDirectory(): string {
  if (_dataRootOverride) return _dataRootOverride;
  if (process.env.PACKAGE_GUARDIAN_DATA_ROOT) {
    const dir = process.env.PACKAGE_GUARDIAN_DATA_ROOT;
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    return dir;
  }
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
 * `%APPDATA%\PackageGuardian\data\package_guardian.db`
 */
export function getDatabasePath(): string {
  const root = getUserDataDirectory();
  const dataDir = path.join(root, 'data');
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch { /* ignore */ }
  const primaryDb = path.join(dataDir, 'package_guardian.db');

  if (!fs.existsSync(primaryDb)) {
    const localCandidates = [
      path.join(dataDir, 'packageguard.db'),
      path.join(dataDir, 'package-guard.db'),
    ];
    for (const cand of localCandidates) {
      if (fs.existsSync(cand)) {
        try {
          fs.copyFileSync(cand, primaryDb);
          break;
        } catch { /* ignore */ }
      }
    }
  }

  return primaryDb;
}

/**
 * Returns the authoritative snapshot storage directory:
 * `%APPDATA%\PackageGuardian\snapshots`
 */
export function getSnapshotDirectory(): string {
  const dir = path.join(getUserDataDirectory(), 'snapshots');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

/**
 * Returns the authoritative logs directory:
 * `%APPDATA%\PackageGuardian\logs`
 */
export function getLogDirectory(): string {
  const dir = path.join(getUserDataDirectory(), 'logs');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

/**
 * Returns the authoritative config directory:
 * `%APPDATA%\PackageGuardian\config`
 */
export function getConfigDirectory(): string {
  const dir = path.join(getUserDataDirectory(), 'config');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

/**
 * Returns the authoritative settings configuration file path:
 * `%APPDATA%\PackageGuardian\config\settings.json`
 */
export function getSettingsPath(): string {
  return path.join(getConfigDirectory(), 'settings.json');
}

/**
 * Returns the authoritative temp directory:
 * `%APPDATA%\PackageGuardian\temp`
 */
export function getTempDirectory(): string {
  const dir = path.join(getUserDataDirectory(), 'temp');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

/**
 * Returns the application installation or execution directory:
 * For normal Windows install: C:\Program Files\Package Guardian\
 * For ZIP extraction: the extracted directory (e.g. D:\Tools\PackageGuardian\)
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
    return '\\\\.\\pipe\\package-guardian-notify';
  }
  return path.join(getUserDataDirectory(), 'notify.sock');
}

export function getLegacyNotifySocketPath(): string {
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
