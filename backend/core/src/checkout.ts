import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import type { DiffEntry, Project, SnapshotPackage } from './types.js';
import { getProjectById, getSnapshot } from './database.js';
import { computeDiff, getWorkingTreeDiff } from './diff.js';

export interface CheckoutOptions {
  force?: boolean;
  preview?: boolean;
  verbose?: boolean;
}

export interface CheckoutPreviewResult {
  preview: true;
  snapshotId: string;
  diff: DiffEntry[];
  summary: string;
}

export interface CheckoutResult {
  preview: false;
  snapshotId: string;
  diff: DiffEntry[];
  summary: string;
  restored: number;
  added: number;
  removed: number;
}

export type CheckoutReturn =
  | CheckoutPreviewResult
  | CheckoutResult
  | { ok: false; error: string; conflictDiff?: DiffEntry[] };

function splitByType(packages: SnapshotPackage[]): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
} {
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  const optionalDependencies: Record<string, string> = {};
  for (const p of packages) {
    if (p.type === 'optional') optionalDependencies[p.name] = p.version;
    else if (p.type === 'devDependency') devDependencies[p.name] = p.version;
    else dependencies[p.name] = p.version;
  }
  return { dependencies, devDependencies, optionalDependencies };
}

async function runInstall(project: Project, verbose: boolean = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(project.packageManager, ['install'], {
      cwd: project.path,
      stdio: verbose ? 'inherit' : 'pipe',
      shell: true,
      env: { ...process.env },
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${project.packageManager} install exited with code ${code}`));
    });
  });
}

interface BackupState {
  dir: string;
  packageJsonPath: string;
  packageJsonBackup: string | null;
  lockfileBackups: Array<{ file: string; backup: string }>;
  restored: boolean;
}

const ALL_LOCKFILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
];

async function createBackup(project: Project): Promise<BackupState> {
  const tag = crypto.randomBytes(4).toString('hex');
  const dir = path.join(os.tmpdir(), `pg-checkout-${tag}`);
  await fs.mkdir(dir, { recursive: true });

  const pjPath = path.join(project.path, 'package.json');
  let pjBackup: string | null = null;
  try {
    const raw = await fs.readFile(pjPath);
    const dest = path.join(dir, 'package.json.bak');
    await fs.writeFile(dest, raw);
    pjBackup = dest;
  } catch {
    // ignore
  }

  const lockfileBackups: Array<{ file: string; backup: string }> = [];
  for (const lf of ALL_LOCKFILES) {
    const src = path.join(project.path, lf);
    try {
      const raw = await fs.readFile(src);
      const dest = path.join(dir, `${lf}.bak`);
      await fs.writeFile(dest, raw);
      lockfileBackups.push({ file: src, backup: dest });
    } catch {
      // not present
    }
  }

  return {
    dir,
    packageJsonPath: pjPath,
    packageJsonBackup: pjBackup,
    lockfileBackups,
    restored: false,
  };
}

async function restoreBackup(backup: BackupState): Promise<void> {
  if (backup.restored) return;
  backup.restored = true;
  if (backup.packageJsonBackup) {
    try {
      const raw = await fs.readFile(backup.packageJsonBackup);
      await fs.writeFile(backup.packageJsonPath, raw);
    } catch {
      // ignore
    }
  }
  for (const lf of ALL_LOCKFILES) {
    const p = path.join(path.dirname(backup.packageJsonPath), lf);
    try {
      await fs.unlink(p);
    } catch {
      // ignore
    }
  }
  for (const { file, backup: src } of backup.lockfileBackups) {
    try {
      const raw = await fs.readFile(src);
      await fs.writeFile(file, raw);
    } catch {
      // ignore
    }
  }
  try {
    await fs.rm(backup.dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

async function cleanupBackup(backup: BackupState): Promise<void> {
  try {
    await fs.rm(backup.dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export async function checkoutSnapshot(
  projectId: string,
  snapshotId: string,
  opts: CheckoutOptions = {},
): Promise<CheckoutReturn> {
  const project = getProjectById(projectId);
  if (!project) {
    return { ok: false, error: `Project not found: ${projectId}` };
  }
  const target = getSnapshot(snapshotId);
  if (!target) {
    return { ok: false, error: `Snapshot not found: ${snapshotId}` };
  }
  if (target.projectId !== projectId) {
    return { ok: false, error: `Snapshot ${snapshotId} does not belong to project ${projectId}` };
  }
  const wt = await getWorkingTreeDiff(projectId);
  if (opts.preview) {
    const current = wt.current;
    const diff = computeDiff(current, target.packages);
    const restored = diff.filter((d) => d.changeType === 'changed' || d.changeType === 'upgraded' || d.changeType === 'downgraded').length;
    const added = diff.filter((d) => d.changeType === 'added').length;
    const removed = diff.filter((d) => d.changeType === 'removed').length;
    return {
      preview: true,
      snapshotId,
      diff,
      summary: `Preview checkout ${snapshotId} — ${restored} restored / ${added} added / ${removed} removed`,
    };
  }
  if (!opts.force && wt.hasChanges) {
    return {
      ok: false,
      error: `Working tree has uncommitted changes. Commit a snapshot or pass --force to overwrite.`,
      conflictDiff: wt.diff,
    };
  }

  const backup = await createBackup(project);

  const diff = computeDiff(wt.current, target.packages);
  const pjPath = backup.packageJsonPath;
  const rawPj = await fs.readFile(pjPath, 'utf8');
  let pj: any;
  try {
    pj = JSON.parse(rawPj);
  } catch (e) {
    return { ok: false, error: `package.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }

  const { dependencies, devDependencies, optionalDependencies } = splitByType(target.packages);
  pj.dependencies = dependencies;
  pj.devDependencies = devDependencies;
  if (Object.keys(optionalDependencies).length > 0) {
    pj.optionalDependencies = optionalDependencies;
  } else if (pj.optionalDependencies) {
    delete pj.optionalDependencies;
  }

  for (const lf of ALL_LOCKFILES) {
    const lfp = path.join(project.path, lf);
    try {
      await fs.unlink(lfp);
    } catch {
      // ignore
    }
  }

  try {
    await fs.writeFile(pjPath, JSON.stringify(pj, null, 2) + '\n', 'utf8');
  } catch (e) {
    await restoreBackup(backup);
    return {
      ok: false,
      error: `Failed to write package.json: ${e instanceof Error ? e.message : String(e)}`,
      conflictDiff: diff,
    };
  }

  let installError: unknown = null;
  try {
    await runInstall(project, opts.verbose ?? false);
  } catch (e) {
    installError = e;
    if (!opts.force) {
      await restoreBackup(backup);
      return {
        ok: false,
        error: `Install failed after checkout; working tree restored. Reason: ${e instanceof Error ? e.message : String(e)}`,
        conflictDiff: diff,
      };
    }
  }

  if (!installError) {
    await cleanupBackup(backup);
  }

  const restored = diff.filter((d) => d.changeType === 'changed' || d.changeType === 'upgraded' || d.changeType === 'downgraded').length;
  const added = diff.filter((d) => d.changeType === 'added').length;
  const removed = diff.filter((d) => d.changeType === 'removed').length;
  const summaryBase = `Checked out snapshot ${snapshotId} — ${restored} restored / ${added} added / ${removed} removed`;
  const summary = installError
    ? `${summaryBase} (install warning, kept rewritten tree (--force): ${installError instanceof Error ? installError.message : String(installError)})`
    : summaryBase;
  return {
    preview: false,
    snapshotId,
    diff,
    summary,
    restored,
    added,
    removed,
  };
}
