import * as readline from "node:readline";
import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getSnapshot, restoreSnapshot, createSnapshot } from "../services/snapshot-service";
import { scanProject } from "../services/scanner-service";
import { verifyProject } from "../services/verify-service";
import { insertHistory } from "@package-guard/shared/repository";
import { sendCliEvent } from "../pipe-client";

function askConfirmation(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return Promise.resolve(true); // automated/scripted test environment defaults to true
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

import { outputSuccess, outputError } from "../output";

export async function executeSnapshotRestore(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const cleanArgs = args.filter((a) => a !== "--json" && a !== "-j");
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    return outputError(
      "snapshot_restore",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const nonFlagArgs = cleanArgs.filter((a) => !a.startsWith("-"));
  const isForced = cleanArgs.some((a) => a === "-y" || a === "--yes" || a === "--force");

  const snapshotId = nonFlagArgs[0];
  if (!snapshotId) {
    return outputError(
      "snapshot_restore",
      "ARGUMENT_REQUIRED",
      "Snapshot ID is required. Usage: pg snapshot restore <id> [-y]",
      2,
      jsonMode
    );
  }

  // Step 1: Validate snapshot
  const { snapshot } = getSnapshot(db, snapshotId);
  if (!snapshot) {
    return outputError(
      "snapshot_restore",
      "SNAPSHOT_NOT_FOUND",
      `Snapshot '${snapshotId}' not found.`,
      4,
      jsonMode
    );
  }

  if (!isForced) {
    if (jsonMode) {
      return outputError(
        "snapshot_restore",
        "CONFIRMATION_REQUIRED",
        `Restoring snapshot '${snapshot.id}' will overwrite current working files. Pass -y or --yes flag to confirm.`,
        2,
        jsonMode
      );
    }

    console.log(`This operation will restore files from snapshot '${snapshot.name}' (${snapshot.id}).`);
    const confirmed = await askConfirmation("Continue? [y/N] ");
    if (!confirmed) {
      console.log("Operation aborted.\n");
      return 0;
    }
  }

  try {
    // Step 2: Create safety snapshot
    const safety = await createSnapshot(db, project.id, projectDir, `Safety Snapshot - Before restoring ${snapshotId}`);

    // Step 3: Restore snapshot files
    const { restoredFiles } = await restoreSnapshot(db, snapshotId, projectDir);

    // Step 4: Run scan
    const scan = await scanProject(db, project.id, projectDir, project.name);

    // Step 5: Verify
    const verify = await verifyProject(db, project.id, projectDir);

    // Step 6: Record history
    insertHistory(db, {
      projectId: project.id,
      eventType: "RESTORE",
      description: `Restored snapshot ${snapshotId} (${restoredFiles} files restored)`,
      detailsJson: JSON.stringify({
        targetSnapshotId: snapshotId,
        safetySnapshotId: safety.id,
        restoredFiles,
        verificationStatus: verify.status
      })
    });

    // Step 7: Update Electron
    await sendCliEvent("snapshot_restore", {
      snapshotId: snapshot.id,
      snapshotName: snapshot.name,
      projectId: project.id,
      projectName: project.name,
      safetySnapshotId: safety.id,
      restoredFiles,
      scanResult: {
        filesScanned: scan.filesScanned,
        changesDetected: scan.changesDetected
      },
      verificationStatus: verify.status
    }, project.id);

    return outputSuccess(
      "snapshot_restore",
      {
        snapshotId: snapshot.id,
        snapshotName: snapshot.name,
        projectId: project.id,
        projectName: project.name,
        safetySnapshotId: safety.id,
        restoredFiles,
        scanResult: {
          filesScanned: scan.filesScanned,
          changesDetected: scan.changesDetected
        },
        verificationStatus: verify.status
      },
      jsonMode,
      () => {
        console.log(`\nSnapshot '${snapshot.id}' restored successfully.`);
        console.log(`Files restored:         ${restoredFiles}`);
        console.log(`Safety snapshot created:${safety.id}`);
        console.log(`Verification status:    ${verify.status}\n`);
      }
    );
  } catch (err) {
    return outputError(
      "snapshot_restore",
      "RESTORE_FAILED",
      `Failed to restore snapshot: ${err instanceof Error ? err.message : String(err)}`,
      1,
      jsonMode
    );
  }
}
