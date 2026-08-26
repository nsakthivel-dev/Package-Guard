/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Project Guardian — Centralized Runtime Path Manager
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DESIGN: AppData-rooted data layout (installed application)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * When PACKAGED (app.isPackaged === true):
 *   The data root is the Windows user-roaming profile directory:
 *
 *     C:\Users\<Username>\AppData\Roaming\Project Guardian\
 *
 *   This is the canonical location for installed Windows applications.
 *   The application binary lives in Program Files (read-only); all mutable
 *   runtime data lives here, completely separated from the install directory.
 *
 *   Layout:
 *     Project Guardian\
 *       ├── config\         ← application settings / preferences
 *       ├── database\       ← app_storage.json, db.json
 *       ├── snapshots\      ← CLI project snapshots
 *       ├── logs\           ← startup.log, error.log, cli.log, ipc.log
 *       ├── cache\          ← version-check cache, scan result cache
 *       ├── temp\           ← atomic write temps, checkout backups
 *       └── venv\           ← registered virtual-environment metadata
 *
 * When IN DEVELOPMENT (app.isPackaged === false):
 *   Falls back to %APPDATA%\Project Guardian\dev\ so that dev and production
 *   data are stored in the same parent directory but in separate sub-trees.
 *   (Previously used ~/.package-guard; migrated on first dev run.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *   const rp = require('./runtimePaths');
 *
 *   rp.paths.database    → full path to database dir
 *   rp.paths.dbFile      → full path to app_storage.json
 *   rp.paths.coreDbFile  → full path to db.json (CLI core database)
 *   rp.paths.serverJson  → full path to server.json
 *   rp.paths.logs        → full path to logs dir
 *   rp.paths.cache       → full path to cache dir
 *   rp.paths.temp        → full path to temp dir
 *   rp.paths.venv        → full path to venv metadata dir
 *   rp.paths.config      → full path to config dir
 *   rp.paths.snapshots   → full path to snapshots dir
 *   rp.paths.root        → full path to data root
 *
 *   rp.ensureDirectories()  → create all dirs idempotently (called once on startup)
 *   rp.isPortable           → true when running as packaged exe
 *   rp.dataRoot             → alias for rp.paths.root
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ─── App name constant ────────────────────────────────────────────────────────

/**
 * This name drives the AppData sub-folder and must match the productName in
 * electron-builder.config.js so that Electron's app.getPath('userData') and
 * our manual path computation always agree.
 */
const APP_NAME = 'Project Guardian';

// ─── Detect packaged vs development ──────────────────────────────────────────

/**
 * Returns true when running inside a packaged Electron application.
 * Works before app.whenReady() resolves, and also in worker/helper processes
 * that don't have the Electron main-process APIs available.
 */
function isPackagedApp() {
  try {
    const { app } = require('electron');
    if (app && typeof app.isPackaged === 'boolean') return app.isPackaged;
  } catch { /* electron not yet ready or not importable */ }

  // asar path is the most reliable runtime signal
  if (__filename.includes('app.asar')) return true;

  // process.resourcesPath is injected by Electron's packager but NOT present
  // when running under plain Node (dev mode with tsx / ts-node).
  if (
    process.resourcesPath &&
    !process.resourcesPath.includes('node_modules') &&
    !process.resourcesPath.includes('electron')
  ) {
    return true;
  }

  return false;
}

// ─── Resolve the AppData root ─────────────────────────────────────────────────

/**
 * Returns the user-specific application-data directory.
 *
 *   Packaged  →  %APPDATA%\Project Guardian\          (Windows)
 *                ~/Library/Application Support/Project Guardian/  (macOS)
 *                ~/.config/Project Guardian/            (Linux)
 *
 *   Dev       →  %APPDATA%\Project Guardian\dev\      (Windows)
 *                ~/Library/Application Support/Project Guardian/dev/  (macOS)
 *                ~/.config/Project Guardian/dev/        (Linux)
 *
 * We deliberately use app.getPath('userData') when available because Electron
 * sets it to %APPDATA%\<productName> which is exactly what we want.  The
 * manual computation below is a fallback for contexts where Electron APIs
 * aren't available yet (e.g. early require-time in worker processes).
 */
function resolveDataRoot() {
  const isPackaged = isPackagedApp();

  // ── Electron API path (most accurate) ──────────────────────────────────────
  try {
    const { app } = require('electron');
    if (app) {
      // app.getPath('userData') returns  %APPDATA%\<productName>  on Windows
      // which matches our APP_NAME if electron-builder.config productName is set.
      const userData = app.getPath('userData');
      // In dev mode, keep data isolated under a dev/ sub-folder so test runs
      // don't corrupt production data.
      return isPackaged ? userData : path.join(userData, 'dev');
    }
  } catch { /* Electron APIs not yet available — fall through to manual */ }

  // ── Manual computation (fallback) ─────────────────────────────────────────
  const appDataBase = resolveAppDataBase();
  const root = path.join(appDataBase, APP_NAME);
  return isPackaged ? root : path.join(root, 'dev');
}

/**
 * Returns the platform-appropriate "application data" base directory without
 * relying on Electron APIs:
 *
 *   Windows: %APPDATA%  (C:\Users\<User>\AppData\Roaming)
 *   macOS:   ~/Library/Application Support
 *   Linux:   $XDG_CONFIG_HOME or ~/.config
 */
function resolveAppDataBase() {
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  // Linux / BSD
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

// ─── Build path map ───────────────────────────────────────────────────────────

const DATA_ROOT   = resolveDataRoot();
const IS_PACKAGED = isPackagedApp();

/**
 * All runtime paths in one place.
 *
 * Every module in the application MUST use these — never construct paths
 * using process.cwd(), __dirname, or hardcoded strings elsewhere.
 */
const paths = {
  /** Root of the user-data directory (AppData\Roaming\Project Guardian) */
  root:          DATA_ROOT,

  // ── Sub-directories ──────────────────────────────────────────────────────
  /** config\  — application settings, preferences */
  config:        path.join(DATA_ROOT, 'config'),

  /** database\  — Electron app_storage.json + CLI core db.json */
  database:      path.join(DATA_ROOT, 'database'),

  /** snapshots\  — CLI project snapshot storage */
  snapshots:     path.join(DATA_ROOT, 'snapshots'),

  /** logs\  — all log files */
  logs:          path.join(DATA_ROOT, 'logs'),

  /** cache\  — version-check cache, scan result cache */
  cache:         path.join(DATA_ROOT, 'cache'),

  /** temp\  — atomic write temporaries, checkout backups */
  temp:          path.join(DATA_ROOT, 'temp'),

  /** venv\  — virtual-environment metadata registered by the app */
  venv:          path.join(DATA_ROOT, 'venv'),

  // ── Files ────────────────────────────────────────────────────────────────
  /** database\app_storage.json — Electron GUI runtime database */
  dbFile:        path.join(DATA_ROOT, 'database', 'app_storage.json'),

  /** database\db.json — CLI / core snapshot database */
  coreDbFile:    path.join(DATA_ROOT, 'database', 'db.json'),

  /** server.json — CLI ↔ Electron bridge discovery file (data root, not a sub-dir) */
  serverJson:    path.join(DATA_ROOT, 'server.json'),

  // ── Individual log files ─────────────────────────────────────────────────
  startupLog:    path.join(DATA_ROOT, 'logs', 'startup.log'),
  errorLog:      path.join(DATA_ROOT, 'logs', 'error.log'),
  cliLog:        path.join(DATA_ROOT, 'logs', 'cli.log'),
  ipcLog:        path.join(DATA_ROOT, 'logs', 'ipc.log'),
};

// ─── Directory bootstrapper ───────────────────────────────────────────────────

const REQUIRED_DIRS = [
  paths.config,
  paths.database,
  paths.snapshots,
  paths.logs,
  paths.cache,
  paths.temp,
  paths.venv,
];

/**
 * Creates every required runtime directory.
 * Safe to call multiple times — idempotent.
 * Must be called once during app startup before any handler loads.
 *
 * @returns {{ created: string[], failed: Array<{dir:string, error:string}> }}
 */
function ensureDirectories() {
  const created = [];
  const failed  = [];

  for (const dir of REQUIRED_DIRS) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        created.push(dir);
        _log('INFO', `Directory created: ${dir}`);
      }
    } catch (err) {
      failed.push({ dir, error: err.message });
      _log('ERROR', `Failed to create directory: ${dir} — ${err.message}`);
    }
  }

  if (failed.length > 0) {
    _log('WARN',
      `${failed.length} director(ies) could not be created. ` +
      'Some features may not persist data correctly.'
    );
  }

  return { created, failed };
}

