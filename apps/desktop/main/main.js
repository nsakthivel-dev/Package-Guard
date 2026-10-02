const { app, BrowserWindow, ipcMain, Menu, dialog, Tray, nativeImage, Notification, shell } = require('electron');

// ── Windows: set AppUserModelId BEFORE app.requestSingleInstanceLock() ────────
// This must be the very first Electron call so that the taskbar, toast
// notifications, and jump lists all identify the app correctly.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.lupusventure.packageguard');
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  const path = require('path');
  const fs = require('fs');

  // ── Runtime path manager — must be required BEFORE any handler ────────────
  // Establishes AppData\Roaming\Package Guard as the data root and ensures
  // every sub-directory exists before any handler tries to read/write files.
  const rp = require('./runtimePaths');
  const { ensureDirectories, migrateFromLegacy, isFirstLaunch, validateStartupPaths } = rp;

  // ── Structured logger — require after runtimePaths so log dir is known ────
  const log = require('./logger');

  // ── Bootstrap: create runtime directory tree ──────────────────────────────
  const firstLaunch = isFirstLaunch();
  const initResult  = ensureDirectories();
  const startupAudit = validateStartupPaths ? validateStartupPaths() : { valid: true, issues: [] };

  if (firstLaunch) {
    log.logFirstLaunch(rp.dataRoot, initResult.created);
  } else {
    log.logPathsCreated(initResult.created, initResult.failed);
  }

  log.info('startup', `Runtime data root: ${rp.dataRoot}`, {
    isPackaged: rp.isPortable,
    firstLaunch,
    directoriesCreated: initResult.created.length,
    directoryFailures:  initResult.failed.length,
    pathAuditValid:     startupAudit.valid,
    pathAuditIssues:    startupAudit.issues.length,
  });

  // Inject the resolved data root into the core library so that CLI snapshot
  // database (db.json) is stored in the same portable data directory.
  // This must happen BEFORE any handler (dbHandler, server, etc.) is required.
  try {
    const tsx = require.resolve('tsx', { paths: [__dirname, path.resolve(__dirname, '..')] });
    if (tsx) {
      const reg = require('tsx/cjs');
      if (reg && typeof reg.register === 'function') reg.register();
    }
  } catch { /* tsx not available in packaged app — core may already be compiled */ }

  try {
    const corePaths = require('@packageguard/core/paths');
    if (corePaths && typeof corePaths.setDataRoot === 'function') {
      corePaths.setDataRoot(rp.dataRoot);
      log.info('startup', `Core data root injected: ${rp.dataRoot}`);
    }
  } catch {
    // Core not yet available (tsx not registered). Will retry after getCore() loads it.
    // The setDataRoot call in the server's getCore() path handles this case.
  }

  // ── Read application version from package.json ───────────────────────────
  let APP_VERSION = 'unknown';
  try {
    const pkgJson = require('../../../package.json');
    APP_VERSION = pkgJson.version || 'unknown';
  } catch {
    try {
      const pkgJson = require('../../../../package.json');
      APP_VERSION = pkgJson.version || 'unknown';
    } catch { /* ignore */ }
  }

  log.logStartup(APP_VERSION, rp.dataRoot, firstLaunch);

  const { getIndexHtmlPath } = require('./paths');

  // Dev vs Prod detection
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  // Handlers
  const dbHandler = require('./handlers/dbHandler');
  const pipHandler = require('./handlers/pipHandler');
  const npmHandler = require('./handlers/npmHandler');
  const pnpmHandler = require('./handlers/pnpmHandler');
  const yarnHandler = require('./handlers/yarnHandler');
  const envScanner = require('./handlers/envScanner');
  const venvHandler = require('./handlers/venvHandler');
  const cliInstaller = require('./handlers/cliInstaller');
  const projectEnvHandler = require('./handlers/projectEnvironmentHandler');
  const { PipeServer } = require('./pipe-server');
  const { openDatabase } = require('@package-guard/shared/db');
  const {
    insertEvent,
    markSynced,
    getPendingEvents,
    getEventCounts,
    eventExists,
    listRecentEvents
  } = require('@package-guard/shared/repository');

  let tray = null;
   let isQuitting = false;
   let backgroundScanInterval = null;
   let mainWindow;
   let coreCache = null;
   let sqliteDb = null;
   let pipeServer = null;

    function handlePipeRequest(request) {
      console.log('[MAIN] Handling pipe request:', request.id, request.type);
      if (!sqliteDb) return false;
      try {
        if (!eventExists(sqliteDb, request.id)) {
          insertEvent(sqliteDb, request.id, request.type, request.payload, 'LIVE');
        }
        markSynced(sqliteDb, request.id, 'LIVE');
        const projId = request.projectId || request.payload?.projectId;
        if (projId && (request.command === 'scan' || request.payload?.command === 'scan' || request.type === 'CLI_EVENT')) {
          try {
            const { touchProjectScan } = require('@package-guard/shared/repository');
            touchProjectScan(sqliteDb, projId);
          } catch (_) {}
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('core:data-changed', { source: 'pipe', request });
          mainWindow.webContents.send('projects:updated', { source: 'pipe', projectId: projId });
        }
        return true;
      } catch (err) {
        console.error('[MAIN] DB error during pipe request:', err);
        return false;
      }
    }

    function recoverPendingEvents() {
      if (!sqliteDb) return;
      try {
        const pending = getPendingEvents(sqliteDb);
        if (pending.length === 0) {
          console.log('[MAIN] No pending events to recover');
          return;
        }
        console.log(`[MAIN] Recovering ${pending.length} pending event(s)`);
        let recovered = 0;
        for (const event of pending) {
          try {
            markSynced(sqliteDb, event.id, 'SYNCED');
            recovered++;
            console.log(`[MAIN] Recovered event ${event.id}`);
          } catch (err) {
            console.error(`[MAIN] Failed to recover event ${event.id}:`, err);
          }
        }
        console.log(`[MAIN] Recovery complete: ${recovered}/${pending.length} events synced`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('core:data-changed', { source: 'recovery', count: recovered });
          mainWindow.webContents.send('projects:updated', { source: 'recovery' });
        }
      } catch (err) {
        console.error('[MAIN] Error recovering pending events:', err);
      }
    }

   function getCore() {
     if (coreCache) return coreCache;
     // Resolve core relative to this file's directory — never use process.cwd()
     // because that changes depending on where the user launched the exe from.
     const appRoot = path.resolve(__dirname, '..');
     try {
       const corePkgPath = require.resolve('@packageguard/core', {
         paths: [appRoot, __dirname],
       });
       coreCache = require(corePkgPath);
       if (!coreCache.initProject) {
         try {
           const tsx = require('tsx/cjs/api');
           const coreSrc = path.resolve(__dirname, '..', '..', '..', 'packages', 'core', 'src', 'index.ts');
           const parentUrl = 'file://' + __dirname.replace(/\\/g, '/') + '/main.js';
           coreCache = tsx.require(coreSrc, parentUrl).exports;
         } catch (_) { /* ignore */ }
       }
     } catch (_loadErr) {
       try {
         const tsxPath = require.resolve('tsx', { paths: [appRoot, __dirname] });
         if (tsxPath) {
           const reg = require('tsx/cjs');
           if (reg && typeof reg.register === 'function') reg.register();
           const coreSrc = path.resolve(__dirname, '..', '..', '..', 'packages', 'core', 'src', 'index.ts');
           coreCache = require(coreSrc);
         }
       } catch (_tsxErr) { /* ignore */ }
     }
     // Inject portable data root into core after it loads (handles tsx-deferred case)
     if (coreCache && typeof coreCache.setDataRoot === 'function') {
       coreCache.setDataRoot(rp.dataRoot);
     }
     return coreCache;
   }

   // CLI deep link handling removed - CLI has been removed from the project

   app.on('second-instance', (_event, argv) => {
     // Someone tried to run a second instance — focus existing window instead.
     console.log('[MAIN] Second instance blocked, focusing existing window');
     if (mainWindow && !mainWindow.isDestroyed()) {
       if (mainWindow.isMinimized()) mainWindow.restore();
       if (!mainWindow.isVisible()) mainWindow.show();
       mainWindow.focus();
     } else {
       createWindow();
     }
     if (Array.isArray(argv)) {
       // CLI-related deep link handling removed - CLI has been removed from the project
     }
   });

function createTray() {
  if (tray) return;
  // Simple blue shield icon (base64)
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5gMWEiE3C8v3AAAAXUlEQVQ4y2NgGAWjYBSMAtIAHxsDA8N/Bv6vDAwMf6A0K2EA2MCE/w0MDAz/oTTI6f8MDAz/IeIgA6B+gBr9H8YmXgOwGfSfgYEBpgaXAUz/Gf4j0yD7YBSAAtIAAI6EE6S7uX0mAAAAAElFTkSuQmCC');
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Package Guard', click: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      } else {
        createWindow();
      }
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => {
      isQuitting = true;
      app.quit();
    }}
  ]);
  tray.setToolTip('Package Guard');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

