import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { getSnapshotStorageDir } from "@package-guard/shared/paths";
import {
  insertSnapshot,
  getSnapshotById,
  listSnapshotsForProject,
  deleteSnapshotById,
  insertSnapshotFiles,
  getSnapshotFiles
} from "@package-guard/shared/repository";
import type { Snapshot, SnapshotFile, SnapshotManifest, PackageInfo } from "@package-guard/shared/types";
import { walkDirectory, calculateFileHash, detectPackages } from "./scanner-service";

function generateNextSnapshotId(db: BetterSqlite3.Database, projectId: string): string {
  const existing = listSnapshotsForProject(db, projectId);
  // Try to find highest numeric id
  let maxNum = 0;
  for (const s of existing) {
    const num = parseInt(s.id, 10);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  }
  const next = maxNum + 1;
  const candidate = String(next).padStart(3, "0");
  if (!existing.some((s) => s.id === candidate) && !getSnapshotById(db, candidate)) {
    return candidate;
  }
  // If candidate is already used in snapshots table, find next available numeric ID
  let cursor = next + 1;
  while (cursor <= next + 1000) {
    const higher = String(cursor).padStart(3, "0");
    if (!getSnapshotById(db, higher)) {
      return higher;
    }
    cursor++;
  }
  return crypto.randomBytes(3).toString("hex");
}

export async function createSnapshot(
  db: BetterSqlite3.Database,
  projectId: string,
  projectDir: string,
  name?: string,
  description?: string
): Promise<Snapshot> {
  const snapshotId = generateNextSnapshotId(db, projectId);
  const snapshotName = name?.trim() || `Snapshot ${snapshotId}`;
  const storageRoot = getSnapshotStorageDir();
  const snapshotDir = path.join(storageRoot, snapshotId);
  fs.mkdirSync(snapshotDir, { recursive: true });

  const rawFiles = walkDirectory(projectDir);
  const snapshotFilesToInsert: Array<{
    id: string;
    snapshotId: string;
    relativePath: string;
    fileHash: string;
    sizeBytes: number;
    storagePath: string;
  }> = [];

  const manifestFiles: SnapshotManifest["files"] = [];

  for (const f of rawFiles) {
    try {
      const hash = calculateFileHash(f.fullPath);
      const destPath = path.join(snapshotDir, f.relativePath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(f.fullPath, destPath);

      const fileId = `sf-${crypto.randomUUID().slice(0, 8)}`;
      snapshotFilesToInsert.push({
        id: fileId,
        snapshotId,
        relativePath: f.relativePath,
        fileHash: hash,
        sizeBytes: f.size,
        storagePath: destPath
      });

      manifestFiles.push({
        relativePath: f.relativePath,
        hash,
        size: f.size,
        storagePath: destPath
      });
    } catch {
      // ignore
    }
  }

  const packages = detectPackages(projectDir);
  const manifest: SnapshotManifest = {
    snapshotId,
    projectId,
    createdAt: new Date().toISOString(),
    files: manifestFiles,
    packages
  };

  const snapshot: Snapshot = {
    id: snapshotId,
    project_id: projectId,
    name: snapshotName,
    description: description || null,
    file_count: snapshotFilesToInsert.length,
    package_count: packages.length,
    manifest_json: JSON.stringify(manifest),
    status: "ACTIVE",
    created_at: new Date().toISOString()
  };

  insertSnapshot(db, {
    id: snapshot.id,
    projectId: snapshot.project_id,
    name: snapshot.name,
    description: snapshot.description || undefined,
    fileCount: snapshot.file_count,
    packageCount: snapshot.package_count,
    manifestJson: snapshot.manifest_json
  });

  insertSnapshotFiles(db, snapshotFilesToInsert);

  return snapshot;
}

export function listSnapshots(db: BetterSqlite3.Database, projectId: string): Snapshot[] {
  return listSnapshotsForProject(db, projectId);
}

export function getSnapshot(
  db: BetterSqlite3.Database,
  snapshotId: string
): { snapshot?: Snapshot; files: SnapshotFile[]; manifest?: SnapshotManifest } {
  const snapshot = getSnapshotById(db, snapshotId);
  if (!snapshot) {
    return { files: [] };
  }

  const files = getSnapshotFiles(db, snapshotId);
  let manifest: SnapshotManifest | undefined;
  try {
    manifest = JSON.parse(snapshot.manifest_json);
  } catch {
    // ignore
  }

  return { snapshot, files, manifest };
}

export async function restoreSnapshot(
  db: BetterSqlite3.Database,
  snapshotId: string,
  projectDir: string
): Promise<{ restoredFiles: number; snapshot: Snapshot }> {
  const { snapshot, files } = getSnapshot(db, snapshotId);
  if (!snapshot) {
    throw new Error(`Snapshot '${snapshotId}' not found.`);
  }

  const storageRoot = getSnapshotStorageDir();
  const snapshotDir = path.join(storageRoot, snapshotId);
  if (!fs.existsSync(snapshotDir)) {
    throw new Error(`Snapshot storage folder missing for snapshot '${snapshotId}'.`);
  }

  // Restore every file in snapshot to projectDir
  let restored = 0;
  for (const f of files) {
    const sourcePath = f.storage_path && fs.existsSync(f.storage_path)
      ? f.storage_path
      : path.join(snapshotDir, f.relative_path);

    if (fs.existsSync(sourcePath)) {
      const targetPath = path.join(projectDir, f.relative_path);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
      restored++;
    }
  }

  return { restoredFiles: restored, snapshot };
}

export function deleteSnapshot(
  db: BetterSqlite3.Database,
  snapshotId: string
): boolean {
  const snapshot = getSnapshotById(db, snapshotId);
  if (!snapshot) return false;

  const storageRoot = getSnapshotStorageDir();
  const snapshotDir = path.join(storageRoot, snapshotId);
  try {
    if (fs.existsSync(snapshotDir)) {
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }

  return deleteSnapshotById(db, snapshotId);
}
