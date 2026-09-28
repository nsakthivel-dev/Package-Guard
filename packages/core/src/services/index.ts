import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { format } from 'date-fns';
import {
  type Project,
  type PgSnapshot,
  type SnapshotPackage,
  type DiffEntry,
} from '@packageguard/shared/types';
import {
  DEFAULT_APP_CONFIG,
} from '@packageguard/shared/constants';
import {
  resolveProjectPath,
  setDataRoot,
  getPgDir,
  getDbJsonPath,
  getNotifySocketPath,
  ensureUserDataDirs,
  getConfigPath,
  getSnapshotDir,
  getLogsDir,
  getTempDir,
  getServerJsonPath,
} from '@packageguard/shared/paths';
import {
  upsertProject as dbUpsertProject,
  getProjectById,
  getProjectByPath,
  listProjects as dbListProjects,
  deleteProject as dbDeleteProject,
  createSnapshot as dbCreateSnapshot,
  listSnapshots as dbListSnapshots,
  getSnapshot as dbGetSnapshot,
  load as dbLoad,
} from '@packageguard/database';
import { detectPackageManager } from '../package-manager/index.js';
import {
  parseLockfile,
  classifyEnvironment,
  scanPythonPackages,
  scanLocalVenvPackages,
  type EnvironmentClassification,
  type EnvironmentType,
} from '../scanner/index.js';
import { computeTreeHash } from '../snapshot/index.js';
import { computeDiff, getWorkingTreeDiff } from '../diff/index.js';
import { checkoutSnapshot, type CheckoutResult } from '../restore/index.js';

export {
  setDataRoot,
  getPgDir,
  getDbJsonPath,
  getNotifySocketPath,
  getConfigPath,
  getSnapshotDir,
  getLogsDir,
  getTempDir,
  getServerJsonPath,
};

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

export interface InitProjectOptions {
  force?: boolean;
  noInitialSnapshot?: boolean;
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
      environmentType: EnvironmentType;
      packageManagerLabel: string | null;
      venvPath: string | null;
      pythonVersion: string | null;
      warning: string | null;
    }
  | { ok: false; error: string }
