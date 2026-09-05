/**
 * yarnHandler.js
 *
 * Handles all Yarn operations for PackageGuard:
 *   - Resolving the yarn executable (handles .cmd, .exe, Corepack on Windows)
 *   - Getting the installed yarn version (classic v1 and berry v2+)
 *   - Listing globally installed yarn packages (classic only; berry has no globals)
 *   - Adding / removing packages in a project directory
 *
 * Windows notes:
 *   Yarn classic (v1) is typically at:
 *     %APPDATA%\npm\yarn.cmd      (npm global install)
 *     %LOCALAPPDATA%\Yarn\bin\yarn
 *   Yarn Berry (v2+) is typically Corepack-managed:
 *     Next to node.exe as yarn.cmd / yarn
 */

const { spawn } = require('child_process');
const { exec }  = require('child_process');
const util  = require('util');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');

const execPromise = util.promisify(exec);

// ─── Executable resolution ────────────────────────────────────────────────────

async function resolveYarnExecutable() {
  const isWin = process.platform === 'win32';
  const whereCmd = isWin ? 'where' : 'which';

  // Strategy 1: PATH lookup
  try {
    const { stdout } = await execPromise(`${whereCmd} yarn`);
    const lines = stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (fs.existsSync(line)) {
        console.log(`[yarnHandler] Found yarn via PATH: ${line}`);
        return line;
      }
    }
  } catch { /* not on PATH */ }

  if (isWin) {
    const candidates = [
      path.join(process.env.APPDATA || '', 'npm', 'yarn.cmd'),
      path.join(process.env.APPDATA || '', 'npm', 'yarn'),
      path.join(process.env.LOCALAPPDATA || '', 'Yarn', 'bin', 'yarn.cmd'),
      path.join(process.env.LOCALAPPDATA || '', 'Yarn', 'bin', 'yarn'),
    ];

    // Corepack shim next to node.exe
    try {
      const { stdout: nodePath } = await execPromise('where node');
      const nodeDir = path.dirname(nodePath.trim().split(/\r?\n/)[0]);
      candidates.push(
        path.join(nodeDir, 'yarn.cmd'),
        path.join(nodeDir, 'yarn.exe'),
        path.join(nodeDir, 'yarn'),
      );
    } catch { /* ignore */ }

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        console.log(`[yarnHandler] Found yarn at known location: ${c}`);
        return c;
      }
    }
  }

  console.log('[yarnHandler] yarn not found');
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

async function getVersion() {
  const exe = await resolveYarnExecutable();
  if (!exe) return null;
  const { stdout, code } = await safeSpawn(exe, ['--version']);
  if (code !== 0 || !stdout) return null;
  const ver = stdout.trim();
  console.log(`[yarnHandler] yarn version: ${ver}`);
  return ver;
}

/**
 * Returns true if this is Yarn Berry (v2+), which uses a different CLI.
 */
async function isBerry(exe) {
  const { stdout } = await safeSpawn(exe, ['--version']);
  const ver = stdout.trim();
  const major = parseInt(ver.split('.')[0], 10);
  return major >= 2;
}

// ─── List global packages ─────────────────────────────────────────────────────

/**
 * List globally installed yarn packages.
 *
 * Yarn classic (v1): `yarn global list --json`
 * Yarn Berry (v2+): no global package concept — returns [] with a note.
 *
 * Returns an array of { name, version } objects.
 */