async function setupBackgroundScan() {
  if (backgroundScanInterval) clearInterval(backgroundScanInterval);
  
  const settings = dbHandler.getSettings();
  if (settings.backgroundPermission !== true) {
    console.log('[BACKGROUND] Permission not granted, skipping background scan setup.');
    return;
  }

  const hours = settings.cacheDurationHours || 6;
  console.log(`[BACKGROUND] Scheduling background scan every ${hours} hours`);
  
  backgroundScanInterval = setInterval(async () => {
    await performFullScan();
  }, hours * 60 * 60 * 1000);
}

async function performFullScan() {
  console.log('[BACKGROUND] Starting scheduled background scan...');
  const envs = dbHandler.getEnvironments();
  let totalUpdates = 0;

  for (const env of envs) {
    try {
      let packages = [];
      if (env.type === 'pip' || env.type === 'venv' || env.type === 'conda') {
        const list = await pipHandler.listPackages(env.path === 'pip' || env.path === 'python' ? null : env.path);
        packages = list.map(p => {
          const existing = dbHandler.getPackages(env.id).find(ep => ep.name === p.name);
          return {
            name: p.name,
            installedVersion: p.version,
            ecosystem: env.type,
            environmentId: env.id,
            environmentName: env.name,
            environmentPath: env.path,
            latestVersion: existing?.latestVersion || null,
            status: existing?.latestVersion ? getStatus(p.version, existing.latestVersion) : (existing?.status || 'unknown'),
            groupName: existing?.groupName || null
          };
        });
      } else if (env.type === 'npm') {
        const list = await npmHandler.listPackages(env.path === 'npm' ? null : env.path);
        packages = list.map(p => {
          const existing = dbHandler.getPackages(env.id).find(ep => ep.name === p.name);
          return {
            name: p.name,
            installedVersion: p.version,
            ecosystem: 'npm',
            environmentId: env.id,
            environmentName: env.name,
            environmentPath: env.path,
            latestVersion: existing?.latestVersion || null,
            status: existing?.latestVersion ? getStatus(p.version, existing.latestVersion) : (existing?.status || 'unknown'),
            groupName: existing?.groupName || null
          };
        });
      } else if (env.type === 'pnpm') {
        const list = await pnpmHandler.listPackages(env.path === 'pnpm' ? null : env.path);
        packages = list.map(p => {
          const existing = dbHandler.getPackages(env.id).find(ep => ep.name === p.name);
          return {
            name: p.name,
            installedVersion: p.version,
            ecosystem: 'pnpm',
            environmentId: env.id,
            environmentName: env.name,
            environmentPath: env.path,
            latestVersion: existing?.latestVersion || null,
            status: existing?.latestVersion ? getStatus(p.version, existing.latestVersion) : (existing?.status || 'unknown'),
            groupName: existing?.groupName || null
          };
        });
      } else if (env.type === 'yarn') {
        const list = await yarnHandler.listPackages(env.path === 'yarn' ? null : env.path);
        packages = list.map(p => {
          const existing = dbHandler.getPackages(env.id).find(ep => ep.name === p.name);
          return {
            name: p.name,
            installedVersion: p.version,
            ecosystem: 'yarn',
            environmentId: env.id,
            environmentName: env.name,
            environmentPath: env.path,
            latestVersion: existing?.latestVersion || null,
            status: existing?.latestVersion ? getStatus(p.version, existing.latestVersion) : (existing?.status || 'unknown'),
            groupName: existing?.groupName || null
          };
        });
      }

      for (const pkg of packages) {
        dbHandler.upsertPackage(pkg, true);
        if (pkg.status !== 'up-to-date' && pkg.status !== 'unknown') {
          totalUpdates++;
        }
      }
      dbHandler.updateEnvironmentScan(env.id, packages.length);
    } catch (e) {
      console.error(`[BACKGROUND SCAN ERROR] ${env.name}:`, e);
    }
  }

  dbHandler.saveStorage();
  console.log('[BACKGROUND] Scan completed.');

  if (totalUpdates > 0) {
    new Notification({
      title: 'Package Guard',
      body: `Found ${totalUpdates} new updates across your environments.`
    }).show();
  }

  // If window is open, refresh it
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('trigger:auto-scan');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // Don't show immediately to prevent flickering
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    title: 'Package Guard',
    backgroundColor: '#09090b',
    autoHideMenuBar: true
  });

  mainWindow.maximize(); // Set to full screen
  mainWindow.show(); // Show now that it's maximized

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[MAIN] did-fail-load:', errorCode, errorDescription, validatedURL);
  });

  loadMainWindow(mainWindow).catch((err) => {
    log.error('startup', `Failed to load window: ${err?.message || err}`);
    if (!app.isPackaged) {
      dialog.showErrorBox('Package Guard — startup failed', String(err?.message || err));
    }
  });
}

async function loadMainWindow(win) {
  const indexPath = getIndexHtmlPath();
  const hasBuild = fs.existsSync(indexPath);
  const useDevServer = isDev && (process.env.VITE_DEV_SERVER_URL || !hasBuild);

  if (useDevServer) {
    console.log('[MAIN] Loading dev server:', devServerUrl);
    try {
      await win.loadURL(devServerUrl);
      return;
    } catch (err) {
      console.warn('[MAIN] Dev server failed, falling back to file build:', err.message);
      if (!hasBuild) {
        const message =
          'UI build not found. Run: pnpm run build:frontend\n\n' +
          'For development with hot reload, run: pnpm dev';
        console.error('[MAIN]', message);
        if (!app.isPackaged) {
          dialog.showErrorBox('Package Guard — missing build', message);
        }
        return;
      }
    }
  }

  console.log('[MAIN] Loading file:', indexPath);
  await win.loadFile(indexPath);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // Run data migration from legacy locations (only executes when packaged)
  try { migrateFromLegacy(); } catch (e) {
    log.warn('migration', `Data migration warning (non-fatal): ${e.message}`);
  }

  // ── SQLite Database & Recovery ───────────────────────────────────────────
  try {
    sqliteDb = openDatabase();
    log.info('startup', 'SQLite database opened successfully');
  } catch (dbErr) {
    log.error('startup', `Failed to open SQLite database: ${dbErr.message}`);
  }

  // Recover any offline PENDING events -> SYNCED
  recoverPendingEvents();

  // ── Start Windows Named Pipe server (\\.\pipe\PackageGuard) ───────────────
  try {
    pipeServer = new PipeServer({
      onListening: () => log.info('pipe', 'PipeServer listening on \\\\.\\pipe\\PackageGuard'),
      onClientConnected: () => log.info('pipe', 'Client connected to Named Pipe'),
      onRequest: handlePipeRequest,
      onError: (err) => log.error('pipe', `PipeServer error: ${err.message}`)
    });
    pipeServer.start();
    log.info('startup', 'Named Pipe server started');
  } catch (pipeErr) {
    log.error('startup', `Failed to start Named Pipe server: ${pipeErr.message}`);
  }

  // ── Layer 1: Fresh db.json read on startup ────────────────────────────────
  // Ensures the GUI always boots with the latest CLI state, regardless of
  // whether any socket notification was ever sent.  We push the data to the
  // renderer once the window has finished loading its first page.
  async function pushStartupDbState(win) {
    try {
      let projects = await projectEnvHandler.listProjectEnvironments();
      if (!projects || projects.length === 0) {
        const core = getCore();
        if (core) {
          if (typeof core.load === 'function') await core.load();
          if (typeof core.listProjectsCLI === 'function') {
            projects = await core.listProjectsCLI();
          } else if (typeof core.listProjects === 'function') {
            projects = core.listProjects();
          }
        }
      }
      if (!win || win.isDestroyed()) return;
      win.webContents.send('core:data-changed', { source: 'startup', projects });
      win.webContents.send('projects:updated', { source: 'startup' });
      log.info('startup', `Layer-1 startup push: ${projects ? projects.length : 0} project(s) sent to renderer`);
    } catch (e) {
      log.warn('startup', `Layer-1 startup push failed (non-fatal): ${e.message}`);
    }
  }

  createWindow();
  createTray();
  setupBackgroundScan();

  // Wire project environment handler to SQLite db and core engine getter
  if (typeof projectEnvHandler.setDb === 'function') {
    projectEnvHandler.setDb(() => sqliteDb);
  }
  projectEnvHandler.setGetCore(getCore);

  // Push startup state once the renderer has finished loading
  if (mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      pushStartupDbState(mainWindow).catch(() => {});
    });
  }

  // On startup: Always scan for environments to detect all package managers (npm, pnpm, yarn, etc.)
  const existingEnvs = dbHandler.getEnvironments();
  const globalPip = existingEnvs.find(e => e.id === 'global-pip');

  // Always run environment scanner on startup to detect all package managers
  log.info('startup', 'Scanning for global package managers and runtimes...');
  try {
    const freshEnvs = await envScanner.scan();
    for (const env of freshEnvs) {
      dbHandler.insertEnvironment(env);
    }
    log.info('startup', `Environment scan complete — found ${freshEnvs.length} environment(s)`);
  } catch (error) {
    log.error('startup', `Failed to scan environments: ${error.message}`);
  }

  // Auto-scan for venvs on startup if configured in settings and background permission granted
  try {
    const startupSettings = dbHandler.getSettings();
    if (startupSettings.backgroundPermission === true && startupSettings.autoScanVenvsOnStartup && startupSettings.defaultVenvScanDir) {
      log.info('startup', `Auto-scanning venvs on startup in: ${startupSettings.defaultVenvScanDir}`);
      venvHandler.findVenvs(startupSettings.defaultVenvScanDir).then((discoveredVenvs) => {
        for (const v of discoveredVenvs) {
          dbHandler.registerVenv(v);
        }
        log.info('startup', `Auto-scanned venvs on startup — registered ${discoveredVenvs.length} venv(s)`);
      }).catch((e) => {
        log.warn('startup', `Auto-scan for venvs on startup warning: ${e.message}`);
      });
    }
  } catch (venvErr) {
    log.warn('startup', `Auto-scan for venvs on startup error: ${venvErr.message}`);
  }

  // Re-scan every 6 hours while app is open ONLY if background permission is granted
  setInterval(() => {
    const settings = dbHandler.getSettings();
    if (settings.backgroundPermission === true && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('trigger:auto-scan');
    }
  }, 6 * 60 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  log.logShutdown('before-quit');
  if (backgroundScanInterval) {
    clearInterval(backgroundScanInterval);
    backgroundScanInterval = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
  // Stop the Windows Named Pipe server and close SQLite
  if (pipeServer) {
    try { pipeServer.stop(); } catch (_) { /* ignore */ }
    pipeServer = null;
  }
  if (sqliteDb) {
    try { sqliteDb.close(); } catch (_) { /* ignore */ }
    sqliteDb = null;
  }
});

