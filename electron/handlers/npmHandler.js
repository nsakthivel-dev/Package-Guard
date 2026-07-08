const { spawn } = require('child_process'); 
const path = require('path'); 

async function updateNpmPackage(packageName, targetVersion, envPath, onProgress) { 
  return new Promise((resolve) => { 
    const pkg = targetVersion ? `${packageName}@${targetVersion}` : packageName; 

    let args;
    let cwd = process.cwd();

    if (envPath && envPath !== 'npm') {
      // Local install in environment
      args = ['install', pkg];
      cwd = envPath;
    } else {
      // Global npm install 
      args = ['install', '-g', pkg]; 
    }

    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    console.log(`[NPM CMD] ${npmCmd} ${args.join(' ')} (cwd: ${cwd})`); 

    const child = spawn(npmCmd, args, { 
      cwd: (cwd && fs.existsSync(cwd)) ? cwd : undefined,
      shell: process.platform === 'win32', 
      windowsHide: true,
      env: process.env
    }); 

    let stdout = ''; 
    let stderr = ''; 

    child.stdout.on('data', (d) => { 
      const raw = d.toString();
      stdout += raw; 
      console.log(`[NPM STDOUT] ${raw.trim()}`); 
      if (onProgress) {
        const progress = parseNpmOutput(raw);
        onProgress({ status: 'installing', ...progress, message: raw.trim() }); 
      }
    }); 

    child.stderr.on('data', (d) => { 
      const raw = d.toString();
      stderr += raw; 
      console.log(`[NPM STDERR] ${raw.trim()}`); 
      if (onProgress) {
        const progress = parseNpmOutput(raw);
        onProgress({ status: 'installing', ...progress, message: raw.trim() }); 
      }
    }); 

    child.on('close', (code) => { 
      console.log(`[NPM EXIT] ${packageName} → code ${code}`); 
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

async function deleteNpmPackage(packageName, envPath) {
  return new Promise((resolve) => {
    let args;
    let cwd = process.cwd();

    if (envPath && envPath !== 'npm') {
      args = ['uninstall', packageName];
      cwd = envPath;
    } else {
      args = ['uninstall', '-g', packageName];
    }

    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    console.log(`[NPM CMD] ${npmCmd} ${args.join(' ')} (cwd: ${cwd})`);

    const child = spawn(npmCmd, args, {
      cwd: (cwd && fs.existsSync(cwd)) ? cwd : undefined,
      shell: process.platform === 'win32',
      windowsHide: true,
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

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

function parseNpmOutput(raw) {
  const result = {};
  
  if (raw.includes('added') || raw.includes('updated')) {
    result.step = 'complete';
  } else if (raw.includes('audit')) {
    result.step = 'auditing';
  } else if (raw.includes('reify')) {
    result.step = 'installing';
  }

  return result;
}

async function listPackages(envPath) {
  const { spawn } = require('child_process');
  const fs = require('fs');

  return new Promise((resolve) => {
    // If envPath is the npm executable path, don't use it as cwd
    const isGlobal = !envPath || envPath === 'npm' || envPath.toLowerCase().includes('nodejs\\npm');
    const args = isGlobal ? ['list', '-g', '--depth=0', '--json'] : ['list', '--depth=0', '--json'];
    
    let cwd = undefined;
    if (!isGlobal && envPath) {
      try {
        if (fs.existsSync(envPath) && fs.lstatSync(envPath).isDirectory()) {
          cwd = envPath;
        } else if (fs.existsSync(envPath)) {
          cwd = path.dirname(envPath);
        }
      } catch (e) {
        console.warn('[NPM LIST] Invalid cwd:', envPath);
      }
    }

    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    const child = spawn(npmCmd, args, { 
      cwd: (cwd && fs.existsSync(cwd)) ? cwd : undefined,
      shell: true,
      windowsHide: true,
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      try {
        if (!stdout && stderr) {
          console.error('[NPM LIST STDERR]', stderr);
          resolve([]);
          return;
        }
        
        const data = JSON.parse(stdout || '{}');
        const packages = [];
        
        if (data.dependencies) {
          for (const [name, info] of Object.entries(data.dependencies)) {
            packages.push({
              name,
              version: info.version
            });
          }
        }
        resolve(packages);
      } catch (e) {
        console.error('[NPM LIST PARSE FAIL]', e.message, 'Output:', stdout);
        resolve([]);
      }
    });

    child.on('error', (err) => {
      console.error('[NPM LIST SPAWN FAIL]', err.message);
      resolve([]);
    });
  });
}

module.exports = { updateNpmPackage, deleteNpmPackage, listPackages }; 
