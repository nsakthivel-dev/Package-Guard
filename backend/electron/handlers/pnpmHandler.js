/**
 * pnpmHandler.js
 *
 * Handles all pnpm operations for PackageGuard:
 *   - Resolving the pnpm executable (handles .cmd, .exe, PATH lookup on Windows)
 *   - Getting the installed pnpm version
 *   - Listing globally installed pnpm packages
 *   - Adding / removing packages in a project directory
 *
 * Windows notes:
 *   pnpm is typically installed as one of:
 *     %APPDATA%\npm\pnpm.cmd          (installed via npm i -g pnpm)
 *     %LOCALAPPDATA%\pnpm\pnpm.exe    (standalone installer)
 *     Corepack-managed shimq in the Node.js bin directory
 *   We resolve through PATH first (via `where pnpm`) to handle all cases.
 */

const { spawn } = require('child_process');
const { exec }  = require('child_process');
const util  = require('util');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');

const execPromise = util.promisify(exec);

// ─── Executable resolution ────────────────────────────────────────────────────

/**
 * Resolve the pnpm executable on the current platform.
 * Returns the first working path found, or null if pnpm is not installed.
 *
 * Resolution order:
 *   1. `where pnpm` (Windows) / `which pnpm` (Unix) — covers PATH installs
 *   2. Well-known Windows locations (%LOCALAPPDATA%\pnpm, %APPDATA%\npm)
 *   3. Corepack shim next to node.exe
 */
async function resolvePnpmExecutable() {
  const isWin = process.platform === 'win32';
  const whereCmd = isWin ? 'where' : 'which';

  // Strategy 1: PATH lookup
  try {
    const { stdout } = await execPromise(`${whereCmd} pnpm`);
    const lines = stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (fs.existsSync(line)) {
        console.log(`[pnpmHandler] Found pnpm via PATH: ${line}`);
        return line;
      }
    }
  } catch { /* not on PATH */ }

  if (isWin) {
    // Strategy 2: well-known Windows locations
    const candidates = [
      path.join(process.env.LOCALAPPDATA || '', 'pnpm', 'pnpm.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'pnpm', 'pnpm.cmd'),
      path.join(process.env.APPDATA || '', 'npm', 'pnpm.cmd'),
      path.join(process.env.APPDATA || '', 'npm', 'pnpm'),
    ];

    // Strategy 3: Corepack shim next to node.exe
    try {
      const { stdout: nodePath } = await execPromise('where node');
      const nodeDir = path.dirname(nodePath.trim().split(/\r?\n/)[0]);
      candidates.push(
        path.join(nodeDir, 'pnpm.cmd'),
        path.join(nodeDir, 'pnpm.exe'),
        path.join(nodeDir, 'pnpm'),
      );
    } catch { /* ignore */ }

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        console.log(`[pnpmHandler] Found pnpm at known location: ${c}`);
        return c;
      }
    }
  }

  console.log('[pnpmHandler] pnpm not found');
  return null;
}

// ─── Safe spawn helper ────────────────────────────────────────────────────────

function safeSpawn(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      shell: process.platform === 'win32',
      windowsHide: true,
      env: process.env,
      ...options,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code }));
    child.on('error', err => resolve({ stdout: '', stderr: err.message, code: -1 }));
  });
}

// ─── Version ──────────────────────────────────────────────────────────────────

/**
 * Get the installed pnpm version string (e.g. "10.14.0").
 * Returns null if pnpm is not installed.
 */
async function getVersion() {
  const exe = await resolvePnpmExecutable();
  if (!exe) return null;
  const { stdout, code } = await safeSpawn(exe, ['--version']);
  if (code !== 0 || !stdout) return null;
  const ver = stdout.trim();
  console.log(`[pnpmHandler] pnpm version: ${ver}`);
  return ver;
}

// ─── List global packages ─────────────────────────────────────────────────────

/**
 * List globally installed pnpm packages.
 * Uses `pnpm list -g --json --depth=0`.
 *
 * Returns an array of { name, version } objects, or [] on failure.
 */
