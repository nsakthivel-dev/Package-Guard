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

module.exports = {
  scan: async () => {
    const results = [];
    
    // 1. Scan for global pip using robust findPython helper
    try {
      const pythonPath = await findPython();
      if (pythonPath) {
        results.push({ 
          id: 'global-pip', 
          name: 'Global Pip', 
          type: 'pip', 
          path: pythonPath, 
          environmentPath: pythonPath 
        });
      }
    } catch (e) {
      console.warn('[envScanner] Failed to find global Python:', e);
    }

    // 2. Scan for global npm
    try {
      const { stdout: npmPath } = await safeExec(os.platform() === 'win32' ? 'where' : 'which', ['npm']);
      if (npmPath) {
        const firstPath = npmPath.split('\n')[0].trim();
        results.push({ 
          id: 'global-npm', 
          name: 'Global NPM', 
          type: 'npm', 
          path: firstPath || 'npm', 
          environmentPath: firstPath || null 
        });
      }
    } catch (e) {
      const { stdout } = await safeExec('npm', ['--version']);
      if (stdout) {
        results.push({ id: 'global-npm', name: 'Global NPM', type: 'npm', path: 'npm', environmentPath: null });
      }
    }

    // 3. Scan common venv locations
    const commonPaths = [
      path.join(os.homedir(), '.virtualenvs'),
      path.join(process.cwd(), 'venv'),
      path.join(process.cwd(), '.venv'),
      path.join(process.cwd(), 'env'),
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        if (fs.lstatSync(p).isDirectory()) {
          const found = await scanVenvs(p);
          results.push(...found);
        }
      }
    }

    // 4. Scan for conda
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
          environmentPath: envPath
        });
      });
    } catch (e) {}

    return results;
  }
};
