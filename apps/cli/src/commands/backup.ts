import type BetterSqlite3 from "better-sqlite3";
import { createSystemBackup, getAllBackups, restoreSystemBackup } from "../services/backup-service";
import { sendCliEvent } from "../pipe-client";

export async function executeBackup(
  db: BetterSqlite3.Database,
  _targetDir: string,
  args: string[]
): Promise<number> {
  const sub = (args[0] || "").toLowerCase();

  if (sub === "list") {
    const backups = getAllBackups(db);
    console.log("Package Guard System Backups:\n");
    if (backups.length === 0) {
      console.log("No system backups found. Run 'pg backup' to create one.");
      return 0;
    }

    console.log("ID                                SIZE        CREATED AT              DESCRIPTION");
    console.log("--------------------------------------------------------------------------------------------");
    for (const b of backups) {
      const sizeMb = (b.size_bytes / 1024).toFixed(1) + " KB";
      const desc = (b.description || "System backup").slice(0, 30);
      const created = b.created_at.slice(0, 19);
      console.log(`${b.id.padEnd(32)} ${sizeMb.padEnd(11)} ${created.padEnd(23)} ${desc}`);
    }
    return 0;
  }

  if (sub === "restore") {
    const backupId = args[1];
    console.log("Initiating system backup restore...\n");

    try {
      const res = restoreSystemBackup(db, backupId);
      console.log(`[PASS] ${res.message}`);

      await sendCliEvent("backup_restored", {
        restoredId: res.restoredId,
        preRestoreBackupId: res.preRestoreBackupId
      });

      return 0;
    } catch (err) {
      console.error(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
  }

  // Default: create a new system backup
  const desc = args.length > 0 && sub !== "create" ? args.join(" ") : undefined;
  console.log("Creating Package Guard system backup...");

  try {
    const backup = createSystemBackup(db, desc);
    const sizeKb = (backup.sizeBytes / 1024).toFixed(1);
    console.log(`\n[PASS] Backup created successfully:`);
    console.log(`  ID:          ${backup.id}`);
    console.log(`  File:        ${backup.backupPath}`);
    console.log(`  Size:        ${sizeKb} KB`);
    console.log(`  Description: ${backup.description}`);

    await sendCliEvent("backup_created", {
      backupId: backup.id,
      backupPath: backup.backupPath,
      sizeBytes: backup.sizeBytes
    });

    return 0;
  } catch (err) {
    console.error(`Failed to create backup: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
