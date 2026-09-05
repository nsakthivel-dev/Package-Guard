/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Package Guard — CLI Installer Handler
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Manages system registration for the `pg` command-line tool so developers
 * can run `pg init`, `pg scan`, `pg status`, etc. directly from any terminal.
 *
 * On Windows:
 *   Installs `pg.cmd` shim into %LOCALAPPDATA%\Microsoft\WindowsApps (in PATH by default)
 *   and/or %APPDATA%\Package Guard\bin.
 *
 * On macOS / Linux:
 *   Installs `pg` shim into ~/.local/bin or /usr/local/bin.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const rp   = require('../runtimePaths');

/**
 * Returns candidate install directories in order of preference.
 */
function getTargetBinDirs() {
  const dirs = [];
  const isWin = process.platform === 'win32';

  if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const winAppsDir = path.join(localAppData, 'Microsoft', 'WindowsApps');
    if (fs.existsSync(winAppsDir)) {
      dirs.push(winAppsDir);
    }
    dirs.push(path.join(rp.dataRoot, 'bin'));
  } else {
    dirs.push(path.join(os.homedir(), '.local', 'bin'));
    dirs.push(path.join(rp.dataRoot, 'bin'));
    dirs.push('/usr/local/bin');
  }

  return dirs;
}

/**
 * Finds the absolute path to apps/cli/dist/index.js entrypoint.
 */
function getCliEntrypoint() {
  const isPackaged = process.mainModule?.filename?.includes('app.asar') ||
                     __dirname.includes('app.asar') ||
                     Boolean(process.resourcesPath && !process.resourcesPath.includes('node_modules'));

  if (isPackaged && process.resourcesPath) {
    const extraCli = path.join(path.dirname(process.resourcesPath), 'cli', 'index.js');
    if (fs.existsSync(extraCli)) return extraCli;

    const asarCliApps = path.join(process.resourcesPath, 'app.asar', 'apps', 'cli', 'dist', 'index.js');
    if (fs.existsSync(asarCliApps)) return asarCliApps;

    const unpackedCliApps = path.join(process.resourcesPath, 'app.asar.unpacked', 'apps', 'cli', 'dist', 'index.js');
    if (fs.existsSync(unpackedCliApps)) return unpackedCliApps;
  }

  // Development fallback paths
  const devCandidates = [
    path.resolve(__dirname, '..', '..', '..', 'apps', 'cli', 'dist', 'index.js'),
    path.resolve(__dirname, '..', '..', '..', '..', 'apps', 'cli', 'dist', 'index.js'),
    path.resolve(__dirname, '..', '..', 'cli', 'dist', 'index.js'),
  ];

  for (const candidate of devCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return devCandidates[0];
}

/**
 * Check if the CLI shim is currently installed.
 * @returns {string|null} Full path to installed shim if found, else null.
 */
function checkCLIInstalled() {
  const isWin = process.platform === 'win32';
  const targetDirs = getTargetBinDirs();

  for (const dir of targetDirs) {
    const shimPath = path.join(dir, isWin ? 'pg.cmd' : 'pg');
    if (fs.existsSync(shimPath)) {
      return shimPath;
    }
  }

  return null;
}

/**
 * Installs the CLI shim script for global `pg` command usage.
 * @returns {{ ok: boolean, installedAt?: string, error?: string }}
 */
function installCLI() {
  try {
    const isWin = process.platform === 'win32';
    const isPackaged = rp.isPortable || Boolean(process.resourcesPath && !process.resourcesPath.includes('node_modules'));
    const cliEntry = getCliEntrypoint();
    const targetDirs = getTargetBinDirs();
    const execPath = process.execPath;

    let targetDir = null;
    for (const dir of targetDirs) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        // Test write permissions
        const testFile = path.join(dir, `.test_write_${Date.now()}`);
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        targetDir = dir;
        break;
      } catch {
        continue;
      }
    }

    if (!targetDir) {
      return { ok: false, error: 'Could not find a writable directory in PATH to install the CLI shim.' };
    }

    if (isWin) {
      const cmdPath = path.join(targetDir, 'pg.cmd');
      let cmdContent;
      if (isPackaged) {
        cmdContent = `@echo off\r\nsetlocal\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"${execPath}" "${cliEntry}" %*\r\n`;
      } else {
        cmdContent = `@echo off\r\nsetlocal\r\nnode "${cliEntry}" %*\r\n`;
      }
      fs.writeFileSync(cmdPath, cmdContent, 'utf8');

      return { ok: true, installedAt: cmdPath };
    } else {
      const shPath = path.join(targetDir, 'pg');
      let shContent;
      if (isPackaged) {
        shContent = `#!/usr/bin/env bash\nexport ELECTRON_RUN_AS_NODE=1\nexec "${execPath}" "${cliEntry}" "$@"\n`;
      } else {
        shContent = `#!/usr/bin/env bash\nexec node "${cliEntry}" "$@"\n`;
      }
      fs.writeFileSync(shPath, shContent, { encoding: 'utf8', mode: 0o755 });
      try {
        fs.chmodSync(shPath, 0o755);
      } catch { /* ignore */ }

      return { ok: true, installedAt: shPath };
    }
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Uninstalls the CLI shim script.
 * @returns {{ ok: boolean, removed?: string, already?: boolean, error?: string }}
 */
function uninstallCLI() {
  try {
    const isWin = process.platform === 'win32';
    const targetDirs = getTargetBinDirs();
    let removedPath = null;

    for (const dir of targetDirs) {
      const shimNames = isWin ? ['pg.cmd', 'pg.bat', 'pg.ps1'] : ['pg'];
      for (const name of shimNames) {
        const shimPath = path.join(dir, name);
        if (fs.existsSync(shimPath)) {
          fs.unlinkSync(shimPath);
          removedPath = shimPath;
        }
      }
    }

    if (removedPath) {
      return { ok: true, removed: removedPath };
    } else {
      return { ok: true, already: true };
    }
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

module.exports = {
  checkCLIInstalled,
  installCLI,
  uninstallCLI,
  getCliEntrypoint
};
