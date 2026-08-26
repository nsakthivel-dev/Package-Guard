const { spawn } = require('child_process'); 
const { exec } = require('child_process'); 
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path'); 
const fs = require('fs'); 

// Robust Python finder
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
      // Try with spawn as fallback - just check if it runs
      try {
        await new Promise((resolve, reject) => {
          const child = spawn(candidate, ['--version'], { windowsHide: true });
          child.on('close', (code) => {
            if (code === 0) resolve();
            else reject();
          });
          child.on('error', reject);
        });
        // If it runs, try to get its path with sys.executable
        try {
          const { stdout: execOut } = await execPromise(`${candidate} -c "import sys; print(sys.executable)"`);
          const exePath = execOut.trim();
          if (fs.existsSync(exePath)) return exePath;
        } catch {}
        return candidate;
      } catch {}
    }
  }
  return null;
}

function getPipCommand(envPath) { 
  if (!envPath) {
    return process.platform === 'win32' ? null : 'pip';
  }

  // If envPath is already a python or pip executable, return it
  if (typeof envPath === 'string' && (envPath.toLowerCase().endsWith('python.exe') || envPath.toLowerCase().endsWith('python') || envPath.toLowerCase().endsWith('pip.exe') || envPath.toLowerCase().endsWith('pip'))) {
    if (fs.existsSync(envPath)) return envPath;
  }

  try {
    if (fs.existsSync(envPath)) {
      const stats = fs.lstatSync(envPath);
      
      if (stats.isFile()) {
        const dir = path.dirname(envPath);
        const name = path.basename(envPath).toLowerCase();
        
        if (name.includes('python')) {
          const pipName = process.platform === 'win32' ? 'pip.exe' : 'pip';
          const pipSameDir = path.join(dir, pipName);
          if (fs.existsSync(pipSameDir)) return pipSameDir;
          return envPath;
        }
        
        if (name.includes('pip')) {
          return envPath;
        }
      } else if (stats.isDirectory()) {
        // Check standard venv structures
        const binDirs = process.platform === 'win32' ? ['Scripts', 'bin'] : ['bin', 'Scripts'];
        const pipNames = process.platform === 'win32' ? ['pip.exe', 'pip'] : ['pip', 'pip3'];
        const pythonNames = process.platform === 'win32' ? ['python.exe', 'python'] : ['python3', 'python'];

        for (const binDir of binDirs) {
          for (const pipName of pipNames) {
            const pipPath = path.join(envPath, binDir, pipName);
            if (fs.existsSync(pipPath)) return pipPath;
          }
          for (const pythonName of pythonNames) {
            const pythonPath = path.join(envPath, binDir, pythonName);
            if (fs.existsSync(pythonPath)) return pythonPath;
          }
        }

        // Fallback for conda-like or flat structures
        for (const pipName of pipNames) {
          const flatPip = path.join(envPath, pipName);
          if (fs.existsSync(flatPip)) return flatPip;
        }
        for (const pythonName of pythonNames) {
          const flatPython = path.join(envPath, pythonName);
          if (fs.existsSync(flatPython)) return flatPython;
        }
      }
    }
  } catch (e) {
    console.error(`[PIP CMD RESOLVE ERROR] ${e.message}`);
  }

  // If we couldn't find a specific pip/python in the provided path, return null
  return null;
} 

