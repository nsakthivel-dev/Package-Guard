import fs from 'node:fs/promises';
import path from 'node:path';
import type { LockfileData, SnapshotPackage } from '@packageguard/shared/types';
import { PYTHON_PROJECT_MARKERS, VENV_DIRS_CHECK, ALL_LOCKFILES } from '@packageguard/shared/constants';
import { detectPackageManager } from '../package-manager/index.js';

type PkgType = SnapshotPackage['type'];

interface PkgJsonShape {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  packageManager?: string;
}

async function readPackageJson(projectPath: string): Promise<PkgJsonShape> {
  const pjPath = path.join(projectPath, 'package.json');
  const raw = await fs.readFile(pjPath, 'utf8');
  return JSON.parse(raw) as PkgJsonShape;
}

function collectFromPkgJson(pkg: PkgJsonShape): SnapshotPackage[] {
  const results: SnapshotPackage[] = [];
  const seen = new Set<string>();

  const pushOne = (name: string, version: string, type: PkgType) => {
    if (seen.has(name)) return;
    seen.add(name);
    results.push({ name, version, type });
  };

  if (pkg.optionalDependencies) {
    for (const [name, version] of Object.entries(pkg.optionalDependencies)) {
      pushOne(name, version, 'optional');
    }
  }
  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      pushOne(name, version, 'dependency');
    }
  }
  if (pkg.devDependencies) {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      pushOne(name, version, 'devDependency');
    }
  }
  return results;
}

async function tryParseNpmLock(projectPath: string, pkg: PkgJsonShape): Promise<LockfileData | null> {
  const lockPath = path.join(projectPath, 'package-lock.json');
  try {
    const raw = await fs.readFile(lockPath, 'utf8');
    const parsed = JSON.parse(raw) as any;
    const typeMap = new Map<string, PkgType>();
    if (pkg.optionalDependencies) {
      for (const n of Object.keys(pkg.optionalDependencies)) typeMap.set(n, 'optional');
    }
    if (pkg.dependencies) {
      for (const n of Object.keys(pkg.dependencies)) {
        if (!typeMap.has(n)) typeMap.set(n, 'dependency');
      }
    }
    if (pkg.devDependencies) {
      for (const n of Object.keys(pkg.devDependencies)) typeMap.set(n, 'devDependency');
    }
    const pkgs: SnapshotPackage[] = [];
    const deps = parsed.packages ?? parsed.dependencies ?? {};
    for (const [key, val] of Object.entries(deps) as [string, any][]) {
      if (key === '') continue;
      const name = key.startsWith('node_modules/') ? key.slice('node_modules/'.length) : key;
      if (!name || name.includes('/node_modules/')) continue;
      const version = val.version ?? '';
      if (!version) continue;
      pkgs.push({ name, version, type: typeMap.get(name) ?? 'dependency' });
    }
    if (pkgs.length === 0) {
      return { packageManager: 'npm', packages: collectFromPkgJson(pkg) };
    }
    return { packageManager: 'npm', packages: pkgs };
  } catch {
    return null;
  }
}