app.on('will-quit', () => {
  if (pipeServer) {
    try { pipeServer.stop(); } catch (_) { /* ignore */ }
    pipeServer = null;
  }
  if (sqliteDb) {
    try { sqliteDb.close(); } catch (_) { /* ignore */ }
    sqliteDb = null;
  }
  log.info('startup', 'will-quit: pipe server stopped and SQLite closed');
});

app.on('window-all-closed', () => {
  const settings = dbHandler.getSettings();
  if (isQuitting || settings.backgroundPermission !== true) {
    app.quit();
  } else {
    console.log('[MAIN] Window closed, staying alive in background with tray.');
    // On Windows, the app continues to run until explicitly quit or all windows are closed AND no background permission
  }
});

// Window Controls
ipcMain.handle('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

ipcMain.handle('dialog:open-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('cli:install', () => cliInstaller.installCLI());
ipcMain.handle('cli:uninstall', () => cliInstaller.uninstallCLI());
ipcMain.handle('cli:status', () => ({
  installedAt: cliInstaller.checkCLIInstalled(),
  server: { status: 'RUNNING', pipe: '\\\\.\\pipe\\PackageGuard' },
  pipeName: '\\\\.\\pipe\\PackageGuard'
}));

// Expose runtime data root path so Settings UI can display it
ipcMain.handle('app:data-root', () => ({
  dataRoot: rp.dataRoot,
  isPortable: rp.isPortable,
  paths: {
    database: rp.paths.database,
    logs:     rp.paths.logs,
    cache:    rp.paths.cache,
    snapshots: rp.paths.snapshots,
    config:   rp.paths.config,
  },
}));

// Expose application version
ipcMain.handle('app:version', () => {
  try {
    return require('../../../../package.json').version || 'unknown';
  } catch { return 'unknown'; }
});

// ── Uninstall helper — called from the Settings UI ────────────────────────────
// mode: 'app-only'  → close app, let NSIS remove the binary (user data kept)
// mode: 'full'      → remove all AppData then close app (NSIS removes binary)
ipcMain.handle('app:uninstall', async (_evt, { mode } = {}) => {
  const uninstallHelper = require('./handlers/uninstallHelper');
  log.logUninstall(mode || 'app-only', rp.dataRoot);

  if (mode === 'full') {
    // Close all windows first so no handles are open on data files
    BrowserWindow.getAllWindows().forEach(w => { try { w.destroy(); } catch (_) {} });
    // Give OS a moment to release file handles
    await new Promise(r => setTimeout(r, 800));

    const result = await uninstallHelper.removeAllUserData(rp.dataRoot, rp.paths);
    log.logUninstallCleanup(rp.dataRoot, result.success, result.error);
  } else {
    // app-only: reset installation permission state so reinstall prompts fresh, keeping database intact
    const installationState = require('./installationState');
    installationState.resetPermissionState();
  }

  // Quit the Electron process — NSIS handles registry and binary removal
  isQuitting = true;
  app.quit();
  return { ok: true };
});

ipcMain.handle('pg:open-path', async (_evt, target) => {
  if (!target) return false;
  try {
    const abs = path.resolve(String(target));
    if (fs.existsSync(abs)) {
      shell.showItemInFolder(abs);
      return true;
    }
    return false;
  } catch (_) { return false; }
});

// CLI-requested: focus/restore window
ipcMain.handle('window:focus', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    // Windows: force foreground
    if (process.platform === 'win32') {
      mainWindow.setAlwaysOnTop(true);
      mainWindow.setAlwaysOnTop(false);
      mainWindow.focus();
    }
    return { ok: true };
  }
  return { ok: false };
});

// CLI-requested: receive project scan snapshot from `pg scan`
ipcMain.handle('snapshot:project:update', (_evt, snapshot) => {
  try {
    console.log(`[IPC] snapshot:project:update — ${snapshot?.projectName} (${(snapshot?.environments ?? []).reduce((s, e) => s + (e.totalPackages ?? 0), 0)} packages)`);
    // Relay to renderer via webContents.send (same channel as HTTP bridge)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('snapshot:project:update', snapshot);
      mainWindow.webContents.send('trigger:auto-scan');
    }
    return { ok: true };
  } catch (e) {
    console.error('[IPC] snapshot:project:update error:', e.message);
    return { ok: false, error: e.message };
  }
});

async function createAutoSnapshot(env, packageName = null, packageVersion = null) {
  try {
    const settings = dbHandler.getSettings();
    if (!settings.autoSnapshotBeforeUpdate) {
      console.log('[AUTO-SNAPSHOT] Skipping (disabled in settings)');
      return;
    }

    let packages = [];
    let envName = env?.name || 'Unknown';
    let envType = env?.type || 'pip';
    let environmentId = env?.id;

    // Handle venvs and regular envs
    if (String(environmentId).startsWith('venv-')) {
      const venvs = dbHandler.getVenvs();
      const venv = venvs.find(v => v.id === environmentId);
      if (venv) {
        envName = venv.name;
        const venvPkgs = await venvHandler.getVenvPackages(venv.path);
        packages = venvPkgs.map(p => ({
          name: p.name,
          installedVersion: p.version,
          ecosystem: 'pip'
        }));
      }
    } else if (env) {
      packages = dbHandler.getPackages(environmentId);
    }

    const snapshot = {
      environmentId,
      environmentName: envName,
      name: `Auto-snapshot before update (${new Date().toLocaleString()})`,
      notes: packageName ? `Updating ${packageName} to ${packageVersion}` : 'Auto-snapshot before batch update',
      packageName,
      packageVersion,
      packages: packages.map(p => ({
        name: p.name,
        version: p.installedVersion || p.version,
        ecosystem: p.ecosystem || (envType === 'npm' ? 'npm' : 'pip')
      }))
    };

    dbHandler.insertSnapshot(snapshot);
    console.log('[AUTO-SNAPSHOT] Created:', snapshot.name);
  } catch (err) {
    console.error('[AUTO-SNAPSHOT ERROR]', err);
  }
}

function getStatus(installed, latest) {
  if (!installed || !latest) return 'unknown';
  if (installed === latest) return 'up-to-date';

  const iParts = installed.split('.').map(Number);
  const lParts = latest.split('.').map(Number);

  // Compare major.minor.patch
  for (let i = 0; i < 3; i++) {
    const iV = iParts[i] || 0;
    const lV = lParts[i] || 0;
    if (lV > iV) {
      if (i === 0) return 'major';
      if (i === 1) return 'minor';
      if (i === 2) return 'patch';
    }
    if (iV > lV) return 'up-to-date'; // Installed is ahead
  }

  return 'up-to-date';
}

