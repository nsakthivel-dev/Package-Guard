/**
 * projectEnvironmentHandler.js
 *
 * Bridges the CLI core database (db.json → projects + snapshots) with the
 * Electron GUI environment system.
 *
 * Responsibility:
 *   - Classify each tracked project as: project | virtual | global | none | unknown
 *   - Return unified ProjectEnvironment objects the GUI can display
 *   - Scan / re-scan a single project and create a new snapshot
 *   - Auto-detect Python virtual environments inside project directories
 *
 * Classification rules:
 *   Node.js project   → environmentType = "project",  packageManager = npm|pnpm|yarn|bun
 *   Python + .venv    → environmentType = "virtual",   packageManager = "pip"
 *   Python no venv    → environmentType = "global",    packageManager = "pip"
 *   No dependencies   → environmentType = "none"
 *   Unknown           → environmentType = "unknown"
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ─── Constants ────────────────────────────────────────────────────────────────

const VENV_DIRS   = ['.venv', 'venv', 'env', '.env', '__venv__'];
const PYTHON_MARKERS = [
  'requirements.txt', 'requirements-dev.txt', 'requirements-base.txt',
  'pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile',
];
const NODE_LOCKFILES = [
  'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'package-lock.json',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dirExists(p) {
  try { return fs.existsSync(p) && fs.statSync(p).isDirectory(); } catch { return false; }
}

function fileExists(p) {
  try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch { return false; }
}

function readJsonSync(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/** Returns the first existing Python venv dir inside projectPath, or null */
function detectVenvDir(projectPath) {
  for (const vd of VENV_DIRS) {
    const full = path.join(projectPath, vd);
    if (!dirExists(full)) continue;
    // Verify it looks like a real venv (has pyvenv.cfg)
    if (fileExists(path.join(full, 'pyvenv.cfg'))) return full;
    // Fallback: check for Scripts/python.exe or bin/python
    const winPy = path.join(full, 'Scripts', 'python.exe');
    const unixPy = path.join(full, 'bin', 'python');
    if (fileExists(winPy) || fileExists(unixPy)) return full;
  }
  return null;
}

/** Returns true if the directory has any Python project marker files */
function hasPythonMarkers(projectPath) {
  return PYTHON_MARKERS.some(m => fileExists(path.join(projectPath, m)));
}

/** Returns true if the directory has a package.json */
function hasPackageJson(projectPath) {
  return fileExists(path.join(projectPath, 'package.json'));
}

