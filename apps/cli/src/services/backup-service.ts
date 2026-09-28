import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { getAppDataDir, getDbPath } from "@package-guard/shared/paths";
import {
  insertBackup,
  listBackups,
  getBackupById,
  deleteBackup
} from "@package-guard/shared/repository";

export interface BackupItem {
  id: string;
  backupPath: string;
  sizeBytes: number;
  description?: string;
  createdAt: string;
}

export function getBackupsDirectory(): string {
  const dir = path.join(getAppDataDir(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createSystemBackup(
  db: BetterSqlite3.Database,
  description?: string
): BackupItem {
  const backupsDir = getBackupsDirectory();
  const backupId = `backup-${Date.now()}-${randomUUID().slice(0, 4)}`;
  const backupFile = path.join(backupsDir, `${backupId}.db`);

  // Ensure WAL changes are checkpointed to main db file before copying
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // ignore
  }

  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Primary database not found at ${dbPath}`);
  }

  fs.copyFileSync(dbPath, backupFile);
  const stat = fs.statSync(backupFile);

  const item: BackupItem = {
    id: backupId,
    backupPath: backupFile,
    sizeBytes: stat.size,
    description: description || "Manual system backup",
    createdAt: new Date().toISOString()
  };

  insertBackup(db, {
    id: item.id,
    backupPath: item.backupPath,
    sizeBytes: item.sizeBytes,
    description: item.description
  });

  return item;
}

export function getAllBackups(db: BetterSqlite3.Database): Array<{
  id: string;
  backup_path: string;
  size_bytes: number;
  description: string | null;
  created_at: string;
}> {
  return listBackups(db);
}

export function restoreSystemBackup(
  db: BetterSqlite3.Database,
  backupId?: string
): { success: boolean; restoredId: string; preRestoreBackupId: string; message: string } {
  const all = listBackups(db);
  if (all.length === 0) {
    throw new Error("No backups found to restore.");
  }

  const target = backupId ? all.find((b) => b.id === backupId) : all[0];
  if (!target) {
    throw new Error(`Backup '${backupId}' not found.`);
  }

  if (!fs.existsSync(target.backup_path)) {
    throw new Error(`Backup file missing from disk: ${target.backup_path}`);
  }

  // 1. Create safety pre-restore backup first
  const preRestore = createSystemBackup(db, "Safety pre-restore backup");

  // 2. Restore database by copying target backup over dbPath
  const dbPath = getDbPath();

  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
    fs.copyFileSync(target.backup_path, dbPath);
  } catch (err) {
    throw new Error(`Failed to restore database file: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    success: true,
    restoredId: target.id,
    preRestoreBackupId: preRestore.id,
    message: `Database restored from backup ${target.id} (safety pre-restore backup created as ${preRestore.id})`
  };
}
