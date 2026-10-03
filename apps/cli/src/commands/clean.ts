import type BetterSqlite3 from "better-sqlite3";
import {
  cleanCache,
  cleanSnapshots,
  cleanLogs,
  cleanAll
} from "../services/clean-service";
import { insertHistory } from "@package-guard/shared/repository";

import { outputSuccess, outputError } from "../output";

export async function executeClean(
  db: BetterSqlite3.Database,
  _targetDir: string,
  args: string[],
  isJson: boolean = false
): Promise<number> {
  const sub = args[0]?.toLowerCase();

  if (sub === "cache") {
    const res = cleanCache();
    if (isJson) {
      outputSuccess({ target: "cache", filesRemoved: res.filesRemoved, bytesFreed: res.bytesFreed });
      return 0;
    }
    console.log("Cleaning temporary cache files...");
    console.log(`Cache Cleaned: ${res.filesRemoved} files removed (${(res.bytesFreed / 1024).toFixed(1)} KB freed).\n`);
    return 0;
  }

  if (sub === "snapshots") {
    const res = cleanSnapshots(db);
    if (isJson) {
      outputSuccess({ target: "snapshots", dirsCleaned: res.dirsCleaned, bytesFreed: res.bytesFreed });
      return 0;
    }
    console.log("Cleaning orphaned snapshot storage directories...");
    console.log(`Snapshots Cleaned: ${res.dirsCleaned} orphaned directories removed (${(res.bytesFreed / 1024).toFixed(1)} KB freed).\n`);
    return 0;
  }

  if (sub === "logs") {
    const res = cleanLogs();
    if (isJson) {
      outputSuccess({ target: "logs", filesCleaned: res.filesCleaned, bytesFreed: res.bytesFreed });
      return 0;
    }
    console.log("Cleaning log files...");
    console.log(`Logs Cleaned: ${res.filesCleaned} log files cleared (${(res.bytesFreed / 1024).toFixed(1)} KB freed).\n`);
    return 0;
  }

  if (sub === "all" || !sub) {
    const res = cleanAll(db);

    insertHistory(db, {
      eventType: "CLEAN",
      description: `Cleaned cache, snapshots, and logs. Freed ${((res.cacheBytesFreed + res.snapshotBytesFreed + res.logBytesFreed) / 1024).toFixed(1)} KB.`
    });

    if (isJson) {
      outputSuccess({
        target: "all",
        cacheFilesRemoved: res.cacheFilesRemoved,
        cacheBytesFreed: res.cacheBytesFreed,
        snapshotDirsCleaned: res.snapshotDirsCleaned,
        snapshotBytesFreed: res.snapshotBytesFreed,
        logFilesCleaned: res.logFilesCleaned,
        logBytesFreed: res.logBytesFreed,
        totalBytesFreed: res.cacheBytesFreed + res.snapshotBytesFreed + res.logBytesFreed
      });
      return 0;
    }

    console.log("Running comprehensive safe cleanup (cache, orphaned snapshots, logs)...");
    console.log(`\nCleanup Report:`);
    console.log(`  Cache files removed:      ${res.cacheFilesRemoved} (${(res.cacheBytesFreed / 1024).toFixed(1)} KB)`);
    console.log(`  Orphaned snapshots freed: ${res.snapshotDirsCleaned} (${(res.snapshotBytesFreed / 1024).toFixed(1)} KB)`);
    console.log(`  Log files cleared:        ${res.logFilesCleaned} (${(res.logBytesFreed / 1024).toFixed(1)} KB)`);
    console.log(`  Total space freed:        ${((res.cacheBytesFreed + res.snapshotBytesFreed + res.logBytesFreed) / 1024).toFixed(1)} KB`);
    console.log("Safety Note: Primary SQLite database and project files remain intact.\n");
    return 0;
  }

  if (isJson) {
    outputError(`Unknown clean target: '${sub}'`, "INVALID_ARGUMENT");
  } else {
    console.error(`Unknown clean target: '${sub}'`);
    console.error("Usage:\n  pg clean cache\n  pg clean snapshots\n  pg clean logs\n  pg clean all\n");
  }
  return 2;
}
