import { coerce, valid as semverValid, lt as semverLt } from 'semver';
import type { DiffEntry, PgSnapshot, SnapshotPackage } from '@packageguard/shared/types';
import { parseLockfile } from '../scanner/index.js';
import {
  getProjectById,
  listSnapshots,
  getSnapshot,
} from '@packageguard/database';

function cleanVer(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (semverValid(v)) return v;
  const coerced = coerce(v);
  return coerced ? coerced.version : null;
}

export function classifyVersionChange(
  fromRaw: string | null,
  toRaw: string | null,
): DiffEntry['changeType'] {
  const a = cleanVer(fromRaw);
  const b = cleanVer(toRaw);
  if (a && b && a !== b) {
    try {
      if (semverLt(a, b)) return 'upgraded';
      return 'downgraded';
    } catch {
      // fall through
    }
    const lex = a.localeCompare(b);
    if (lex < 0) return 'upgraded';
    if (lex > 0) return 'downgraded';
  }
  return 'changed';
}

export function computeDiff(
  aPkgs: SnapshotPackage[],
  bPkgs: SnapshotPackage[],
): DiffEntry[] {
  const aMap = new Map<string, string>();
  const bMap = new Map<string, string>();
  for (const p of aPkgs) aMap.set(p.name, p.version);
  for (const p of bPkgs) bMap.set(p.name, p.version);
  const allNames = new Set<string>([...aMap.keys(), ...bMap.keys()]);
  const entries: DiffEntry[] = [];
  for (const name of allNames) {
    const a = aMap.get(name) ?? null;
    const b = bMap.get(name) ?? null;
    if (a === null && b !== null) {
      entries.push({ name, fromVersion: null, toVersion: b, changeType: 'added' });
    } else if (a !== null && b === null) {
      entries.push({ name, fromVersion: a, toVersion: null, changeType: 'removed' });
    } else if (a !== b) {
      entries.push({
        name,
        fromVersion: a,
        toVersion: b,
        changeType: classifyVersionChange(a, b),
      });
    }
  }
  entries.sort((x, y) => x.name.localeCompare(y.name));
  return entries;
}

export interface WorkingTreeDiffResult {
  current: SnapshotPackage[];
  last: SnapshotPackage[];
  lastSnapshotId: string | null;
  diff: DiffEntry[];
  hasChanges: boolean;
}

export async function getWorkingTreeDiff(projectId: string): Promise<WorkingTreeDiffResult> {
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const lock = await parseLockfile(project.path);
  const current = lock.packages;
  const snaps = listSnapshots(projectId);
  const lastSnap = snaps.length > 0 ? snaps[snaps.length - 1] : null;
  const last = lastSnap?.packages ?? [];
  const diff = computeDiff(last, current);
  return {
    current,
    last,
    lastSnapshotId: lastSnap?.id ?? null,
    diff,
    hasChanges: diff.length > 0,
  };
}

export interface CompareResult {
  snapA: PgSnapshot;
  snapB: PgSnapshot;
  diff: DiffEntry[];
}

export async function compareSnapshots(
  projectId: string,
  snap1Id: string,
  snap2Id: string,
): Promise<CompareResult> {
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const a = getSnapshot(snap1Id);
  const b = getSnapshot(snap2Id);
  if (!a) throw new Error(`Snapshot not found: ${snap1Id}`);
  if (!b) throw new Error(`Snapshot not found: ${snap2Id}`);
  if (a.projectId !== projectId || b.projectId !== projectId) {
    throw new Error('Snapshots do not belong to the given project.');
  }
  return {
    snapA: a,
    snapB: b,
    diff: computeDiff(a.packages, b.packages),
  };
}
