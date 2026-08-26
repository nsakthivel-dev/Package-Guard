/**
 * ipcBridge.js — Layer 2: Named-pipe / Unix-socket notification server
 *
 * This module is the Electron-side half of the hybrid CLI↔GUI sync mechanism.
 *
 * WHAT IT DOES
 * ─────────────
 * Creates a net.Server bound to a fixed, predictable path:
 *   Windows  →  \\.\pipe\package-guard-notify  (named pipe)
 *   macOS/Linux → {dataRoot}/notify.sock       (Unix domain socket)
 *
 * When the CLI finishes a DB write it connects to this socket and sends a
 * one-line JSON message:  { "type": "data-changed", "source": "cli" }
 * The server receives it, re-reads db.json through core, and pushes the
 * refreshed data to the renderer via webContents.send('core:data-changed').
 *
 * LAYER RELATIONSHIP
 * ──────────────────
 * Layer 1 (startup): main.js calls loadCoreDb() before createWindow() so the
 *   GUI always boots with the latest persisted state — no socket needed.
 *
 * Layer 2 (live): this bridge fires while the GUI is open. Missed events are
 *   caught by the chokidar db.json file-watcher in main.js.
 *
 * FAILURE CONTRACT
 * ────────────────
 * • If the CLI can't connect (GUI not running) → ECONNREFUSED/ENOENT caught
 *   silently in notify-gui.ts. CLI always succeeds independently.
 * • If the socket path is already in use on startup → we remove the stale
 *   socket file and retry once (Unix only; Windows pipes self-clean).
 */

'use strict';

const net  = require('net');
const fs   = require('fs');
const path = require('path');

// Resolve socket path the same way the CLI does — via the shared core helper.
// Falls back to a hard-coded default if core isn't loaded yet.
function resolveSocketPath(rpPaths) {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\package-guard-notify';
  }
  // On Unix prefer the data-root socket; fall back to ~/.package-guard
  if (rpPaths && rpPaths.root) {
    return path.join(rpPaths.root, 'notify.sock');
  }
  const os = require('os');
  return path.join(os.homedir(), '.package-guard', 'notify.sock');
}

// ─── State ────────────────────────────────────────────────────────────────────

let _server       = null;
let _socketPath   = null;
let _winGetter    = null;   // () => BrowserWindow | null
let _getCore      = null;   // () => coreModule | null
let _log          = null;   // structured logger (optional)
let _rpPaths      = null;   // runtimePaths.paths

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(level, msg, extra) {
  if (_log && typeof _log[level] === 'function') {
    _log[level]('ipcBridge', msg, extra);
    return;
  }
  const ts  = new Date().toISOString();
  const tag = `[IPC-BRIDGE][${level.toUpperCase()}] ${ts}`;
  const out = extra ? `${tag} ${msg} ${JSON.stringify(extra)}` : `${tag} ${msg}`;
  if (level === 'error') console.error(out); else console.log(out);
}

/** Remove stale Unix socket file left by a previous crash */
function cleanStaleSocket(sockPath) {
  if (process.platform === 'win32') return; // pipes self-clean on Windows
  try {
    if (fs.existsSync(sockPath)) {
      fs.unlinkSync(sockPath);
      log('info', `Removed stale socket: ${sockPath}`);
    }
  } catch (e) {
    log('warn', `Could not remove stale socket ${sockPath}: ${e.message}`);
  }
}

/**
 * Read db.json fresh through core and push the result to the renderer.
 * This is the function that makes the GUI update immediately.
 */
