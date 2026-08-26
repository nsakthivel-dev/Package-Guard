import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { format } from 'date-fns';
import {
  type Project,
  type PgSnapshot,
  type SnapshotPackage,
} from './types.js';
import { resolveProjectPath } from './paths.js';
import { detectPackageManager } from './pm-detector.js';
import { parseLockfile } from './lockfile-parser.js';
import {
  upsertProject,
  getProjectById,
  getProjectByPath,
  listProjects,
  deleteProject,
  createSnapshot as dbCreateSnapshot,
  listSnapshots,
} from './database.js';
import { computeTreeHash } from './snapshot.js';

function generateProjectId(): string {
  return `proj-${crypto.randomBytes(8).toString('hex')}`;
}

function generateSnapshotId(): string {
  return crypto.randomBytes(4).toString('hex');
}

function dedupePackages(pkgs: SnapshotPackage[]): SnapshotPackage[] {
  const byName = new Map<string, SnapshotPackage>();
  for (const p of pkgs) byName.set(p.name, p);
  return Array.from(byName.values());
}

// ─── Python project detection ─────────────────────────────────────────────────
async function hasPythonProject(dir: string): Promise<boolean> {
  const markers = [
    'requirements.txt', 'requirements-dev.txt', 'requirements-base.txt',
    'pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile',
  ];
  for (const m of markers) {
    try { await fs.access(path.join(dir, m)); return true; } catch { /* skip */ }
  }
  return false;
}