async function updatePackage(packageName, targetVersion, envPath, onProgress) { 
  return new Promise(async (resolve) => { 
    let resolvedPath = getPipCommand(envPath); 

    // If envPath is provided but invalid (and it looks like global env), try findPython()
    if (!resolvedPath && envPath) {
      const isOldGlobalPath = envPath.includes('Python314') || !fs.existsSync(envPath);
      if (isOldGlobalPath) {
        console.log('[PIP UPDATE] Old/invalid global path detected, finding Python...');
        resolvedPath = await findPython();
      }
    }

    let command; 
    let args; 

    const isPip = resolvedPath && (resolvedPath.toLowerCase().endsWith('pip.exe') || resolvedPath.toLowerCase().endsWith('pip'));

    if (resolvedPath) {
      command = resolvedPath;
      args = isPip ? ['install', '--upgrade'] : ['-m', 'pip', 'install', '--upgrade'];
    } else if (!envPath) {
      command = process.platform === 'win32' ? 'python' : 'python3';
      args = ['-m', 'pip', 'install', '--upgrade'];
    } else {
      console.error(`[PIP UPDATE] Could not find python/pip in ${envPath}.`);
      resolve({ success: false, package: packageName, error: `Could not find Python environment at ${envPath}` });
      return;
    }

    // Add package with specific version if provided 
    if (targetVersion) { 
      args.push(`${packageName}==${targetVersion}`); 
    } else { 
      args.push(packageName); 
    } 

    console.log(`[PIP CMD] "${command}" ${args.join(' ')}`); 

    const child = spawn(command, args, { 
      shell: process.platform === 'win32',  
      windowsHide: true,
      cwd: (envPath && fs.existsSync(envPath) && fs.lstatSync(envPath).isDirectory()) 
        ? envPath 
        : (envPath && fs.existsSync(envPath) ? path.dirname(envPath) : undefined)
    }); 

    // On Windows, if spawn fails without shell, it might be because the command needs shell
    child.on('error', (err) => {
      console.error(`[PIP SPAWN ERROR] ${err.message}`);
    });
    let stdout = ''; 
    let stderr = ''; 

    child.stdout.on('data', (data) => { 
      const raw = data.toString();
      stdout += raw; 
      if (onProgress) { 
        const progress = parsePipOutput(raw);
        onProgress({ status: 'installing', ...progress, message: raw.trim() }); 
      } 
    }); 

    child.stderr.on('data', (data) => { 
      const raw = data.toString();
      stderr += raw; 
      if (onProgress) { 
        const progress = parsePipOutput(raw);
        onProgress({ status: 'installing', ...progress, message: raw.trim() }); 
      } 
    }); 

    child.on('close', (code) => { 
      console.log(`[PIP EXIT] ${packageName} → code ${code}`); 

      if (code === 0) { 
        resolve({ 
          success: true, 
          package: packageName, 
          output: stdout || stderr 
        }); 
      } else { 
        // Parse a clean error message from stderr 
        const cleanError = parseErrorMessage(stderr || stdout); 
        resolve({ 
          success: false, 
          package: packageName, 
          error: cleanError 
        }); 
      } 
    }); 

    child.on('error', (err) => { 
      console.error(`[PIP SPAWN ERROR] ${err.message}`); 

      // If 'python' not found, try 'python3' 
      if (err.code === 'ENOENT' && command === 'python') { 
        console.log('[PIP RETRY] Trying python3...'); 
        retryWithPython3(packageName, targetVersion, args, onProgress, resolve); 
      } else { 
        resolve({ 
          success: false, 
          package: packageName, 
          error: `Could not start pip: ${err.message}` 
        }); 
      } 
    }); 
  }); 
} 

function retryWithPython3(packageName, targetVersion, originalArgs, onProgress, resolve) { 
  const args = ['-m', 'pip', 'install', '--upgrade']; 
  if (targetVersion) { 
    args.push(`${packageName}==${targetVersion}`); 
  } else { 
    args.push(packageName); 
  } 

  const child = spawn('python3', args, { shell: true, windowsHide: true }); 
  let stderr = ''; 

  child.stderr.on('data', (d) => { stderr += d.toString(); }); 
  child.stdout.on('data', (d) => { 
    if (onProgress) onProgress({ status: 'installing', message: d.toString().trim() }); 
  }); 

  child.on('close', (code) => { 
    resolve( 
      code === 0 
        ? { success: true, package: packageName } 
        : { success: false, package: packageName, error: parseErrorMessage(stderr) } 
    ); 
  }); 

  child.on('error', () => { 
    resolve({ 
      success: false, 
      package: packageName, 
      error: 'Python not found. Please ensure Python is installed and added to PATH.' 
    }); 
  }); 
} 

function parseErrorMessage(raw) { 
  if (!raw) return 'Unknown error occurred'; 

  // Extract meaningful pip error lines only 
  const lines = raw.split('\n').filter(l => l.trim()); 

  const errorLine = lines.find(l => 
    l.includes('ERROR:') || 
    l.includes('error:') || 
    l.includes('No matching distribution') || 
    l.includes('Could not find') || 
    l.includes('is not a supported wheel') 
  ); 

  if (errorLine) return errorLine.trim(); 

  // Return last 2 lines as fallback 
  return lines.slice(-2).join(' ').trim() || 'Update failed'; 
} 

