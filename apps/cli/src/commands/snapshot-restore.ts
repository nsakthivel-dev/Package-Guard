import * as readline from "node:readline";
import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getSnapshot, restoreSnapshot } from "../services/snapshot-service";
import { scanProject } from "../services/scanner-service";
import { sendCliEvent } from "../pipe-client";

function askConfirmation(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    // If not a TTY (scripted/automated), default to true if forced, or false otherwise
    return Promise.resolve(false);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === "y" || trimmed === "yes");
    });
  });
}

export async function executeSnapshotRestore(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    console.error("Run:\n\n  pg init\n");
    return 3;
  }

  const nonFlagArgs = args.filter((a) => !a.startsWith("-"));
  const isForced = args.some((a) => a === "-y" || a === "--yes" || a === "--force");

  const snapshotId = nonFlagArgs[0];
  if (!snapshotId) {
    console.error("Error: Snapshot ID is required.");
    console.error("Usage: pg snapshot restore <id> [-y]");
    return 2;
  }

  const { snapshot } = getSnapshot(db, snapshotId);
  if (!snapshot) {
    console.error(`Error: Snapshot '${snapshotId}' not found.`);
    return 4;
  }

  if (!isForced) {
    console.log("This operation will modify project files.");
    const confirmed = await askConfirmation("Continue? [y/N] ");
    if (!confirmed) {
      console.log("Operation aborted.");
      return 0;
    }
  }

  try {
    const { restoredFiles } = await restoreSnapshot(db, snapshotId, projectDir);

    // Refresh state by running a scan
    const scan = await scanProject(db, project.id, projectDir, project.name);

    await sendCliEvent("snapshot_restore", {
      snapshotId: snapshot.id,
      snapshotName: snapshot.name,
      projectId: project.id,
      projectName: project.name,
      restoredFiles,
      scanResult: {
        filesScanned: scan.filesScanned,
        changesDetected: scan.changesDetected
      }
    }, project.id);

    console.log(`\nSnapshot '${snapshot.id}' restored successfully.`);
    console.log(`Files restored: ${restoredFiles}`);
    console.log(`Project state refreshed: ${scan.filesScanned} files active.`);

    return 0;
  } catch (err) {
    console.error(`\nFailed to restore snapshot: ${err instanceof Error ? err.message : err}`);
    return 1;
  }
}