// ─── Python package scanner (reads requirements.txt / pyproject.toml) ────────
async function scanPythonPackages(dir: string): Promise<SnapshotPackage[]> {
  const pkgs: SnapshotPackage[] = [];
  const seen = new Set<string>();

  const addPkg = (name: string, version: string, type: SnapshotPackage['type'] = 'dependency') => {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    pkgs.push({ name, version: version || '0.0.0', type });
  };

  // requirements.txt (and variants)
  for (const reqFile of ['requirements.txt', 'requirements-dev.txt', 'requirements-base.txt']) {
    try {
      const raw = await fs.readFile(path.join(dir, reqFile), 'utf8');
      const isDev = reqFile.includes('dev');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
        // e.g. requests==2.31.0  or  requests>=2.0  or  requests
        const match = trimmed.match(/^([A-Za-z0-9_.\-]+)\s*(?:[=<>!~^]+\s*([^\s;#]+))?/);
        if (match) addPkg(match[1], match[2] ?? '*', isDev ? 'devDependency' : 'dependency');
      }
    } catch { /* not present */ }
  }

  // pyproject.toml (basic TOML parse — just grab [project].dependencies)
  try {
    const raw = await fs.readFile(path.join(dir, 'pyproject.toml'), 'utf8');
    // Match lines like: "requests>=2.0"  (inside dependencies array)
    const depSection = raw.match(/\[project\][^[]*?dependencies\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    for (const line of depSection.split('\n')) {
      const m = line.match(/["']([A-Za-z0-9_.\-]+)\s*(?:[=<>!~^]+\s*([^"'\s;,]+))?/);
      if (m) addPkg(m[1], m[2] ?? '*');
    }
  } catch { /* not present */ }

  // Pipfile
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

// ─── Environment type ─────────────────────────────────────────────────────────
export type EnvironmentType = 'project' | 'virtual' | 'global' | 'none' | 'unknown';

export interface EnvironmentClassification {
  environmentType: EnvironmentType;
  /** Detected package manager label (npm|pnpm|yarn|bun|pip|null) */
  packageManagerLabel: string | null;
  /** Path to the virtual environment dir, if found */
  venvPath: string | null;
  /** Python version string read from pyvenv.cfg, if applicable */
  pythonVersion: string | null;
  /** Human-readable warning (e.g. "Using global Python") */
  warning: string | null;
}

const VENV_DIRS_CHECK = ['.venv', 'venv', 'env', '.env', '__venv__'];

/** Detect whether a directory contains a Python virtual environment */
async function detectVenvPath(dir: string): Promise<string | null> {
  for (const vd of VENV_DIRS_CHECK) {
    const venvPath = path.join(dir, vd);
    try {
      const stat = await fs.stat(venvPath);
      if (!stat.isDirectory()) continue;
      // pyvenv.cfg is the canonical venv marker
      try { await fs.access(path.join(venvPath, 'pyvenv.cfg')); return venvPath; } catch { /* try next */ }
      // Fallback: check for python binary
      const winPy = path.join(venvPath, 'Scripts', 'python.exe');
      const unixPy = path.join(venvPath, 'bin', 'python');
      try { await fs.access(winPy); return venvPath; } catch { /* try next */ }
      try { await fs.access(unixPy); return venvPath; } catch { /* try next */ }
    } catch { /* not present */ }
  }
  return null;
}

/** Read Python version from pyvenv.cfg */
async function readVenvPythonVersion(venvPath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(venvPath, 'pyvenv.cfg'), 'utf8');
    const m = raw.match(/version\s*=\s*(.+)/i);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

/**
 * Classify the environment of a directory.
 * Returns the classification without modifying any stored data.
 */
export async function classifyEnvironment(dir: string): Promise<EnvironmentClassification> {
  // Node.js project
  try {
    await fs.access(path.join(dir, 'package.json'));
    const pm = await import('./pm-detector.js').then(m => m.detectPackageManager(dir));
    return {
      environmentType: 'project',
      packageManagerLabel: pm,
      venvPath: null,
      pythonVersion: null,
      warning: null,
    };
  } catch { /* not node */ }

  // Python: check for venv first
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
    // Python markers but no venv
    return {
      environmentType: 'global',
      packageManagerLabel: 'pip',
      venvPath: null,
      pythonVersion: null,
      warning: '⚠ No virtual environment found — using global Python',
    };
  }

  // No recognised dependency markers at all
  return {
    environmentType: 'none',
    packageManagerLabel: null,
    venvPath: null,
    pythonVersion: null,
    warning: 'No project dependencies detected',
  };
}

// ─── Local venv scanner ───────────────────────────────────────────────────────
async function scanLocalVenvPackages(dir: string): Promise<SnapshotPackage[]> {
  const venvPath = await detectVenvPath(dir);
  if (!venvPath) return [];

  const sitePackagesCandidates = [
    path.join(venvPath, 'Lib', 'site-packages'),     // Windows
    path.join(venvPath, 'lib', 'site-packages'),      // Linux/macOS (no py version dir)
  ];
  // Also handle lib/pythonX.Y/site-packages
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
        // dist-info directories: <name>-<version>.dist-info
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

export interface InitProjectOptions {
  force?: boolean;
  noInitialSnapshot?: boolean;
  detected_pm?: any;
  package_json?: any;
}

export async function initProject(
  rawPath?: string,
  opts: InitProjectOptions = {},
): Promise<
  | {
      ok: true;
      project: Project;
      initialSnapshot?: PgSnapshot | null;
      message: string;
      /** Classification of the environment type */
      environmentType: EnvironmentType;
      /** Detected package manager label for display (may differ from stored pm) */
      packageManagerLabel: string | null;
      venvPath: string | null;
      pythonVersion: string | null;
      warning: string | null;
    }
  | { ok: false; error: string }
> {
  const resolved = resolveProjectPath(rawPath);

  // ── Validate directory ────────────────────────────────────────────────────
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      return { ok: false, error: `Path is not a directory: ${resolved}` };
    }
  } catch (e: any) {
    return { ok: false, error: `Path does not exist: ${resolved} (${e?.message ?? String(e)})` };
  }

  // ── Classify environment ──────────────────────────────────────────────────
  const classification = await classifyEnvironment(resolved);
  const { environmentType, packageManagerLabel, venvPath, pythonVersion, warning } = classification;

  // ── Detect project type: Node.js or Python ────────────────────────────────
  const pjPath = path.join(resolved, 'package.json');
  let packageJson: any = null;
  let isNodeProject = false;
  let isPythonProject = false;

  try {
    const raw = await fs.readFile(pjPath, 'utf8');
    packageJson = JSON.parse(raw);
    isNodeProject = true;
  } catch {
    isPythonProject = await hasPythonProject(resolved);
    if (!isNodeProject && !isPythonProject) {
      // Allow "none" projects (no dependencies) to still be tracked
      if (environmentType === 'none') {
        isPythonProject = false; // no markers, just register with empty snapshot
      } else {
        return {
          ok: false,
          error: `No package.json found at ${pjPath} and no Python project markers detected.\n` +
            `Supported: package.json (npm/pnpm/yarn/bun) or requirements.txt/pyproject.toml/Pipfile (Python).`,
        };
      }
    }
  }

  // ── Check if already tracked ──────────────────────────────────────────────
  const existing = getProjectByPath(resolved);
  if (existing && !opts.force) {
    // Re-classify in case the environment changed since last init
    const snaps = listSnapshots(existing.id);
    const last = snaps[snaps.length - 1];
    return {
      ok: true,
      project: existing,
      initialSnapshot: last ?? null,
      message: `Project already tracked (id=${existing.id}). Use snapshot commands to capture state.`,
      environmentType,
      packageManagerLabel,
      venvPath,
      pythonVersion,
      warning,
    };
  }

  // ── Determine package manager & project name ──────────────────────────────
  let pm: Project['packageManager'] = 'npm';
  let projectName: string;

  if (isNodeProject) {
    pm = await detectPackageManager(resolved);
    projectName =
      typeof packageJson?.name === 'string' && packageJson.name.length > 0
        ? packageJson.name
        : path.basename(resolved);
  } else {
    // Python / no-dependency project: schema requires a PackageManager literal.
    // Store as 'npm' to satisfy Zod; the real label is in packageManagerLabel.
    pm = 'npm';
    projectName = path.basename(resolved);
  }

  const now = Date.now();
  const project: Project = {
    id: existing?.id ?? generateProjectId(),
    name: projectName,
    path: resolved,
    packageManager: pm,
    packageJson: packageJson ?? { name: projectName, version: '0.0.0' },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  upsertProject(project);

  // ── Create initial snapshot ───────────────────────────────────────────────
  let initialSnapshot: PgSnapshot | undefined | null = null;
  if (!opts.noInitialSnapshot) {
    try {
      let packages: SnapshotPackage[] = [];

      if (isNodeProject) {
        const lock = await parseLockfile(resolved);
        packages = dedupePackages(lock.packages);
      } else if (isPythonProject) {
        // Python: try local venv first (actual installed packages), then requirements files
        const venvPkgs = await scanLocalVenvPackages(resolved);
        if (venvPkgs.length > 0) {
          packages = dedupePackages(venvPkgs);
        } else {
          packages = dedupePackages(await scanPythonPackages(resolved));
        }
      }
      // environmentType === 'none': packages stays []

      const snaps = listSnapshots(project.id);
      const parentId = snaps.length > 0 ? snaps[snaps.length - 1].id : null;
      initialSnapshot = {
        id: generateSnapshotId(),
        projectId: project.id,
        message: 'Initial state',
        packages,
        packageCount: packages.length,
        parentId,
        createdAt: Date.now(),
        treeHash: computeTreeHash(packages),
      };
      dbCreateSnapshot(initialSnapshot);
    } catch (e: any) {
      console.warn(`[package-guard] Could not create initial snapshot: ${e?.message ?? String(e)}`);
    }
  }

  return {
    ok: true,
    project,
    initialSnapshot,
    message: `Tracked project ${project.name} (id=${project.id}) with ${initialSnapshot ? initialSnapshot.packageCount : 0} packages.`,
    environmentType,
    packageManagerLabel,
    venvPath,
    pythonVersion,
    warning,
  };
}

export interface ProjectListEntry {
  id: string;
  name: string;
  path: string;
  packageManager: Project['packageManager'];
  packageCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function listProjectsCLI(): Promise<ProjectListEntry[]> {
  const projects = listProjects();
  const rows: ProjectListEntry[] = [];
  for (const p of projects) {
    const snaps = listSnapshots(p.id);
    const last = snaps[snaps.length - 1];
    rows.push({
      id: p.id,
      name: p.name,
      path: p.path,
      packageManager: p.packageManager,
      packageCount: last?.packageCount ?? 0,
      createdAt: format(p.createdAt, 'yyyy-MM-dd HH:mm:ss'),
      updatedAt: format(p.updatedAt, 'yyyy-MM-dd HH:mm:ss'),
    });
  }
  return rows;
}

export interface RemoveProjectOptions {
  projectId?: string;
  path?: string;
}

export async function removeProject(
  rawPathOrOptions?: string | RemoveProjectOptions,
  optsCompat?: RemoveProjectOptions,
): Promise<{ ok: true; id: string; message: string } | { ok: false; error: string }> {
  let targetPath: string | undefined;
  let targetId: string | undefined;

  if (typeof rawPathOrOptions === 'string') {
    targetPath = rawPathOrOptions;
    if (optsCompat && typeof optsCompat === 'object') {
      targetId = optsCompat.projectId;
    }
  } else if (rawPathOrOptions && typeof rawPathOrOptions === 'object') {
    targetPath = rawPathOrOptions.path;
    targetId = rawPathOrOptions.projectId;
  }

  let existing: ReturnType<typeof getProjectById> | ReturnType<typeof getProjectByPath> | undefined;

  if (targetId) {
    existing = getProjectById(targetId);
  }
  if (!existing && targetPath) {
    const resolved = resolveProjectPath(targetPath);
    existing = getProjectByPath(resolved);
  }

  if (!existing) {
    const hint = targetId
      ? `Project not found with id: ${targetId}`
      : targetPath
        ? `Project not tracked at path: ${targetPath}`
        : `No project identifier provided`;
    return { ok: false, error: hint };
  }

  const deleted = deleteProject(existing.id);
  if (!deleted) {
    return { ok: false, error: `Failed to delete project ${existing.id}` };
  }
  return { ok: true, id: existing.id, message: `Untracked project ${existing.name} (id=${existing.id}).` };
}