async function listPackages(envPath) {
  const exe = await resolveYarnExecutable();
  if (!exe) {
    console.warn('[yarnHandler] Cannot list packages — yarn not found');
    return [];
  }

  const isGlobal = !envPath || envPath === 'yarn';

  if (isGlobal) {
    // Check if Berry — Berry has no global packages
    try {
      const berry = await isBerry(exe);
      if (berry) {
        console.log('[yarnHandler] Yarn Berry detected — no global packages concept');
        return [];
      }
    } catch { /* ignore, assume classic */ }

    // Yarn classic: list global packages
    const { stdout, stderr, code } = await safeSpawn(exe, ['global', 'list', '--json']);
    if (code !== 0) {
      console.warn('[yarnHandler] yarn global list failed:', stderr || stdout);
      return [];
    }

    const packages = [];
    // yarn --json outputs one JSON object per line (ndjson)
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        // Look for the "info" type line containing the trees
        if (obj.type === 'tree' && Array.isArray(obj.data?.trees)) {
          for (const node of obj.data.trees) {
            const m = (node.name || '').match(/^([^@]+)@(.+)$/);
            if (m) packages.push({ name: m[1], version: m[2] });
          }
        }
      } catch { /* skip malformed lines */ }
    }

    console.log(`[yarnHandler] Found ${packages.length} global packages`);
    return packages;
  }

  // Project-scoped list
  let cwd;
  try {
    cwd = fs.existsSync(envPath) && fs.lstatSync(envPath).isDirectory()
      ? envPath
      : fs.existsSync(envPath) ? path.dirname(envPath) : undefined;
  } catch { /* ignore */ }

  const { stdout, code } = await safeSpawn(exe, ['list', '--json'], {
    cwd: cwd && fs.existsSync(cwd) ? cwd : undefined,
  });
  if (code !== 0) return [];

  const packages = [];
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'tree' && Array.isArray(obj.data?.trees)) {
        for (const node of obj.data.trees) {
          const m = (node.name || '').match(/^([^@]+)@(.+)$/);
          if (m) packages.push({ name: m[1], version: m[2] });
        }
      }
    } catch { /* skip */ }
  }
  return packages;
}

// ─── Add / install a package ──────────────────────────────────────────────────

async function updateYarnPackage(packageName, targetVersion, envPath, onProgress) {
  const exe = await resolveYarnExecutable();
  if (!exe) {
    return { success: false, package: packageName, error: 'yarn executable not found' };
  }

  const pkg = targetVersion ? `${packageName}@${targetVersion}` : packageName;
  const isGlobal = !envPath || envPath === 'yarn';

  let args;
  let cwd;

  if (isGlobal) {
    // Yarn classic: yarn global add; Berry: yarn dlx (but we skip Berry global ops)
    try {
      const berry = await isBerry(exe);
      if (berry) {
        return { success: false, package: packageName, error: 'Yarn Berry does not support global package installation' };
      }
    } catch { /* assume classic */ }
    args = ['global', 'add', pkg];
    cwd = os.homedir();
  } else {
    args = ['add', pkg];
    try {
      cwd = fs.existsSync(envPath) && fs.lstatSync(envPath).isDirectory()
        ? envPath
        : fs.existsSync(envPath) ? path.dirname(envPath) : os.homedir();
    } catch { cwd = os.homedir(); }
  }

  console.log(`[yarnHandler] ${exe} ${args.join(' ')} (cwd: ${cwd})`);

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
      console.log(`[yarnHandler] add ${packageName} → exit ${code}`);
      resolve(code === 0
        ? { success: true, package: packageName }
        : { success: false, package: packageName, error: stderr || stdout });
    });
    child.on('error', err => {
      resolve({ success: false, package: packageName, error: err.message });
    });
  });
}

// ─── Remove / uninstall a package ─────────────────────────────────────────────

async function deleteYarnPackage(packageName, envPath) {
  const exe = await resolveYarnExecutable();
  if (!exe) {
    return { success: false, package: packageName, error: 'yarn executable not found' };
  }

  const isGlobal = !envPath || envPath === 'yarn';
  const args = isGlobal ? ['global', 'remove', packageName] : ['remove', packageName];

  let cwd;
  if (!isGlobal) {
    try {
      cwd = fs.existsSync(envPath) && fs.lstatSync(envPath).isDirectory()
        ? envPath
        : fs.existsSync(envPath) ? path.dirname(envPath) : os.homedir();
    } catch { cwd = os.homedir(); }
  }

  console.log(`[yarnHandler] ${exe} ${args.join(' ')}`);

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
  resolveYarnExecutable,
  getVersion,
  listPackages,
  updateYarnPackage,
  deleteYarnPackage,
};