// IPC Handlers

// Dashboard
ipcMain.handle('dashboard:summary', async () => {
  const settings = dbHandler.getSettings();
  const includeVenvs = settings.includeVenvsInDashboard !== false;
  const envs = dbHandler.getEnvironments();
  const venvs = dbHandler.getVenvs();
  const allPackages = [];
  
  for (const env of envs) {
    const pkgs = dbHandler.getPackages(env.id);
    allPackages.push(...pkgs);
  }

  if (includeVenvs) {
    for (const venv of venvs) {
      const pkgs = dbHandler.getPackages(venv.id);
      allPackages.push(...pkgs);
    }
  }

  const totalEnvironments = envs.length + (includeVenvs ? venvs.length : 0);

  const upToDate = allPackages.filter(p => p.status === 'up-to-date').length;
  const patchUpdates = allPackages.filter(p => p.status === 'patch').length;
  const minorUpdates = allPackages.filter(p => p.status === 'minor').length;
  const majorUpdates = allPackages.filter(p => p.status === 'major').length;
  const failedPackages = allPackages.filter(p => p.status === 'failed').length;

  const lastScanEnv = envs.reduce((latest, current) => {
    if (!latest || (current.last_scanned && current.last_scanned > latest.last_scanned)) return current;
    return latest;
  }, null);

  return {
    totalPackages: allPackages.length,
    totalEnvironments,
    totalVenvs: includeVenvs ? venvs.length : 0,
    upToDate,
    needsUpdate: patchUpdates + minorUpdates + majorUpdates,
    majorUpdates,
    minorUpdates,
    patchUpdates,
    failedPackages,
    lastScanAt: lastScanEnv?.last_scanned ? new Date(lastScanEnv.last_scanned).toISOString() : null
  };
});

ipcMain.handle('dashboard:status-breakdown', async () => {
  const settings = dbHandler.getSettings();
  const includeVenvs = settings.includeVenvsInDashboard !== false;
  const envs = [...dbHandler.getEnvironments()];
  if (includeVenvs) {
    const venvs = dbHandler.getVenvs();
    for (const v of venvs) {
      envs.push({ id: v.id, name: v.name || path.basename(v.path) });
    }
  }
  return envs.map(env => {
    const pkgs = dbHandler.getPackages(env.id);
    return {
      environmentId: env.id,
      environmentName: env.name,
      upToDate: pkgs.filter(p => p.status === 'up-to-date').length,
      patch: pkgs.filter(p => p.status === 'patch').length,
      minor: pkgs.filter(p => p.status === 'minor').length,
      major: pkgs.filter(p => p.status === 'major').length,
      failed: pkgs.filter(p => p.status === 'failed').length,
      unknown: pkgs.filter(p => p.status === 'unknown').length
    };
  });
});

// Environments
ipcMain.handle('environments:create', (_, env) => {
  const id = `env-${Date.now()}`;
  dbHandler.insertEnvironment({ ...env, id });
  return dbHandler.getEnvironment(id);
});

ipcMain.handle('scan:environments', async () => {
  const envs = await envScanner.scan();
  for (const env of envs) {
    const existing = dbHandler.getEnvironment(env.id);
    if (existing) {
      // Update existing environment (important for updating Python path!)
      dbHandler.insertEnvironment(env);
    } else {
      dbHandler.insertEnvironment(env);
    }
  }
  return dbHandler.getEnvironments();
});

ipcMain.handle('environments:get', () => dbHandler.getEnvironments());

ipcMain.handle('environments:delete', (_, id) => dbHandler.deleteEnvironment(id));

ipcMain.handle('environments:scan', async (_, id) => {
  const env = dbHandler.getEnvironment(id);
  if (!env) throw new Error('Environment not found');

  console.log(`[SCAN] Starting fresh disk scan for ${env.name} (${env.type}) at ${env.path}`);

  let packages = [];
  if (env.type === 'pip' || env.type === 'venv' || env.type === 'conda') {
    const list = await pipHandler.listPackages(env.path === 'pip' || env.path === 'python' ? null : env.path);
    packages = list.map(p => {
      // Find existing package to preserve metadata
      const existing = dbHandler.getPackages(env.id).find(ep => ep.name === p.name);
      return {
        name: p.name,
        installedVersion: p.version,
        ecosystem: env.type,
        environmentId: env.id,
        environmentName: env.name,
        environmentPath: env.path,
        latestVersion: existing?.latestVersion || null,
        status: existing?.latestVersion ? getStatus(p.version, existing.latestVersion) : (existing?.status || 'unknown'),
        groupName: existing?.groupName || null
      };
    });
  } else if (env.type === 'npm') {
    const list = await npmHandler.listPackages(env.path === 'npm' ? null : env.path);
    packages = list.map(p => {
      const existing = dbHandler.getPackages(env.id).find(ep => ep.name === p.name);
      return {
        name: p.name,
        installedVersion: p.version,
        ecosystem: 'npm',
        environmentId: env.id,
        environmentName: env.name,
        environmentPath: env.path,
        latestVersion: existing?.latestVersion || null,
        status: existing?.latestVersion ? getStatus(p.version, existing.latestVersion) : (existing?.status || 'unknown'),
        groupName: existing?.groupName || null
      };
    });
  } else if (env.type === 'pnpm') {
    const list = await pnpmHandler.listPackages(env.path === 'pnpm' ? null : env.path);
    packages = list.map(p => {
      const existing = dbHandler.getPackages(env.id).find(ep => ep.name === p.name);
      return {
        name: p.name,
        installedVersion: p.version,
        ecosystem: 'pnpm',
        environmentId: env.id,
        environmentName: env.name,
        environmentPath: env.path,
        latestVersion: existing?.latestVersion || null,
        status: existing?.latestVersion ? getStatus(p.version, existing.latestVersion) : (existing?.status || 'unknown'),
        groupName: existing?.groupName || null
      };
    });
  } else if (env.type === 'yarn') {
    const list = await yarnHandler.listPackages(env.path === 'yarn' ? null : env.path);
    packages = list.map(p => {
      const existing = dbHandler.getPackages(env.id).find(ep => ep.name === p.name);
      return {
        name: p.name,
        installedVersion: p.version,
        ecosystem: 'yarn',
        environmentId: env.id,
        environmentName: env.name,
        environmentPath: env.path,
        latestVersion: existing?.latestVersion || null,
        status: existing?.latestVersion ? getStatus(p.version, existing.latestVersion) : (existing?.status || 'unknown'),
        groupName: existing?.groupName || null
      };
    });
  }

  for (const pkg of packages) {
    dbHandler.upsertPackage(pkg, true); // Skip individual saves
  }

  dbHandler.updateEnvironmentScan(id, packages.length);
  dbHandler.saveStorage(); // Batch save

  return dbHandler.getPackages(id);
});

// Packages
ipcMain.handle('packages:get', (_, params) => {
  const envId = typeof params === 'string' ? params : params?.environmentId;
  let pkgs = dbHandler.getPackages(envId);

  if (typeof params === 'object' && params !== null) {
    if (params.status && params.status !== 'all') {
      pkgs = pkgs.filter(p => p.status === params.status);
    }
    if (params.search) {
      const search = params.search.toLowerCase();
      pkgs = pkgs.filter(p => p.name.toLowerCase().includes(search));
    }
  }

  return pkgs;
});

// Venv Handlers
ipcMain.handle('venv:scan', async (_, rootDir) => {
  const venvs = await venvHandler.findVenvs(rootDir);
  dbHandler.insertHistory({
    packageName: 'Venv Scanner',
    ecosystem: 'pip',
    environmentName: 'System',
    fromVersion: '-',
    toVersion: '-',
    status: 'success',
    note: `Scanned ${rootDir} for venvs, found ${venvs.length}`
  });
  return venvs;
});

ipcMain.handle('venv:get-packages', async (_, venvPath) => {
  try {
    const packages = await venvHandler.getVenvPackages(venvPath);
    return { success: true, packages };
  } catch (err) {
    return { success: false, packages: [], error: err.message };
  }
});

ipcMain.handle('venv:update-package', async (event, { venvPath, packageName }) => {
  const venvs = dbHandler.getVenvs();
  const venv = venvs.find(v => v.path === venvPath);
  
  const progressCb = (progress) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('update:progress', { package: packageName, ...progress });
    }
  };
  
  const result = await venvHandler.updateVenvPackage(venvPath, packageName, progressCb);
  
  // Log to history
  dbHandler.insertHistory({
    packageName,
    ecosystem: 'pip',
    environmentName: venv?.name || 'Venv',
    fromVersion: 'unknown',
    toVersion: 'updated',
    status: result.success ? 'success' : 'failed',
    errorMessage: result.success ? null : result.error,
    note: `Updated in venv: ${venv?.name || venvPath}`
  });

  return result;
});

