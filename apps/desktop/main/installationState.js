/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Package Guardian — Installation State & Permission Manager
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Separates INSTALLATION / PERMISSION STATE from PERSISTENT APPLICATION DATA.
 *
 * Persistent User Data:
 *   %APPDATA%\PackageGuardian\data\package_guardian.db
 *   %APPDATA%\PackageGuardian\snapshots\
 *   (Projects, snapshots, history, environments, user preferences)
 *   -> ALWAYS PRESERVED across uninstalls and upgrades.
 *
 * Installation / Permission State:
 *   %APPDATA%\PackageGuardian\config\permissions.json
 *   $INSTDIR\install.ini
 *   -> Bound to the active installation identity.
 *   -> When Package Guardian is uninstalled, installation state is wiped.
 *   -> When reinstalled, a new installation identity is detected and permission
 *      resets to fresh-install state (null) so the user is prompted again.
 *   -> On normal upgrade, the installation identity is preserved, keeping
 *      the granted permission intact.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const rp = require('./runtimePaths');

const PERMISSIONS_FILE = path.join(rp.paths.config, 'permissions.json');

/**
 * Resolves the application installation directory ($INSTDIR).
 */
function resolveInstallDir() {
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) {
      // In packaged electron app, process.execPath is in $INSTDIR
      return path.dirname(process.execPath);
    }
    if (process.resourcesPath && !process.resourcesPath.includes('node_modules')) {
      return path.dirname(process.resourcesPath);
    }
  } catch { /* ignore */ }

  // Fallback for dev mode
  return path.resolve(__dirname, '../../..');
}

/**
 * Gets or creates the installation identity from install.ini in $INSTDIR.
 * If $INSTDIR is read-only or in dev mode, falls back to a machine/location identity.
 */
function getInstallationId() {
  const installDir = resolveInstallDir();
  const installIniPath = path.join(installDir, 'install.ini');

  // Check if install.ini exists in installDir (written by NSIS installer)
  if (fs.existsSync(installIniPath)) {
    try {
      const content = fs.readFileSync(installIniPath, 'utf8');
      const match = content.match(/InstallationId\s*=\s*(.+)/i) ||
                    content.match(/Id\s*=\s*(.+)/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    } catch { /* ignore read errors */ }
  }

  // Also check AppData install.ini as secondary check
  const appDataIni = path.join(rp.dataRoot, 'install.ini');
  if (fs.existsSync(appDataIni)) {
    try {
      const content = fs.readFileSync(appDataIni, 'utf8');
      const match = content.match(/InstallationId\s*=\s*(.+)/i) ||
                    content.match(/Id\s*=\s*(.+)/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    } catch { /* ignore */ }
  }

  // If packaged and writable, generate and persist installationId
  if (rp.isPortable) {
    const newId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    try {
      const iniContent = `[Installation]\nInstallationId=${newId}\nInstalledAtTime=${new Date().toISOString()}\n`;
      try {
        fs.writeFileSync(installIniPath, iniContent, 'utf8');
        return newId;
      } catch {
        // Fallback to writing in appData config directory
        const fallbackFile = path.join(rp.paths.config, '.install_id');
        if (!fs.existsSync(fallbackFile)) {
          fs.writeFileSync(fallbackFile, newId, 'utf8');
        }
        return fs.readFileSync(fallbackFile, 'utf8').trim();
      }
    } catch { /* ignore */ }
    return newId;
  }

  // Development mode: return a stable dev installation identity
  return 'dev-environment-installation-id';
}

/**
 * Reads the permission state from permissions.json, validating it
 * against the current installation ID.
 */
function getPermissionState() {
  const currentInstallId = getInstallationId();

  if (!fs.existsSync(PERMISSIONS_FILE)) {
    return {
      installationId: currentInstallId,
      backgroundPermission: null,
      dontAskAgain: false
    };
  }

  try {
    const raw = fs.readFileSync(PERMISSIONS_FILE, 'utf8');
    const data = JSON.parse(raw);

    // If permissions belong to a previous installation that was replaced/reinstalled:
    if (data.installationId && data.installationId !== currentInstallId) {
      console.log('[PERMISSIONS] Detected new installation identity. Resetting permission state to fresh install.');
      resetPermissionState();
      return {
        installationId: currentInstallId,
        backgroundPermission: null,
        dontAskAgain: false
      };
    }

    return {
      installationId: currentInstallId,
      backgroundPermission: data.backgroundPermission !== undefined ? data.backgroundPermission : null,
      dontAskAgain: Boolean(data.dontAskAgain),
      grantedAt: data.grantedAt || null
    };
  } catch (err) {
    console.error('[PERMISSIONS] Error reading permissions.json:', err.message);
    return {
      installationId: currentInstallId,
      backgroundPermission: null,
      dontAskAgain: false
    };
  }
}

/**
 * Saves permission state bound to current installation ID.
 */
function setPermissionState({ backgroundPermission, dontAskAgain }) {
  const currentInstallId = getInstallationId();
  try {
    fs.mkdirSync(rp.paths.config, { recursive: true });
    const payload = {
      installationId: currentInstallId,
      backgroundPermission: backgroundPermission !== undefined ? backgroundPermission : null,
      dontAskAgain: Boolean(dontAskAgain),
      updatedAt: new Date().toISOString()
    };
    if (backgroundPermission === true) {
      payload.grantedAt = new Date().toISOString();
    }

    fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(payload, null, 2), 'utf8');
    return payload;
  } catch (err) {
    console.error('[PERMISSIONS] Error saving permissions.json:', err.message);
    return {
      installationId: currentInstallId,
      backgroundPermission,
      dontAskAgain
    };
  }
}

/**
 * Resets permission state completely (e.g. during clean uninstall).
 */
function resetPermissionState() {
  try {
    if (fs.existsSync(PERMISSIONS_FILE)) {
      fs.unlinkSync(PERMISSIONS_FILE);
    }
  } catch { /* ignore */ }

  // Also remove .first_launch_done so app behaves as fresh install
  try {
    const sentinel = path.join(rp.paths.config, '.first_launch_done');
    if (fs.existsSync(sentinel)) {
      fs.unlinkSync(sentinel);
    }
  } catch { /* ignore */ }
}

module.exports = {
  getInstallationId,
  getPermissionState,
  setPermissionState,
  resetPermissionState,
  PERMISSIONS_FILE,
  resolveInstallDir
};
