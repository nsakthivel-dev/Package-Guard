/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Package Guard — Structured Logger
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Writes JSON-lines to rotating log files in the runtime log directory.
 * No third-party dependencies — only Node built-ins.
 *
 * Log files:
 *   logs/startup.log  — application lifecycle (install, launch, quit, update)
 *   logs/error.log    — all ERROR and FATAL entries (across all categories)
 *   logs/ipc.log      — IPC handler activity
 *   logs/cli.log      — CLI bridge server activity
 *
 * Rotation: each file is capped at MAX_FILE_BYTES.  When the cap is exceeded
 * the file is renamed to <name>.1.log and a fresh file is started.  Only one
 * backup generation is kept (simple, no external library needed).
 *
 * Usage:
 *   const log = require('./logger');
 *   log.info ('startup', 'Application started', { version: '1.0.0' });
 *   log.warn ('runtime', 'Cache miss', { key: 'npm:react' });
 *   log.error('database', 'Write failed', { path: '/...', err: 'EACCES' });
 *
 * Named channels map to files:
 *   startup | install | update | uninstall | firstlaunch  → startup.log
 *   ipc                                                   → ipc.log
 *   cli | server                                          → cli.log
 *   everything else + every ERROR/FATAL                   → error.log (mirror)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 5 * 1024 * 1024;   // 5 MB per log file before rotation

const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40, FATAL: 50 };

// ─── State ────────────────────────────────────────────────────────────────────

/** @type {string|null} Resolved log directory — set by _init() */
let _logDir    = null;
let _initDone  = false;
let _initError = null;

// File-descriptor cache — one entry per logical log file name
const _fds = {};

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Lazily resolves and creates the log directory the first time a log entry is
 * written.  Uses runtimePaths when available; falls back to a temp directory so
 * logging never throws even in early startup or test contexts.
 */
function _init() {
  if (_initDone) return;
  _initDone = true;

  try {
    const rp = require('./runtimePaths');
    _logDir = rp.paths.logs;
    if (!fs.existsSync(_logDir)) {
      fs.mkdirSync(_logDir, { recursive: true });
    }
  } catch (e) {
    // runtimePaths not yet resolvable (very early startup) — fall back to temp
    _logDir    = require('os').tmpdir();
    _initError = e.message;
  }
}

// ─── Channel → file mapping ───────────────────────────────────────────────────

const STARTUP_CHANNELS = new Set([
  'startup', 'install', 'update', 'uninstall', 'firstlaunch', 'migration', 'init',
]);

const IPC_CHANNELS = new Set(['ipc']);
const CLI_CHANNELS = new Set(['cli', 'server']);

/**
 * Returns the base filename (without directory) for a given channel/level.
 * Errors are always mirrored to error.log as well.
 */
function _fileFor(channel, level) {
  const ch = (channel || 'app').toLowerCase();
  if (STARTUP_CHANNELS.has(ch)) return 'startup.log';
  if (IPC_CHANNELS.has(ch))     return 'ipc.log';
  if (CLI_CHANNELS.has(ch))     return 'cli.log';
  if (level >= LEVELS.ERROR)    return 'error.log';
  return 'startup.log';  // default bucket for unlisted channels
}

// ─── Rotation ─────────────────────────────────────────────────────────────────

function _rotate(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < MAX_FILE_BYTES) return;
    const backup = filePath.replace(/\.log$/, '.1.log');
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    fs.renameSync(filePath, backup);
    // Close and remove the cached fd so a fresh file is opened
    const key = path.basename(filePath);
    if (_fds[key]) {
      try { fs.closeSync(_fds[key]); } catch (_) { /* ignore */ }
      delete _fds[key];
    }
  } catch (_) { /* rotation errors are non-fatal */ }
}

// ─── Core write ───────────────────────────────────────────────────────────────

function _write(level, channel, message, extra) {
  _init();

  const entry = {
    ts:      new Date().toISOString(),
    level:   _levelName(level),
    channel: (channel || 'app').toLowerCase(),
    msg:     String(message),
  };
  if (extra !== undefined && extra !== null) {
    entry.data = _safeStringify(extra);
  }

  const line = JSON.stringify(entry) + '\n';

  // Determine target file(s)
  const primaryFile = _fileFor(channel, level);
  const files = [primaryFile];

  // Mirror all errors to error.log as well (unless error.log already IS the target)
  if (level >= LEVELS.ERROR && primaryFile !== 'error.log') {
    files.push('error.log');
  }

  for (const filename of files) {
    _appendLine(filename, line);
  }

  // Always echo to console for dev visibility
  _consoleEcho(level, entry.channel, message, extra);
}