async function listPackages(envPath) {
  const exe = await resolvePnpmExecutable();
  if (!exe) {
    console.warn('[pnpmHandler] Cannot list packages — pnpm not found');
    return [];
  }

  const isGlobal = !envPath || envPath === 'pnpm';
  const args = isGlobal
    ? ['list', '-g', '--json', '--depth=0']
    : ['list', '--json', '--depth=0'];

  let cwd;
  if (!isGlobal && envPath) {
    try {
      if (fs.existsSync(envPath) && fs.lstatSync(envPath).isDirectory()) {
        cwd = envPath;
      } else if (fs.existsSync(envPath)) {
        cwd = path.dirname(envPath);
      }
    } catch { /* ignore */ }
  }

  console.log(`[pnpmHandler] ${exe} ${args.join(' ')}${cwd ? ` (cwd: ${cwd})` : ''}`);

  const { stdout, stderr, code } = await safeSpawn(exe, args, {
    cwd: cwd && fs.existsSync(cwd) ? cwd : undefined,
  });

  if (code !== 0) {
    console.warn('[pnpmHandler] pnpm list failed:', stderr || stdout);
    return [];
  }

  try {
    // pnpm list --json returns an array of objects (one per workspace)
    const parsed = JSON.parse(stdout || '[]');
    const packages = [];

    // Handle both array and single object shapes
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of entries) {
      const deps = entry.dependencies || {};
      for (const [name, info] of Object.entries(deps)) {
        packages.push({ name, version: info.version || 'unknown' });
      }
    }

    console.log(`[pnpmHandler] Found ${packages.length} global packages`);
    return packages;
  } catch (e) {
    console.warn('[pnpmHandler] Failed to parse pnpm list output:', e.message);
    return [];
  }
}

// ─── Add / install a package ──────────────────────────────────────────────────

/**
 * Install or update a package using pnpm.
 * - If envPath is a project directory, runs `pnpm add <pkg>` in that directory.
 * - If envPath is null/'pnpm', runs `pnpm add -g <pkg>`.
 */
async function updatePnpmPackage(packageName, targetVersion, envPath, onProgress) {
  const exe = await resolvePnpmExecutable();
  if (!exe) {
    return { success: false, package: packageName, error: 'pnpm executable not found' };
  }

  const pkg = targetVersion ? `${packageName}@${targetVersion}` : packageName;
  const isGlobal = !envPath || envPath === 'pnpm';
  const args = isGlobal ? ['add', '-g', pkg] : ['add', pkg];

  let cwd;
  if (!isGlobal) {
    try {
      cwd = fs.existsSync(envPath) && fs.lstatSync(envPath).isDirectory()
        ? envPath
        : fs.existsSync(envPath) ? path.dirname(envPath) : os.homedir();
    } catch { cwd = os.homedir(); }
  } else {
    cwd = os.homedir();
  }

  console.log(`[pnpmHandler] ${exe} ${args.join(' ')} (cwd: ${cwd})`);

  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      cwd: cwd && fs.existsSync(cwd) ? cwd : undefined,
      shell: process.platform === 'win32',
      windowsHide: true,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => {
      const raw = d.toString();
      stdout += raw;
      if (onProgress) onProgress({ status: 'installing', message: raw.trim() });
    });
    child.stderr.on('data', d => {
      const raw = d.toString();
      stderr += raw;
      if (onProgress) onProgress({ status: 'installing', message: raw.trim() });
    });
    child.on('close', code => {
      console.log(`[pnpmHandler] add ${packageName} → exit ${code}`);
      if (code === 0) {
        resolve({ success: true, package: packageName });
      } else {
        resolve({ success: false, package: packageName, error: stderr || stdout });
      }
    });
    child.on('error', err => {
      resolve({ success: false, package: packageName, error: err.message });
    });
  });
}

// ─── Remove / uninstall a package ─────────────────────────────────────────────

async function deletePnpmPackage(packageName, envPath) {
  const exe = await resolvePnpmExecutable();
  if (!exe) {
    return { success: false, package: packageName, error: 'pnpm executable not found' };
  }

  const isGlobal = !envPath || envPath === 'pnpm';
  const args = isGlobal ? ['remove', '-g', packageName] : ['remove', packageName];

  let cwd;
  if (!isGlobal) {
    try {
      cwd = fs.existsSync(envPath) && fs.lstatSync(envPath).isDirectory()
        ? envPath
        : fs.existsSync(envPath) ? path.dirname(envPath) : os.homedir();
    } catch { cwd = os.homedir(); }
  } else {
    cwd = os.homedir();
  }

  console.log(`[pnpmHandler] ${exe} ${args.join(' ')}`);

  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      cwd: cwd && fs.existsSync(cwd) ? cwd : undefined,
      shell: process.platform === 'win32',
      windowsHide: true,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => {
      resolve(code === 0
        ? { success: true, package: packageName }
        : { success: false, package: packageName, error: stderr || stdout });
    });
    child.on('error', err => {
      resolve({ success: false, package: packageName, error: err.message });
    });
  });
}

module.exports = {
  resolvePnpmExecutable,
  getVersion,
  listPackages,
  updatePnpmPackage,
  deletePnpmPackage,
};