async function deletePackage(packageName, envPath) {
  return new Promise(async (resolve) => {
    let resolvedPath = getPipCommand(envPath); 

    // If envPath is provided but invalid (and it looks like global env), try findPython()
    if (!resolvedPath && envPath) {
      const isOldGlobalPath = envPath.includes('Python314') || !fs.existsSync(envPath);
      if (isOldGlobalPath) {
        console.log('[PIP DELETE] Old/invalid global path detected, finding Python...');
        resolvedPath = await findPython();
      }
    }

    let command;
    let args;

    const isPip = resolvedPath && (resolvedPath.toLowerCase().endsWith('pip.exe') || resolvedPath.toLowerCase().endsWith('pip'));

    if (resolvedPath) {
      command = resolvedPath;
      args = isPip ? ['uninstall', '-y', packageName] : ['-m', 'pip', 'uninstall', '-y', packageName];
    } else if (!envPath) {
      command = process.platform === 'win32' ? 'python' : 'python3';
      args = ['-m', 'pip', 'uninstall', '-y', packageName];
    } else {
      console.error(`[PIP DELETE] Could not find python/pip in ${envPath}.`);
      resolve({ success: false, package: packageName, error: `Could not find Python environment at ${envPath}` });
      return;
    }

    console.log(`[PIP CMD] "${command}" ${args.join(' ')}`);

    const child = spawn(command, args, {
      shell: process.platform === 'win32',
      windowsHide: true,
      cwd: (envPath && fs.existsSync(envPath) && fs.lstatSync(envPath).isDirectory())
        ? envPath
        : (envPath && fs.existsSync(envPath) ? path.dirname(envPath) : undefined)
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, package: packageName });
      } else {
        resolve({ success: false, package: packageName, error: stderr || stdout });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, package: packageName, error: err.message });
    });
  });
}

function parsePipOutput(raw) {
  const result = {};
  
  // Try to find download info: "Downloading package-1.2.3-py3-none-any.whl (1.2 MB)"
  const downloadMatch = raw.match(/Downloading\s+.*?\((.*?)\)/);
  if (downloadMatch) {
    result.size = downloadMatch[1];
    result.step = 'downloading';
  }

  // Try to find install info: "Installing collected packages: package"
  if (raw.includes('Installing collected packages')) {
    result.step = 'installing';
  }

  // Try to find success info: "Successfully installed package-1.2.3"
  if (raw.includes('Successfully installed')) {
    result.step = 'complete';
  }

  return result;
}

async function getInstalledPackages(envPath) { 
  return new Promise(async (resolve) => { 
    let resolvedPath = getPipCommand(envPath); 

    // If envPath is provided but invalid (and it looks like global env), try findPython()
    if (!resolvedPath && envPath) {
      const isOldGlobalPath = envPath.includes('Python314') || !fs.existsSync(envPath);
      if (isOldGlobalPath) {
        console.log('[PIP LIST] Old/invalid global path detected, finding Python...');
        resolvedPath = await findPython();
      }
    }

    // Determine if we are using a specific pip/python or falling back to global
    const isPip = resolvedPath && (resolvedPath.toLowerCase().endsWith('pip.exe') || resolvedPath.toLowerCase().endsWith('pip'));
    
    // If envPath was provided but we couldn't resolve a path, we should NOT fall back to global 'python'
    // as that's likely not what the user wants if they specifically pointed to a venv.
    let command;
    if (resolvedPath) {
      command = resolvedPath;
    } else if (!envPath) {
      command = process.platform === 'win32' ? 'python' : 'python3';
    } else {
      console.warn(`[PIP LIST] Could not find python/pip in ${envPath}. Returning empty list to avoid global fallback.`);
      resolve([]);
      return;
    }

    const args = !isPip ? ['-m', 'pip', 'list', '--format=json'] : ['list', '--format=json']; 

    console.log(`[PIP LIST] Executing: "${command}" ${args.join(' ')} (envPath: ${envPath})`);

    const child = spawn(command, args, { 
      shell: process.platform === 'win32', 
      windowsHide: true,
      cwd: (envPath && fs.existsSync(envPath) && fs.lstatSync(envPath).isDirectory()) 
        ? envPath 
        : (envPath && fs.existsSync(envPath) ? path.dirname(envPath) : undefined)
    }); 
    let output = ''; 
    let stderr = '';

    child.stdout.on('data', (d) => { output += d.toString(); }); 
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    
    child.on('close', (code) => { 
      try { 
        if (code !== 0) {
          console.error('[PIP LIST FAIL]', stderr);
          resolve([]);
          return;
        }
        resolve(JSON.parse(output)); 
      } catch { 
        resolve([]); 
      } 
    }); 
    child.on('error', (err) => {
      console.error('[PIP LIST SPAWN ERROR]', err.message);
      resolve([]);
    }); 
  }); 
} 

module.exports = { updatePackage, deletePackage, getInstalledPackages, getPipCommand, listPackages: getInstalledPackages }; 
