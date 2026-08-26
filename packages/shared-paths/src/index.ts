/**
 * @workspace/shared-paths
 *
 * Single source of truth for every filesystem path used by PackageGuard.
 * Imported by BOTH the CLI (packages/cli) and the Electron main process.
 *
 * ── PATH CONTRACT ──────────────────────────────────────────────────────────
 *
 * APP_NAME must equal productName in config/electron-builder.config.js exactly,
 * because Electron derives app.getPath('userData') from that field:
 *
 *   Windows  →  %APPDATA%\Project Guardian
 *   macOS    →  ~/Library/Application Support/Project Guardian
 *   Linux    →  $XDG_CONFIG_HOME/Project Guardian  (falls back to ~/.config/Project Guardian)
 *
 * The display name shown to users is "PackageGuard".  The data FOLDER is
 * "Project Guardian" — they are different on purpose.  Do NOT change APP_NAME
 * without simultaneously changing productName in electron-builder.config.js,
 * or the CLI and Electron will write to different directories.
 *
 * ── DEV vs PROD ────────────────────────────────────────────────────────────
 *
 * The Electron app appends a /dev/ subdirectory when app.isPackaged === false.
 * The CLI is NEVER run inside Electron's dev mode — it always talks to the
 * installed/running packaged app.  Therefore the CLI ALWAYS targets the
 * production path (no /dev/ suffix) and this module NEVER adds one.
 *
 * ── KNOWN PRIOR BUG (fixed here) ──────────────────────────────────────────
 *
 * Previous builds had two separate path-resolution copies that drifted apart.
 * This module is the single copy imported via workspace: protocol — one copy,
 * no drift.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * MUST match productName in config/electron-builder.config.js exactly —
 * including capitalisation and the space.  Electron derives userData from this.
 *
 * Display name shown to users is "PackageGuard" (no space).
 * This folder name is "Project Guardian" (with space) to match electron-builder.
 */
export const APP_NAME = 'Project Guardian' as const;

// ── Platform base ─────────────────────────────────────────────────────────────

/**
 * Platform-appropriate "roaming application data" base directory.
 *
 *   Windows  →  %APPDATA%           (e.g. C:\Users\you\AppData\Roaming)
 *   macOS    →  ~/Library/Application Support
 *   Linux    →  $XDG_CONFIG_HOME    (falls back to ~/.config)
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

// ── Data root ─────────────────────────────────────────────────────────────────

/**
 * Root of the PackageGuard user-data directory.
 * Matches app.getPath('userData') when productName = "Project Guardian".
 *
 *   Windows  →  C:\Users\you\AppData\Roaming\Project Guardian
 *   macOS    →  /Users/you/Library/Application Support/Project Guardian
 *   Linux    →  /home/you/.config/Project Guardian
 *
 * NOTE: No /dev/ subdirectory — CLI always targets the production store.
 */
export function getUserDataDir(): string {
  return path.join(getAppDataBase(), APP_NAME);
}

// ── File paths ────────────────────────────────────────────────────────────────

/**
 * Full path to the project snapshot database written by the CLI and read by Electron.
 *   …\Project Guardian\database\db.json
 */
export function getDbJsonPath(): string {
  return path.join(getUserDataDir(), 'database', 'db.json');
}

/**
 * Full path to server.json — written by the Electron app on startup so the CLI
 * can discover the HTTP bridge port, token, and PID without hardcoding them.
 *   …\Project Guardian\server.json
 */
export function getServerJsonPath(): string {
  return path.join(getUserDataDir(), 'server.json');
}

// ── Directory bootstrap ───────────────────────────────────────────────────────

/**
 * Ensure every directory that PackageGuard needs exists.
 * Idempotent — safe to call on every CLI invocation.
 */
export function ensureUserDataDirs(): { created: string[]; failed: Array<{ dir: string; error: string }> } {
  const root = getUserDataDir();
  const required = [
    path.join(root, 'database'),
    path.join(root, 'snapshots'),
    path.join(root, 'logs'),
  ];

  const created: string[] = [];
  const failed: Array<{ dir: string; error: string }> = [];

  for (const dir of required) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        created.push(dir);
      }
    } catch (err: unknown) {
      failed.push({ dir, error: (err as Error).message });
    }
  }

  return { created, failed };
}