function _appendLine(filename, line) {
  if (!_logDir) return;
  const filePath = path.join(_logDir, filename);

  try {
    // Rotate before writing if needed
    if (fs.existsSync(filePath)) _rotate(filePath);

    fs.appendFileSync(filePath, line, { encoding: 'utf8' });
  } catch (_) { /* never throw from logger */ }
}

// ─── Console echo ─────────────────────────────────────────────────────────────

function _consoleEcho(level, channel, message, extra) {
  const prefix = `[${channel.toUpperCase()}]`;
  const extraStr = extra ? ' ' + _safeStringify(extra) : '';
  const full = `${prefix} ${message}${extraStr}`;
  if      (level >= LEVELS.FATAL) console.error('[FATAL]', full);
  else if (level >= LEVELS.ERROR) console.error('[ERROR]', full);
  else if (level >= LEVELS.WARN)  console.warn ('[WARN] ', full);
  else if (level >= LEVELS.INFO)  console.log  ('[INFO] ', full);
  else                            console.debug('[DEBUG]', full);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _levelName(n) {
  for (const [name, val] of Object.entries(LEVELS)) {
    if (val === n) return name;
  }
  return 'INFO';
}

function _safeStringify(v) {
  try {
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  } catch (_) {
    return String(v);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const logger = {
  /**
   * @param {string}  channel   Logical category (startup | ipc | cli | runtime | …)
   * @param {string}  message   Human-readable description
   * @param {*}       [extra]   Any additional serialisable context
   */
  debug: (channel, message, extra) => _write(LEVELS.DEBUG, channel, message, extra),
  info:  (channel, message, extra) => _write(LEVELS.INFO,  channel, message, extra),
  warn:  (channel, message, extra) => _write(LEVELS.WARN,  channel, message, extra),
  error: (channel, message, extra) => _write(LEVELS.ERROR, channel, message, extra),
  fatal: (channel, message, extra) => _write(LEVELS.FATAL, channel, message, extra),

  /**
   * Convenience: log with an explicit level string ('info', 'warn', …).
   */
  log: (level, channel, message, extra) => {
    const lvl = LEVELS[(level || 'info').toUpperCase()] ?? LEVELS.INFO;
    _write(lvl, channel, message, extra);
  },

  /**
   * Returns the resolved log directory path (after init).
   * Returns null if called before the first log write.
   */
  get logDir() { return _logDir; },

  // ── Structured event helpers ─────────────────────────────────────────────

  /** Log application installation event (fired from NSIS / first run). */
  logInstall: (version, installDir) =>
    _write(LEVELS.INFO, 'install', 'Application installed', { version, installDir }),

  /** Log first-launch directory / database initialisation. */
  logFirstLaunch: (dataRoot, directoriesCreated) =>
    _write(LEVELS.INFO, 'firstlaunch', 'First launch — runtime directories initialised', {
      dataRoot,
      directoriesCreated,
    }),

  /** Log normal application startup. */
  logStartup: (version, dataRoot, isFirstLaunch) =>
    _write(LEVELS.INFO, 'startup', 'Application started', { version, dataRoot, isFirstLaunch }),

  /** Log application quit. */
  logShutdown: (reason) =>
    _write(LEVELS.INFO, 'startup', 'Application quit', { reason }),

  /** Log database initialisation. */
  logDbInit: (dbPath, fresh) =>
    _write(LEVELS.INFO, 'init', 'Database initialised', { dbPath, fresh }),

  /** Log configuration initialisation. */
  logConfigInit: (configPath, fresh) =>
    _write(LEVELS.INFO, 'init', 'Configuration initialised', { configPath, fresh }),

  /** Log runtime path creation. */
  logPathsCreated: (created, failed) =>
    _write(LEVELS.INFO, 'init', 'Runtime paths bootstrapped', {
      created: created.length,
      failed:  failed.length,
      createdList: created,
      failedList:  failed,
    }),

  /** Log an available or completed update. */
  logUpdate: (fromVersion, toVersion, status) =>
    _write(LEVELS.INFO, 'update', 'Application update', { fromVersion, toVersion, status }),

  /** Log uninstall start (called from the NSIS custom action helper). */
  logUninstall: (mode, dataRoot) =>
    _write(LEVELS.INFO, 'uninstall', 'Uninstall initiated', { mode, dataRoot }),

  /** Log cleanup of user data during full uninstall. */
  logUninstallCleanup: (path, success, error) =>
    _write(
      success ? LEVELS.INFO : LEVELS.WARN,
      'uninstall',
      success ? 'User data removed' : 'User data removal failed',
      { path, error }
    ),

  /** Log migration from legacy data location. */
  logMigration: (src, dst, success, error) =>
    _write(
      success ? LEVELS.INFO : LEVELS.WARN,
      'migration',
      success ? 'Data migrated' : 'Data migration failed',
      { src, dst, error }
    ),
};

module.exports = logger;
