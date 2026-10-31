/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Package Guardian — Runtime Path Manager (Electron Main Process)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Delegates authoritatively to `@packageguard/shared/paths` to ensure that
 * CLI and Electron ALWAYS access the exact same persistent data directory:
 *
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
 * NO isolating `/dev/` database subfolder — CLI and Electron share identical data.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { assertSafeWritePath } = require('./pathGuard');

// Authoritative shared paths
let sharedPaths;
try {
  sharedPaths = require('@packageguard/shared/paths');
} catch {
  try {
    sharedPaths = require('../../packages/shared/dist/paths/index.js');
  } catch {
    // Fallback if shared not yet built
    sharedPaths = null;
  }
}

const APP_NAME = 'PackageGuardian';

function isPackagedApp() {
  try {
    const { app } = require('electron');
    if (app && typeof app.isPackaged === 'boolean') return app.isPackaged;
  } catch { /* ignore */ }

  if (__filename.includes('app.asar')) return true;

  if (
    process.resourcesPath &&
    !process.resourcesPath.includes('node_modules') &&
    !process.resourcesPath.includes('electron')
  ) {
    return true;
  }

  return false;
}

function resolveDataRoot() {
  if (sharedPaths && typeof sharedPaths.getUserDataDirectory === 'function') {
    return sharedPaths.getUserDataDirectory();
  }

  if (process.env.PACKAGE_GUARDIAN_DATA_ROOT) return process.env.PACKAGE_GUARDIAN_DATA_ROOT;
  if (process.env.PG_DATA_ROOT) return process.env.PG_DATA_ROOT;

  const base = process.platform === 'win32'
    ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : (process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')));

  const root = path.join(base, APP_NAME);
  try { fs.mkdirSync(root, { recursive: true }); } catch { /* ignore */ }
  return root;
}

const DATA_ROOT = resolveDataRoot();
const IS_PACKAGED = isPackagedApp();

const resolvedDbFile = (sharedPaths && typeof sharedPaths.getDatabasePath === 'function')
  ? sharedPaths.getDatabasePath()
  : path.join(DATA_ROOT, 'data', 'package_guardian.db');

const paths = {
  root: DATA_ROOT,
  config: path.join(DATA_ROOT, 'config'),
  data: path.join(DATA_ROOT, 'data'),
  database: path.join(DATA_ROOT, 'data'),
  snapshots: path.join(DATA_ROOT, 'snapshots'),
  logs: path.join(DATA_ROOT, 'logs'),
  cache: path.join(DATA_ROOT, 'cache'),
  temp: path.join(DATA_ROOT, 'temp'),
  venv: path.join(DATA_ROOT, 'venv'),

  // Single source of truth database for both Electron and CLI
  dbFile: resolvedDbFile,
  coreDbFile: resolvedDbFile,
  serverJson: path.join(DATA_ROOT, 'server.json'),

  // Permission state and installation config
  permissionsJson: path.join(DATA_ROOT, 'config', 'permissions.json'),

  // Log files
  startupLog: path.join(DATA_ROOT, 'logs', 'startup.log'),
  errorLog: path.join(DATA_ROOT, 'logs', 'error.log'),
  cliLog: path.join(DATA_ROOT, 'logs', 'cli.log'),
  ipcLog: path.join(DATA_ROOT, 'logs', 'ipc.log'),
};

const REQUIRED_DIRS = [
  paths.config,
  paths.data,
  paths.snapshots,
  paths.logs,
  paths.cache,
  paths.temp,
  paths.venv,
];

function ensureDirectories() {
  const created = [];
  const failed = [];

  for (const dir of REQUIRED_DIRS) {
    try {
      assertSafeWritePath(dir);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        created.push(dir);
      }
    } catch (err) {
      failed.push({ dir, error: err.message || String(err) });
    }
  }

  return { created, failed };
}

function isFirstLaunch() {
  const sentinel = path.join(paths.config, '.first_launch_done');
  if (!fs.existsSync(sentinel)) {
    try {
      fs.mkdirSync(paths.config, { recursive: true });
      fs.writeFileSync(sentinel, new Date().toISOString(), 'utf8');
    } catch { /* ignore */ }
    return true;
  }
  return false;
}

function migrateFromLegacy() {
  if (sharedPaths && typeof sharedPaths.ensureUserDataDirs === 'function') {
    sharedPaths.ensureUserDataDirs();
  }
  return { migrated: [] };
}

function validateStartupPaths() {
  const issues = [];
  try {
    assertSafeWritePath(DATA_ROOT);
  } catch (err) {
    issues.push(`DATA_ROOT not writable: ${err.message}`);
  }

  return { valid: issues.length === 0, issues };
}

module.exports = {
  paths,
  dataRoot: DATA_ROOT,
  isPortable: IS_PACKAGED,
  ensureDirectories,
  isFirstLaunch,
  migrateFromLegacy,
  validateStartupPaths,
  resolveDataRoot,
  isPackagedApp,
  APP_NAME,
};
