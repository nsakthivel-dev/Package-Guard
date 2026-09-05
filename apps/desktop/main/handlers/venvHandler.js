const fs = require('fs');
const path = require('path');
const { spawn, execFileSync, execFile } = require('child_process');
const pipHandler = require('./pipHandler');

function isVenv(folderPath) {
  try {
    return fs.existsSync(path.join(folderPath, 'pyvenv.cfg'));
  } catch (e) {
    return false;
  }
}

async function findVenvs(rootDir, maxDepth = 3, currentDepth = 0) {
  let venvs = [];
  if (currentDepth > maxDepth) return venvs;

  try {
    const items = fs.readdirSync(rootDir);
    for (const item of items) {
      const fullPath = path.join(rootDir, item);
      try {
        const stats = fs.lstatSync(fullPath);
        if (stats.isDirectory()) {
          if (isVenv(fullPath)) {
            const meta = getVenvMeta(fullPath);
            venvs.push({
              name: item,
              path: fullPath,
              ...meta
            });
          } else if (item !== 'node_modules' && !item.startsWith('.')) {
            const subVenvs = await findVenvs(fullPath, maxDepth, currentDepth + 1);
            venvs = venvs.concat(subVenvs);
          }
        }
      } catch (e) {
        // Skip inaccessible folders
      }
    }
  } catch (e) {
    // Skip inaccessible root
  }
  return venvs;
}

function getVenvMeta(venvPath) {
  const cfgPath = path.join(venvPath, 'pyvenv.cfg');
  const meta = {
    pythonVersion: 'Unknown',
    home: '',
    prompt: path.basename(venvPath)
  };

  try {
    const content = fs.readFileSync(cfgPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const [key, value] = line.split('=').map(s => s.trim());
      if (key === 'version') meta.pythonVersion = value;
      if (key === 'home') meta.home = value;
      if (key === 'prompt') meta.prompt = value;
    }
  } catch (e) {
    console.error(`Error parsing pyvenv.cfg at ${venvPath}:`, e);
  }

  return meta;
}

function getPipPath(venvPath) {
  const binPath = process.platform === 'win32' 
    ? path.join(venvPath, 'Scripts', 'pip.exe')
    : path.join(venvPath, 'bin', 'pip');
  
  if (fs.existsSync(binPath)) return binPath;
  
  // Fallback to python -m pip
  const pythonPath = process.platform === 'win32'
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python');
    
  if (fs.existsSync(pythonPath)) return pythonPath; // signals to use python -m pip
  
  return null;
}

async function getVenvPackages(venvPath) {
  if (!fs.existsSync(venvPath)) return [];
  // pipHandler.listPackages handles resolving pip from the venv folder
  return pipHandler.listPackages(venvPath);
}

async function updateVenvPackage(venvPath, packageName, onProgress) {
  if (!fs.existsSync(venvPath)) throw new Error('Venv path does not exist');
  return pipHandler.updatePackage(packageName, null, venvPath, onProgress);
}

module.exports = {
  isVenv,
  findVenvs,
  getVenvMeta,
  getVenvPackages,
  updateVenvPackage
};