// ─── First-launch detection ───────────────────────────────────────────────────

/**
 * Returns true if this is the very first time the application has run on this
 * machine / user-profile.  Detection is based on the absence of the primary
 * database file (app_storage.json), which is created by dbHandler on first
 * save.
 *
 * Call AFTER ensureDirectories() so the database directory already exists.
 */
function isFirstLaunch() {
  return !fs.existsSync(paths.dbFile);
}

// ─── Migration: old data location → AppData ──────────────────────────────────

/**
 * One-time migration from the old "beside-executable" portable layout to the
 * new AppData-rooted layout.
 *
 * Old locations (packaged portable build):
 *   <exe-dir>\data\database\app_storage.json  →  database\app_storage.json
 *   <exe-dir>\data\database\db.json           →  database\db.json
 *   ~/.package-guard\db.json                  →  database\db.json
 *
 * Migration is non-destructive: it never overwrites an existing destination
 * file, and it never deletes the source.
 *
 * Only runs when the packaged app is detected.
 */
function migrateFromLegacy() {
  if (!IS_PACKAGED) return;   // dev mode — no migration needed

  // Source 1: old portable data/ folder beside the executable
  const exeDir = path.dirname(process.execPath);
  const portableBase = path.join(exeDir, 'data');

  _tryMigrate(
    path.join(portableBase, 'database', 'app_storage.json'),
    paths.dbFile,
    'portable → AppData (app_storage.json)'
  );
  _tryMigrate(
    path.join(portableBase, 'database', 'db.json'),
    paths.coreDbFile,
    'portable → AppData (db.json)'
  );

  // Source 2: legacy ~/.package-guard/db.json (very old builds)
  const legacyPgDir = path.join(os.homedir(), '.package-guard');
  _tryMigrate(
    path.join(legacyPgDir, 'db.json'),
    paths.coreDbFile,
    '~/.package-guard → AppData (db.json)'
  );

  // Source 3: old userData location (Electron default before explicit rename)
  try {
    const { app } = require('electron');
    if (app) {
      // Before productName was set to "Project Guardian", userData defaulted to
      // %APPDATA%\PackageGuard (or the repo folder name on some builds).
      for (const oldName of ['PackageGuard', 'packageguard', 'package-guard']) {
        const oldBase = path.join(resolveAppDataBase(), oldName);
        _tryMigrate(
          path.join(oldBase, 'database', 'app_storage.json'),
          paths.dbFile,
          `${oldName} → Project Guardian (app_storage.json)`
        );
        _tryMigrate(
          path.join(oldBase, 'database', 'db.json'),
          paths.coreDbFile,
          `${oldName} → Project Guardian (db.json)`
        );
      }
    }
  } catch { /* electron not ready — skip */ }
}