ipcMain.handle('venv:get-meta', async (_, venvPath) => {
  return venvHandler.getVenvMeta(venvPath);
});

// Venv Storage Handlers
ipcMain.handle('venvs:get-registered', () => dbHandler.getVenvs());
ipcMain.handle('venvs:register', (_, venv) => {
  const result = dbHandler.registerVenv(venv);
  dbHandler.insertHistory({
    packageName: venv.name,
    ecosystem: 'pip',
    environmentName: 'System',
    fromVersion: '-',
    toVersion: 'registered',
    status: 'success',
    note: `Registered venv: ${venv.name} at ${venv.path}`
  });
  return result;
});
ipcMain.handle('venvs:remove', (_, path) => dbHandler.removeVenv(path));

ipcMain.handle('update:package', async (event, { packageName, targetVersion, ecosystem, envPath }) => { 
  console.log(`[IPC] update:package → ${packageName}@${targetVersion} | ecosystem: ${ecosystem} | envPath: ${envPath}`); 

  // Capture environment and fromVersion before update
  const envs = dbHandler.getEnvironments();
  const env = envs.find(e => {
    if (envPath) return e.path === envPath || e.environmentPath === envPath;
    return (ecosystem === 'npm' && (e.id === 'global-npm' || e.name === 'Global NPM')) ||
           ((ecosystem === 'pip' || ecosystem === 'venv' || ecosystem === 'conda') && (e.id === 'global-pip' || e.name === 'Global Pip'));
  });
  
  const allPkgs = env ? dbHandler.getPackages(env.id) : [];
  const existingPkg = allPkgs.find(p => {
    if (ecosystem === 'npm') return p.name === packageName;
    const n1 = p.name.toLowerCase().replace(/[._]/g, '-');
    const n2 = packageName.toLowerCase().replace(/[._]/g, '-');
    return n1 === n2;
  });
  const fromVersion = existingPkg?.installedVersion || 'unknown';

  // Create auto-snapshot before update
  if (env) {
    await createAutoSnapshot(env, packageName, targetVersion);
  }

  const progressCb = (progress) => { 
    if (!event.sender.isDestroyed()) {
      event.sender.send('update:progress', { package: packageName, ...progress }); 
    }
  }; 

  try { 
    let result; 

    if (ecosystem === 'npm') { 
      result = await npmHandler.updateNpmPackage(packageName, targetVersion, envPath, progressCb); 
    } else { 
      result = await pipHandler.updatePackage(packageName, targetVersion, envPath || null, progressCb); 
    } 

    if (result.success) {
      // Refresh package data after successful update
      console.log(`[IPC] Refreshing package data for ${packageName}`);
      
      // Delay slightly to ensure OS file handles are released
      await new Promise(r => setTimeout(r, 1000));

      if (env) {
        console.log(`[IPC] Found environment for refresh: ${env.name} (${env.id})`);
        let packages = [];
        if (env.type === 'pip' || env.type === 'venv' || env.type === 'conda') {
          // Force a fresh scan bypassing any possible node cache
          const list = await pipHandler.listPackages(env.path === 'pip' ? null : env.path);
          packages = list.map(p => ({
            name: p.name,
            installedVersion: p.version,
            ecosystem: env.type,
            environmentId: env.id,
            environmentName: env.name,
            environmentPath: env.path
          }));
        } else if (env.type === 'npm') {
          const list = await npmHandler.listPackages(env.path === 'npm' ? null : env.path);
          packages = list.map(p => ({
            name: p.name,
            installedVersion: p.version,
            ecosystem: 'npm',
            environmentId: env.id,
            environmentName: env.name,
            environmentPath: env.path
          }));
        }

          // Case-insensitive matching for Pip/Conda
          const updatedPkg = packages.find(p => {
            if (ecosystem === 'npm') return p.name === packageName;
            const n1 = p.name.toLowerCase().replace(/[._]/g, '-');
            const n2 = packageName.toLowerCase().replace(/[._]/g, '-');
            return n1 === n2;
          });

          if (updatedPkg) {
            console.log(`[IPC] VERIFIED: ${updatedPkg.name} is now @ ${updatedPkg.installedVersion}`);
            // Keep existing latest version and status from current record if available
            const existing = dbHandler.getPackages(env.id).find(p => {
              if (ecosystem === 'npm') return p.name === packageName;
              const n1 = p.name.toLowerCase().replace(/[._]/g, '-');
              const n2 = packageName.toLowerCase().replace(/[._]/g, '-');
              return n1 === n2;
            });
            
            const latestVersion = existing?.latestVersion || null;
            const status = latestVersion ? getStatus(updatedPkg.installedVersion, latestVersion) : 'unknown';

            dbHandler.upsertPackage({
              ...updatedPkg,
              latestVersion,
              status
            });
          } else {
          console.warn(`[IPC] Could not find package ${packageName} in post-update scan of ${env.name}`);
        }
      } else {
        console.warn(`[IPC] Could not find matching environment for refresh. envPath: ${envPath}`);
      }
    }

    // Insert history entry
    dbHandler.insertHistory({
      packageName,
      ecosystem,
      environmentName: env?.name || 'Unknown',
      fromVersion: fromVersion,
      toVersion: targetVersion,
      status: result.success ? 'success' : 'failed',
      errorMessage: result.success ? null : result.error
    });

    if (!event.sender.isDestroyed()) {
      event.sender.send('update:progress', { 
        package: packageName, 
        status: result.success ? 'complete' : 'failed', 
        message: result.success ? 'Update complete' : result.error 
      }); 
    }
    return result; 

  } catch (err) { 
    console.error('[IPC ERROR]', err.message); 
    
    // Also record failure in history
    dbHandler.insertHistory({
      packageName,
      ecosystem,
      environmentName: env?.name || 'Unknown',
      fromVersion: fromVersion,
      toVersion: targetVersion,
      status: 'failed',
      errorMessage: err.message
    });

    if (!event.sender.isDestroyed()) {
      event.sender.send('update:progress', { 
        package: packageName, 
        status: 'failed', 
        message: err.message 
      }); 
    }    return { success: false, package: packageName, error: err.message }; 
  } 
});

ipcMain.handle('packages:delete', async (_, { packageName, ecosystem, envPath }) => {
  console.log(`[IPC] packages:delete → ${packageName} | ecosystem: ${ecosystem} | envPath: ${envPath}`);

  // Capture environment and fromVersion before delete
  const envs = dbHandler.getEnvironments();
  const env = envs.find(e => {
    if (envPath) return e.path === envPath || e.environmentPath === envPath;
    return (ecosystem === 'npm' && (e.id === 'global-npm' || e.name === 'Global NPM')) ||
           ((ecosystem === 'pip' || ecosystem === 'venv' || ecosystem === 'conda') && (e.id === 'global-pip' || e.name === 'Global Pip'));
  });

  const allPkgs = env ? dbHandler.getPackages(env.id) : [];
  const existingPkg = allPkgs.find(p => p.name === packageName);
  const fromVersion = existingPkg?.installedVersion || 'unknown';

  try {
    let result;
    if (ecosystem === 'npm') {
      result = await npmHandler.deleteNpmPackage(packageName, envPath);
    } else {
      result = await pipHandler.deletePackage(packageName, envPath);
    }

    if (result.success) {
      if (env) {
        dbHandler.deletePackage(env.id, packageName);
      }
    }

    // Insert history entry
    dbHandler.insertHistory({
      packageName,
      ecosystem,
      environmentName: env?.name || 'Unknown',
      fromVersion: fromVersion,
      toVersion: 'removed',
      status: result.success ? 'success' : 'failed',
      errorMessage: result.success ? null : result.error
    });

    return result;
  } catch (err) {
    console.error(`[IPC] packages:delete Error:`, err);
    return { success: false, package: packageName, error: err.message };
  }
});