async function pushDbRefresh(source) {
  const win = _winGetter && _winGetter();
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;

  try {
    const core = _getCore && _getCore();
    let projects = [];
    if (core) {
      // Force a fresh read — reload from disk, bypassing any in-memory cache.
      // The core database module exposes load() (async) which re-reads db.json.
      if (typeof core.load === 'function') {
        await core.load();
      }
      if (typeof core.listProjectsCLI === 'function') {
        projects = await core.listProjectsCLI();
      } else if (typeof core.listProjects === 'function') {
        projects = core.listProjects();
      }
    }

    // Push to renderer — App.tsx / preload listens on 'core:data-changed'
    win.webContents.send('core:data-changed', { source, projects });
    // Also send the generic projects:updated event so existing listeners fire
    win.webContents.send('projects:updated', { source });
    log('info', `Pushed data-changed to renderer`, { source, projectCount: projects.length });
  } catch (e) {
    log('error', `Failed to push db refresh to renderer: ${e.message}`);
  }
}

// ─── Connection handler ───────────────────────────────────────────────────────

function handleConnection(socket) {
  let buf = '';

  socket.setTimeout(3000);
  socket.on('timeout', () => socket.destroy());
  socket.on('error', () => socket.destroy());

  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    // Messages are newline-terminated; handle multiple in one burst
    const lines = buf.split('\n');
    buf = lines.pop(); // keep incomplete tail
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg && msg.type === 'data-changed') {
          log('info', `Received data-changed notification`, { source: msg.source || 'cli' });
          pushDbRefresh(msg.source || 'cli').catch(() => {});
        }
      } catch {
        log('warn', `Received malformed message: ${trimmed.slice(0, 80)}`);
      }
    }
    // Close the connection immediately — this is fire-and-forget from the CLI
    socket.end();
  });

  socket.on('end', () => socket.destroy());
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the notification bridge server.
 *
 * @param {object} opts
 * @param {() => BrowserWindow | null} opts.getWindow
 * @param {() => any}                  opts.getCore
 * @param {object}                     opts.rpPaths   runtimePaths.paths
 * @param {object}                     [opts.logger]  structured logger (optional)
 */
async function start({ getWindow, getCore, rpPaths, logger } = {}) {
  _winGetter  = getWindow || (() => null);
  _getCore    = getCore   || (() => null);
  _rpPaths    = rpPaths   || null;
  _log        = logger    || null;

  _socketPath = resolveSocketPath(rpPaths);

  // On Unix: remove stale socket before binding
  if (process.platform !== 'win32') {
    cleanStaleSocket(_socketPath);
  }

  return new Promise((resolve, reject) => {
    const server = net.createServer(handleConnection);

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && process.platform !== 'win32') {
        // Stale socket from a crash — remove and retry once
        log('warn', `Socket path in use — removing and retrying: ${_socketPath}`);
        cleanStaleSocket(_socketPath);
        server.close();
        // Retry after a brief delay
        setTimeout(() => {
          start({ getWindow, getCore, rpPaths, logger }).then(resolve).catch(reject);
        }, 200);
      } else {
        log('error', `Bridge server error: ${err.message}`, { code: err.code });
        // Non-fatal: bridge is optional, CLI writes always succeed without it
        resolve(null);
      }
    });

    server.listen(_socketPath, () => {
      // Restrict access to owner on Unix
      if (process.platform !== 'win32') {
        try { fs.chmodSync(_socketPath, 0o600); } catch { /* ignore */ }
      }
      _server = server;
      log('info', `IPC bridge listening`, { path: _socketPath, platform: process.platform });
      resolve(server);
    });
  });
}

/**
 * Stop the bridge and clean up the socket file.
 * Called from main.js before-quit / will-quit handlers.
 */
function stop() {
  if (_server) {
    try {
      _server.close();
      _server = null;
      log('info', 'IPC bridge stopped');
    } catch { /* ignore */ }
  }
  if (process.platform !== 'win32' && _socketPath) {
    cleanStaleSocket(_socketPath);
  }
  _socketPath = null;
}

/**
 * Manually trigger a db refresh push (e.g. from the chokidar file-watcher
 * fallback in main.js).
 */
async function triggerRefresh(source) {
  return pushDbRefresh(source || 'file-watcher');
}

module.exports = { start, stop, triggerRefresh };