function _tryMigrate(src, dst, label) {
  try {
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
      _log('INFO', `Migrated ${label}: ${src} → ${dst}`);
    }
  } catch (e) {
    _log('WARN', `Could not migrate ${label}: ${e.message}`);
  }
}

// ─── Internal logger ─────────────────────────────────────────────────────────

function _log(level, msg) {
  const ts   = new Date().toISOString();
  const line = `[RUNTIME-PATHS][${level}] ${ts} ${msg}`;
  if (level === 'ERROR') console.error(line);
  else                   console.log(line);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  /** Complete map of every runtime path used by the application. */
  paths,

  /** Alias for paths.root — the AppData\Roaming\Project Guardian directory. */
  dataRoot: DATA_ROOT,

  /** True when running as a packaged Electron app (not in development). */
  isPortable: IS_PACKAGED,

  /** Create all required runtime sub-directories (idempotent). */
  ensureDirectories,

  /** True if this is the first time the application has been launched. */
  isFirstLaunch,

  /** Migrate data files from legacy path locations to the new AppData layout. */
  migrateFromLegacy,

  /** Raw resolver — exposed for unit tests and diagnostics only. */
  resolveDataRoot,
  isPackagedApp,

  /** Application name constant used to build all paths. */
  APP_NAME,
};
