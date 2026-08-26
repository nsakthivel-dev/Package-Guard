const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Robust helper to find Python executable
 */
async function findPython() {
  const candidates = process.platform === 'win32' 
    ? ['python.exe', 'python3.exe', 'python'] 
    : ['python3', 'python'];
  
  for (const candidate of candidates) {
    try {
      const whichCmd = process.platform === 'win32' ? 'where' : 'which';
      const { stdout } = await execPromise(`${whichCmd} ${candidate}`);
      const lines = stdout.trim().split('\n').map(l => l.trim()).filter(l => l);
      for (const line of lines) {
        if (fs.existsSync(line)) {
          return line;
        }
      }
    } catch (e) {
      // Try with spawn as fallback
      try {
        const { stdout: versionOut } = await safeExec(candidate, ['--version']);
        if (versionOut) {
          // If it runs, let's try to get the path
          try {
            // Try sys.executable via Python itself
            const { stdout: execOut } = await safeExec(candidate, ['-c', 'import sys; print(sys.executable)']);
            const exePath = execOut.trim();
            if (fs.existsSync(exePath)) {
              return exePath;
            }
          } catch {
            // If that fails, just return the candidate itself since it runs
            return candidate;
          }
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function scanVenvs(searchPath) {
  const venvs = [];
  try {
    const items = fs.readdirSync(searchPath);
    for (const item of items) {
      const fullPath = path.join(searchPath, item);
      if (fs.lstatSync(fullPath).isDirectory()) {
        const pythonPath = os.platform() === 'win32' 
          ? path.join(fullPath, 'Scripts', 'python.exe')
          : path.join(fullPath, 'bin', 'python');
        
        if (fs.existsSync(pythonPath)) {
          venvs.push({
            id: `venv-${Buffer.from(fullPath).toString('base64').slice(0, 8)}`,
            name: item,
            type: 'venv',
            path: pythonPath,
            environmentPath: pythonPath
          });
        }
      }
    }
  } catch (e) {}
  return venvs;
}

async function safeExec(cmd, args = []) {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      shell: process.platform === 'win32', 
      windowsHide: true 
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
    child.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, code: -1 });
    });
  });
}

// ─── Resolve a CLI tool via PATH then well-known Windows locations ─────────────
/**
 * Resolve a command-line tool executable.
 * Returns { found: true, execPath, version } or { found: false }.
 *
 * @param {string}   toolName      e.g. 'pnpm', 'yarn'
 * @param {string[]} winFallbacks  additional absolute paths to try on Windows
 * @param {string[]} versionArgs   args to pass to get the version string (default: ['--version'])
 */
async function resolveCliTool(toolName, winFallbacks = [], versionArgs = ['--version']) {
  const isWin = os.platform() === 'win32';
  const whereCmd = isWin ? 'where' : 'which';

  console.log(`[envScanner] Detecting ${toolName}...`);

  // 1. PATH lookup
  let execPath = null;
  try {
    const { stdout } = await safeExec(whereCmd, [toolName]);
    if (stdout) {
      const first = stdout.split(/\r?\n/)[0].trim();
      if (first && fs.existsSync(first)) {
        execPath = first;
      }
    }
  } catch { /* not on PATH */ }

  // 2. Windows fallback locations
  if (!execPath && isWin) {
    for (const candidate of winFallbacks) {
      if (candidate && fs.existsSync(candidate)) {
        execPath = candidate;
        break;
      }
    }
  }

  if (!execPath) {
    // 3. Last resort: just try running it directly (relies on shell PATH)
    const { stdout: ver, code } = await safeExec(toolName, versionArgs);
    if (code === 0 && ver) {
      console.log(`[envScanner] ${toolName} found via direct exec (PATH), version: ${ver.trim()}`);
      return { found: true, execPath: toolName, version: ver.trim() };
    }
    console.log(`[envScanner] ${toolName} not found`);
    return { found: false, execPath: null, version: null };
  }

  // Get version from the resolved executable
  const { stdout: verOut, code: verCode } = await safeExec(execPath, versionArgs);
  const version = verCode === 0 && verOut ? verOut.trim() : null;
  console.log(`[envScanner] ${toolName} found: ${execPath}  version: ${version}`);
  return { found: true, execPath, version };
}

