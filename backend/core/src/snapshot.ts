import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { format } from 'date-fns';
import type { PgSnapshot, SnapshotPackage } from './types.js';
import { parseLockfile } from './lockfile-parser.js';
import {
  getProjectById,
  listSnapshots as dbListSnapshots,
  createSnapshot as dbCreateSnapshot,
} from './database.js';

function generateSnapshotId(): string {
  return crypto.randomBytes(4).toString('hex');
}

function dedupePackages(pkgs: SnapshotPackage[]): SnapshotPackage[] {
  const byName = new Map<string, SnapshotPackage>();
  for (const p of pkgs) byName.set(p.name, p);
  return Array.from(byName.values());
}

export function computeTreeHash(packages: SnapshotPackage[]): string {
  const sorted = [...packages].sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    if (a.version !== b.version) return a.version.localeCompare(b.version);
    return (a.type ?? '').localeCompare(b.type ?? '');
  });
  const canonical = sorted.map((p) => `${p.name}@${p.version}[${p.type}]`).join('|');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export async function createSnapshotCLI(
  projectId: string,
  message: string = 'Untitled snapshot',
): Promise<PgSnapshot> {
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Determine packages: prefer lockfile (Node.js), fall back to last snapshot packages
  // for Python projects that have no package.json / lockfile.
  let packages: SnapshotPackage[] = [];
  const hasPackageJson = fs.existsSync(path.join(project.path, 'package.json'));

  if (hasPackageJson) {
    // Node.js project — parse the lockfile as before
    const lock = await parseLockfile(project.path);
    packages = dedupePackages(lock.packages);
  } else {
    // Python / non-Node project — reuse packages from the most recent snapshot.
    // The caller should have already created an up-to-date
    // snapshot via initProject; this path just re-wraps that state with a new message.
    const existing = dbListSnapshots(projectId);
    const last = existing.length > 0 ? existing[existing.length - 1] : null;
    packages = last ? dedupePackages(last.packages) : [];
  }

  const snaps = dbListSnapshots(projectId);
  const parentId = snaps.length > 0 ? snaps[snaps.length - 1].id : null;
  const treeHash = computeTreeHash(packages);

  // Skip creating a duplicate snapshot only when no message is provided AND the tree
  // hash matches a previous snapshot (spec: snapshots can always be created explicitly).
  const lastSame = parentId ? snaps.find((s) => s.treeHash === treeHash) : undefined;
  if (lastSame && !message) {
    return lastSame;
  }

  const snapshot: PgSnapshot = {
    id: generateSnapshotId(),
    projectId,
    message,
    packages,
    packageCount: packages.length,
    parentId,
    createdAt: Date.now(),
    treeHash,
  };
  dbCreateSnapshot(snapshot);
  return snapshot;
}

export interface SnapshotListEntry {
  id: string;
  message: string;
  packageCount: number;
  createdAt: string;
  createdAtRaw: number;
  parentId: string | null;
  oneline?: string;
}

export async function listSnapshotsCLI(
  projectId: string,
  oneline: boolean = false,
  limit?: number,
): Promise<SnapshotListEntry[]> {
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  let snaps = dbListSnapshots(projectId);
  if (typeof limit === 'number' && limit > 0) {
    snaps = snaps.slice(0, limit);
  }
  return snaps.map((s) => {
    const created = format(s.createdAt, 'yyyy-MM-dd HH:mm:ss');
    const entry: SnapshotListEntry = {
      id: s.id,
      message: s.message,
      packageCount: s.packageCount,
      createdAt: created,
      createdAtRaw: s.createdAt,
      parentId: s.parentId,
    };
    if (oneline) {
      entry.oneline = `${s.id}  ${created}  (${s.packageCount} pkgs)  ${s.message}`;
    }
    return entry;
  });
}