> {
  const resolved = resolveProjectPath(rawPath);

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      return { ok: false, error: `Path is not a directory: ${resolved}` };
    }
  } catch (e: any) {
    return { ok: false, error: `Path does not exist: ${resolved} (${e?.message ?? String(e)})` };
  }

  const classification = await classifyEnvironment(resolved);
  const { environmentType, packageManagerLabel, venvPath, pythonVersion, warning } = classification;

  const pjPath = path.join(resolved, 'package.json');
  let packageJson: any = null;
  let isNodeProject = false;
  let isPythonProject = false;

  try {
    const raw = await fs.readFile(pjPath, 'utf8');
    packageJson = JSON.parse(raw);
    isNodeProject = true;
  } catch {
    isPythonProject = await (async () => {
      const markers = ['requirements.txt', 'requirements-dev.txt', 'requirements-base.txt', 'pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile'];
      for (const m of markers) {
        try { await fs.access(path.join(resolved, m)); return true; } catch { /* skip */ }
      }
      return false;
    })();
    if (!isNodeProject && !isPythonProject) {
      if (environmentType === 'none') {
        isPythonProject = false;
      } else {
        return {
          ok: false,
          error: `No package.json found at ${pjPath} and no Python project markers detected.\n` +
            `Supported: package.json (npm/pnpm/yarn/bun) or requirements.txt/pyproject.toml/Pipfile (Python).`,
        };
      }
    }
  }

  const existing = getProjectByPath(resolved);
  if (existing && !opts.force) {
    const snaps = dbListSnapshots(existing.id);
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

  let pm: Project['packageManager'] = 'npm';
  let projectName: string;

  if (isNodeProject) {
    pm = await detectPackageManager(resolved);
    projectName =
      typeof packageJson?.name === 'string' && packageJson.name.length > 0
        ? packageJson.name
        : path.basename(resolved);
  } else {
    pm = 'npm';
    projectName = path.basename(resolved);
  }

  const now = Date.now();
  const isoNow = new Date(now).toISOString();
  const project: Project = {
    id: existing?.id ?? generateProjectId(),
    name: projectName,
    path: resolved,
    packageManager: pm,
    packageJson: packageJson ?? { name: projectName, version: '0.0.0' },
    created_at: existing?.created_at ?? isoNow,
    last_scan_at: existing?.last_scan_at ?? null,
    status: existing?.status ?? 'ACTIVE',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  dbUpsertProject(project);

  let initialSnapshot: PgSnapshot | undefined | null = null;
  if (!opts.noInitialSnapshot) {
    try {
      let packages: SnapshotPackage[] = [];

      if (isNodeProject) {
        const lock = await parseLockfile(resolved);
        packages = dedupePackages(lock.packages);
      } else if (isPythonProject) {
        const venvPkgs = await scanLocalVenvPackages(resolved);
        if (venvPkgs.length > 0) {
          packages = dedupePackages(venvPkgs);
        } else {
          packages = dedupePackages(await scanPythonPackages(resolved));
        }
      }

      const snaps = dbListSnapshots(project.id);
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
  const projects = dbListProjects();
  const rows: ProjectListEntry[] = [];
  for (const p of projects) {
    const snaps = dbListSnapshots(p.id);
    const last = snaps[snaps.length - 1];
    rows.push({
      id: p.id,
      name: p.name,
      path: p.path,
      packageManager: p.packageManager,
      packageCount: last?.packageCount ?? 0,
      createdAt: format(p.createdAt || Date.now(), 'yyyy-MM-dd HH:mm:ss'),
      updatedAt: format(p.updatedAt || Date.now(), 'yyyy-MM-dd HH:mm:ss'),
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

  const deleted = dbDeleteProject(existing.id);
  if (!deleted) {
    return { ok: false, error: `Failed to delete project ${existing.id}` };
  }
  return { ok: true, id: existing.id, message: `Untracked project ${existing.name} (id=${existing.id}).` };
}

// ─────────────────────────────────────────────────────────────────────────────
// High-Level Core Services for CLI and Desktop
// ─────────────────────────────────────────────────────────────────────────────

export interface InitPackageGuardResult {
  ok: boolean;
  directoriesCreated: string[];
  databaseReady: boolean;
  configReady: boolean;
  environmentReady: boolean;
  message: string;
}

export async function initPackageGuard(): Promise<InitPackageGuardResult> {
  // 1. Ensure required user data directories: database, snapshots, logs, temp
  const { created: directoriesCreated, failed } = ensureUserDataDirs();
  if (failed.length > 0) {
    throw new Error(`Failed to create directories: ${failed.map(f => `${f.dir} (${f.error})`).join(', ')}`);
  }

  // 2. Initialize database if missing / load database
  await dbLoad();

  // 3. Create default configuration if missing
  const cfgPath = getConfigPath();
  let configReady = false;
  try {
    await fs.access(cfgPath);
    configReady = true;
  } catch {
    await fs.writeFile(cfgPath, JSON.stringify(DEFAULT_APP_CONFIG, null, 2) + '\n', 'utf8');
    configReady = true;
  }

  // 4. Validate basic environment requirements
  const environmentReady = parseInt(process.versions.node.split('.')[0], 10) >= 18;

  return {
    ok: true,
    directoriesCreated,
    databaseReady: true,
    configReady,
    environmentReady,
    message: 'Package Guard initialized',
  };
}

export interface ScanCoreResult {
  project: Project;
  packages: SnapshotPackage[];
  packageCount: number;
  prodCount: number;
  devCount: number;
  diff: DiffEntry[];
  changesCount: number;
  timestamp: number;
  isNewProject: boolean;
}

export async function scanCore(targetPath?: string): Promise<ScanCoreResult> {
  await dbLoad();
  let dir = resolveProjectPath(targetPath);
  const pjExists = fsSync.existsSync(path.join(dir, 'package.json'));

  if (!targetPath && !pjExists) {
    const projects = dbListProjects();
    if (projects.length > 0) {
      dir = projects[0].path;
    }
  }

  let packages: SnapshotPackage[] = [];
  const hasNode = fsSync.existsSync(path.join(dir, 'package.json'));

  if (hasNode) {
    const lock = await parseLockfile(dir);
    packages = dedupePackages(lock.packages);
  } else {
    const venvPkgs = await scanLocalVenvPackages(dir);
    if (venvPkgs.length > 0) {
      packages = dedupePackages(venvPkgs);
    } else {
      packages = dedupePackages(await scanPythonPackages(dir));
    }
  }

  if (packages.length === 0) {
    const existing = getProjectByPath(dir);
    if (existing) {
      const snaps = dbListSnapshots(existing.id);
      packages = snaps.length > 0 ? snaps[snaps.length - 1].packages : [];
    }
  }

  const existingProject = getProjectByPath(dir);
  const now = Date.now();
  let pm: Project['packageManager'] = 'npm';
  let projectName = path.basename(dir);

  if (hasNode) {
    pm = await detectPackageManager(dir);
    try {
      const raw = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
      const pj = JSON.parse(raw);
      if (pj.name) projectName = pj.name;
    } catch { /* ignore */ }
  }

  const isoNow = new Date(now).toISOString();
  const project: Project = {
    id: existingProject?.id ?? generateProjectId(),
    name: existingProject?.name ?? projectName,
    path: dir,
    packageManager: existingProject?.packageManager ?? pm,
    packageJson: existingProject?.packageJson ?? { name: projectName, version: '1.0.0' },
    created_at: existingProject?.created_at ?? isoNow,
    last_scan_at: existingProject?.last_scan_at ?? null,
    status: existingProject?.status ?? 'ACTIVE',
    createdAt: existingProject?.createdAt ?? now,
    updatedAt: now,
  };

  dbUpsertProject(project);

  const snaps = dbListSnapshots(project.id);
  const lastSnap = snaps.length > 0 ? snaps[snaps.length - 1] : null;
  const previousPkgs = lastSnap ? lastSnap.packages : [];
  const diff = computeDiff(previousPkgs, packages);

  return {
    project,
    packages,
    packageCount: packages.length,
    prodCount: packages.filter(p => p.type === 'dependency').length,
    devCount: packages.filter(p => p.type === 'devDependency').length,
    diff,
    changesCount: diff.length,
    timestamp: now,
    isNewProject: !existingProject,
  };
}

export async function createSnapshotCore(
  name?: string,
  targetPath?: string,
): Promise<PgSnapshot> {
  await dbLoad();
  let dir = resolveProjectPath(targetPath);
  let project = getProjectByPath(dir);

  if (!project) {
    const projects = dbListProjects();
    if (projects.length > 0) {
      project = projects[0];
      dir = project.path;
    } else {
      const initRes = await initProject(dir, { noInitialSnapshot: true });
      if (!initRes.ok) throw new Error(initRes.error);
      project = initRes.project;
    }
  }

  let packages: SnapshotPackage[] = [];
  const hasNode = fsSync.existsSync(path.join(dir, 'package.json'));
  if (hasNode) {
    const lock = await parseLockfile(dir);
    packages = dedupePackages(lock.packages);
  } else {
    const venvPkgs = await scanLocalVenvPackages(dir);
    packages = venvPkgs.length > 0 ? dedupePackages(venvPkgs) : dedupePackages(await scanPythonPackages(dir));
  }

  const snaps = dbListSnapshots(project.id);
  const parentId = snaps.length > 0 ? snaps[snaps.length - 1].id : null;
  const treeHash = computeTreeHash(packages);
  const snapshotId = generateSnapshotId();
  const snapshotName = name && name.trim().length > 0 ? name.trim() : `Snapshot ${format(Date.now(), 'yyyy-MM-dd HH:mm:ss')}`;

  const snapshot: PgSnapshot = {
    id: snapshotId,
    projectId: project.id,
    message: snapshotName,
    packages,
    packageCount: packages.length,
    parentId,
    createdAt: Date.now(),
    treeHash,
  };

  dbCreateSnapshot(snapshot);

  const snapDir = getSnapshotDir();
  const snapFile = path.join(snapDir, `${snapshotId}.json`);
  try {
    await fs.writeFile(snapFile, JSON.stringify(snapshot, null, 2), 'utf8');
  } catch { /* ignore */ }

  return snapshot;
}

export interface SnapshotInfo {
  id: string;
  name: string;
  createdAt: number;
  createdFormatted: string;
  packageCount: number;
  status: 'Healthy' | 'Missing File' | 'Corrupted';
  projectId: string;
}

export async function listSnapshotsCore(targetPath?: string): Promise<SnapshotInfo[]> {
  await dbLoad();
  let snaps: PgSnapshot[] = [];

  if (targetPath) {
    const project = getProjectByPath(resolveProjectPath(targetPath));
    if (project) snaps = dbListSnapshots(project.id);
  } else {
    const currentProject = getProjectByPath(resolveProjectPath());
    if (currentProject) {
      snaps = dbListSnapshots(currentProject.id);
    }
    if (snaps.length === 0) {
      const projects = dbListProjects();
      for (const p of projects) {
        snaps.push(...dbListSnapshots(p.id));
      }
    }
  }

  snaps.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));

  const snapDir = getSnapshotDir();
  const results: SnapshotInfo[] = [];

  for (const s of snaps) {
    let status: 'Healthy' | 'Missing File' | 'Corrupted' = 'Healthy';
    try {
      if (!s.id || !s.packages || !Array.isArray(s.packages)) {
        status = 'Corrupted';
      } else {
        const snapFile = path.join(snapDir, `${s.id}.json`);
        if (!fsSync.existsSync(snapFile)) {
          try {
            fsSync.writeFileSync(snapFile, JSON.stringify(s, null, 2), 'utf8');
          } catch {
            status = 'Missing File';
          }
        }
      }
    } catch {
      status = 'Corrupted';
    }

    results.push({
      id: s.id,
      name: s.message || 'Untitled snapshot',
      createdAt: Number(s.createdAt),
      createdFormatted: format(Number(s.createdAt), 'yyyy-MM-dd HH:mm'),
      packageCount: s.packageCount ?? s.packages?.length ?? 0,
      status,
      projectId: s.projectId,
    });
  }

  return results;
}

export interface RestorePlan {
  snapshot: PgSnapshot;
  project: Project;
  packagesToRestore: number;
  packagesToRemove: number;
  packagesToUpdate: number;
  diff: DiffEntry[];
}

export interface RestoreResult {
  success: boolean;
  snapshotId: string;
  restored: number;
  removed: number;
  updated: number;
  error?: string;
}

export async function getRestorePlanCore(snapshotId: string): Promise<RestorePlan> {
  await dbLoad();
  let snapshot = dbGetSnapshot(snapshotId);
  if (!snapshot) {
    const snapFile = path.join(getSnapshotDir(), `${snapshotId}.json`);
    if (fsSync.existsSync(snapFile)) {
      const raw = await fs.readFile(snapFile, 'utf8');
      const loaded = JSON.parse(raw);
      dbCreateSnapshot(loaded);
      snapshot = loaded;
    }
  }

  if (!snapshot) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const project = getProjectById(snapshot.projectId) || getProjectByPath(resolveProjectPath());
  if (!project) {
    throw new Error(`Associated project not found for snapshot ${snapshotId}`);
  }

  let currentPkgs: SnapshotPackage[] = [];
  try {
    const wt = await getWorkingTreeDiff(project.id);
    currentPkgs = wt.current;
  } catch {
    const snaps = dbListSnapshots(project.id);
    currentPkgs = snaps.length > 0 ? snaps[snaps.length - 1].packages : [];
  }

  const diff = computeDiff(currentPkgs, snapshot.packages);
  const packagesToRestore = diff.filter(d => d.changeType === 'changed' || d.changeType === 'downgraded').length;
  const packagesToRemove = diff.filter(d => d.changeType === 'removed').length;
  const packagesToUpdate = diff.filter(d => d.changeType === 'upgraded' || d.changeType === 'added').length;

  return {
    snapshot,
    project,
    packagesToRestore,
    packagesToRemove,
    packagesToUpdate,
    diff,
  };
}

export async function restoreSnapshotCore(
  snapshotId: string,
  opts: { force?: boolean; preview?: boolean; verbose?: boolean } = {},
): Promise<RestoreResult> {
  const plan = await getRestorePlanCore(snapshotId);
  if (opts.preview) {
    return {
      success: true,
      snapshotId,
      restored: plan.packagesToRestore,
      removed: plan.packagesToRemove,
      updated: plan.packagesToUpdate,
    };
  }

  const res = await checkoutSnapshot(plan.project.id, snapshotId, {
    force: opts.force,
    verbose: opts.verbose,
  });

  if ('ok' in res && res.ok === false) {
    return {
      success: false,
      snapshotId,
      restored: 0,
      removed: 0,
      updated: 0,
      error: res.error,
    };
  }

  const logDir = getLogsDir();
  const logFile = path.join(logDir, 'restore.log');
  const entry = `[${format(Date.now(), 'yyyy-MM-dd HH:mm:ss')}] Restored snapshot ${snapshotId} for project ${plan.project.name} (${plan.project.id})\n`;
  await fs.appendFile(logFile, entry, 'utf8').catch(() => {});

  const checkoutRes = res as CheckoutResult;
  return {
    success: true,
    snapshotId,
    restored: checkoutRes.restored,
    removed: checkoutRes.removed,
    updated: checkoutRes.added,
  };
}

export interface DiffCoreResult {
  hasChanges: boolean;
  added: Array<{ name: string; version: string }>;
  removed: Array<{ name: string; version: string }>;
  updated: Array<{ name: string; fromVersion: string | null; toVersion: string | null; changeType: string }>;
  unchangedCount: number;
  totalCurrent: number;
}

export async function diffCore(targetPath?: string): Promise<DiffCoreResult> {
  await dbLoad();
  let dir = resolveProjectPath(targetPath);
  let project = getProjectByPath(dir);
  if (!project) {
    const projects = dbListProjects();
    if (projects.length > 0) project = projects[0];
    else {
      return {
        hasChanges: false,
        added: [],
        removed: [],
        updated: [],
        unchangedCount: 0,
        totalCurrent: 0,
      };
    }
  }

  const wt = await getWorkingTreeDiff(project.id);
  const diff = wt.diff;

  const added: Array<{ name: string; version: string }> = [];
  const removed: Array<{ name: string; version: string }> = [];
  const updated: Array<{ name: string; fromVersion: string | null; toVersion: string | null; changeType: string }> = [];

  for (const d of diff) {
    if (d.changeType === 'added') {
      added.push({ name: d.name, version: d.toVersion ?? '' });
    } else if (d.changeType === 'removed') {
      removed.push({ name: d.name, version: d.fromVersion ?? '' });
    } else {
      updated.push({
        name: d.name,
        fromVersion: d.fromVersion,
        toVersion: d.toVersion,
        changeType: d.changeType,
      });
    }
  }

  const unchangedCount = Math.max(0, wt.current.length - (added.length + updated.length));

  return {
    hasChanges: diff.length > 0,
    added,
    removed,
    updated,
    unchangedCount,
    totalCurrent: wt.current.length,
  };
}

export async function isElectronRunning(): Promise<boolean> {
  // 1. Check server.json PID liveness if present
  try {
    const srvPath = getServerJsonPath();
    if (fsSync.existsSync(srvPath)) {
      const raw = fsSync.readFileSync(srvPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (typeof parsed.pid === 'number') {
        try {
          process.kill(parsed.pid, 0);
          return true;
        } catch {
          // PID is not active
        }
      }
    }
  } catch { /* ignore */ }

  // 2. Check named pipe / socket
  const socketOk = await new Promise<boolean>((resolve) => {
    if (process.platform === 'win32') {
      const socket = net.createConnection('\\\\.\\pipe\\package-guard-notify', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.setTimeout(250, () => {
        socket.destroy();
        resolve(false);
      });
    } else {
      resolve(false);
    }
  });
  if (socketOk) return true;

  // 3. Check HTTP daemon port
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:48291/health', { timeout: 250 }, (res: any) => {
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(250, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export interface StatusCoreResult {
  initialization: 'Ready' | 'Not initialized';
  database: 'Healthy' | 'Missing' | 'Corrupted';
  lastScan: string;
  lastSnapshot: string;
  trackedPackages: number;
  snapshots: number;
  changes: number;
  electron: 'Running' | 'Not running';
}

export async function getStatusCore(): Promise<StatusCoreResult> {
  await dbLoad();
  const dbPath = getDbJsonPath();
  let dbStatus: 'Healthy' | 'Missing' | 'Corrupted' = 'Healthy';

  try {
    if (!fsSync.existsSync(dbPath)) {
      dbStatus = 'Missing';
    } else {
      const raw = fsSync.readFileSync(dbPath, 'utf8');
      JSON.parse(raw);
    }
  } catch {
    dbStatus = 'Corrupted';
  }

  const isInitialized = fsSync.existsSync(getPgDir()) && dbStatus !== 'Missing';

  const projects = dbListProjects();
  let totalPkgs = 0;
  let latestScanTime = 0;

  for (const p of projects) {
    const upd = Number(p.updatedAt || 0);
    if (upd > latestScanTime) latestScanTime = upd;
    const snaps = dbListSnapshots(p.id);
    const last = snaps[snaps.length - 1];
    const deps = p.packageJson?.dependencies;
    totalPkgs += last?.packageCount ?? (deps && typeof deps === 'object' ? Object.keys(deps).length : 0);
  }

  let totalSnapshots = 0;
  let latestSnapshotTime = 0;
  for (const p of projects) {
    const snaps = dbListSnapshots(p.id);
    totalSnapshots += snaps.length;
    for (const s of snaps) {
      const c = Number(s.createdAt || 0);
      if (c > latestSnapshotTime) latestSnapshotTime = c;
    }
  }

  let changesCount = 0;
  try {
    const diffRes = await diffCore();
    changesCount = diffRes.added.length + diffRes.removed.length + diffRes.updated.length;
  } catch {
    changesCount = 0;
  }

  const electronRunning = await isElectronRunning();

  const formatRelative = (timestamp: number): string => {
    if (!timestamp) return 'Never';
    const diffMin = Math.round((Date.now() - timestamp) / 60000);
    if (diffMin <= 1) return 'Just now';
    if (diffMin < 60) return `${diffMin} minutes ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr === 1) return '1 hour ago';
    if (diffHr < 24) return `${diffHr} hours ago`;
    return format(timestamp, 'yyyy-MM-dd HH:mm');
  };

  return {
    initialization: isInitialized ? 'Ready' : 'Not initialized',
    database: dbStatus,
    lastScan: formatRelative(latestScanTime),
    lastSnapshot: formatRelative(latestSnapshotTime),
    trackedPackages: totalPkgs,
    snapshots: totalSnapshots,
    changes: changesCount,
    electron: electronRunning ? 'Running' : 'Not running',
  };
}

export interface DiagnosticCheck {
  name: string;
  passed: boolean;
  repaired?: boolean;
  message?: string;
  error?: string;
}

export interface DoctorReport {
  checks: DiagnosticCheck[];
  allHealthy: boolean;
  repairs: string[];
}

export async function runDoctorCore(): Promise<DoctorReport> {
  const checks: DiagnosticCheck[] = [];
  const repairs: string[] = [];

  // 1. CLI Installation
  const nodeVer = parseInt(process.versions.node.split('.')[0], 10);
  checks.push({
    name: 'CLI',
    passed: nodeVer >= 18,
    message: `Node.js v${process.versions.node}`,
  });

  // 2. Package Guard directories (auto-repairs missing)
  const { created: dirsCreated, failed: dirFails } = ensureUserDataDirs();
  if (dirsCreated.length > 0) {
    repairs.push(`Created missing directories: ${dirsCreated.join(', ')}`);
  }
  checks.push({
    name: 'Directories',
    passed: dirFails.length === 0,
    repaired: dirsCreated.length > 0,
    error: dirFails.length > 0 ? dirFails.map(f => f.error).join(', ') : undefined,
  });

  // 3. Database
  const dbPath = getDbJsonPath();
  let dbOk = false;
  let dbErr: string | undefined;
  try {
    if (!fsSync.existsSync(dbPath)) {
      await dbLoad();
      repairs.push('Initialized default database db.json');
      dbOk = true;
    } else {
      const raw = fsSync.readFileSync(dbPath, 'utf8');
      JSON.parse(raw);
      dbOk = true;
    }
  } catch (err: any) {
    dbErr = `Database corrupted: ${err?.message ?? String(err)}`;
  }
  checks.push({
    name: 'Database',
    passed: dbOk,
    repaired: repairs.some(r => r.includes('database')),
    error: dbErr,
  });

  // 4. Configuration
  const cfgPath = getConfigPath();
  let cfgOk = false;
  try {
    if (!fsSync.existsSync(cfgPath)) {
      fsSync.writeFileSync(cfgPath, JSON.stringify(DEFAULT_APP_CONFIG, null, 2) + '\n', 'utf8');
      repairs.push('Created default config.json');
    }
    const raw = fsSync.readFileSync(cfgPath, 'utf8');
    JSON.parse(raw);
    cfgOk = true;
  } catch {
    cfgOk = false;
  }
  checks.push({
    name: 'Configuration',
    passed: cfgOk,
    repaired: repairs.some(r => r.includes('config')),
  });

  // 5. Snapshot storage
  const snapDir = getSnapshotDir();
  let snapOk = false;
  try {
    if (!fsSync.existsSync(snapDir)) {
      fsSync.mkdirSync(snapDir, { recursive: true });
      repairs.push('Created snapshot storage directory');
    }
    snapOk = true;
  } catch {
    snapOk = false;
  }
  checks.push({
    name: 'Snapshot storage',
    passed: snapOk,
    repaired: repairs.some(r => r.includes('snapshot')),
  });

  // 6. Permissions
  let permOk = false;
  try {
    const testFile = path.join(getTempDir(), `doctor-perm-${Date.now()}.tmp`);
    fsSync.writeFileSync(testFile, 'ok', 'utf8');
    fsSync.unlinkSync(testFile);
    permOk = true;
  } catch {
    permOk = false;
  }
  checks.push({
    name: 'Permissions',
    passed: permOk,
  });

  // 7. Optional Electron connection
  const electronRunning = await isElectronRunning();
  checks.push({
    name: 'Electron',
    passed: true,
    message: electronRunning ? 'Running' : 'Not running (optional)',
  });

  const allHealthy = checks.every(c => c.passed);
  return { checks, allHealthy, repairs };
}