async function tryParsePnpmLock(projectPath: string, pkg: PkgJsonShape): Promise<LockfileData | null> {
  const lockPath = path.join(projectPath, 'pnpm-lock.yaml');
  try {
    const raw = await fs.readFile(lockPath, 'utf8');
    const typeMap = new Map<string, PkgType>();
    if (pkg.optionalDependencies) {
      for (const n of Object.keys(pkg.optionalDependencies)) typeMap.set(n, 'optional');
    }
    if (pkg.dependencies) {
      for (const n of Object.keys(pkg.dependencies)) {
        if (!typeMap.has(n)) typeMap.set(n, 'dependency');
      }
    }
    if (pkg.devDependencies) {
      for (const n of Object.keys(pkg.devDependencies)) typeMap.set(n, 'devDependency');
    }
    const importerMatch = raw.match(/importers:\s*[\s\S]*?packages:/m);
    const topDeps: Record<string, string> = {};
    if (importerMatch) {
      const section = importerMatch[0];
      const blockRegex = /(dependencies|devDependencies|optionalDependencies):\s*\n((?:\s{2,}\S.*\n?)*)/g;
      let m: RegExpExecArray | null;
      while ((m = blockRegex.exec(section)) !== null) {
        const block = m[2];
        const lineRegex = /^\s{2,}(\S+):\s*['"]?([^'"\s]+)/gm;
        let lm: RegExpExecArray | null;
        while ((lm = lineRegex.exec(block)) !== null) {
          const name = lm[1];
          let version = lm[2];
          const paren = version.indexOf('(');
          if (paren !== -1) version = version.slice(0, paren);
          topDeps[name] = version;
        }
      }
    }
    const packages: SnapshotPackage[] = [];
    const seen = new Set<string>();
    for (const [name, version] of Object.entries(topDeps)) {
      if (seen.has(name)) continue;
      seen.add(name);
      packages.push({ name, version, type: typeMap.get(name) ?? 'dependency' });
    }
    if (packages.length === 0) {
      return { packageManager: 'pnpm', packages: collectFromPkgJson(pkg) };
    }
    return { packageManager: 'pnpm', packages };
  } catch {
    return null;
  }
}

async function tryParseYarnLock(projectPath: string, pkg: PkgJsonShape): Promise<LockfileData | null> {
  const lockPath = path.join(projectPath, 'yarn.lock');
  try {
    const raw = await fs.readFile(lockPath, 'utf8');
    const typeMap = new Map<string, PkgType>();
    if (pkg.optionalDependencies) {
      for (const n of Object.keys(pkg.optionalDependencies)) typeMap.set(n, 'optional');
    }
    if (pkg.dependencies) {
      for (const n of Object.keys(pkg.dependencies)) {
        if (!typeMap.has(n)) typeMap.set(n, 'dependency');
      }
    }
    if (pkg.devDependencies) {
      for (const n of Object.keys(pkg.devDependencies)) typeMap.set(n, 'devDependency');
    }
    const topDeclared = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ]);
    const entryRegex = /^"?((?:@[^/]+\/)?[^"@\s][^"\s]*?)@[^:\n]*:\s*\n\s*version\s+"?([^"\n]+)"?/gm;
    const pkgs: SnapshotPackage[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = entryRegex.exec(raw)) !== null) {
      const name = m[1];
      const version = m[2];
      if (!topDeclared.has(name)) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      pkgs.push({ name, version, type: typeMap.get(name) ?? 'dependency' });
    }
    if (pkgs.length === 0) {
      return { packageManager: 'yarn', packages: collectFromPkgJson(pkg) };
    }
    return { packageManager: 'yarn', packages: pkgs };
  } catch {
    return null;
  }
}

async function tryParseBunLock(projectPath: string, pkg: PkgJsonShape): Promise<LockfileData | null> {
  const lockPath = path.join(projectPath, 'bun.lockb');
  try {
    await fs.access(lockPath);
    console.warn('bun.lockb detected but binary parsing is not supported; falling back to package.json declared versions.');
    return { packageManager: 'bun', packages: collectFromPkgJson(pkg) };
  } catch {
    return null;
  }
}

export async function parseLockfile(projectPath: string): Promise<LockfileData> {
  const pkg = await readPackageJson(projectPath);
  const pnpm = await tryParsePnpmLock(projectPath, pkg);
  if (pnpm) return pnpm;
  const yarn = await tryParseYarnLock(projectPath, pkg);
  if (yarn) return yarn;
  const bun = await tryParseBunLock(projectPath, pkg);
  if (bun) return bun;
  const npm = await tryParseNpmLock(projectPath, pkg);
  if (npm) return npm;
  return { packageManager: 'npm', packages: collectFromPkgJson(pkg) };
}

export async function hasPythonProject(dir: string): Promise<boolean> {
  for (const m of PYTHON_PROJECT_MARKERS) {
    try { await fs.access(path.join(dir, m)); return true; } catch { /* skip */ }
  }
  return false;
}

