/**
 * packages/core/src/paths.ts
 *
 * Centralized path resolver for the PackageGuard core library.
 * Used by the Electron main process.
 *
 * PATH RESOLUTION STRATEGY
 * ────────────────────────
 * 1. If an explicit override has been set via `setDataRoot()` (called by the
 *    Electron main process after it has resolved its portable data directory),
 *    ALL paths derive from that override.
 *
 * 2. If the environment variable PG_DATA_ROOT is set, use that.
 *    This lets external tools communicate the packaged app's data root when needed.
 *
 * 3. Default: ~/.package-guard
 *    This is the dev-mode path. It is also the fallback
 *    for the packaged app if the override is somehow not injected.
 *
 * NEVER use process.cwd() for runtime data storage.  process.cwd() is the
 * directory from which the process was launched — completely arbitrary in a
 * packaged desktop app.
 */

import os   from 'node:os';
import path from 'node:path';
import fs   from 'node:fs';

// ─── Override mechanism ───────────────────────────────────────────────────────

let _dataRootOverride: string | null = null;

/**
 * Called once by the Electron main process to inject the portable data root
 * resolved by runtimePaths.js.
 *
 * Example (electron/main.js):
 *   const rp = require('./runtimePaths');
 *   const { setDataRoot } = require('@workspace/package-guard-core/paths');
 *   setDataRoot(rp.dataRoot);
 */
export function setDataRoot(dir: string): void {
  _dataRootOverride = dir;
  // Pre-create the directory so subsequent sync calls never fail
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch { /* ignore — already exists or permission error handled upstream */ }
}

// ─── Root resolver ────────────────────────────────────────────────────────────

export function getPgDir(): string {
  // Priority 1: explicit runtime injection (Electron portable mode)
  if (_dataRootOverride) return _dataRootOverride;

  // Priority 2: environment variable (useful for testing / advanced setups)
  if (process.env.PG_DATA_ROOT) {
    const dir = process.env.PG_DATA_ROOT;
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    return dir;
  }

  // Priority 3: default dev path
  const dir = path.join(os.homedir(), '.package-guard');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

// ─── File path accessors ──────────────────────────────────────────────────────

/**
 * server.json — written by the Electron HTTP bridge server on startup.
 * Used to discover the running Electron instance's port + token.
 */
export function getServerJsonPath(): string {
  return path.join(getPgDir(), 'server.json');
}

/**
 * db.json — the core snapshot database.
 * In portable (packaged) mode this lives in data/database/db.json.
 * In dev mode this lives in ~/.package-guard/db.json.
 */
export function getDbJsonPath(): string {
  const root = getPgDir();

  // When a data-root override is set (Electron portable mode), the database
  // lives in the database/ subdirectory (matching runtimePaths layout).
  if (_dataRootOverride || process.env.PG_DATA_ROOT) {
    const dbDir = path.join(root, 'database');
    try { fs.mkdirSync(dbDir, { recursive: true }); } catch { /* ignore */ }
    return path.join(dbDir, 'db.json');
  }

  // Default: flat layout in ~/.package-guard/db.json
  return path.join(root, 'db.json');
}

// ─── Notify socket / named-pipe path ─────────────────────────────────────────

/**
 * Returns the platform-appropriate path for the CLI→GUI "data-changed"
 * notification channel.
 *
 * • Windows  → Named pipe:  \\.\pipe\package-guard-notify
 *              (Named pipes on Windows are global; no directory needed.)
 *
 * • macOS / Linux → Unix domain socket inside the data root directory.
 *              Using a predictable, fixed name derived from the app name means
 *              the CLI never needs to discover a port or read a config file to
 *              send a notification.
 *
 * Both Electron (listener) and the CLI (sender) call this function, so the
 * path is always identical for both sides without any coordination file.
 */
export function getNotifySocketPath(): string {
  if (process.platform === 'win32') {
    // Named pipes on Windows are not filesystem paths, so the data root is
    // irrelevant — the name must simply be unique per application.
    return '\\\\.\\pipe\\package-guard-notify';
  }
  // Unix: store the socket inside the data root so it is isolated per
  // installation (packaged vs. dev).  The socket file is created/deleted
  // by Electron; the CLI just connects to it.
  return path.join(getPgDir(), 'notify.sock');
}

// ─── Project path resolver ────────────────────────────────────────────────────

/**
 * Resolves an arbitrary user-supplied project path to an absolute, real path.
 * Falls back to process.cwd() ONLY for project path resolution (not storage).
 * process.cwd() is intentionally valid here because the user is invoking the
 * CLI from their project directory.
 */
export function resolveProjectPath(rawPath?: string): string {
  const target   = rawPath ?? process.cwd();
  const resolved = path.resolve(target);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}