ipcMain.handle('update:batch', async (event, { packages, envPath }) => {
  console.log(`[IPC] update:batch called for ${packages.length} packages`);
  const results = [];
  const updatedEnvs = new Set();

  // Create auto-snapshot before batch update (only once per unique env)
  const uniqueEnvs = new Map();
  for (const pkg of packages) {
    const envs = dbHandler.getEnvironments();
    const env = envs.find(e => {
      if (envPath) return e.path === envPath || e.environmentPath === envPath;
      return (pkg.ecosystem === 'npm' && (e.id === 'global-npm' || e.name === 'Global NPM')) ||
             ((pkg.ecosystem === 'pip' || pkg.ecosystem === 'venv' || pkg.ecosystem === 'conda') && (e.id === 'global-pip' || e.name === 'Global Pip'));
    });
    if (env && !uniqueEnvs.has(env.id)) {
      uniqueEnvs.set(env.id, env);
    }
  }
  for (const env of uniqueEnvs.values()) {
    await createAutoSnapshot(env);
  }

  const total = packages.length;
  let completedCount = 0;
  let successfulCount = 0;
  let failedCount = 0;

  for (const pkg of packages) {
    // Notify starting update for this package
    if (!event.sender.isDestroyed()) {
      event.sender.send('update:progress', {
        package: pkg.name,
        status: 'installing',
        message: `Updating ${pkg.name} to ${pkg.targetVersion}...`,
        batch: {
          total,
          completed: completedCount,
          successful: successfulCount,
          failed: failedCount,
          currentPackage: pkg.name
        }
      });
    }

    // Capture environment and fromVersion before update
    const envs = dbHandler.getEnvironments();
    const env = envs.find(e => {
      if (envPath) return e.path === envPath || e.environmentPath === envPath;
      return (pkg.ecosystem === 'npm' && (e.id === 'global-npm' || e.name === 'Global NPM')) ||
             ((pkg.ecosystem === 'pip' || pkg.ecosystem === 'venv' || pkg.ecosystem === 'conda') && (e.id === 'global-pip' || e.name === 'Global Pip'));
    });
    
    const allPkgs = env ? dbHandler.getPackages(env.id) : [];
    const existingPkg = allPkgs.find(p => p.name === pkg.name);
    const fromVersion = existingPkg?.installedVersion || 'unknown';

    let result;
    try {
      if (pkg.ecosystem === 'npm') {
        result = await npmHandler.updateNpmPackage(
          pkg.name,
          pkg.targetVersion,
          envPath,
          (progress) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('update:progress', {
                package: pkg.name,
                ...progress,
                batch: {
                  total,
                  completed: completedCount,
                  successful: successfulCount,
                  failed: failedCount,
                  currentPackage: pkg.name
                }
              });
            }
          }
        );
      } else {
        result = await pipHandler.updatePackage(
          pkg.name,
          pkg.targetVersion,
          envPath,
          (progress) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('update:progress', {
                package: pkg.name,
                ...progress,
                batch: {
                  total,
                  completed: completedCount,
                  successful: successfulCount,
                  failed: failedCount,
                  currentPackage: pkg.name
                }
              });
            }
          }
        );
      }
    } catch (err) {
      console.error(`[IPC] Error updating ${pkg.name}:`, err);
      result = { success: false, package: pkg.name, error: err.message || String(err) };
    }

    if (result && result.success) {
      successfulCount++;
    } else {
      failedCount++;
    }
    completedCount++;
    
    // Optimistic refresh after each successful update in the batch
    if (result && result.success) {
      if (env) {
        updatedEnvs.add(env.id);
        
        // Use normalization for finding the existing record
        const allPkgs = dbHandler.getPackages(env.id);
        const existing = allPkgs.find(p => {
          if (pkg.ecosystem === 'npm') return p.name === pkg.name;
          const n1 = p.name.toLowerCase().replace(/[._]/g, '-');
          const n2 = pkg.name.toLowerCase().replace(/[._]/g, '-');
          return n1 === n2;
        });
        
        const latestVersion = existing?.latestVersion || null;
        const status = latestVersion ? getStatus(pkg.targetVersion, latestVersion) : 'unknown';

        // Update DB optimistically with target version
        dbHandler.upsertPackage({
          name: pkg.name,
          installedVersion: pkg.targetVersion,
          ecosystem: pkg.ecosystem,
          environmentId: env.id,
          latestVersion,
          status
        }, true);
      }
    }

    // Insert history entry for each package in batch
    dbHandler.insertHistory({
      packageName: pkg.name,
      ecosystem: pkg.ecosystem,
      environmentName: env?.name || 'Unknown',
      fromVersion: fromVersion,
      toVersion: pkg.targetVersion,
      status: result.success ? 'success' : 'failed',
      errorMessage: result.success ? null : result.error
    });

    results.push(result);

    // Send final update progress event after each package finishes
    if (!event.sender.isDestroyed()) {
      event.sender.send('update:progress', { 
        package: pkg.name, 
        status: result.success ? 'complete' : 'failed', 
        message: result.success ? `Updated ${pkg.name} to ${pkg.targetVersion}` : (result.error || 'Update failed'),
        error: result.success ? null : result.error,
        batch: {
          total,
          completed: completedCount,
          successful: successfulCount,
          failed: failedCount,
          currentPackage: pkg.name
        }
      }); 
    }
  }

  // Final verification: Refresh package data for all affected environments ONCE
  if (updatedEnvs.size > 0) {
    console.log(`[IPC] Final batch verification for ${updatedEnvs.size} environments`);
    for (const envId of updatedEnvs) {
      const env = dbHandler.getEnvironments().find(e => e.id === envId);
      if (env) {
        try {
          let freshList = [];
          if (env.type === 'pip' || env.type === 'venv' || env.type === 'conda') {
            freshList = await pipHandler.listPackages(env.path === 'pip' ? null : env.path);
          } else if (env.type === 'npm') {
            freshList = await npmHandler.listPackages(env.path === 'npm' ? null : env.path);
          }
          
          const existingPkgs = dbHandler.getPackages(envId);
          for (const updated of freshList) {
            const existing = existingPkgs.find(p => {
              if (env.type === 'npm') return p.name === updated.name;
              const n1 = p.name.toLowerCase().replace(/[._]/g, '-');
              const n2 = updated.name.toLowerCase().replace(/[._]/g, '-');
              return n1 === n2;
            });

            if (existing) {
              const status = existing.latestVersion ? getStatus(updated.version, existing.latestVersion) : 'unknown';
              dbHandler.upsertPackage({
                ...existing,
                installedVersion: updated.version,
                status
              }, true);
            }
          }
        } catch (e) {
          console.warn(`[IPC] Failed final verification for ${env.name}:`, e.message);
        }
      }
    }
  }

  dbHandler.saveStorage();
  return results;
});

ipcMain.handle('versions:check', async (_, packages) => {
  const axios = require('axios');
  const settings = dbHandler.getSettings();
  const BATCH = Math.max(1, settings.concurrencyLimit ?? 10);
  const cacheMs = (settings.cacheDurationHours ?? 6) * 60 * 60 * 1000;
  const cutoff = Date.now() - cacheMs;
  const results = [];
  const toFetch = [];

  for (const pkg of packages) {
    const envId = pkg.environmentId || pkg.envId;
    const existing = envId
      ? dbHandler.getPackages(envId).find((p) => {
          if (p.ecosystem !== pkg.ecosystem) return false;
          if (pkg.ecosystem === 'npm') return p.name === pkg.name;
          const n1 = p.name.toLowerCase().replace(/[._]/g, '-');
          const n2 = pkg.name.toLowerCase().replace(/[._]/g, '-');
          return n1 === n2;
        })
      : null;

    if (existing?.latestVersion && existing.lastChecked > cutoff) {
      results.push({
        name: pkg.name,
        latest: existing.latestVersion,
        status: existing.status || getStatus(pkg.installedVersion, existing.latestVersion),
        ecosystem: pkg.ecosystem,
      });
    } else {
      toFetch.push(pkg);
    }
  }

  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(async (pkg) => {
        const ecosystem = pkg.ecosystem;
        const name = ecosystem === 'npm'
          ? pkg.name
          : pkg.name.toLowerCase().replace(/[._]/g, '-');

        try {
          let latest;
          if (ecosystem === 'npm') {
            const res = await axios.get(
              `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
              { timeout: 8000 }
            );
            latest = res.data.version;
          } else {
            const res = await axios.get(
              `https://pypi.org/pypi/${name}/json`,
              { timeout: 8000 }
            );
            latest = res.data.info.version;
          }

          if (!latest) throw new Error('No version found in registry');

          const status = getStatus(pkg.installedVersion, latest);
          const result = { name: pkg.name, latest, status, ecosystem: pkg.ecosystem };

          dbHandler.upsertPackage({
            ...pkg,
            latestVersion: latest,
            status: status,
          }, true);

          return result;
        } catch (err) {
          console.error(`[VERSION FAIL] ${pkg.name} (${ecosystem}):`, err.message);
          return { name: pkg.name, latest: null, status: 'unknown', ecosystem: pkg.ecosystem };
        }
      })
    );

    settled.forEach((s) => {
      if (s.status === 'fulfilled') results.push(s.value);
    });

    if (i + BATCH < toFetch.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  dbHandler.saveStorage();
  return results;
});

// Settings
ipcMain.handle('settings:get', () => dbHandler.getSettings());
ipcMain.handle('settings:update', (_, settings) => {
  const result = dbHandler.updateSettings(settings);
  setupBackgroundScan();
  return result;
});

