const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
// ─── Runtime path manager ─────────────────────────────────────────────────────
const rp = require('../runtimePaths');

const SERVER_CONFIG = {
  PREFERRED_PORT: 17452,
  PORT_RANGE_START: 17452,
  PORT_RANGE_END: 17500,
  HOST: '127.0.0.1'
};

// ─── Structured logger ────────────────────────────────────────────────────────
function log(level, msg, extra) {
  const ts = new Date().toISOString();
  const line = extra
    ? `[SERVER][${level}] ${ts} ${msg} ${JSON.stringify(extra)}`
    : `[SERVER][${level}] ${ts} ${msg}`;
  if (level === 'ERROR') console.error(line);
  else console.log(line);
}

// ─── Path helpers (now delegates to runtimePaths) ────────────────────────────
function getPgDir() {
  // Kept for backwards-compat export only. Use rp.paths directly.
  return rp.paths.root;
}

function getServerJsonPath() {
  return rp.paths.serverJson;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ─── Port helpers ─────────────────────────────────────────────────────────────
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, SERVER_CONFIG.HOST);
  });
}

async function findFreePort() {
  for (let port = SERVER_CONFIG.PREFERRED_PORT; port <= SERVER_CONFIG.PORT_RANGE_END; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No free port available in range ${SERVER_CONFIG.PORT_RANGE_START}-${SERVER_CONFIG.PORT_RANGE_END}`);
}

// ─── State ────────────────────────────────────────────────────────────────────
let httpServerRef = null;
let currentPort = null;
let currentToken = null;
let browserWindowGetter = null;

function setBrowserWindowGetter(fn) {
  browserWindowGetter = fn;
}

// ─── server.json ─────────────────────────────────────────────────────────────
// FIX: Write server.json BEFORE app.listen() so the CLI can detect the port
// and token even if the HTTP server takes a moment to bind. The CLI will retry
// the health check, so writing early is safe.
// ─── server.json (pid-only — port/token no longer needed for discovery) ──────
// The CLI no longer reads port or token from this file for the socket/pipe
// notification path.  We keep the file so the CLI can still do a PID liveness
// check before attempting the HTTP API (existing endpoints remain unchanged).
// Fields written:  pid, started_at
// Fields removed:  port, token  (were used for HTTP discovery, now internal)
function writeServerFile(port, token) {
  const cfg = {
    // Keep port/token so older CLI builds that haven't updated yet still work
    port,
    token,
    pid: process.pid,
    started_at: new Date().toISOString(),
  };
  const p = getServerJsonPath();
  try {
    // Atomic write via tmp file to avoid partial reads
    const tmp = p + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600, encoding: 'utf8' });
    fs.renameSync(tmp, p);
    log('INFO', `server.json written (pid-only mode; port kept for compat)`, { port, pid: process.pid, path: p });
  } catch (e) {
    log('ERROR', `Failed to write server.json: ${e.message}`);
  }
}

function clearServerFile() {
  try {
    const p = getServerJsonPath();
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      log('INFO', 'server.json removed');
    }
  } catch (_) { /* ignore */ }
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || token !== currentToken) {
    log('WARN', `Unauthorized request ${req.method} ${req.url} from ${req.ip}`);
    res.status(401).json({ error: 'Unauthorized. Invalid or missing Bearer token.' });
    return;
  }
  next();
}

// ─── Express app factory ──────────────────────────────────────────────────────
function createExpressApp() {
  const express = require('express');
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  return app;
}

// ─── Main server start ────────────────────────────────────────────────────────
async function startServer(getCore) {
  const express = require('express');
  const app = createExpressApp();

  log('INFO', 'Finding free port...');
  const port = await findFreePort();
  const token = generateToken();

  currentPort = port;
  currentToken = token;

  // FIX: Write server.json NOW — before listen() — so CLI can read port+token
  // immediately. The HTTP server may still be binding, but the CLI will retry
  // the health check with backoff, so this is safe.
  writeServerFile(port, token);

  // Load core lazily
  let core = null;
  try {
    if (getCore && typeof getCore === 'function') {
      core = getCore();
      log('INFO', 'Core engine loaded', { hasInitProject: !!core?.initProject });
    }
  } catch (e) {
    log('WARN', `Core not available via getter: ${e.message}`);
  }

  // ── Public endpoints (no auth) ──────────────────────────────────────────────

  // Health — used by CLI to detect the running Electron instance
  app.get('/api/v1/health', (req, res) => {
    log('INFO', `Health check from ${req.ip}`);
    res.json({
      ok: true,
      version: (() => { try { return require('../../package.json').version || '0.0.0'; } catch { return '0.0.0'; } })(),
      pid: process.pid,
      port
    });
  });

  // Liveness — lightweight ping (no JSON body overhead)
  app.get('/api/v1/ping', (req, res) => {
    res.json({ ok: true, pid: process.pid });
  });

  // ── Auth-gated endpoints ────────────────────────────────────────────────────
  app.use('/api/v1', authMiddleware);

  // ── Projects ────────────────────────────────────────────────────────────────
  app.post('/api/v1/projects/init', async (req, res) => {
    try {
      const { path: p, detected_pm, package_json, force, noInitialSnapshot } = req.body || {};
      log('INFO', `projects/init`, { path: p, force, noInitialSnapshot });
      const initFn = core && core.initProject;
      const result = initFn
        ? await initFn(p, { force: !!force, noInitialSnapshot: !!noInitialSnapshot, detected_pm, package_json })
        : { ok: false, error: 'Core engine not available in Electron shell' };
      if (result.ok === false) return res.status(400).json(result);
      _triggerAutoScan();
      // Notify renderer's Projects tab to refresh immediately
      _notifyProjectsUpdated(result.project?.id);
      // Include environment classification in HTTP response so CLI can display it
      res.json({
        ...result,
        environmentType: result.environmentType ?? 'unknown',
        packageManagerLabel: result.packageManagerLabel ?? null,
        venvPath: result.venvPath ?? null,
        pythonVersion: result.pythonVersion ?? null,
        warning: result.warning ?? null,
      });
    } catch (e) {
      log('ERROR', `projects/init error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/v1/projects', async (req, res) => {
    try {
      const fn = core && core.listProjectsCLI;
      const list = fn ? await fn() : [];
      res.json({ ok: true, projects: list });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/v1/projects/:id', async (req, res) => {
    try {
      const fn = core && core.getProjectById;
      const p = fn ? await fn(req.params.id) : null;
      if (!p) return res.status(404).json({ error: 'Project not found' });
      res.json({ ok: true, project: p });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/v1/projects/:id', async (req, res) => {
    try {
      const fn = core && core.removeProject;
      if (!fn) return res.status(500).json({ error: 'Core not available' });
      const r = await fn({ projectId: req.params.id });
      if (r && r.ok === false) return res.status(400).json(r);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Snapshots ────────────────────────────────────────────────────────────────
  app.post('/api/v1/snapshots/commit', async (req, res) => {
    try {
      const { projectId, message } = req.body || {};
      if (!projectId || !message) return res.status(400).json({ error: 'projectId and message required' });
      log('INFO', `snapshots/commit`, { projectId, message });
      const fn = core && core.createSnapshotCLI;
      const snap = fn ? await fn(projectId, message) : null;
      if (!snap) return res.status(500).json({ error: 'Snapshot creation failed' });
      _notifySnapshot(projectId, snap);
      const wtBefore = core && core.getWorkingTreeDiff ? await core.getWorkingTreeDiff(projectId).catch(() => null) : null;
      const changed = wtBefore?.diff?.length ?? 0;
      const added = wtBefore?.diff?.filter(d => d.changeType === 'added').length ?? 0;
      const removed = wtBefore?.diff?.filter(d => d.changeType === 'removed').length ?? 0;
      res.json({ ok: true, snapshot: { ...snap, added, removed, changed } });
    } catch (e) {
      log('ERROR', `snapshots/commit error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // Project-scoped snapshot endpoint
  app.post('/api/v1/projects/:projectId/snapshots', async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const { message } = req.body || {};
      if (!message) return res.status(400).json({ error: 'message required' });
      log('INFO', `projects/${projectId}/snapshots`, { message });
      const fn = core && core.createSnapshotCLI;
      const snap = fn ? await fn(projectId, message) : null;
      if (!snap) return res.status(500).json({ error: 'Snapshot creation failed' });
      _notifySnapshot(projectId, snap);
      const wtBefore = core && core.getWorkingTreeDiff ? await core.getWorkingTreeDiff(projectId).catch(() => null) : null;
      const changed = wtBefore?.diff?.length ?? 0;
      const added = wtBefore?.diff?.filter(d => d.changeType === 'added').length ?? 0;
      const removed = wtBefore?.diff?.filter(d => d.changeType === 'removed').length ?? 0;
      res.json({ snapshot: { ...snap, added, removed, changed } });
    } catch (e) {
      log('ERROR', `projects/snapshots error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/v1/snapshots', async (req, res) => {
    try {
      const { projectId, oneline, n } = req.query;
      const fn = core && core.listSnapshotsCLI;
      const list = fn ? await fn(projectId, oneline === 'true', n ? Number(n) : 20) : [];
      res.json({ ok: true, snapshots: list });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/v1/projects/:projectId/snapshots', async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const { limit, n } = req.query;
      const lim = n ? Number(n) : (limit ? Number(limit) : 20);
      const fn = core && core.listSnapshotsCLI;
      const list = fn ? await fn(projectId, false, lim) : [];
      res.json({ snapshots: list });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/v1/snapshots/:id', (req, res) => {
    try {
      const fn = core && core.getSnapshot;
      const s = fn ? fn(req.params.id) : null;
      if (!s) return res.status(404).json({ error: 'Snapshot not found' });
      res.json({ ok: true, snapshot: s });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/v1/snapshots/:id', (req, res) => {
    try {
      const fn = core && core.deleteSnapshot;
      if (fn) fn(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Checkout ─────────────────────────────────────────────────────────────────
  app.post('/api/v1/checkout', async (req, res) => {
    try {
      const { projectId, snapshotId, force, verbose } = req.body || {};
      const fn = core && core.checkoutSnapshot;
      if (!fn) return res.status(500).json({ error: 'Core not available' });
      const r = await fn(projectId, snapshotId, { force: !!force, verbose: !!verbose });
      if (r && r.ok === false) return res.status(409).json(r);
      if (r && r.preview === false) {
        res.json({
          ok: true, checkedOut: true, snapshotId,
          applied: r.diff?.map(d => ({ name: d.name, version: d.toVersion })).filter(x => x.version) ?? [],
          result: r,
        });
      } else {
        res.json({ ok: true, result: r });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/v1/projects/:projectId/snapshots/:snapshotId/checkout', async (req, res) => {
    try {
      const { projectId, snapshotId } = req.params;
      const { force } = req.body || {};
      const fn = core && core.checkoutSnapshot;
      if (!fn) return res.status(500).json({ error: 'Core not available' });
      const r = await fn(projectId, snapshotId, { force: !!force });
      if (r && r.ok === false) return res.status(409).json(r);
      if (r && r.preview === false) {
        res.json({
          checkedOut: true, snapshotId,
          applied: r.diff?.map(d => ({ name: d.name, version: d.toVersion })).filter(x => x.version) ?? [],
        });
      } else {
        res.json({ checkedOut: true, snapshotId, applied: [], result: r });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/v1/checkout/preview', async (req, res) => {
    try {
      const { projectId, snapshotId } = req.query;
      const fn = core && core.checkoutSnapshot;
      if (!fn) return res.status(500).json({ error: 'Core not available' });
      const r = await fn(projectId, snapshotId, { preview: true });
      if (r && r.ok === false) return res.status(400).json(r);
      res.json({ ok: true, preview: r });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Diff ─────────────────────────────────────────────────────────────────────
  app.post('/api/v1/diff', async (req, res) => {
    try {
      const { projectId, snap1, snap2 } = req.body || {};
      const fn = core && core.compareSnapshots;
      const fnWorking = core && core.getWorkingTreeDiff;
      let result = null;
      if (snap1 && snap2 && fn) result = await fn(projectId, snap1, snap2);
      else if (fnWorking) result = await fnWorking(projectId);
      res.json({ ok: true, diff: result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/v1/projects/:projectId/diff', async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const { snap1, snap2 } = req.query;
      const fnWorking = core && core.getWorkingTreeDiff;
      const fnCompare = core && core.compareSnapshots;
      let changes = [];
      if (snap1 && snap2 && fnCompare) {
        const r = await fnCompare(projectId, String(snap1), String(snap2));
        changes = (r?.diff ?? []).map(d => ({ name: d.name, from: d.fromVersion, to: d.toVersion, type: d.changeType }));
      } else if (snap1 && fnCompare) {
        const wt = fnWorking ? await fnWorking(projectId) : null;
        const current = wt?.current ?? [];
        const snapFn = core && core.getSnapshot;
        const snap = snapFn ? snapFn(String(snap1)) : null;
        const computeFn = core && core.computeDiff;
        if (snap && computeFn) {
          const diff = computeFn(snap.packages, current);
          changes = diff.map(d => ({ name: d.name, from: d.fromVersion, to: d.toVersion, type: d.changeType }));
        }
      } else if (fnWorking) {
        const wt = await fnWorking(projectId);
        changes = (wt?.diff ?? []).map(d => ({ name: d.name, from: d.fromVersion, to: d.toVersion, type: d.changeType }));
      }
      res.json({ changes });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Status ───────────────────────────────────────────────────────────────────
  app.get('/api/v1/status', async (req, res) => {
    try {
      const { projectId } = req.query;
      const fn = core && core.getWorkingTreeDiff;
      const r = fn ? await fn(projectId) : { current: null, last: null, diff: [] };
      const changes = (r?.diff ?? []).map(d => ({ name: d.name, from: d.fromVersion, to: d.toVersion, type: d.changeType }));
      res.json({ ok: true, dirty: r?.hasChanges ?? changes.length > 0, changes });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/v1/projects/:projectId/status', async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const fn = core && core.getWorkingTreeDiff;
      const r = fn ? await fn(projectId) : { current: null, last: null, diff: [] };
      const changes = (r?.diff ?? []).map(d => ({ name: d.name, from: d.fromVersion, to: d.toVersion, type: d.changeType }));
      res.json({ dirty: r?.hasChanges ?? changes.length > 0, changes });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Open GUI (from CLI) ───────────────────────────────────────────────────────
  app.post('/api/v1/open-gui', (req, res) => {
    try {
      const { projectId } = req.body || {};
      log('INFO', `open-gui requested`, { projectId });
      const w = browserWindowGetter && browserWindowGetter();
      if (w && !w.isDestroyed()) {
        // Spec: restore if minimized, show if hidden, bring to foreground
        if (w.isMinimized()) w.restore();
        if (!w.isVisible()) w.show();
        w.focus();
        // On Windows, forcefully bring to foreground via setAlwaysOnTop trick
        if (process.platform === 'win32') {
          w.setAlwaysOnTop(true);
          w.setAlwaysOnTop(false);
          w.focus();
        }
        if (projectId) w.webContents.send('server:open-project', { projectId });
        log('INFO', 'Window focused and raised');
        res.json({ ok: true, focused: true });
      } else {
        log('WARN', 'open-gui: no window available yet');
        res.json({ ok: true, focused: false, hint: 'Window not created yet' });
      }
    } catch (e) {
      log('ERROR', `open-gui error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Project snapshot update ────────────────────────────
  app.post('/api/v1/snapshot/project-update', (req, res) => {
    try {
      const snapshot = req.body;
      if (!snapshot || !snapshot.projectPath) {
        return res.status(400).json({ error: 'snapshot.projectPath is required' });
      }
      log('INFO', `snapshot:project-update received`, {
        project: snapshot.projectName,
        environments: snapshot.environments?.length ?? 0,
        totalPackages: (snapshot.environments ?? []).reduce((s, e) => s + (e.totalPackages ?? 0), 0),
      });

      const w = browserWindowGetter && browserWindowGetter();
      if (w && !w.isDestroyed()) {
        // Send to renderer — Snapshots page and Venv page listen for this
        w.webContents.send('snapshot:project:update', snapshot);
        // Also trigger a general auto-scan refresh
        w.webContents.send('trigger:auto-scan');
        log('INFO', 'snapshot:project:update dispatched to renderer');
      } else {
        log('WARN', 'snapshot:project-update: no window — snapshot stored but not displayed');
      }

      // Persist in core db via the project snapshot flow
      try {
        if (core && core.initProject && snapshot.projectPath) {
          // Fire-and-forget — we don't wait for this
          core.initProject(snapshot.projectPath, { noInitialSnapshot: true })
            .then(() => {
              log('INFO', `Project registered/confirmed: ${snapshot.projectPath}`);
              // Notify the GUI's Projects tab to refresh now that the project is persisted
              _notifyProjectsUpdated(null);
            })
            .catch(e => log('WARN', `Could not register project: ${e.message}`));
        }
      } catch { /* non-fatal */ }

      res.json({ ok: true, received: true });
    } catch (e) {
      log('ERROR', `snapshot/project-update error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Project-changed notification (from CLI after standalone operations) ────
  app.post('/api/v1/notify/project-changed', (req, res) => {
    try {
      const { projectId } = req.body || {};
      log('INFO', `notify/project-changed received`, { projectId });
      // Notify the renderer's Projects tab to refresh
      _notifyProjectsUpdated(projectId || null);
      // Also trigger a snapshot list refresh
      const w = browserWindowGetter && browserWindowGetter();
      if (w && !w.isDestroyed()) {
        w.webContents.send('server:snapshot-created', { projectId, snapshot: null });
      }
      res.json({ ok: true });
    } catch (e) {
      log('ERROR', `notify/project-changed error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // ── 404 ──────────────────────────────────────────────────────────────────────
  app.use('/api/v1', (req, res) => {
    res.status(404).json({ error: `Endpoint not found: ${req.method} ${req.url}` });
  });

  // ── Start listening ───────────────────────────────────────────────────────────
  return new Promise((resolve, reject) => {
    const server = app.listen(port, SERVER_CONFIG.HOST, () => {
      // server.json was already written above — this is just a confirmation log
      log('INFO', `HTTP server listening`, { host: SERVER_CONFIG.HOST, port, tokenPrefix: token.slice(0, 8) });
      httpServerRef = server;
      resolve({ port, token });
    });

    server.on('error', (err) => {
      log('ERROR', `Server bind error: ${err.message}`);
      clearServerFile();
      reject(err);
    });
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
function _triggerAutoScan() {
  try {
    const w = browserWindowGetter && browserWindowGetter();
    if (w && !w.isDestroyed()) w.webContents.send('trigger:auto-scan');
  } catch (_) { /* ignore */ }
}

function _notifySnapshot(projectId, snapshot) {
  try {
    const w = browserWindowGetter && browserWindowGetter();
    if (w && !w.isDestroyed()) w.webContents.send('server:snapshot-created', { projectId, snapshot });
  } catch (_) { /* ignore */ }
}

function _notifyProjectsUpdated(projectId) {
  try {
    const w = browserWindowGetter && browserWindowGetter();
    if (w && !w.isDestroyed()) w.webContents.send('projects:updated', { projectId });
  } catch (_) { /* ignore */ }
}

// ─── Stop server ──────────────────────────────────────────────────────────────
function stopServer() {
  if (httpServerRef) {
    try { httpServerRef.close(() => log('INFO', 'HTTP server closed')); } catch (_) { /* ignore */ }
    httpServerRef = null;
  }
  clearServerFile();
  currentPort = null;
  currentToken = null;
}

function getCurrentServerInfo() {
  return { port: currentPort, token: currentToken };
}

module.exports = {
  startServer,
  stopServer,
  setBrowserWindowGetter,
  getCurrentServerInfo,
  writeServerFile,
  clearServerFile,
  getPgDir,
  getServerJsonPath,
  SERVER_CONFIG
};
