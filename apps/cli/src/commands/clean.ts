import type BetterSqlite3 from "better-sqlite3";
import {
  cleanCache,
  cleanSnapshots,
  cleanLogs,
  cleanAll
} from "../services/clean-service";
import { insertHistory } from "@package-guard/shared/repository";

export async function executeClean(
  db: BetterSqlite3.Database,
  _targetDir: string,
  args: string[]
): Promise<number> {
  const sub = args[0]?.toLowerCase();

  if (sub === "cache") {
    console.log("Cleaning temporary cache files...");
    const res = cleanCache();
    console.log(`Cache Cleaned: ${res.filesRemoved} files removed (${(res.bytesFreed / 1024).toFixed(1)} KB freed).\n`);
    return 0;
  }

  if (sub === "snapshots") {
    console.log("Cleaning orphaned snapshot storage directories...");
    const res = cleanSnapshots(db);
    console.log(`Snapshots Cleaned: ${res.dirsCleaned} orphaned directories removed (${(res.bytesFreed / 1024).toFixed(1)} KB freed).\n`);
    return 0;
  }

  if (sub === "logs") {
    console.log("Cleaning log files...");
    const res = cleanLogs();
    console.log(`Logs Cleaned: ${res.filesCleaned} log files cleared (${(res.bytesFreed / 1024).toFixed(1)} KB freed).\n`);
    return 0;
  }

  if (sub === "all" || !sub) {
    console.log("Running comprehensive safe cleanup (cache, orphaned snapshots, logs)...");
    const res = cleanAll(db);

    insertHistory(db, {
      eventType: "CLEAN",
      description: `Cleaned cache, snapshots, and logs. Freed ${((res.cacheBytesFreed + res.snapshotBytesFreed + res.logBytesFreed) / 1024).toFixed(1)} KB.`
    });

    console.log(`\nCleanup Report:`);
    console.log(`  Cache files removed:      ${res.cacheFilesRemoved} (${(res.cacheBytesFreed / 1024).toFixed(1)} KB)`);
    console.log(`  Orphaned snapshots freed: ${res.snapshotDirsCleaned} (${(res.snapshotBytesFreed / 1024).toFixed(1)} KB)`);
    console.log(`  Log files cleared:        ${res.logFilesCleaned} (${(res.logBytesFreed / 1024).toFixed(1)} KB)`);
    console.log(`  Total space freed:        ${((res.cacheBytesFreed + res.snapshotBytesFreed + res.logBytesFreed) / 1024).toFixed(1)} KB`);
    console.log("Safety Note: Primary SQLite database and project files remain intact.\n");
    return 0;
  }

  console.error(`Unknown clean target: '${sub}'`);
  console.error("Usage:\n  pg clean cache\n  pg clean snapshots\n  pg clean logs\n  pg clean all\n");
  return 2;
}