// Snapshots
ipcMain.handle('snapshots:get', async () => {
  try {
    const db = sqliteDb || (projectEnvHandler.getDb ? projectEnvHandler.getDb() : null);
    let sqliteSnaps = [];
    if (db) {
      const allSnaps = db.prepare(`SELECT * FROM snapshots WHERE status != 'DELETED' ORDER BY created_at DESC`).all();
      const allProjects = db.prepare(`SELECT * FROM projects`).all();
      const projMap = new Map(allProjects.map(p => [p.id, p]));
      sqliteSnaps = allSnaps.map(s => {
        const proj = projMap.get(s.project_id);
        let packages = [];
        try {
          const m = JSON.parse(s.manifest_json);
          packages = m.packages || [];
        } catch {}
        return {
          id: s.id,
          environmentId: s.project_id,
          environmentName: proj ? proj.name : (s.project_id || 'Unknown'),
          name: s.name,
          notes: s.description || null,
          description: s.description || null,
          fileCount: s.file_count,
          packageCount: s.package_count,
          packages,
          status: s.status || 'ACTIVE',
          createdAt: s.created_at,
        };
      });
    }
    const legacySnaps = dbHandler.getSnapshots() || [];
    const sqliteIds = new Set(sqliteSnaps.map(s => String(s.id)));
    const filteredLegacy = legacySnaps.filter(s => !sqliteIds.has(String(s.id)));
    return [...sqliteSnaps, ...filteredLegacy];
  } catch (e) {
    log.error('ipc', `snapshots:get error: ${e.message}`);
    return dbHandler.getSnapshots() || [];
  }
});
ipcMain.handle('snapshots:create', async (_, data) => {
  const { environmentId, name, notes, packageName, packageVersion } = data;
  let packages = [];
  let envName = 'Unknown';
  let envType = 'pip';

  if (String(environmentId).startsWith('venv-')) {
    // It's a venv
    const venvs = dbHandler.getVenvs();
    const venv = venvs.find(v => v.id === environmentId);
    if (venv) {
      envName = venv.name;
      const venvPkgs = await venvHandler.getVenvPackages(venv.path);
      packages = venvPkgs.map(p => ({
        name: p.name,
        installedVersion: p.version,
        ecosystem: 'pip'
      }));
    }
  } else {
    // It's a regular environment
    packages = dbHandler.getPackages(environmentId);
    const env = dbHandler.getEnvironments().find(e => e.id === environmentId);
    if (env) {
      envName = env.name;
      envType = env.type;
    }
  }
  
  const snapshot = {
    environmentId,
    environmentName: envName,
    name,
    notes,
    packageName,
    packageVersion,
    packages: packages.map(p => ({
      name: p.name,
      version: p.installedVersion || p.version,
      ecosystem: p.ecosystem || (envType === 'npm' ? 'npm' : 'pip')
    }))
  };
  
  dbHandler.insertSnapshot(snapshot);
  return { success: true };
});
ipcMain.handle('snapshots:delete', async (_, id) => {
  const snapshotId = String(id);
  const db = sqliteDb || (projectEnvHandler.getDb ? projectEnvHandler.getDb() : null);
  if (db) {
    try {
      const { deleteSnapshotById } = require('@package-guard/shared/repository');
      const { getSnapshotStorageDir } = require('@package-guard/shared/paths');
      const storageRoot = getSnapshotStorageDir();
      const snapshotDir = path.join(storageRoot, snapshotId);
      if (fs.existsSync(snapshotDir)) {
        fs.rmSync(snapshotDir, { recursive: true, force: true });
      }
      deleteSnapshotById(db, snapshotId);
    } catch (e) {
      log.error('ipc', `Failed to delete SQLite snapshot ${snapshotId}: ${e.message}`);
    }
  }
  dbHandler.deleteSnapshot(snapshotId);
  return { success: true };
});
ipcMain.handle('snapshots:restore', async (event, id) => {
  const snapshotId = String(id);
  const db = sqliteDb || (projectEnvHandler.getDb ? projectEnvHandler.getDb() : null);
  if (db) {
    try {
      const { getSnapshotById, getSnapshotFiles, getProjectById } = require('@package-guard/shared/repository');
      const { getSnapshotStorageDir } = require('@package-guard/shared/paths');
      const snap = getSnapshotById(db, snapshotId);
      if (snap) {
        const project = getProjectById(db, snap.project_id);
        if (!project) return { success: false, error: 'Associated project not found' };
        const storageRoot = getSnapshotStorageDir();
        const snapshotDir = path.join(storageRoot, snapshotId);
        const files = getSnapshotFiles(db, snapshotId);
        let restored = 0;
        for (const f of files) {
          const sourcePath = f.storage_path && fs.existsSync(f.storage_path)
            ? f.storage_path
            : path.join(snapshotDir, f.relative_path);
          if (fs.existsSync(sourcePath)) {
            const targetPath = path.join(project.path, f.relative_path);
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.copyFileSync(sourcePath, targetPath);
            restored++;
          }
        }
        return { success: true, message: `Restored ${restored} files to ${project.name}` };
      }
    } catch (e) {
      log.error('ipc', `Failed to restore SQLite snapshot ${snapshotId}: ${e.message}`);
    }
  }

  const snapshot = dbHandler.getSnapshots().find(s => String(s.id) === snapshotId);
  if (!snapshot) return { success: false, error: 'Snapshot not found' };
  
  let envId = snapshot.environmentId;
  if (!envId) {
    const env = dbHandler.getEnvironments().find(e => e.name === snapshot.environmentName);
    if (env) {
      envId = env.id;
      console.log(`[SNAPSHOT] Resolved null environmentId to ${envId} via name ${snapshot.environmentName}`);
    }
  }

  const env = dbHandler.getEnvironment(envId);
  if (!env) return { success: false, error: 'Environment not found' };

  console.log(`[SNAPSHOT] Restoring ${snapshot.name} | Package: ${snapshot.packageName}@${snapshot.packageVersion} | Environment: ${env.name}`);
  
  const ecosystem = env.type === 'npm' ? 'npm' : 'pip';
  const envPath = env.path;

  try {
    if (snapshot.packageName && snapshot.packageVersion) {
      // Restore single package
      const packageName = snapshot.packageName;
      const targetVersion = snapshot.packageVersion;

      const progressCb = (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('update:progress', { package: packageName, ...progress });
        }
      };

      let result;
      if (ecosystem === 'npm') {
        result = await npmHandler.updateNpmPackage(packageName, targetVersion, envPath, progressCb);
      } else {
        result = await pipHandler.updatePackage(packageName, targetVersion, envPath || null, progressCb);
      }

      if (result.success) {
        console.log(`[SNAPSHOT] Refreshing package data for ${packageName}`);
        await new Promise(r => setTimeout(r, 1000));

        let freshList = [];
        if (env.type === 'pip' || env.type === 'venv' || env.type === 'conda') {
          freshList = await pipHandler.listPackages(env.path === 'pip' ? null : env.path);
        } else if (env.type === 'npm') {
          freshList = await npmHandler.listPackages(env.path === 'npm' ? null : env.path);
        }

        const updatedPkg = freshList.find(p => {
          if (env.type === 'npm') return p.name === packageName;
          const n1 = p.name.toLowerCase().replace(/[._]/g, '-');
          const n2 = packageName.toLowerCase().replace(/[._]/g, '-');
          return n1 === n2;
        });

        if (updatedPkg) {
          console.log(`[SNAPSHOT] VERIFIED: ${updatedPkg.name} restored to ${updatedPkg.version}`);
          
          const existing = dbHandler.getPackages(env.id).find(p => {
            if (env.type === 'npm') return p.name === packageName;
            const n1 = p.name.toLowerCase().replace(/[._]/g, '-');
            const n2 = packageName.toLowerCase().replace(/[._]/g, '-');
            return n1 === n2;
          });

          const latestVersion = existing?.latestVersion || null;
          const status = latestVersion ? getStatus(updatedPkg.version, latestVersion) : 'unknown';

          dbHandler.upsertPackage({
            ...existing,
            name: existing?.name || updatedPkg.name,
            installedVersion: updatedPkg.version,
            latestVersion,
            status,
            environmentId: env.id,
            environmentName: env.name,
            environmentPath: env.path,
            ecosystem: env.type === 'npm' ? 'npm' : 'pip'
          });
        }

        dbHandler.insertHistory({
          packageName,
          ecosystem,
          environmentName: env.name,
          fromVersion: 'unknown',
          toVersion: targetVersion,
          status: 'success',
          errorMessage: null,
          note: `Restored from snapshot: ${snapshot.name}`
        });

        return { success: true, message: `Successfully restored ${packageName} to version ${targetVersion}` };
      } else {
        return { success: false, error: result.error || 'Installation failed during restore' };
      }
    } else if (snapshot.packages && snapshot.packages.length > 0) {
      // Restore entire environment
      console.log(`[SNAPSHOT] Restoring entire environment (${snapshot.packages.length} packages)`);

      const results = [];
      let restoredCount = 0;
      let failedCount = 0;

      for (const pkg of snapshot.packages) {
        try {
          const progressCb = (progress) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('update:progress', { package: pkg.name, ...progress });
            }
          };

          let result;
          if (pkg.ecosystem === 'npm') {
            result = await npmHandler.updateNpmPackage(pkg.name, pkg.version, envPath, progressCb);
          } else {
            result = await pipHandler.updatePackage(pkg.name, pkg.version, envPath || null, progressCb);
          }

          results.push({ package: pkg.name, success: result.success, error: result.error });

          if (result.success) {
            restoredCount++;
            if (!event.sender.isDestroyed()) {
              event.sender.send('update:progress', { 
                package: pkg.name, 
                status: 'complete', 
                message: `Restored ${pkg.name} to ${pkg.version}` 
              });
            }
          } else {
            failedCount++;
            if (!event.sender.isDestroyed()) {
              event.sender.send('update:progress', { 
                package: pkg.name, 
                status: 'failed', 
                message: result.error 
              });
            }
          }
        } catch (err) {
          console.error(`[SNAPSHOT RESTORE ERROR] Failed to restore ${pkg.name}:`, err);
          results.push({ package: pkg.name, success: false, error: err.message });
          failedCount++;
        }
      }

      // Refresh all package data
      console.log('[SNAPSHOT] Refreshing all package data');
      await new Promise(r => setTimeout(r, 1000));

      let freshList = [];
      if (env.type === 'pip' || env.type === 'venv' || env.type === 'conda') {
        freshList = await pipHandler.listPackages(env.path === 'pip' ? null : env.path);
      } else if (env.type === 'npm') {
        freshList = await npmHandler.listPackages(env.path === 'npm' ? null : env.path);
      }

      // Update database with fresh data
      for (const updated of freshList) {
        const existing = dbHandler.getPackages(env.id).find(p => {
          if (env.type === 'npm') return p.name === updated.name;
          const n1 = p.name.toLowerCase().replace(/[._]/g, '-');
          const n2 = updated.name.toLowerCase().replace(/[._]/g, '-');
          return n1 === n2;
        });

        if (existing) {
          const latestVersion = existing.latestVersion || null;
          const status = latestVersion ? getStatus(updated.version, latestVersion) : 'unknown';
          dbHandler.upsertPackage({
            ...existing,
            installedVersion: updated.version,
            status
          }, true);
        } else {
          // Add new package to DB if not present
          dbHandler.upsertPackage({
            name: updated.name,
            installedVersion: updated.version,
            ecosystem: env.type === 'npm' ? 'npm' : 'pip',
            environmentId: env.id,
            environmentName: env.name,
            environmentPath: env.path,
            latestVersion: null,
            status: 'unknown'
          }, true);
        }
      }

      dbHandler.saveStorage();

      // Record history
      dbHandler.insertHistory({
        packageName: snapshot.environmentName,
        ecosystem: env.type === 'npm' ? 'npm' : 'pip',
        environmentName: env.name,
        fromVersion: 'current',
        toVersion: 'snapshot',
        status: failedCount === 0 ? 'success' : 'partial',
        errorMessage: failedCount > 0 ? `${failedCount} packages failed to restore` : null,
        note: `Restored entire environment from snapshot: ${snapshot.name} (${restoredCount} succeeded, ${failedCount} failed)`
      });

      if (failedCount === 0) {
        return { 
          success: true, 
          message: `Successfully restored entire environment (${restoredCount} packages)` 
        };
      } else {
        return { 
          success: true, 
          message: `Partially restored environment (${restoredCount} succeeded, ${failedCount} failed)`,
          details: results 
        };
      }
    } else {
      return { success: false, error: 'Snapshot does not contain package version information' };
    }
  } catch (err) {
    console.error('[SNAPSHOT RESTORE ERROR]', err.message);
    return { success: false, error: err.message };
  }
});