export async function scanPythonPackages(dir: string): Promise<SnapshotPackage[]> {
  const pkgs: SnapshotPackage[] = [];
  const seen = new Set<string>();

  const addPkg = (name: string, version: string, type: SnapshotPackage['type'] = 'dependency') => {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    pkgs.push({ name, version: version || '0.0.0', type });
  };

  for (const reqFile of ['requirements.txt', 'requirements-dev.txt', 'requirements-base.txt']) {
    try {
      const raw = await fs.readFile(path.join(dir, reqFile), 'utf8');
      const isDev = reqFile.includes('dev');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
        const match = trimmed.match(/^([A-Za-z0-9_.\-]+)\s*(?:[=<>!~^]+\s*([^\s;#]+))?/);
        if (match) addPkg(match[1], match[2] ?? '*', isDev ? 'devDependency' : 'dependency');
      }
    } catch { /* not present */ }
  }

  try {
    const raw = await fs.readFile(path.join(dir, 'pyproject.toml'), 'utf8');
    const depSection = raw.match(/\[project\][^[]*?dependencies\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    for (const line of depSection.split('\n')) {
      const m = line.match(/["']([A-Za-z0-9_.\-]+)\s*(?:[=<>!~^]+\s*([^"'\s;,]+))?/);
      if (m) addPkg(m[1], m[2] ?? '*');
    }
  } catch { /* not present */ }

  try {
    const raw = await fs.readFile(path.join(dir, 'Pipfile'), 'utf8');
    let inPackages = false;
    let inDev = false;
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (t === '[packages]') { inPackages = true; inDev = false; continue; }
      if (t === '[dev-packages]') { inPackages = true; inDev = true; continue; }
      if (t.startsWith('[')) { inPackages = false; continue; }
      if (!inPackages || !t || t.startsWith('#')) continue;
      const m = t.match(/^([A-Za-z0-9_.\-]+)\s*=\s*["']?([^"']+)["']?/);
      if (m) addPkg(m[1], m[2].trim() === '*' ? '*' : m[2].trim(), inDev ? 'devDependency' : 'dependency');
    }
  } catch { /* not present */ }

  return pkgs;
}

async function detectVenvPath(dir: string): Promise<string | null> {
  for (const vd of VENV_DIRS_CHECK) {
    const venvPath = path.join(dir, vd);
    try {
      const stat = await fs.stat(venvPath);
      if (!stat.isDirectory()) continue;
      try { await fs.access(path.join(venvPath, 'pyvenv.cfg')); return venvPath; } catch { /* try next */ }
      const winPy = path.join(venvPath, 'Scripts', 'python.exe');
      const unixPy = path.join(venvPath, 'bin', 'python');
      try { await fs.access(winPy); return venvPath; } catch { /* try next */ }
      try { await fs.access(unixPy); return venvPath; } catch { /* try next */ }
    } catch { /* not present */ }
  }
  return null;
}

async function readVenvPythonVersion(venvPath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(venvPath, 'pyvenv.cfg'), 'utf8');
    const m = raw.match(/version\s*=\s*(.+)/i);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

export async function scanLocalVenvPackages(dir: string): Promise<SnapshotPackage[]> {
  const venvPath = await detectVenvPath(dir);
  if (!venvPath) return [];

  const sitePackagesCandidates = [
    path.join(venvPath, 'Lib', 'site-packages'),
    path.join(venvPath, 'lib', 'site-packages'),
  ];
  try {
    const libDir = path.join(venvPath, 'lib');
    const libEntries = await fs.readdir(libDir).catch(() => [] as string[]);
    for (const entry of libEntries) {
      if (entry.startsWith('python')) {
        sitePackagesCandidates.push(path.join(libDir, entry, 'site-packages'));
      }
    }
  } catch { /* ignore */ }

  for (const sp of sitePackagesCandidates) {
    try {
      const entries = await fs.readdir(sp);
      const pkgs: SnapshotPackage[] = [];
      const seen = new Set<string>();
      for (const entry of entries) {
        const m = entry.match(/^([A-Za-z0-9_.\-]+)-([0-9][A-Za-z0-9._\-]*)\.dist-info$/);
        if (m) {
          const name = m[1].replace(/_/g, '-');
          const version = m[2];
          if (!seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            pkgs.push({ name, version, type: 'dependency' });
          }
        }
      }
      if (pkgs.length > 0) return pkgs;
    } catch { /* keep trying */ }
  }
  return [];
}

export type EnvironmentType = 'project' | 'virtual' | 'global' | 'none' | 'unknown';

export interface EnvironmentClassification {
  environmentType: EnvironmentType;
  packageManagerLabel: string | null;
  venvPath: string | null;
  pythonVersion: string | null;
  warning: string | null;
}

export async function classifyEnvironment(dir: string): Promise<EnvironmentClassification> {
  try {
    await fs.access(path.join(dir, 'package.json'));
    const pm = await detectPackageManager(dir);
    return {
      environmentType: 'project',
      packageManagerLabel: pm,
      venvPath: null,
      pythonVersion: null,
      warning: null,
    };
  } catch { /* not node */ }

  const isPython = await hasPythonProject(dir);

  if (isPython) {
    const venvDir = await detectVenvPath(dir);
    if (venvDir) {
      const pyVer = await readVenvPythonVersion(venvDir);
      return {
        environmentType: 'virtual',
        packageManagerLabel: 'pip',
        venvPath: venvDir,
        pythonVersion: pyVer,
        warning: null,
      };
    }
    return {
      environmentType: 'global',
      packageManagerLabel: 'pip',
      venvPath: null,
      pythonVersion: null,
      warning: '⚠ No virtual environment found — using global Python',
    };
  }

  return {
    environmentType: 'none',
    packageManagerLabel: null,
    venvPath: null,
    pythonVersion: null,
    warning: 'No project dependencies detected',
  };
}
