import * as fs from "node:fs";
import * as path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { getAppDataDir, getSnapshotStorageDir, getLogsDir } from "@package-guard/shared/paths";
import { listSnapshotsForProject, listProjects } from "@package-guard/shared/repository";

export interface CleanReport {
  cacheFilesRemoved: number;
  cacheBytesFreed: number;
  snapshotDirsCleaned: number;
  snapshotBytesFreed: number;
  logFilesCleaned: number;
  logBytesFreed: number;
}

export function cleanCache(): { filesRemoved: number; bytesFreed: number } {
  let filesRemoved = 0;
  let bytesFreed = 0;

  const appData = getAppDataDir();
  const cacheCandidates = [
    path.join(appData, "cache"),
    path.join(appData, "temp"),
    path.join(appData, "tmp")
  ];

  for (const cDir of cacheCandidates) {
    if (fs.existsSync(cDir)) {
      try {
        const entries = fs.readdirSync(cDir);
        for (const entry of entries) {
          const entryPath = path.join(cDir, entry);
          try {
            const stat = fs.statSync(entryPath);
            bytesFreed += stat.size;
            if (stat.isDirectory()) {
              fs.rmSync(entryPath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(entryPath);
            }
            filesRemoved++;
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return { filesRemoved, bytesFreed };
}

export function cleanSnapshots(db: BetterSqlite3.Database): { dirsCleaned: number; bytesFreed: number } {
  let dirsCleaned = 0;
  let bytesFreed = 0;

  const storageRoot = getSnapshotStorageDir();
  if (!fs.existsSync(storageRoot)) {
    return { dirsCleaned: 0, bytesFreed: 0 };
  }

  // Find all active snapshot IDs in DB across all projects
  const activeSnapIds = new Set<string>();
  const projects = listProjects(db);
  for (const p of projects) {
    const snaps = listSnapshotsForProject(db, p.id);
    for (const s of snaps) {
      activeSnapIds.add(s.id);
    }
  }

  // Iterate folders in snapshot storage
  try {
    const entries = fs.readdirSync(storageRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const folderName = entry.name;
        // If folder is not associated with any active snapshot, remove it
        if (!activeSnapIds.has(folderName)) {
          const folderPath = path.join(storageRoot, folderName);
          try {
            const getDirSize = (dir: string): number => {
              let sz = 0;
              const subEntries = fs.readdirSync(dir, { withFileTypes: true });
              for (const se of subEntries) {
                const subPath = path.join(dir, se.name);
                if (se.isDirectory()) sz += getDirSize(subPath);
                else {
                  try { sz += fs.statSync(subPath).size; } catch {}
                }
              }
              return sz;
            };
            bytesFreed += getDirSize(folderPath);
            fs.rmSync(folderPath, { recursive: true, force: true });
            dirsCleaned++;
          } catch {
            // ignore
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return { dirsCleaned, bytesFreed };
}

export function cleanLogs(): { filesCleaned: number; bytesFreed: number } {
  let filesCleaned = 0;
  let bytesFreed = 0;

  const logsDir = getLogsDir();
  if (fs.existsSync(logsDir)) {
    try {
      const entries = fs.readdirSync(logsDir);
      for (const entry of entries) {
        const logFile = path.join(logsDir, entry);
        try {
          const stat = fs.statSync(logFile);
          if (stat.isFile()) {
            bytesFreed += stat.size;
            fs.truncateSync(logFile, 0); // truncate instead of delete in case process has lock
            filesCleaned++;
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  return { filesCleaned, bytesFreed };
}

export function cleanAll(db: BetterSqlite3.Database): CleanReport {
  const cache = cleanCache();
  const snaps = cleanSnapshots(db);
  const logs = cleanLogs();

  return {
    cacheFilesRemoved: cache.filesRemoved,
    cacheBytesFreed: cache.bytesFreed,
    snapshotDirsCleaned: snaps.dirsCleaned,
    snapshotBytesFreed: snaps.bytesFreed,
    logFilesCleaned: logs.filesCleaned,
    logBytesFreed: logs.bytesFreed
  };
}
