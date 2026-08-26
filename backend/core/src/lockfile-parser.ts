import fs from 'node:fs/promises';
import path from 'node:path';
import type { LockfileData, SnapshotPackage } from './types.js';

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
