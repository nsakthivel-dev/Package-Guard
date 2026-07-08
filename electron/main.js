const { app, BrowserWindow, ipcMain, Menu, dialog, Tray, nativeImage, Notification } = require('electron');
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  const path = require('path');
  const fs = require('fs');
  const { getIndexHtmlPath } = require('./paths');

  // Dev vs Prod detection
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  // Handlers
  const dbHandler = require('./handlers/dbHandler');
  const pipHandler = require('./handlers/pipHandler');
  const npmHandler = require('./handlers/npmHandler');
  const envScanner = require('./handlers/envScanner');
  const venvHandler = require('./handlers/venvHandler');

  let tray = null;
   let isQuitting = false;
   let backgroundScanInterval = null;
   let mainWindow;

   app.on('second-instance', () => {
     // Someone tried to run a second instance, we should focus our window.
     if (mainWindow && !mainWindow.isDestroyed()) {
       if (mainWindow.isMinimized()) mainWindow.restore();
       mainWindow.focus();
     } else {
       createWindow();
     }
   });

function createTray() {
  if (tray) return;
  // Simple blue shield icon (base64)
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5gMWEiE3C8v3AAAAXUlEQVQ4y2NgGAWjYBSMAtIAHxsDA8N/Bv6vDAwMf6A0K2EA2MCE/w0MDAz/oTTI6f8MDAz/IeIgA6B+gBr9H8YmXgOwGfSfgYEBpgaXAUz/Gf4j0yD7YBSAAtIAAI6EE6S7uX0mAAAAAElFTkSuQmCC');
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show PackageGuard', click: () => {
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
  tray.setToolTip('PackageGuard Security Suite');
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
      title: 'PackageGuard Security Update',
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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    title: 'PackageGuard',
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
    console.error('[MAIN] Failed to load window:', err);
    if (!app.isPackaged) {
      dialog.showErrorBox('PackageGuard — startup failed', String(err?.message || err));
    }
  });
}

async function loadMainWindow(win) {
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    console.log('[MAIN] Loading dev server:', devServerUrl);
    await win.loadURL(devServerUrl);
    return;
  }

  const indexPath = getIndexHtmlPath();
  console.log('[MAIN] Loading file:', indexPath);

  if (!fs.existsSync(indexPath)) {
    const message =
      'UI build not found. Run: pnpm run build:frontend\n\n' +
      'For development with hot reload, run: pnpm dev';
    console.error('[MAIN]', message);
    if (!app.isPackaged) {
      dialog.showErrorBox('PackageGuard — missing build', message);
    }
    return;
  }

  await win.loadFile(indexPath);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  createWindow();
  createTray();
  setupBackgroundScan();

  // On startup: Check if global-pip path is valid, if not, re-scan!
  const existingEnvs = dbHandler.getEnvironments();
  const globalPip = existingEnvs.find(e => e.id === 'global-pip');
  
  if (globalPip && (!globalPip.path || (typeof globalPip.path === 'string' && !fs.existsSync(globalPip.path)))) {
    console.log('[MAIN] Global pip path invalid, re-scanning for environments...');
    try {
      const freshEnvs = await envScanner.scan();
      for (const env of freshEnvs) {
        // Overwrite/update all environments
        dbHandler.insertEnvironment(env);
      }
      console.log('[MAIN] Environments updated successfully!');
    } catch (error) {
      console.error('[MAIN] Failed to scan environments on startup:', error);
    }
  }

  // Re-scan every 6 hours while app is open
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('trigger:auto-scan');
    }
  }, 6 * 60 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (backgroundScanInterval) {
    clearInterval(backgroundScanInterval);
    backgroundScanInterval = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
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
  const envs = dbHandler.getEnvironments();
  const venvs = dbHandler.getVenvs();
  const allPackages = [];
  
  for (const env of envs) {
    const pkgs = dbHandler.getPackages(env.id);
    allPackages.push(...pkgs);
  }

  // Also include venv packages if they are registered in the packages table
  // But wait, venv packages might not be in the packages table yet if they haven't been scanned.
  // The user wants "Total packages across all venvs" and "Outdated packages in venvs".
  
  // For now, let's just include environments count including venvs
  const totalEnvironments = envs.length + venvs.length;

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
    totalVenvs: venvs.length,
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
  const envs = dbHandler.getEnvironments();
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

  for (const pkg of packages) {
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
    if (pkg.ecosystem === 'npm') {
      result = await npmHandler.updateNpmPackage(
        pkg.name,
        pkg.targetVersion,
        envPath,
        (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('update:progress', {
              package: pkg.name,
              ...progress
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
              ...progress
            });
          }
        }
      );
    }
    
    // Optimistic refresh after each successful update in the batch
    if (result.success) {
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
        message: result.success ? 'Update complete' : result.error 
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
ipcMain.handle('snapshots:get', () => dbHandler.getSnapshots());
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
ipcMain.handle('snapshots:delete', (_, id) => dbHandler.deleteSnapshot(id));
ipcMain.handle('snapshots:restore', async (event, id) => {
  const snapshot = dbHandler.getSnapshots().find(s => s.id === id);
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
ipcMain.handle('history:get', (_, limit) => {
  return dbHandler.getHistory(limit);
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

} // End of single instance block