/** Detect package manager from lockfiles / packageManager field */
function detectPM(projectPath) {
  const pjPath = path.join(projectPath, 'package.json');
  if (fileExists(pjPath)) {
    const pj = readJsonSync(pjPath);
    if (pj && typeof pj.packageManager === 'string') {
      const name = pj.packageManager.split('@')[0].trim();
      if (['npm', 'pnpm', 'yarn', 'bun'].includes(name)) return name;
    }
  }
  if (fileExists(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fileExists(path.join(projectPath, 'yarn.lock')))       return 'yarn';
  if (fileExists(path.join(projectPath, 'bun.lockb')))       return 'bun';
  if (fileExists(path.join(projectPath, 'package-lock.json'))) return 'npm';
  return 'npm'; // default for node projects
}

/** Read Python version from pyvenv.cfg */
function readVenvPythonVersion(venvPath) {
  const cfgPath = path.join(venvPath, 'pyvenv.cfg');
  if (!fileExists(cfgPath)) return null;
  try {
    const content = fs.readFileSync(cfgPath, 'utf8');
    const m = content.match(/version\s*=\s*(.+)/i);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

/** Count packages in a venv's site-packages */
function countVenvPackages(venvPath) {
  const candidates = [
    path.join(venvPath, 'Lib', 'site-packages'),     // Windows
    path.join(venvPath, 'lib', 'site-packages'),      // Linux/macOS (no py version)
  ];
  // Also handle lib/pythonX.Y/site-packages
  try {
    const libDir = path.join(venvPath, 'lib');
    if (dirExists(libDir)) {
      for (const entry of fs.readdirSync(libDir)) {
        if (entry.startsWith('python')) {
          candidates.push(path.join(libDir, entry, 'site-packages'));
        }
      }
    }
  } catch { /* ignore */ }

  for (const sp of candidates) {
    if (!dirExists(sp)) continue;
    try {
      const entries = fs.readdirSync(sp);
      const count = entries.filter(e => e.endsWith('.dist-info') || e.endsWith('.egg-info')).length;
      if (count > 0) return count;
    } catch { /* keep trying */ }
  }
  return 0;
}

/** Parse requirements.txt and variants to count declared packages */
function countRequirementsPackages(projectPath) {
  const files = [
    'requirements.txt', 'requirements-dev.txt', 'requirements-base.txt',
  ];
  let count = 0;
  for (const f of files) {
    const fp = path.join(projectPath, f);
    if (!fileExists(fp)) continue;
    try {
      const lines = fs.readFileSync(fp, 'utf8').split('\n');
      count += lines.filter(l => {
        const t = l.trim();
        return t && !t.startsWith('#') && !t.startsWith('-');
      }).length;
    } catch { /* skip */ }
  }
  return count;
}

// ─── Classification ───────────────────────────────────────────────────────────

/**
 * Classify a project into one of: project | virtual | global | none | unknown
 *
 * @param {object} project  Core project record { id, name, path, packageManager, packageJson, ... }
 * @param {number} packageCount  Package count from latest snapshot
 * @returns {ProjectEnvironment}
 */
function classifyProject(project, packageCount) {
  const dir = project.path;

  if (!dirExists(dir)) {
    return buildEnv(project, 'unknown', null, null, packageCount, '⚠ Project path not found');
  }

  // Node.js project
  if (hasPackageJson(dir)) {
    const pm = detectPM(dir);
    return buildEnv(project, 'project', pm, null, packageCount, null);
  }

  // Python project
  if (hasPythonMarkers(dir)) {
    const venvDir = detectVenvDir(dir);
    if (venvDir) {
      const pyVer = readVenvPythonVersion(venvDir);
      const venvCount = countVenvPackages(venvDir) || packageCount;
      return buildEnv(project, 'virtual', 'pip', venvDir, venvCount,
        null, pyVer ? `Python ${pyVer}` : 'Python');
    }
    // Has Python markers but no venv
    const reqCount = countRequirementsPackages(dir) || packageCount;
    return buildEnv(project, 'global', 'pip', null, reqCount,
      '⚠ Using global Python — consider creating a virtual environment');
  }

  // Directory has no recognizable dependencies
  return buildEnv(project, 'none', null, null, 0, 'No project dependencies detected');
}

/**
 * Build a unified ProjectEnvironment object.
 */
function buildEnv(project, envType, pm, venvPath, packageCount, warning, runtime) {
  return {
    // Identifiers
    id: `proj-env-${project.id}`,
    projectId: project.id,
    // Display
    name: project.name,
    path: project.path,
    // Classification
    environmentType: envType,          // project | virtual | global | none | unknown
    packageManager: pm,                // npm | pnpm | yarn | bun | pip | null
    runtime: runtime || null,          // e.g. "Python 3.13", "Node.js 22"
    // Virtual env specifics
    venvPath: venvPath || null,
    // Metadata
    packageCount: typeof packageCount === 'number' ? packageCount : 0,
    warning: warning || null,
    // Timestamps (from core project record)
    createdAt: project.createdAt || null,
    updatedAt: project.updatedAt || null,
    lastScanAt: project.updatedAt || null,
    // Raw core data (for snapshot lookups etc.)
    _coreProjectId: project.id,
  };
}

// ─── Core access (lazy loaded to avoid circular requires) ──────────────────────

let _getCore = null;

function setGetCore(fn) {
  _getCore = fn;
}

function getCore() {
  if (_getCore) return _getCore();
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List all tracked projects as classified ProjectEnvironment objects.
 * Reads from the CLI core db.json via listProjectsCLI / listProjects.
 *
 * @returns {Promise<ProjectEnvironment[]>}
 */
async function listProjectEnvironments() {
  const core = getCore();
  if (!core) return [];

  let projects = [];
  try {
    // listProjects() is synchronous, listProjectsCLI() is async (includes packageCount)
    if (typeof core.listProjectsCLI === 'function') {
      projects = await core.listProjectsCLI();
    } else if (typeof core.listProjects === 'function') {
      projects = core.listProjects();
    }
  } catch (e) {
    console.error('[ProjectEnvHandler] Failed to list projects:', e.message);
    return [];
  }

  return projects.map(p => classifyProject(p, p.packageCount || 0));
}

/**
 * Get a single project environment by project ID.
 */
async function getProjectEnvironment(projectId) {
  const core = getCore();
  if (!core) return null;

  let project = null;
  try {
    if (typeof core.getProjectById === 'function') {
      project = core.getProjectById(projectId);
    }
  } catch (e) {
    console.error('[ProjectEnvHandler] Failed to get project:', e.message);
    return null;
  }

  if (!project) return null;

  // Get package count from snapshots
  let packageCount = 0;
  try {
    if (typeof core.listSnapshots === 'function') {
      const snaps = core.listSnapshots(projectId);
      const last = snaps[snaps.length - 1];
      packageCount = last?.packageCount ?? 0;
    }
  } catch { /* ignore */ }

  return classifyProject(project, packageCount);
}

/**
 * Get packages for a project environment.
 * Reads from the latest snapshot in the core db.
 *
 * @param {string} projectId
 * @returns {Promise<{name: string, version: string, type: string}[]>}
 */
async function getProjectPackages(projectId) {
  const core = getCore();
  if (!core) return [];

  try {
    let snaps = [];
    if (typeof core.listSnapshots === 'function') {
      snaps = core.listSnapshots(projectId);
    } else if (typeof core.listSnapshotsCLI === 'function') {
      const rows = await core.listSnapshotsCLI(projectId, false, 1);
      // listSnapshotsCLI doesn't include packages, use getSnapshot
      if (rows.length && typeof core.getSnapshot === 'function') {
        const snap = core.getSnapshot(rows[0].id);
        return (snap?.packages || []).map(p => ({
          name: p.name,
          version: p.version,
          type: p.type || 'dependency',
          installedVersion: p.version,
        }));
      }
      return [];
    }

    if (snaps.length === 0) return [];
    const last = snaps[snaps.length - 1];
    return (last.packages || []).map(p => ({
      name: p.name,
      version: p.version,
      type: p.type || 'dependency',
      installedVersion: p.version,
    }));
  } catch (e) {
    console.error('[ProjectEnvHandler] Failed to get packages for project', projectId, e.message);
    return [];
  }
}

/**
 * Get snapshot history for a project.
 *
 * @param {string} projectId
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
async function getProjectSnapshots(projectId, limit = 20) {
  const core = getCore();
  if (!core) return [];

  try {
    if (typeof core.listSnapshotsCLI === 'function') {
      return await core.listSnapshotsCLI(projectId, false, limit);
    }
    if (typeof core.listSnapshots === 'function') {
      const snaps = core.listSnapshots(projectId);
      return snaps.slice(0, limit).reverse();
    }
    return [];
  } catch (e) {
    console.error('[ProjectEnvHandler] Failed to get snapshots for project', projectId, e.message);
    return [];
  }
}

/**
 * Re-scan a project: read current state, create a new snapshot, return updated env.
 *
 * Uses initProject(force:true) which handles both Node.js and Python projects
 * and always creates a fresh snapshot from the current package state.
 *
 * @param {string} projectId
 * @returns {Promise<{env: ProjectEnvironment, snapshot: object | null}>}
 */
async function scanProjectEnvironment(projectId) {
  const core = getCore();
  if (!core) throw new Error('Core engine not available');

  const project = typeof core.getProjectById === 'function'
    ? core.getProjectById(projectId)
    : null;
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Re-initialize with force:true — this re-scans packages and creates a new snapshot.
  // initProject handles both Node.js (lockfile) and Python (venv site-packages /
  // requirements.txt) correctly. It is also safe to call multiple times: upsertProject
  // deduplicates by path so no duplicate project record is created.
  let initResult = null;
  if (typeof core.initProject === 'function') {
    try {
      initResult = await core.initProject(project.path, {
        force: true,
        noInitialSnapshot: false,
      });
    } catch (e) {
      console.warn('[ProjectEnvHandler] initProject(force) failed:', e.message);
    }
  }

  const snapshot = initResult?.initialSnapshot ?? null;
  const env = await getProjectEnvironment(projectId);
  return { env, snapshot };
}

/**
 * Detect global runtime systems on the machine.
 * Returns enhanced environment objects with version info.
 * The existing envScanner already handles this; we just augment the data.
 *
 * @param {object[]} rawEnvs  Environments from dbHandler (the existing global envs)
 * @returns {object[]}
 */
async function enrichGlobalSystems(rawEnvs) {
  const { spawn } = require('child_process');

  async function runVersion(cmd, args) {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        shell: process.platform === 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      child.stdout.on('data', d => { out += d.toString(); });
      child.stderr.on('data', d => { out += d.toString(); }); // node --version writes to stderr
      child.on('close', () => resolve(out.trim()));
      child.on('error', () => resolve(''));
    });
  }

  const enriched = [...rawEnvs];

  for (const env of enriched) {
    if (env.version) continue; // already enriched

    try {
      if (env.type === 'pip' || env.id === 'global-pip') {
        const pythonExe = env.path && env.path !== 'python' && env.path !== 'python3'
          ? env.path
          : (process.platform === 'win32' ? 'python' : 'python3');
        const ver = await runVersion(pythonExe, ['--version']);
        const m = ver.match(/Python\s+([\d.]+)/i);
        env.version = m ? m[1] : null;
        env.displayName = 'Python';
        env.runtime = env.version ? `Python ${env.version}` : 'Python';
        env.environmentCategory = 'global-system';
      } else if (env.type === 'npm' || env.id === 'global-npm') {
        const ver = await runVersion('node', ['--version']);
        const m = ver.match(/v?([\d.]+)/);
        env.version = m ? m[1] : null;
        env.displayName = 'Node.js';
        env.runtime = env.version ? `Node.js ${env.version}` : 'Node.js';
        env.environmentCategory = 'global-system';
      } else if (env.type === 'pnpm' || env.id === 'global-pnpm') {
        const exe = env.path && env.path !== 'pnpm' ? env.path : 'pnpm';
        const ver = await runVersion(exe, ['--version']);
        const m = ver.match(/v?([\d.]+)/);
        env.version = m ? m[1] : null;
        env.displayName = 'pnpm';
        env.runtime = env.version ? `pnpm ${env.version}` : 'pnpm';
        env.environmentCategory = 'global-system';
      } else if (env.type === 'yarn' || env.id === 'global-yarn') {
        const exe = env.path && env.path !== 'yarn' ? env.path : 'yarn';
        const ver = await runVersion(exe, ['--version']);
        const m = ver.match(/v?([\d.]+)/);
        env.version = m ? m[1] : null;
        env.displayName = 'Yarn';
        env.runtime = env.version ? `Yarn ${env.version}` : 'Yarn';
        env.environmentCategory = 'global-system';
      } else if (env.type === 'conda') {
        env.displayName = 'Conda';
        env.environmentCategory = 'global-system';
      }
    } catch { /* ignore enrichment errors */ }
  }

  // Also detect Java, if present
  try {
    const javaVer = await runVersion('java', ['-version']);
    const m = javaVer.match(/version\s+"([\d._]+)"/i);
    const version = m ? m[1] : null;
    const javaPath = process.platform === 'win32'
      ? (process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe') : 'java')
      : 'java';
    if (version) {
      const existingJava = enriched.find(e => e.id === 'global-java');
      if (!existingJava) {
        enriched.push({
          id: 'global-java',
          name: 'Java',
          displayName: 'Java',
          type: 'java',
          path: javaPath,
          environmentPath: javaPath,
          version,
          runtime: `Java ${version}`,
          environmentCategory: 'global-system',
          packageCount: 0,
          isActive: 1,
        });
      } else {
        existingJava.version = version;
        existingJava.displayName = 'Java';
        existingJava.runtime = `Java ${version}`;
        existingJava.environmentCategory = 'global-system';
      }
    }
  } catch { /* Java not installed — skip */ }

  return enriched;
}

module.exports = {
  setGetCore,
  listProjectEnvironments,
  getProjectEnvironment,
  getProjectPackages,
  getProjectSnapshots,
  scanProjectEnvironment,
  enrichGlobalSystems,
  classifyProject,
  detectVenvDir,
};