module.exports = {
  scan: async () => {
    const results = [];

    console.log('[envScanner] Scanning global package managers and runtimes...');

    // ── 1. Global Python / pip ──────────────────────────────────────────────
    try {
      const pythonPath = await findPython();
      if (pythonPath) {
        console.log(`[envScanner] Python found: ${pythonPath}`);
        results.push({
          id: 'global-pip',
          name: 'Global Pip',
          type: 'pip',
          path: pythonPath,
          environmentPath: pythonPath,
        });
      } else {
        console.log('[envScanner] Python not found');
      }
    } catch (e) {
      console.warn('[envScanner] Failed to find global Python:', e.message);
    }

    // ── 2. Global npm ───────────────────────────────────────────────────────
    // Resolve npm executable path; also capture the npm version.
    {
      const npmWinFallbacks = [
        path.join(process.env.APPDATA || '', 'npm', 'npm.cmd'),
        path.join(process.env.ProgramFiles || '', 'nodejs', 'npm.cmd'),
      ];
      const { found, execPath, version } = await resolveCliTool('npm', npmWinFallbacks);
      if (found) {
        console.log(`[envScanner] npm found: ${execPath}  version: ${version}`);
        results.push({
          id: 'global-npm',
          name: 'Global NPM',
          type: 'npm',
          path: execPath || 'npm',
          environmentPath: execPath || null,
          version: version || null,
        });
      } else {
        console.log('[envScanner] npm not found');
      }
    }

    // ── 3. Global pnpm ──────────────────────────────────────────────────────
    // pnpm can be installed via:
    //   - npm i -g pnpm  → %APPDATA%\npm\pnpm.cmd
    //   - standalone installer → %LOCALAPPDATA%\pnpm\pnpm.exe
    //   - Corepack shim → next to node.exe
    {
      const pnpmWinFallbacks = [
        path.join(process.env.LOCALAPPDATA || '', 'pnpm', 'pnpm.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'pnpm', 'pnpm.cmd'),
        path.join(process.env.APPDATA || '', 'npm', 'pnpm.cmd'),
        path.join(process.env.APPDATA || '', 'npm', 'pnpm'),
      ];
      // Also check next to node.exe (Corepack)
      try {
        const { stdout: nodeWhere } = await safeExec('where', ['node']);
        if (nodeWhere) {
          const nodeDir = path.dirname(nodeWhere.split(/\r?\n/)[0].trim());
          pnpmWinFallbacks.push(
            path.join(nodeDir, 'pnpm.cmd'),
            path.join(nodeDir, 'pnpm.exe'),
          );
        }
      } catch { /* ignore */ }

      const { found, execPath, version } = await resolveCliTool('pnpm', pnpmWinFallbacks);
      if (found) {
        console.log(`[envScanner] pnpm found: ${execPath}  version: ${version}`);
        results.push({
          id: 'global-pnpm',
          name: 'Global PNPM',
          type: 'pnpm',
          path: execPath || 'pnpm',
          environmentPath: execPath || null,
          version: version || null,
        });
      } else {
        console.log('[envScanner] pnpm not found');
      }
    }

    // ── 4. Global yarn ──────────────────────────────────────────────────────
    // yarn can be installed via:
    //   - npm i -g yarn  → %APPDATA%\npm\yarn.cmd
    //   - Corepack shim  → next to node.exe
    //   - Standalone     → %LOCALAPPDATA%\Yarn\bin\yarn.cmd
    {
      const yarnWinFallbacks = [
        path.join(process.env.APPDATA || '', 'npm', 'yarn.cmd'),
        path.join(process.env.APPDATA || '', 'npm', 'yarn'),
        path.join(process.env.LOCALAPPDATA || '', 'Yarn', 'bin', 'yarn.cmd'),
        path.join(process.env.LOCALAPPDATA || '', 'Yarn', 'bin', 'yarn'),
      ];
      try {
        const { stdout: nodeWhere } = await safeExec('where', ['node']);
        if (nodeWhere) {
          const nodeDir = path.dirname(nodeWhere.split(/\r?\n/)[0].trim());
          yarnWinFallbacks.push(
            path.join(nodeDir, 'yarn.cmd'),
            path.join(nodeDir, 'yarn.exe'),
          );
        }
      } catch { /* ignore */ }

      const { found, execPath, version } = await resolveCliTool('yarn', yarnWinFallbacks);
      if (found) {
        console.log(`[envScanner] yarn found: ${execPath}  version: ${version}`);
        results.push({
          id: 'global-yarn',
          name: 'Global Yarn',
          type: 'yarn',
          path: execPath || 'yarn',
          environmentPath: execPath || null,
          version: version || null,
        });
      } else {
        console.log('[envScanner] yarn not found');
      }
    }

    // ── 5. Common venv locations ────────────────────────────────────────────
    // NEVER use process.cwd() here — only well-known, user-controlled paths.
    const commonPaths = [
      path.join(os.homedir(), '.virtualenvs'),
      path.join(os.homedir(), 'Envs'),
      path.join(os.homedir(), '.local', 'share', 'virtualenvs'),
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p) && fs.lstatSync(p).isDirectory()) {
        const found = await scanVenvs(p);
        results.push(...found);
      }
    }

    // ── 6. Conda environments ───────────────────────────────────────────────
    try {
      const { stdout } = await execPromise('conda env list --json');
      const data = JSON.parse(stdout);
      data.envs.forEach(envPath => {
        const name = path.basename(envPath);
        results.push({
          id: `conda-${Buffer.from(envPath).toString('base64').slice(0, 8)}`,
          name: name === envPath ? 'base' : name,
          type: 'conda',
          path: envPath,
          environmentPath: envPath,
        });
      });
    } catch { /* conda not installed */ }

    console.log(`[envScanner] Scan complete — found ${results.length} environment(s)`);
    return results;
  },
};