// History
ipcMain.handle('history:get', (_, limit = 50) => {
  const list = [];
  if (sqliteDb) {
    try {
      const recent = listRecentEvents(sqliteDb, limit);
      for (const ev of recent) {
        let cmd = ev.type;
        let pkgName = cmd;
        let fromVer = '';
        let toVer = '';
        let envName = 'CLI';
        let errMsg = null;
        try {
          const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
          if (payload && payload.command) {
            cmd = `pg ${payload.command}`;
            pkgName = cmd;
          }
          if (payload && payload.projectId) envName = payload.projectId;
          if (payload && (payload.status === 'FAILED' || payload.status === 'FAIL')) {
            errMsg = payload.message || 'Operation failed';
          }
          if (payload && payload.filesScanned !== undefined) {
            fromVer = `${payload.filesScanned} files`;
            toVer = `${payload.packagesDetected ?? 0} pkgs`;
          }
        } catch {}

        // Delivery type is strictly LIVE or SYNCED
        const delivery = ev.delivery_type === 'LIVE' ? 'LIVE' : 'SYNCED';

        list.push({
          id: ev.id,
          packageName: pkgName,
          ecosystem: 'cli',
          environmentName: envName,
          fromVersion: fromVer,
          toVersion: toVer,
          status: delivery, // LIVE or SYNCED
          errorMessage: errMsg,
          updatedAt: ev.created_at || new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('[MAIN] Error querying SQLite events for history:', err);
    }
  }

  // Also append any local package update entries
  try {
    const localHistory = dbHandler.getHistory(limit);
    if (Array.isArray(localHistory)) {
      list.push(...localHistory);
    }
  } catch {}

  list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return list.slice(0, limit);
});

// Fast startup: environments + fresh cache in one IPC round-trip
ipcMain.handle('bootstrap:get', () => {
  const settings = dbHandler.getSettings();
  const cacheHours = settings.cacheDurationHours ?? 6;
  const packages = dbHandler.getCachedPackages(cacheHours);
  return {
    environments: dbHandler.getEnvironments(),
    packages,
    cacheFresh: packages.length > 0,
    cacheDurationHours: cacheHours,
  };
});

// Cache Handlers
ipcMain.handle('cache:get', () => {
  const settings = dbHandler.getSettings();
  return dbHandler.getCachedPackages(settings.cacheDurationHours ?? 6);
});

ipcMain.handle('cache:save', (_, packages) => {
  dbHandler.saveScanCache(packages);
  return { success: true };
});

// ─── Project Environments (new architecture) ─────────────────────────────────
// These handlers expose the CLI core db.json projects to the renderer, classified
// by environment type: project | virtual | global | none | unknown.

/**
 * Get all tracked projects as classified environment objects.
 * Reads from packages/core/src/database.ts (db.json) via core.listProjectsCLI.
 */
ipcMain.handle('projects:get', async () => {
  try {
    return await projectEnvHandler.listProjectEnvironments();
  } catch (e) {
    log.error('ipc', `projects:get error: ${e.message}`);
    return [];
  }
});

/**
 * Get packages for a specific project (from latest snapshot).
 */
ipcMain.handle('projects:getPackages', async (_, projectId) => {
  try {
    return await projectEnvHandler.getProjectPackages(projectId);
  } catch (e) {
    log.error('ipc', `projects:getPackages error: ${e.message}`);
    return [];
  }
});

/**
 * Get snapshot history for a specific project.
 */
ipcMain.handle('projects:getSnapshots', async (_, { projectId, limit = 20 } = {}) => {
  try {
    return await projectEnvHandler.getProjectSnapshots(projectId, limit);
  } catch (e) {
    log.error('ipc', `projects:getSnapshots error: ${e.message}`);
    return [];
  }
});

/**
 * Re-scan a project: detect current packages, create a new snapshot, return updated env.
 */
ipcMain.handle('projects:scan', async (_, projectId) => {
  try {
    const result = await projectEnvHandler.scanProjectEnvironment(projectId);
    // Notify renderer to refresh all queries
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('trigger:auto-scan');
      mainWindow.webContents.send('projects:updated', { projectId });
    }
    return result;
  } catch (e) {
    log.error('ipc', `projects:scan error: ${e.message}`);
    throw e;
  }
});

/**
 * Get global systems with version enrichment.
 * Extends the existing environments with runtime version info.
 */
ipcMain.handle('globalSystems:get', async () => {
  try {
    const rawEnvs = dbHandler.getEnvironments();
    // Only return global system environments (not project or venv ones)
    const globals = rawEnvs.filter(e =>
      e.environmentCategory === 'global-system' ||
      !e.environmentCategory ||
      ['pip', 'npm', 'conda', 'java'].includes(e.type)
    );
    return await projectEnvHandler.enrichGlobalSystems(globals);
  } catch (e) {
    log.error('ipc', `globalSystems:get error: ${e.message}`);
    return dbHandler.getEnvironments();
  }
});

} // End of single instance block
